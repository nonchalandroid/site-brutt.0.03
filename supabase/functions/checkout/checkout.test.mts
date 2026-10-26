// Testes da função checkout com Supabase, Mercado Pago e Evolution API simulados em memória.
// Rodar: node --experimental-strip-types supabase/functions/checkout/checkout.test.mts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv", MP_ACCESS_TOKEN: "TEST-token", MP_PUBLIC_KEY: "TEST-pk",
  MP_WEBHOOK_SECRET: "segredo", MP_ACEITA_CARTAO: "1", EVOLUTION_API_URL: "https://evo.test", EVOLUTION_API_KEY: "evo", EVOLUTION_INSTANCE: "brutt", WHATS_LOJA_AVISOS: "21999990000",
};
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
const bg: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => bg.push(p) };
const realTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: any, ms: number) => realTimeout(fn, ms >= 3000 && ms < 5000 ? 1 : ms); // pula as pausas de 3 s

// ── banco em memória ──
const db: Record<string, any[]> = { staff: [{ user_id: "u-staff", active: true }], pedidos: [], wa_notificacoes: [], wa_contatos: [], mp_eventos: [], push_config: [], push_assinaturas: [], sync_config: [{ key: "sync_secret", value: "seg-teste" }] };
const products = [
  { site_product_id: "ess-1", name: "Essência Ziggy Menta", price: 25, promo_price: null, stock: 5, is_active: true },
  { site_product_id: "car-1", name: "Carvão 1kg", price: 30, promo_price: 19.9, stock: 1, is_active: true },
];
const UNIQ: Record<string, (a: any, b: any) => boolean> = {
  wa_notificacoes: (a, b) => a.pedido_id === b.pedido_id && a.tipo === b.tipo,
  wa_contatos: (a, b) => a.numero === b.numero, mp_eventos: (a, b) => a.chave === b.chave, push_config: () => true,
};
function filtros(q: URLSearchParams) {
  const fs: ((r: any) => boolean)[] = [];
  q.forEach((v, k) => {
    if (k === "select" || k === "order" || k === "limit") return;
    if (v.startsWith("eq.")) fs.push(r => String(r[k]) === v.slice(3));
    else if (v === "is.null") fs.push(r => r[k] == null);
    else if (v.startsWith("in.(")) { const l = v.slice(4, -1).split(",").map(s => s.replace(/^"|"$/g, "")); fs.push(r => l.includes(String(r[k]))); }
  });
  return (r: any) => fs.every(f => f(r));
}
let seq = 41, mpSeq = 9000, rotaM = 1800;
let mapa: any[] = []; const rotaPorLng: Record<string, number> = {};
const mpPays = new Map<string, any>();
let proximoMp: any = { status: "pending", status_detail: "pending_waiting_transfer" };
const whats: { numero: string; text: string }[] = [];
const idemKeys: string[] = [];
const pushes: { path: string; headers: any; corpo: Uint8Array }[] = [];
const res = (o: any, status = 200) => new Response(o == null ? "" : JSON.stringify(o), { status });

(globalThis as any).fetch = async (input: string, init: any = {}) => {
  const u = new URL(input), m = (init.method || "GET").toUpperCase(), body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  if (u.host === "push.test") { pushes.push({ path: u.pathname, headers: init.headers, corpo: init.body }); return new Response("", { status: u.pathname === "/morto" ? 410 : 201 }); }
  if (u.host === "router.project-osrm.org") { const lngB = u.pathname.split(";")[1]?.split(",")[0]; return res({ code: "Ok", routes: [{ distance: rotaPorLng[lngB] ?? rotaM }] }); }
  if (u.host === "sb.test" && u.pathname === "/functions/v1/geoapify-autocomplete") { assert.match(init.headers.Authorization, /^Bearer ./); return res({ resultados: mapa }); }
  if (u.host === "evo.test") { assert.equal(init.headers.apikey, "evo"); whats.push(body); return res({ key: { id: "x" } }, 201); }
  if (u.host === "api.mercadopago.com") {
    assert.equal(init.headers.Authorization, "Bearer TEST-token");
    if (m === "POST") {
      idemKeys.push(init.headers["X-Idempotency-Key"]);
      if (body.payer?.email === "dono@loja.com") return res({ message: "Invalid users involved", status: 400, cause: [{ code: 4390 }] }, 400);
      const id = String(++mpSeq);
      const p = { id: +id, currency_id: "BRL", transaction_amount: body.transaction_amount, external_reference: body.external_reference, payment_method_id: body.payment_method_id, ...proximoMp, _req: body,
        point_of_interaction: body.payment_method_id === "pix" ? { transaction_data: { qr_code: "000201PIX" + id, qr_code_base64: "aW1n" } } : undefined, date_of_expiration: body.date_of_expiration };
      mpPays.set(id, p); return res(p, 201);
    }
    const id = u.pathname.split("/").pop()!;
    if (m === "PUT") { mpPays.get(id).status = body.status; return res(mpPays.get(id)); }
    return mpPays.has(id) ? res(mpPays.get(id)) : res({}, 404);
  }
  if (u.host === "sb.test" && u.pathname === "/auth/v1/user") {
    return init.headers?.Authorization === "Bearer token-equipe" ? res({ id: "u-staff" }) : res({ msg: "invalid" }, 401);
  }
  if (u.host === "sb.test") {
    const path = u.pathname.replace("/rest/v1/", "");
    if (path === "rpc/proximo_numero_pedido") return res(++seq);
    if (path === "products") return res(products.filter(filtros(u.searchParams)));
    const t = db[path]; assert.ok(t, "tabela " + path);
    if (m === "GET") return res(t.filter(filtros(u.searchParams)));
    if (m === "POST") {
      if (UNIQ[path] && t.some(r => UNIQ[path](r, body))) return res({ code: "23505" }, 409);
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 60e3).toISOString(), status: "aguardando_pagamento", tentativas: 0, mp_payment_id: null, ...body };
      t.push(row); return res([row], 201);
    }
    const alvo = t.filter(filtros(u.searchParams));
    if (m === "PATCH") { alvo.forEach(r => Object.assign(r, body)); return res(alvo); }
    if (m === "DELETE") { db[path] = t.filter(r => !alvo.includes(r)); return res(null, 204); }
  }
  throw new Error("fetch inesperado " + input);
};

