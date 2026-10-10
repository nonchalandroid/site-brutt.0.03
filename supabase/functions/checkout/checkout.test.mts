// Testes da função checkout com Supabase, Mercado Pago e Evolution API simulados em memória.
// Rodar: node --experimental-strip-types supabase/functions/checkout/checkout.test.mts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv", MP_ACCESS_TOKEN: "TEST-token", MP_PUBLIC_KEY: "TEST-pk",
  MP_WEBHOOK_SECRET: "segredo", EVOLUTION_API_URL: "https://evo.test", EVOLUTION_API_KEY: "evo", EVOLUTION_INSTANCE: "brutt", WHATS_LOJA_AVISOS: "21999990000",
};
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
const bg: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => bg.push(p) };
const realTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: any, ms: number) => realTimeout(fn, ms >= 3000 && ms < 5000 ? 1 : ms); // pula as pausas de 3 s

// ── banco em memória ──
const db: Record<string, any[]> = { pedidos: [], wa_notificacoes: [], wa_contatos: [], mp_eventos: [] };
const products = [
  { site_product_id: "ess-1", name: "Essência Ziggy Menta", price: 25, promo_price: null, stock: 5, is_active: true },
  { site_product_id: "car-1", name: "Carvão 1kg", price: 30, promo_price: 19.9, stock: 1, is_active: true },
];
const UNIQ: Record<string, (a: any, b: any) => boolean> = {
  wa_notificacoes: (a, b) => a.pedido_id === b.pedido_id && a.tipo === b.tipo,
  wa_contatos: (a, b) => a.numero === b.numero, mp_eventos: (a, b) => a.chave === b.chave,
};
function filtros(q: URLSearchParams) {
  const fs: ((r: any) => boolean)[] = [];
  q.forEach((v, k) => {
    if (k === "select" || k === "order" || k === "limit") return;
    if (v.startsWith("eq.")) fs.push(r => String(r[k]) === v.slice(3));
    else if (v.startsWith("in.(")) { const l = v.slice(4, -1).split(",").map(s => s.replace(/^"|"$/g, "")); fs.push(r => l.includes(String(r[k]))); }
  });
  return (r: any) => fs.every(f => f(r));
}
let seq = 41, mpSeq = 9000;
const mpPays = new Map<string, any>();
let proximoMp: any = { status: "pending", status_detail: "pending_waiting_transfer" };
const whats: { numero: string; text: string }[] = [];
const idemKeys: string[] = [];
const res = (o: any, status = 200) => new Response(o == null ? "" : JSON.stringify(o), { status });

(globalThis as any).fetch = async (input: string, init: any = {}) => {
  const u = new URL(input), m = (init.method || "GET").toUpperCase(), body = init.body ? JSON.parse(init.body) : null;
  if (u.host === "router.project-osrm.org") return res({ code: "Ok", routes: [{ distance: 4600 }] });
  if (u.host === "evo.test") { assert.equal(init.headers.apikey, "evo"); whats.push(body); return res({ key: { id: "x" } }, 201); }
  if (u.host === "api.mercadopago.com") {
    assert.equal(init.headers.Authorization, "Bearer TEST-token");
    if (m === "POST") {
      idemKeys.push(init.headers["X-Idempotency-Key"]);
      const id = String(++mpSeq);
      const p = { id: +id, currency_id: "BRL", transaction_amount: body.transaction_amount, external_reference: body.external_reference, payment_method_id: body.payment_method_id, ...proximoMp, _req: body,
        point_of_interaction: body.payment_method_id === "pix" ? { transaction_data: { qr_code: "000201PIX" + id, qr_code_base64: "aW1n" } } : undefined, date_of_expiration: body.date_of_expiration };
      mpPays.set(id, p); return res(p, 201);
    }
    const id = u.pathname.split("/").pop()!;
    if (m === "PUT") { mpPays.get(id).status = body.status; return res(mpPays.get(id)); }
    return mpPays.has(id) ? res(mpPays.get(id)) : res({}, 404);
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
await t("entrega pela loja: taxa recalculada no servidor (4,6 km → R$ 10,40)", async () => {
  const r = await call("criar", { ...base, entrega: { tipo: "entrega", geo: { lat: -22.9, lng: -43.6 }, endereco: { rua: "Rua A", numero: "10", cidade: "Rio de Janeiro", uf: "rj", bairro: "Campo Grande" } } });
  assert.equal(r.j.taxa_entrega, 10.4); assert.equal(r.j.total, 35.4); assert.equal(r.j.km, 4.6);
});

let pixPedido = "";
await t("Pix: gera QR dinâmico com valor do banco; pendente NÃO marca pago", async () => {
  const c = await call("criar", { ...base, entrega: { tipo: "cliente" } }); pixPedido = c.j.pedido_id;
  proximoMp = { status: "pending", status_detail: "pending_waiting_transfer" };
  const p = await call("pagar", { pedido_id: pixPedido, metodo: "pix", formData: { payment_method_id: "pix", transaction_amount: 0.01, payer: { email: "joao@ex.com" } } });
  assert.equal(p.status, 200); assert.equal(p.j.status, "aguardando_pagamento"); assert.match(p.j.pix.qr_code, /^000201PIX/); assert.equal(p.j.pix.qr_code_base64, "aW1n");
  const pay = mpPays.get(String(mpSeq)); assert.equal(pay._req.transaction_amount, 25); assert.equal(pay._req.external_reference, pixPedido);
  assert.match(pay._req.date_of_expiration, /-03:00$/); assert.equal(pay._req.notification_url, F + "?acao=webhook");
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
await t("dataMP formata no fuso de Brasília", async () => {
  assert.equal(C.dataMP(new Date("2026-10-10T21:30:00Z")), "2026-10-10T18:30:00.000-03:00");
});
console.log(`\n${ok} testes passaram`);