const C = await import("./index.ts");
C._limites({ ipMax: 1e6, whatsAbertosHora: 1e6, whatsDia: 1e6 });   // os testes reusam o mesmo número; o freio tem teste próprio no fim
const F = "https://sb.test/functions/v1/checkout";
const call = async (acao: string, body?: any, headers: Record<string, string> = {}) => {
  const r = await C.handler(new Request(`${F}?acao=${acao}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: r.status, j: await r.json() };
};
const getStatus = async (id: string) => (await C.handler(new Request(`${F}?acao=status&pedido=${id}`))).json();
const assina = (dataId: string, reqId: string, ts = "1700000000") => ({ "x-request-id": reqId, "x-signature": `ts=${ts},v1=${createHmac("sha256", "segredo").update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex")}` });
const flush = async () => { await Promise.all(bg.splice(0)); };
let ok = 0; const t = async (nome: string, fn: () => Promise<void>) => { await fn(); ok++; console.log("✓", nome); };

const base = { nome: "João Silva", whats: "(21) 98888-7777", itens: [{ id: "ess-1", q: 1 }] };

await t("recusa carrinho abaixo do mínimo e preço vem do banco, não do navegador", async () => {
  const r = await call("criar", { ...base, itens: [{ id: "ess-1", q: 1, preco: 0.01 }], entrega: { tipo: "cliente" } });
  assert.equal(r.status, 200); assert.equal(r.j.total, 25); assert.equal(r.j.taxa_entrega, 0); assert.equal(r.j.public_key, "TEST-pk");
  const r2 = await call("criar", { ...base, itens: [{ id: "car-1", q: 1 }], entrega: { tipo: "cliente" } });
  assert.equal(r2.status, 400); assert.match(r2.j.erro, /mínimo/);
});
await t("valida estoque, whatsapp e produto inexistente", async () => {
  assert.equal((await call("criar", { ...base, itens: [{ id: "car-1", q: 2 }], entrega: { tipo: "cliente" } })).status, 409);
  assert.equal((await call("criar", { ...base, whats: "123", entrega: { tipo: "cliente" } })).status, 400);
  assert.equal((await call("criar", { ...base, itens: [{ id: "nao-existe", q: 1 }], entrega: { tipo: "cliente" } })).status, 409);
});
await t("entrega pela loja: tabela recalculada no servidor (até 2 km R$ 5; acima + R$ 2/km rodado, proporcional; sem teto; sem limite de raio)", async () => {
  const ent = { tipo: "entrega", geo: { lat: -22.9, lng: -43.6 }, endereco: { rua: "Rua A", numero: "10", cidade: "Rio de Janeiro", uf: "rj", bairro: "Campo Grande" } };
  rotaM = 1800; let r = await call("criar", { ...base, entrega: ent });
  assert.equal(r.j.taxa_entrega, 5); assert.equal(r.j.total, 30); assert.equal(r.j.km, 1.8);
  rotaM = 2000; r = await call("criar", { ...base, entrega: ent }); assert.equal(r.j.taxa_entrega, 5, "2,0 km ainda é a base");
  rotaM = 2100; r = await call("criar", { ...base, entrega: ent }); assert.equal(r.j.taxa_entrega, 5.2, "2,1 km = base + 0,1 km × R$ 2");
  rotaM = 3500; r = await call("criar", { ...base, entrega: ent }); assert.equal(r.j.taxa_entrega, 8, "3,5 km: 5 + 1,5 × 2 = 8"); assert.equal(r.j.km, 3.5);
  rotaM = 9000; r = await call("criar", { ...base, entrega: ent }); assert.equal(r.status, 200, "sem limite de raio"); assert.equal(r.j.taxa_entrega, 19, "9 km: 5 + 7 × 2, sem teto");
  rotaM = 4600; r = await call("criar", { ...base, entrega: ent }); assert.equal(r.j.taxa_entrega, 10.2, "4,6 km: 5 + 2,6 × 2");
  rotaM = 1800;
  const C2 = await import("./index.ts");
  assert.equal(C2.taxaEntrega(2.5), 6); assert.equal(C2.taxaEntrega(3.01), 7.02); assert.equal(C2.taxaEntrega(3.9), 8.8); assert.equal(C2.taxaEntrega(9), 19, "sem teto"); assert.equal(C2.taxaEntrega(0.4), 5);
});

let pixPedido = "";
await t("Pix: gera QR dinâmico com valor do banco; pendente NÃO marca pago", async () => {
  const c = await call("criar", { ...base, entrega: { tipo: "cliente" } }); pixPedido = c.j.pedido_id;
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  const p = await call("pagar", { pedido_id: pixPedido, metodo: "pix", formData: { payment_method_id: "pix", transaction_amount: 0.01, payer: { email: "joao@ex.com" } } });
  assert.equal(p.status, 200); assert.equal(p.j.status, "aguardando_pagamento"); assert.match(p.j.pix.qr_code, /^000201PIX/); assert.equal(p.j.pix.qr_code_base64, "aW1n");
  const pay = mpPays.get(String(mpSeq)); assert.equal(pay._req.transaction_amount, 25); assert.equal(pay._req.external_reference, pixPedido);
  assert.match(pay._req.date_of_expiration, /-03:00$/); assert.equal(pay._req.notification_url, undefined); // a URL do webhook é configurada no Mercado Pago, não no payload do pagamento
  assert.equal(whats.length, 0);
});
await t("webhook com assinatura inválida é rejeitado", async () => {
  const id = String(mpSeq); mpPays.get(id).status = "approved";
  const r = await C.handler(new Request(`${F}?acao=webhook`, { method: "POST", headers: { "x-request-id": "r1", "x-signature": "ts=1,v1=deadbeef" }, body: JSON.stringify({ type: "payment", data: { id } }) }));
  assert.equal(r.status, 401); assert.equal(db.pedidos.find(p => p.id === pixPedido).status, "aguardando_pagamento");
});
await t("webhook válido confirma pelo GET no MP e manda WhatsApp uma vez; duplicado é ignorado", async () => {
  const id = String(mpSeq);
  const w = () => C.handler(new Request(`${F}?acao=webhook`, { method: "POST", headers: assina(id, "req-1"), body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id } }) }));
  assert.equal((await w()).status, 200); await flush();
  assert.equal(db.pedidos.find(p => p.id === pixPedido).status, "pago");
  const conf = whats.filter(m => m.text.includes("Pagamento confirmado"));
  assert.equal(conf.length, 1); assert.equal(conf[0].number, "5521988887777");
  assert.ok(whats.some(m => m.number === "5521999990000" && m.text.includes("NOVO PEDIDO PAGO")), "aviso para a loja");
  assert.ok(whats.some(m => m.text.includes("Seja bem-vindo")), "saudação a contato novo");
  const antes = whats.length;
  const r2 = await (await w()).json(); assert.equal(r2.repetido, true);
  // mesmo evento com outro request-id (reentrega) → processa de novo, mas não duplica mensagens
  await C.handler(new Request(`${F}?acao=webhook`, { method: "POST", headers: assina(id, "req-2"), body: JSON.stringify({ type: "payment", data: { id } }) })); await flush();
  assert.equal(whats.length, antes);
});
await t("Pix sem e-mail: o servidor usa o e-mail interno do pedido e gera o QR", async () => {
  const c = await call("criar", { ...base, whats: "21944443333", entrega: { tipo: "cliente" } });
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  const p = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix" } });
  assert.equal(p.status, 200); assert.match(p.j.pix.qr_code, /^000201PIX/);
  assert.equal(mpPays.get(String(mpSeq))._req.payer.email, `pix+${c.j.numero.toLowerCase()}@tabacariabrutt.com.br`);
});
await t("Pix com e-mail do cliente: vai pro Mercado Pago; se o MP recusar o e-mail, tenta 1x com o interno", async () => {
  const c = await call("criar", { ...base, whats: "21944443334", entrega: { tipo: "cliente" } });
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  const p = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "cliente@gmail.com" } } });
  assert.equal(p.status, 200); assert.equal(mpPays.get(String(mpSeq))._req.payer.email, "cliente@gmail.com");
  const c2 = await call("criar", { ...base, whats: "21944443335", entrega: { tipo: "cliente" } });
  const n = idemKeys.length;
  const p2 = await call("pagar", { pedido_id: c2.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "dono@loja.com" } } });
  assert.equal(p2.status, 200); assert.match(p2.j.pix.qr_code, /^000201PIX/);
  assert.equal(mpPays.get(String(mpSeq))._req.payer.email, `pix+${c2.j.numero.toLowerCase()}@tabacariabrutt.com.br`);
  assert.deepEqual(idemKeys.slice(n), [`${c2.j.pedido_id}-1`, `${c2.j.pedido_id}-1-interno`], "a 2ª chamada usa outra chave de idempotência");
});
await t("saudação não se repete para o mesmo contato", async () => {
  const c = await call("criar", { ...base, entrega: { tipo: "cliente" } });
  proximoMp = { status: "approved", status_detail: "accredited" };
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "credito", formData: { token: "tok", payment_method_id: "master", installments: 12, payer: { email: "a@b.co" } } }); await flush();
  assert.equal(whats.filter(m => m.text.includes("Seja bem-vindo")).length, 1);
  assert.equal(mpPays.get(String(mpSeq))._req.installments, 1, "crédito sempre à vista");
});
await t("cartão recusado: status recusado + aviso; nova tentativa usa nova chave de idempotência e aprova", async () => {
  const c = await call("criar", { ...base, whats: "21977776666", entrega: { tipo: "cliente" } });
  proximoMp = { status: "rejected", status_detail: "cc_rejected_insufficient_amount" };
  const p1 = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "debito", formData: { token: "t1", payment_method_id: "debmaster", payer: { email: "a@b.co" } } });
  assert.equal(p1.j.status, "recusado");
  assert.equal(whats.filter(m => m.number === "5521977776666" && m.text.includes("não aprovado")).length, 1);
  const recusado = String(mpSeq);
  proximoMp = { status: "approved", status_detail: "accredited" };
  const p2 = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "debito", formData: { token: "t2", payment_method_id: "debmaster", payer: { email: "a@b.co" } } }); await flush();
  assert.equal(p2.j.status, "pago");
  assert.deepEqual(idemKeys.slice(-2), [`${c.j.pedido_id}-1`, `${c.j.pedido_id}-2`]);
  // webhook atrasado da tentativa recusada não "despaga" o pedido
  await C.handler(new Request(`${F}?acao=webhook`, { method: "POST", headers: assina(recusado, "req-late"), body: JSON.stringify({ type: "payment", data: { id: recusado } }) }));
  assert.equal(db.pedidos.find(p => p.id === c.j.pedido_id).status, "pago");
});
await t("Pix expirado vira 'expirado' e avisa o cliente (status reconciliado pela consulta)", async () => {
  const c = await call("criar", { ...base, whats: "21966665555", entrega: { tipo: "cliente" } });
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "x@y.com" } } });
  Object.assign(mpPays.get(String(mpSeq)), { status: "cancelled", status_detail: "expired" });
  db.pedidos.find(p => p.id === c.j.pedido_id).updated_at = new Date(Date.now() - 60e3).toISOString();
  const s = await getStatus(c.j.pedido_id);
  assert.equal(s.status, "expirado");
  assert.equal(whats.filter(m => m.number === "5521966665555" && m.text.includes("Pix expirado")).length, 1);
});
await t("valor divergente no MP não marca como pago", async () => {
  const c = await call("criar", { ...base, whats: "21955554444", entrega: { tipo: "cliente" } });
  proximoMp = { status: "pending" };
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "x@y.com" } } });
  Object.assign(mpPays.get(String(mpSeq)), { status: "approved", transaction_amount: 1 });
  await C.processarPagamento(mpPays.get(String(mpSeq)));
  assert.equal(db.pedidos.find(p => p.id === c.j.pedido_id).status, "aguardando_pagamento");
});
await t("concluir exige staff", async () => {
  const r = await call("concluir", { pedido_id: pixPedido });
  assert.equal(r.status, 403);
});
await t("sem MP_ACCESS_TOKEN o checkout responde 503 (site cai no fluxo antigo)", async () => {
  const tok = ENV.MP_ACCESS_TOKEN; delete ENV.MP_ACCESS_TOKEN;
  assert.equal((await call("criar", { ...base, entrega: { tipo: "cliente" } })).status, 503);
  ENV.MP_ACCESS_TOKEN = tok;
});
await t("cartão bloqueado por padrão (só Pix)", async () => {
  delete ENV.MP_ACEITA_CARTAO;
  const c = await call("criar", { ...base, whats: "21933332222", entrega: { tipo: "cliente" } });
  const r = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "credito", formData: { token: "t", payment_method_id: "master", payer: { email: "a@b.co" } } });
  assert.equal(r.status, 400); assert.match(r.j.erro, /só Pix/);
  ENV.MP_ACEITA_CARTAO = "1";
});
await t("dataMP formata no fuso de Brasília", async () => {
  assert.equal(C.dataMP(new Date("2026-10-10T21:30:00Z")), "2026-10-10T18:30:00.000-03:00");
});

// ── notificações da equipe (Web Push): o aparelho simulado descriptografa e confere a assinatura VAPID ──
const P = await import("./push.ts");
async function hk(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8));
}
const te = new TextEncoder();
async function aparelho(caminho: string, user_id = "u-staff") {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  db.push_assinaturas.push({ id: crypto.randomUUID(), endpoint: "https://push.test" + caminho, p256dh: P.b64u(pub), auth: P.b64u(auth), ativo: true, falhas: 0, user_id });
  return { par, pub, auth };
}
async function abre(ua: any, corpo: Uint8Array) {   // RFC 8291 do lado do navegador
  const salt = corpo.slice(0, 16), idlen = corpo[20], asPub = corpo.slice(21, 21 + idlen), ct = corpo.slice(21 + idlen);
  const k = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: k }, ua.par.privateKey, 256));
  const info = new Uint8Array([...te.encode("WebPush: info\0"), ...ua.pub, ...asPub]);
  const ikm = await hk(ua.auth, ecdh, info, 32);
  const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), ct));
  assert.equal(pt[pt.length - 1], 2);
  return JSON.parse(new TextDecoder().decode(pt.slice(0, -1)));
}
async function vapidOk(h: string) {
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
  const [a, b, c] = jwt.split(".");
  const chave = await crypto.subtle.importKey("raw", P.deB64u(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, chave, P.deB64u(c), te.encode(`${a}.${b}`)), "assinatura VAPID");
  const claims = JSON.parse(new TextDecoder().decode(P.deB64u(b)));
  assert.equal(claims.aud, "https://push.test"); assert.match(claims.sub, /^mailto:/); assert.ok(claims.exp > Date.now() / 1000);
  return k;
}
await t("avisa a equipe no celular: Pix gerado e pago, 1 vez cada, criptografado e assinado", async () => {
  const ua = await aparelho("/meu-celular"); await aparelho("/morto");
  const c = await call("criar", { ...base, nome: "Maria Push", whats: "21977771111", entrega: { tipo: "cliente" } });
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "m@p.com" } } });
  await flush();
  const p1 = pushes.filter(x => x.path === "/meu-celular");
  assert.equal(p1.length, 1);
  const d1 = await abre(ua, p1[0].corpo);
  assert.match(d1.title, /Pix gerado #BR-/); assert.match(d1.body, /Maria Push · R\$ 25,00/); assert.equal(d1.url, "/admin/#/pedidos?ped=" + c.j.pedido_id); assert.match(d1.body, /👉/);
  assert.equal(p1[0].headers["Content-Encoding"], "aes128gcm"); assert.equal(p1[0].headers.Urgency, "high");
  const pubServidor = await vapidOk(p1[0].headers.Authorization);
  assert.equal(pubServidor, db.push_config[0].vapid_public);                       // chave gerada e guardada no servidor
  assert.equal(db.push_assinaturas.find(s => s.endpoint.endsWith("/morto")).ativo, false);   // 410 = aparelho saiu
  const pago = { ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" };
  await C.processarPagamento(pago); await C.processarPagamento(pago); await flush();
  const p2 = pushes.filter(x => x.path === "/meu-celular");
  assert.equal(p2.length, 2, "pago avisa 1 vez só");
  const d2 = await abre(ua, p2[1].corpo);
  assert.match(d2.title, /Pedido PAGO #BR-/); assert.equal(d2.fixo, true);
  const ped = db.pedidos.find(p => p.id === c.j.pedido_id);
  assert.equal(ped.visto_em, null);                                                // pago volta a piscar no admin
});
await t("push_chave e push_teste exigem staff", async () => {
  assert.equal((await call("push_chave", {})).status, 403);
  assert.equal((await call("push_teste", { endpoint: "https://push.test/meu-celular" })).status, 403);
});

// ── tela "Acompanhe seu pedido" + etapas da equipe ──
const equipe = { Authorization: "Bearer token-equipe" };
await t("status traz a linha do tempo sem endereço, telefone nem dados de pagamento", async () => {
  const c = await call("criar", { ...base, nome: "Ana Acomp Silva", whats: "21966665555", entrega: { tipo: "cliente" } });
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "a@a.com" } } });
  await C.processarPagamento({ ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" }); await flush();
  const j = await getStatus(c.j.pedido_id);
  assert.equal(j.acomp.status, "pago"); assert.equal(j.acomp.tipo, "cliente"); assert.equal(j.acomp.nome, "Ana");
  assert.ok(j.acomp.criado && j.acomp.pago); assert.equal(j.acomp.saiu, null);
  assert.deepEqual(j.acomp.itens, [{ qtd: 1, nome: "Essência Ziggy Menta", subtotal: 25 }]);
  const txt = JSON.stringify(j.acomp);
  assert.ok(!/21966665555|Silva|mp_payment|endereco/.test(txt), "nada sensível no acompanhamento");
});
await t("etapa 'saiu para entrega': só equipe, só entrega da loja, 1 vez, com mensagem e link de acompanhamento", async () => {
  rotaM = 1500;
  const c = await call("criar", { ...base, whats: "21955554444", entrega: { tipo: "entrega", endereco: { rua: "Rua A", numero: "10", bairro: "Campo Grande", cidade: "Rio de Janeiro", uf: "RJ" }, geo: { lat: -22.88, lng: -43.61 } } });
  assert.equal(c.status, 200, JSON.stringify(c.j));
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "b@b.com" } } });
  assert.equal((await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe)).status, 409);   // ainda não pago
  await C.processarPagamento({ ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" }); await flush();
  assert.equal((await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" })).status, 403);            // sem login de equipe
  whats.length = 0;
  const r = await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe);
  assert.equal(r.status, 200); assert.ok(r.j.saiu_em);
  assert.match(decodeURIComponent(r.j.whats.link), /saiu para entrega[\s\S]*Rua A, 10[\s\S]*\/pedido\/\?id=/);
  assert.ok(r.j.whats.link.startsWith("https://wa.me/5521955554444?text="));
  assert.equal(r.j.whats.auto, true);                                                // Evolution configurada no teste
  assert.equal(whats.filter(w => /saiu para entrega/.test(w.text)).length, 1);
  const r2 = await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe);
  assert.equal(r2.j.saiu_em, r.j.saiu_em);                                          // idempotente
  assert.equal(whats.filter(w => /saiu para entrega/.test(w.text)).length, 1);
  assert.ok((await getStatus(c.j.pedido_id)).acomp.saiu);
  const fim = await call("concluir", { pedido_id: c.j.pedido_id }, equipe);
  assert.match(decodeURIComponent(fim.j.whats.link), /Pedido entregue/);
});
await t("cliente que chama Uber/99: pago (pede a corrida) → motoboy retirou → concluído", async () => {
  whats.length = 0;
  const c = await call("criar", { ...base, whats: "21944443333", entrega: { tipo: "cliente" } });
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "c@c.com" } } });
  assert.equal((await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe)).status, 409);   // ainda não pago
  await C.processarPagamento({ ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" }); await flush();
  const pago = whats.find(w => /Pagamento confirmado/.test(w.text) && w.number === "5521944443333");
  assert.match(pago.text, /pedir o Uber Flash ou 99[\s\S]*Rua 18, 145[\s\S]*link da corrida/);
  const link = await call("etapa", { pedido_id: c.j.pedido_id, etapa: "link" }, equipe);
  assert.equal(link.status, 200); assert.ok(link.j.corrida_link_em);
  assert.match(decodeURIComponent(link.j.whats.link), /Link da corrida recebido[\s\S]*\/pedido\/\?id=/);
  const r = await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe);
  assert.equal(r.status, 200); assert.ok(r.j.saiu_em);
  assert.match(decodeURIComponent(r.j.whats.link), /Entregador já retirou seu pedido[\s\S]*\/pedido\/\?id=/);
  assert.equal(whats.filter(w => /Entregador já retirou/.test(w.text)).length, 1);
  await call("etapa", { pedido_id: c.j.pedido_id, etapa: "saiu" }, equipe);
  assert.equal(whats.filter(w => /Entregador já retirou/.test(w.text)).length, 1);                // 1 vez só
  const a = (await getStatus(c.j.pedido_id)).acomp; assert.equal(a.status, "pago"); assert.ok(a.saiu);
  const fim = await call("concluir", { pedido_id: c.j.pedido_id }, equipe);
  assert.equal(fim.status, 200); assert.match(decodeURIComponent(fim.j.whats.link), /Pedido concluído/);
  assert.equal((await getStatus(c.j.pedido_id)).acomp.status, "concluido");
});
await t("sem o robô do WhatsApp: a equipe recebe o link com a mensagem pronta", async () => {
  const url = ENV.EVOLUTION_API_URL; delete ENV.EVOLUTION_API_URL;
  const c = await call("criar", { ...base, whats: "21933330000", entrega: { tipo: "cliente" } });
  await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "d@d.com" } } });
  await C.processarPagamento({ ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" }); await flush();
  const fim = await call("concluir", { pedido_id: c.j.pedido_id }, equipe);
  assert.equal(fim.j.whats.auto, false); assert.ok(fim.j.whats.link.startsWith("https://wa.me/5521933330000?text="));
  ENV.EVOLUTION_API_URL = url;
});
await t("taxa de entrega: endereço digitado conferido no mapa (coordenada do navegador não manda sozinha)", async () => {
  const end = { rua: "Rua Dezoito", numero: "200", cidade: "Rio de Janeiro", uf: "RJ", bairro: "Campo Grande" };
  const cli = { ...base, whats: "21944440000" };
  // confere: o mapa acha o mesmo lugar (diferença pequena) → taxa normal, conferido
  rotaM = 1500; mapa = [{ rua: "Rua Dezoito", numero: "200", lat: -22.8819, lng: -43.6140 }];
  let r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo: { lat: -22.8817, lng: -43.6138 }, endereco: end } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 5);
  let ped = db.pedidos.find(p => p.id === r.j.pedido_id); assert.equal(ped.entrega.conferencia.exato, true); assert.ok(ped.entrega.conferencia.dif_km < 0.6);
  // golpe: manda a coordenada da porta da loja, mas o endereço digitado fica a 9 km → vale a distância do mapa → fora da área
  mapa = [{ rua: "Rua Dezoito", numero: "200", lat: -22.95, lng: -43.70 }]; rotaPorLng["-43.7"] = 9000;
  r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo: { lat: -22.8815, lng: -43.6136 }, endereco: end } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 19, "endereço do mapa a 9 km paga pelo km rodado, não pela coordenada da loja"); assert.ok(r.j.km > 8);
  // golpe menor: endereço real a 3,4 km, coordenada a 1,5 km → cobra a taxa dos 3,4 km (5 + 1,4 × 2 = 7,80)
  mapa = [{ rua: "Rua Dezoito", numero: "200", lat: -22.90, lng: -43.63 }]; rotaPorLng["-43.63"] = 3400;
  r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo: { lat: -22.8815, lng: -43.6136 }, endereco: end } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 7.8); assert.equal(r.j.km, 3.4);
  ped = db.pedidos.find(p => p.id === r.j.pedido_id); assert.equal(ped.entrega.conferencia.km_mapa, 3.4);
  // número que o mapa não conhece: não bloqueia, mas fica "não conferido" para a equipe
  mapa = [{ rua: "Rua Dezoito", numero: "1", lat: -22.90, lng: -43.63 }];
  r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo: { lat: -22.8817, lng: -43.6138 }, endereco: end } });
  assert.equal(r.status, 200); ped = db.pedidos.find(p => p.id === r.j.pedido_id); assert.equal(ped.entrega.conferencia.exato, false);
  mapa = []; rotaM = 1800;
});
await t("Conjunto Campinho (pedido da IA): homônima longe não muda a taxa; casa achada no conjunto a 3,4 km soma por km", async () => {
  const end = { rua: "Rua 5", numero: "120", cidade: "Rio de Janeiro", uf: "RJ", bairro: "Conjunto Campinho (Campo Grande)" };
  const geo = { lat: -22.882284, lng: -43.6161089 }, cli = { ...base, whats: "21933330001" };
  rotaM = 500; mapa = [{ rua: "Rua 5", numero: "120", bairro: "Santa Cruz", lat: -22.92, lng: -43.69 }];
  let r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo, endereco: end } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 5);
  assert.equal(db.pedidos.find(p => p.id === r.j.pedido_id).entrega.conferencia.exato, false);
  mapa = [{ rua: "Rua 5", numero: "120", bairro: "Campo Grande", lat: -22.8890, lng: -43.6300 }]; rotaPorLng["-43.63"] = 3400;
  r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo, endereco: end } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 7.8);
  // fora do conjunto, rua homônima em OUTRO bairro também não vale como conferência
  mapa = [{ rua: "Rua 5", numero: "120", bairro: "Santa Cruz", lat: -22.92, lng: -43.69 }];
  r = await call("criar", { ...cli, entrega: { tipo: "entrega", geo: { lat: -22.8817, lng: -43.6138 }, endereco: { ...end, bairro: "Campo Grande" } } });
  assert.equal(r.status, 200); assert.equal(r.j.taxa_entrega, 5);
  mapa = []; rotaM = 1800; delete rotaPorLng["-43.63"];
});
await t("segurança: nome sem links, freio de pedidos em massa, estoque conferido de novo no pagar, aviso só p/ equipe ativa", async () => {
  assert.equal(C.nomeLimpo("https://golpe.example/pix Maria"), "Maria");
  assert.equal(C.nomeLimpo("golpe.com.br João"), "João");
  assert.equal(C.nomeLimpo("Ana D'Ávila-Souza"), "Ana D'Ávila-Souza");
  assert.equal(C.nomeLimpo("<script>x</script>"), "script x script");
  C._limites({ ipMax: 2, whatsAbertosHora: 1e6, whatsDia: 1e6 });
  const h = { "x-forwarded-for": "9.9.9.9" }, cli = { ...base, whats: "21955550000", entrega: { tipo: "cliente" } };
  const r1 = await call("criar", cli, h), r2 = await call("criar", cli, h), r3 = await call("criar", cli, h);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200); assert.equal(r3.status, 429);
  assert.equal((await call("criar", cli, { "x-forwarded-for": "8.8.8.8" })).status, 200, "outro aparelho segue");
  C._limites({ ipMax: 1e6, whatsAbertosHora: 3, whatsDia: 1e6 });
  assert.equal((await call("criar", cli)).status, 429, "4º pedido aberto do mesmo número na hora");
  assert.equal((await call("criar", { ...cli, whats: "21955551111" })).status, 200);
  C._limites({ ipMax: 1e6, whatsAbertosHora: 1e6, whatsDia: 1e6 });
  const c = await call("criar", { ...base, whats: "21955552222", itens: [{ id: "car-1", q: 1 }, { id: "ess-1", q: 1 }], entrega: { tipo: "cliente" } });
  assert.equal(c.status, 200);
  const carvao = products.find(p => p.site_product_id === "car-1")!; carvao.stock = 0;
  const pg = await call("pagar", { pedido_id: c.j.pedido_id, metodo: "pix", formData: { payment_method_id: "pix", payer: { email: "a@b.com" } } });
  assert.equal(pg.status, 409); assert.match(pg.j.erro, /Carvão/); carvao.stock = 1;
  db.staff[0].active = false;
  const antes = pushes.length;
  assert.equal(await C.avisarEquipe({ id: crypto.randomUUID(), numero: "BR-999999", total: 10, cliente_nome: "X", entrega: { tipo: "cliente" } }, "pago"), 0);
  assert.equal(pushes.length, antes, "desativado não recebe"); db.staff[0].active = true;
});
await t("sem WhatsApp (só o nome): cria, gera Pix, paga sem mandar mensagem ao cliente; cancelado e pago depois vira pago", async () => {
  const { whats: _w, ...semWhats } = base;
  const c = await call("criar", { ...semWhats, entrega: { tipo: "cliente" } });
  assert.equal(c.status, 200); const ped = db.pedidos.find(p => p.id === c.j.pedido_id); assert.equal(ped.cliente_whats, null);
  assert.equal((await call("criar", { ...semWhats, whats: "  ", entrega: { tipo: "cliente" } })).status, 200, "WhatsApp em branco = sem WhatsApp");
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  const pg = await call("pagar", { pedido_id: ped.id, metodo: "pix", formData: { payment_method_id: "pix", payer: {} } });
  assert.equal(pg.status, 200); assert.match(pg.j.pix.qr_code, /^000201PIX/);
  ped.status = "cancelado";                                   // a equipe cancelou com o Pix em aberto…
  const id = String(mpSeq); mpPays.get(id).status = "approved"; // …e o cliente pagou mesmo assim
  const antes = whats.length;
  await C.processarPagamento(mpPays.get(id)); await flush();
  assert.equal(ped.status, "pago", "pagamento depois do cancelamento aparece como pago");
  assert.equal(whats.filter(m => m.number === null || m.number === "null").length, 0, "nada vai para número vazio");
  assert.ok(whats.length >= antes);
  ped.status = "cancelado";                                   // pago e cancelado pela equipe: aviso repetido do MP não desfaz
  await C.processarPagamento(mpPays.get(id));
  assert.equal(ped.status, "cancelado");
  assert.match(C._whatsDe({ cliente_whats: null }, "oi", false).link, /^https:\/\/wa\.me\/\?text=oi$/, "sem número: link abre o WhatsApp para escolher a conversa");
});
await t("um aviso por etapa, com o que fazer; quem fez a etapa não recebe o aviso dela", async () => {
  db.staff.push({ user_id: "u-outro", active: true });
  const outro = await aparelho("/outro-celular", "u-outro"), meu = () => pushes.filter(x => x.path === "/meu-celular").length;
  const c = await call("criar", { ...base, nome: "Ana Etapas", entrega: { tipo: "cliente" } }), id = c.j.pedido_id;
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  // espera o aviso do Pix gerado (vai em segundo plano) antes de pagar; sem isso os dois avisos às vezes chegavam fora de ordem
  await call("pagar", { pedido_id: id, metodo: "pix", formData: { payment_method_id: "pix", payer: {} } }); await flush();
  await C.processarPagamento({ ...mpPays.get(String(mpSeq)), status: "approved", status_detail: "accredited" }); await flush();
  const doOutro = async () => Promise.all(pushes.filter(x => x.path === "/outro-celular").map(x => abre(outro, x.corpo)));
  let av = await doOutro();
  assert.deepEqual(av.map(x => x.title.split(" #")[0]), ["⚠️ Pix gerado", "✅ Pedido PAGO"]);
  assert.match(av[1].body, /👉 A fazer: separar o pedido; o cliente chama o Uber\/99/);
  const antes = meu();
  await call("etapa", { pedido_id: id, etapa: "saiu" }, equipe); await flush();
  await call("concluir", { pedido_id: id }, equipe); await flush();
  av = await doOutro();
  assert.deepEqual(av.slice(2).map(x => x.title.split(" #")[0]), ["🛵 Motoboy retirou", "✔ Pedido concluído"]);
  assert.match(av[2].body, /Concluir pedido/); assert.ok(av.every(x => x.url === "/admin/#/pedidos?ped=" + id && x.tag === av[0].tag));
  assert.equal(meu(), antes, "o aparelho de quem tocou na etapa não é avisado");
  await call("etapa", { pedido_id: id, etapa: "saiu" }, equipe); await flush();
  assert.equal((await doOutro()).length, 4, "repetir a etapa não avisa de novo");
  db.staff.pop();
});
await t("lembrete de pedido parado: 20 e 45 min sem sair, 1 h depois de sair; reserva fica de fora; exige o segredo", async () => {
  const min = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
  const base0 = { status: "pago", reserva: false, entrega: { tipo: "entrega" } };
  const d = C.lembretesDevidos([{ ...base0, id: "a", pago_em: min(10) }, { ...base0, id: "b", pago_em: min(25) }, { ...base0, id: "c", pago_em: min(50) },
    { ...base0, id: "d", pago_em: min(90), saiu_em: min(30) }, { ...base0, id: "e", pago_em: min(120), saiu_em: min(70) }, { ...base0, id: "f", reserva: true, pago_em: min(60) }, { ...base0, id: "g", status: "concluido", pago_em: min(60) }]);
  assert.deepEqual(d.map(x => x.ped.id + ":" + x.tipo), ["b:lembrete_pago", "c:lembrete_pago2", "e:lembrete_saiu"]);
  const l = C.avisoEquipe({ id: "x", numero: "BR-000900", total: 30, cliente_nome: "Rui", pago_em: min(25), entrega: { tipo: "entrega" } }, "lembrete_pago");
  assert.match(l.title, /⏰ Pago há 25 min e parado #BR-000900/); assert.match(l.body, /👉 A fazer: separar e tocar em 🛵 Saiu para entrega/); assert.equal(l.fixo, true);
  const r401 = await C.handler(new Request(`${F}?acao=lembretes`, { method: "POST", body: "{}" }));
  assert.equal(r401.status, 401);
  const r = await C.handler(new Request(`${F}?acao=lembretes`, { method: "POST", headers: { "x-sync-secret": "seg-teste" }, body: "{}" }));
  assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
});
await t("contato opcional: e-mail e WhatsApp válidos são guardados; promoções só com a caixa e algum contato", async () => {
  const { whats: _w, ...semWhats } = base;
  const c1 = await call("criar", { ...semWhats, email: "Ana@Ex.com", whats: "21988887777", promos: true, entrega: { tipo: "cliente" } });
  assert.equal(c1.status, 200); let p = db.pedidos.find(x => x.id === c1.j.pedido_id);
  assert.equal(p.cliente_email, "ana@ex.com"); assert.equal(p.cliente_whats, "5521988887777"); assert.equal(p.aceita_promos, true);
  const c2 = await call("criar", { ...semWhats, promos: true, entrega: { tipo: "cliente" } });
  p = db.pedidos.find(x => x.id === c2.j.pedido_id); assert.equal(p.aceita_promos, false, "sem contato não vale a caixa");
  const c3 = await call("criar", { ...semWhats, whats: "21988887777", entrega: { tipo: "cliente" } });
  p = db.pedidos.find(x => x.id === c3.j.pedido_id); assert.equal(p.aceita_promos, false, "sem marcar a caixa = não aceita");
  assert.equal((await call("criar", { ...semWhats, email: "nao-e-email", entrega: { tipo: "cliente" } })).status, 400);
});
await t("entrega pela loja desligada no CMS: recusa a entrega da loja e aceita Uber/99", async () => {
  const ent = { tipo: "entrega", geo: { lat: -22.9, lng: -43.6 }, endereco: { rua: "Rua A", numero: "10", cidade: "Rio de Janeiro", uf: "RJ", bairro: "Campo Grande" } };
  db.site_cms_config = [{ id: "homepage", config: { entrega: { loja: false } } }]; C._limpaEntregaCache();
  let r = await call("criar", { ...base, entrega: ent });
  assert.equal(r.status, 409); assert.match(r.j.erro, /Uber ou 99/);
  r = await call("criar", { ...base, entrega: { tipo: "cliente" } }); assert.equal(r.status, 200, "Uber/99 continua");
  db.site_cms_config = [{ id: "homepage", config: { entrega: { loja: true } } }]; C._limpaEntregaCache();
  r = await call("criar", { ...base, entrega: ent }); assert.equal(r.status, 200, "religada volta a aceitar");
  delete db.site_cms_config; C._limpaEntregaCache();
  r = await call("criar", { ...base, entrega: ent }); assert.equal(r.status, 200, "sem ler o CMS vale ligada (como antes do botão)");
});
console.log(`\n${ok} testes passaram`);
