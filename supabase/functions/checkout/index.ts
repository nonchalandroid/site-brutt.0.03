// CHECKOUT — pedidos pagos pelo Mercado Pago (Payment Brick: Pix, débito e crédito à vista)
// + avisos automáticos no WhatsApp pela Evolution API.
//
// Rotas (todas em /functions/v1/checkout?acao=...):
//   POST criar     → valida o carrinho com os preços do BANCO, calcula a entrega e grava o pedido
//   POST pagar     → cria o pagamento no Mercado Pago com o valor do pedido gravado (nunca o do navegador)
//   GET  status    → situação do pedido (o site consulta enquanto espera o Pix)
//   POST webhook   → notificações oficiais do Mercado Pago (assinatura x-signature conferida)
//   POST concluir  → equipe marca o pedido como concluído (exige login de staff)
//
// Segredos (variáveis de ambiente da função — nunca no site):
//   MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET
//   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, WHATS_LOJA_AVISOS (opcional)
// O "pagamento confirmado" só é marcado depois de consultar o pagamento direto na API do
// Mercado Pago (GET /v1/payments/{id}) — o status enviado pelo navegador é ignorado.

// trim: um espaço ou quebra de linha colado junto no painel de Secrets não pode virar "chave vazia" silenciosa
const env = (k: string) => String(((globalThis as any).Deno?.env?.get(k) as string | undefined) ?? "").trim().replace(/^["']|["']$/g, "");
const SB = () => env("SUPABASE_URL"), SK = () => env("SUPABASE_SERVICE_ROLE_KEY");
const hdr = (x: Record<string, string> = {}) => ({ apikey: SK(), Authorization: "Bearer " + SK(), "Content-Type": "application/json", ...x });
async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: hdr((init.headers as Record<string, string>) || {}) });
  const txt = await r.text();
  if (!r.ok) { const e: any = new Error(`supabase ${path.split("?")[0]}: ${r.status} ${txt.slice(0, 200)}`); e.status = r.status; e.body = txt; throw e; }
  return txt ? JSON.parse(txt) : null;
}
const sbGet = (path: string) => sb(path);
const sbRpc = (nome: string, args: unknown = {}) => sb(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });
const sbInsert = (path: string, body: unknown, prefer = "return=representation") => sb(path, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(body) });
const sbPatch = (path: string, body: unknown) => sb(path, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const brl = (v: number) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const cent = (v: number) => Math.round(v * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Regras da loja (as mesmas do site: ENTREGA_LOJA e MIN em index.html) ──
export const LOJA = { nome: "Tabacaria Brutt", endereco: "Rua 18, 145 - Campo Grande, Rio de Janeiro - RJ" };
export const ENTREGA_LOJA = { lat: -22.881489, lng: -43.61375, raioMaxKm: 8, taxaBase: 8, baseAteKm: 3, porKmExtra: 1.5, taxaMaxima: 20 };
export const PEDIDO_MINIMO = 20;
export const PIX_MINUTOS = 30;
const INTERVALO_MSG_MS = 3000;

export function taxaEntrega(km: number) {
  const t = km <= ENTREGA_LOJA.baseAteKm ? ENTREGA_LOJA.taxaBase : Math.min(ENTREGA_LOJA.taxaBase + (km - ENTREGA_LOJA.baseAteKm) * ENTREGA_LOJA.porKmExtra, ENTREGA_LOJA.taxaMaxima);
  return cent(t);
}
export function haversineKm(la1: number, lo1: number, la2: number, lo2: number) {
  const r = 6371, d = Math.PI / 180, a = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
async function distanciaKm(lat: number, lng: number) {
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${ENTREGA_LOJA.lng},${ENTREGA_LOJA.lat};${lng},${lat}?overview=false`, { signal: c.signal });
    clearTimeout(t);
    const j = await r.json();
    if (j?.code === "Ok" && j.routes?.[0]?.distance > 0) return Math.round(j.routes[0].distance / 100) / 10;
  } catch { /* cai na estimativa */ }
  return Math.round(haversineKm(ENTREGA_LOJA.lat, ENTREGA_LOJA.lng, lat, lng) * 1.3 * 10) / 10;
}

export function normalizaWhats(s: unknown): string | null {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
const texto = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ───────────────────────────── criar pedido ─────────────────────────────
type ItemIn = { id: string; q: number };
export async function criarPedido(body: any) {
  const nome = texto(body?.nome, 60);
  if (!nome) return { erro: "Digite seu nome.", status: 400 };
  const whats = normalizaWhats(body?.whats);
  if (!whats) return { erro: "Digite um WhatsApp válido com DDD.", status: 400 };
  const brutos: ItemIn[] = Array.isArray(body?.itens) ? body.itens : [];
  const qtd = new Map<string, number>();
  for (const it of brutos.slice(0, 80)) {
    const id = texto(it?.id, 80), q = Math.floor(Number(it?.q));
    if (!id || !/^[\w.-]+$/.test(id) || !(q > 0 && q <= 99)) return { erro: "Carrinho inválido.", status: 400 };
    qtd.set(id, (qtd.get(id) ?? 0) + q);
  }
  if (!qtd.size) return { erro: "Seu carrinho está vazio.", status: 400 };

  // Preço e estoque SEMPRE do banco (site_product_id é o id usado no carrinho do site).
  const lista = [...qtd.keys()].map(id => `"${id}"`).join(",");
  const prods: any[] = await sbGet(`products?select=site_product_id,name,price,promo_price,stock,is_active&site_product_id=in.(${encodeURIComponent(lista)})`);
  const porId = new Map(prods.map(p => [p.site_product_id, p]));
  const itens: any[] = [];
  for (const [id, q] of qtd) {
    const p = porId.get(id);
    if (!p || p.is_active === false) return { erro: "Um produto do carrinho não está mais disponível. Atualize a página.", status: 409 };
    if (Number(p.stock) < q) return { erro: `Só temos ${Math.max(0, Number(p.stock))} de “${p.name}” em estoque.`, status: 409 };
    const promo = Number(p.promo_price), preco = cent(promo > 0 ? promo : Number(p.price));
    if (!(preco > 0)) return { erro: `“${p.name}” está sem preço. Fale com a gente no WhatsApp.`, status: 409 };
    itens.push({ id, nome: p.name, qtd: q, preco, subtotal: cent(preco * q) });
  }
  const subtotal = cent(itens.reduce((s, i) => s + i.subtotal, 0));
  if (subtotal < PEDIDO_MINIMO) return { erro: `Pedido mínimo de ${brl(PEDIDO_MINIMO)}.`, status: 400 };

  let entrega: any, taxa = 0;
  if (body?.entrega?.tipo === "entrega") {
    const g = body.entrega.geo, e = body.entrega.endereco || {};
    const lat = Number(g?.lat), lng = Number(g?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { erro: "Confirme o endereço de entrega de novo.", status: 400 };
    const endereco = { rua: texto(e.rua, 120), numero: texto(e.numero, 20), complemento: texto(e.complemento, 80), bairro: texto(e.bairro, 80), cidade: texto(e.cidade, 80), uf: texto(e.uf, 2).toUpperCase(), cep: String(e.cep ?? "").replace(/\D/g, "").slice(0, 8) };
    if (!endereco.rua || !endereco.numero || !endereco.cidade) return { erro: "Endereço de entrega incompleto.", status: 400 };
    const km = await distanciaKm(lat, lng);
    if (km > ENTREGA_LOJA.raioMaxKm) return { erro: "Entrega indisponível para esse endereço. Escolha “Prefiro eu mesmo solicitar a entrega”.", status: 400 };
    taxa = taxaEntrega(km);
    entrega = { tipo: "entrega", endereco, geo: { lat, lng }, km };
  } else if (body?.entrega?.tipo === "cliente") {
    entrega = { tipo: "cliente" };   // cliente chama Uber Flash/99 por conta própria; frete da loja = 0
  } else return { erro: "Escolha como você quer receber o pedido.", status: 400 };

  const n = await sbRpc("proximo_numero_pedido");
  const numero = "BR-" + String(n).padStart(6, "0");
  const total = cent(subtotal + taxa);
  const [ped] = await sbInsert("pedidos", { numero, reserva: body?.reserva === true, cliente_nome: nome, cliente_whats: whats, itens, subtotal, taxa_entrega: taxa, total, entrega });
  return { ok: true, pedido_id: ped.id, numero, itens, subtotal, taxa_entrega: taxa, total, km: entrega.km ?? null, public_key: env("MP_PUBLIC_KEY") };
}

// ───────────────────────────── pagar ─────────────────────────────
const MP = "https://api.mercadopago.com";
async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch(MP + path, { ...init, headers: { Authorization: "Bearer " + env("MP_ACCESS_TOKEN"), "Content-Type": "application/json", ...((init.headers as Record<string, string>) || {}) } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
// Data no formato que o Mercado Pago pede: 2026-10-10T18:30:00.000-03:00
export function dataMP(d: Date) {
  const br = new Date(d.getTime() - 3 * 3600e3).toISOString().replace("Z", "");
  return br + "-03:00";
}
const METODO: Record<string, string> = { pix: "pix", debito: "debito", credito: "credito" };

export async function pagar(body: any, urlFuncao: string) {
  const id = String(body?.pedido_id ?? "");
  if (!UUID.test(id)) return { erro: "Pedido inválido.", status: 400 };
  const metodo = METODO[String(body?.metodo)];
  if (!metodo) return { erro: "Forma de pagamento inválida.", status: 400 };
  const [ped] = await sbGet(`pedidos?id=eq.${id}&select=*`);
  if (!ped) return { erro: "Pedido não encontrado.", status: 404 };
  if (ped.status === "pago" || ped.status === "concluido") return { ok: true, status: ped.status, numero: ped.numero };
  if (!["aguardando_pagamento", "recusado", "expirado"].includes(ped.status)) return { erro: "Este pedido não aceita mais pagamento.", status: 409 };
  if (Date.now() - new Date(ped.created_at).getTime() > 24 * 3600e3) return { erro: "Pedido antigo. Monte o carrinho de novo.", status: 409 };
  if (ped.tentativas >= 8) return { erro: "Muitas tentativas. Fale com a gente no WhatsApp.", status: 429 };

  const f = body?.formData || {};
  const email = texto(f?.payer?.email, 120);
  const pm = String(f?.payment_method_id ?? "");
  const pay: any = {
    transaction_amount: Number(ped.total),               // valor do BANCO
    description: `Pedido ${ped.numero} - ${LOJA.nome}`,
    external_reference: ped.id,
    notification_url: urlFuncao + "?acao=webhook",
    statement_descriptor: "TABACARIABRUTT",
    payer: { email, first_name: ped.cliente_nome.split(" ")[0] },
    metadata: { pedido_numero: ped.numero },
  };
  const ident = f?.payer?.identification;
  if (ident?.type && ident?.number) pay.payer.identification = { type: texto(ident.type, 10), number: String(ident.number).replace(/\D/g, "").slice(0, 14) };
  if (metodo === "pix") {
    if (pm !== "pix") return { erro: "Forma de pagamento inválida.", status: 400 };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "Digite um e-mail válido para o Pix.", status: 400 };
    pay.payment_method_id = "pix";
    pay.date_of_expiration = dataMP(new Date(Date.now() + PIX_MINUTOS * 60e3));
  } else {
    const token = String(f?.token ?? "");
    if (!token || !pm) return { erro: "Dados do cartão incompletos.", status: 400 };
    pay.token = token;
    pay.payment_method_id = pm;
    pay.installments = 1;                                 // crédito à vista / débito
    if (f?.issuer_id) pay.issuer_id = f.issuer_id;
  }
  // Trocou de forma de pagamento com um Pix ainda em aberto: cancela o Pix antigo (evita pagamento em dobro).
  if (ped.mp_payment_id && ped.metodo === "pix" && ped.status === "aguardando_pagamento") {
    await mp(`/v1/payments/${ped.mp_payment_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }).catch(() => {});
  }
  const tentativa = ped.tentativas + 1;
  await sbPatch(`pedidos?id=eq.${id}`, { tentativas: tentativa, metodo, status: "aguardando_pagamento", mp_payment_id: null, pix_qr: null, pix_qr_base64: null, pix_expira_em: null });
  const r = await mp("/v1/payments", { method: "POST", headers: { "X-Idempotency-Key": `${ped.id}-${tentativa}` }, body: JSON.stringify(pay) });
  if (!r.ok || !r.j?.id) {
    console.error("mp pagar", r.status, JSON.stringify(r.j).slice(0, 400));
    return { erro: "Não foi possível processar o pagamento agora. Tente de novo.", status: 502 };
  }
  const p = r.j;
  const extra: any = { mp_payment_id: String(p.id) };
  const td = p.point_of_interaction?.transaction_data;
  if (metodo === "pix" && td) Object.assign(extra, { pix_qr: td.qr_code || null, pix_qr_base64: td.qr_code_base64 || null, pix_expira_em: p.date_of_expiration || null });
  await sbPatch(`pedidos?id=eq.${id}`, extra);
  const atual = await processarPagamento(p);
  return {
    ok: true, numero: ped.numero, status: atual?.status ?? ped.status, mp_status: p.status, mp_status_detail: p.status_detail,
    pix: metodo === "pix" ? { qr_code: extra.pix_qr, qr_code_base64: extra.pix_qr_base64, expira_em: extra.pix_expira_em } : null,
  };
}

// ─────────────────── aplicar o status REAL do Mercado Pago ───────────────────
// Transições permitidas (UPDATE condicional = idempotente: rodar 2x não muda nada).
const DE: Record<string, string[]> = {
  pago: ["aguardando_pagamento", "recusado", "expirado"],
  recusado: ["aguardando_pagamento"],
  expirado: ["aguardando_pagamento"],
  cancelado: ["pago", "concluido"],
};
export function novoStatus(p: any): string | null {
  if (p.status === "approved") return "pago";
  if (p.status === "rejected") return "recusado";
  if (p.status === "cancelled") return p.payment_method_id === "pix" || p.status_detail === "expired" ? "expirado" : "recusado";
  if (p.status === "refunded" || p.status === "charged_back") return "cancelado";
  return null;                                            // pending / in_process / authorized: segue aguardando
}
export async function processarPagamento(p: any) {
  const id = String(p?.external_reference ?? "");
  if (!UUID.test(id)) return null;
  const [ped] = await sbGet(`pedidos?id=eq.${id}&select=*`);
  if (!ped) return null;
  const alvo = novoStatus(p);
  let atual = ped;
  if (alvo && DE[alvo].includes(ped.status)) {
    // Pagamento antigo (de uma tentativa anterior) só pode APROVAR; nunca recusar a tentativa nova.
    const mesmo = ped.mp_payment_id === String(p.id);
    const valorOk = Math.abs(Number(p.transaction_amount) - Number(ped.total)) < 0.01 && (p.currency_id ?? "BRL") === "BRL";
    if (alvo === "pago" && !valorOk) console.error("valor divergente", ped.numero, p.transaction_amount, ped.total);
    else if (alvo === "pago" || mesmo) {
      const patch: any = { status: alvo, mp_payment_id: String(p.id), mp_status: p.status, mp_status_detail: p.status_detail };
      if (alvo === "pago") patch.pago_em = p.date_approved || new Date().toISOString();
      const rows = await sbPatch(`pedidos?id=eq.${id}&status=in.(${DE[alvo].join(",")})`, patch);
      if (rows?.[0]) atual = rows[0];
    }
  } else if (!alvo && ped.mp_payment_id === String(p.id) && ped.mp_status !== p.status) {
    const rows = await sbPatch(`pedidos?id=eq.${id}`, { mp_status: p.status, mp_status_detail: p.status_detail });
    if (rows?.[0]) atual = rows[0];
  }
  await notificar(atual);
  return atual;
}

// ───────────────────────────── WhatsApp (Evolution API) ─────────────────────────────
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));
function emSegundoPlano(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
}
export async function enviarWhats(numero: string, text: string) {
  const base = env("EVOLUTION_API_URL").replace(/\/+$/, ""), key = env("EVOLUTION_API_KEY"), inst = env("EVOLUTION_INSTANCE");
  if (!base || !key || !inst) throw new Error("Evolution API não configurada");
  const c = new AbortController(), t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(`${base}/message/sendText/${encodeURIComponent(inst)}`, { method: "POST", signal: c.signal, headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ number: numero, text }) });
    if (!r.ok) throw new Error(`Evolution ${r.status} ${(await r.text()).slice(0, 150)}`);
  } finally { clearTimeout(t); }
}
// Reserva (pedido, tipo) — só quem conseguir inserir envia. Se o envio falhar, libera para tentar de novo.
async function enviarUmaVez(pedidoId: string, tipo: string, destino: string, msg: string) {
  try { await sbInsert("wa_notificacoes", { pedido_id: pedidoId, tipo, destino }, "return=minimal"); }
  catch (e: any) { if (e?.status === 409) return false; throw e; }
  try { await enviarWhats(destino, msg); await sbPatch(`wa_notificacoes?pedido_id=eq.${pedidoId}&tipo=eq.${tipo}`, { ok: true }); return true; }
  catch (e: any) {
    console.error("whats", tipo, String(e?.message ?? e));
    await sb(`wa_notificacoes?pedido_id=eq.${pedidoId}&tipo=eq.${tipo}`, { method: "DELETE" }).catch(() => {});
    return false;
  }
}
const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";
function linhasItens(ped: any) { return (ped.itens || []).map((i: any) => `• ${i.qtd}x ${i.nome} — ${brl(i.subtotal)}`).join("\n"); }
function linhaEntrega(ped: any) {
  const e = ped.entrega || {};
  if (e.tipo === "entrega") { const a = e.endereco || {}; return `🚚 Entrega pela loja: ${a.rua}, ${a.numero}${a.complemento ? " (" + a.complemento + ")" : ""} — ${a.bairro ? a.bairro + ", " : ""}${a.cidade}/${a.uf} · ≈ ${String(e.km).replace(".", ",")} km`; }
  return `🛵 Você mesmo solicita a entrega (Uber Flash ou 99). Endereço de coleta: ${LOJA.endereco}`;
}
const METODO_TXT: Record<string, string> = { pix: "Pix", debito: "Cartão de débito", credito: "Cartão de crédito (à vista)" };
export function mensagens(ped: any) {
  const n = primeiroNome(ped.cliente_nome);
  return {
    pagamento_confirmado: [`✅ *Pagamento confirmado!*`, ``, `Oi${n ? ", " + n : ""}! Recebemos o pagamento do pedido *#${ped.numero}* (${METODO_TXT[ped.metodo] || "online"}).`, ``, linhasItens(ped), ``, `💰 Total pago: *${brl(ped.total)}*`, linhaEntrega(ped), ``, ped.reserva ? `🕐 A loja estava fechada quando você pediu: a gente separa tudo assim que abrir.` : `Já estamos separando seu pedido. Avisamos por aqui quando estiver pronto.`].join("\n"),
    pagamento_recusado: [`⚠️ *Pagamento não aprovado*`, ``, `Oi${n ? ", " + n : ""}. O pagamento do pedido *#${ped.numero}* não foi aprovado pelo emissor do cartão. Nenhum valor foi cobrado.`, `Você pode tentar de novo no site com outro cartão ou pagar com Pix.`].join("\n"),
    pix_expirado: [`⌛ *Pix expirado*`, ``, `Oi${n ? ", " + n : ""}. O código Pix do pedido *#${ped.numero}* (${brl(ped.total)}) expirou antes do pagamento. Nada foi cobrado.`, `Se ainda quiser os produtos, é só finalizar o pedido de novo no site.`].join("\n"),
    pedido_concluido: [`📦 *Pedido concluído!*`, ``, `${n ? n + ", s" : "S"}eu pedido *#${ped.numero}* foi concluído. Obrigado pela preferência! 🔥`].join("\n"),
    saudacao: [`👋 Seja bem-vindo(a) à *${LOJA.nome}*!`, `Este é o nosso WhatsApp oficial: salve o número pra receber as novidades e falar com a equipe.`, `📍 ${LOJA.endereco}`].join("\n"),
    loja_novo_pedido: [`🔔 *NOVO PEDIDO PAGO #${ped.numero}*${ped.reserva ? " (reserva: loja fechada)" : ""}`, `👤 ${ped.cliente_nome} · wa.me/${ped.cliente_whats}`, `💳 ${METODO_TXT[ped.metodo] || "-"} · MP ${ped.mp_payment_id || "-"}`, ``, linhasItens(ped), ``, `🛒 Produtos: ${brl(ped.subtotal)} · 🚚 Entrega: ${brl(ped.taxa_entrega)}`, `💰 *Total pago: ${brl(ped.total)}*`, linhaEntrega(ped)].join("\n"),
  };
}
async function saudarSeNovo(numero: string) {
  try { await sbInsert("wa_contatos", { numero }, "return=minimal"); return true; }
  catch (e: any) { if (e?.status === 409) return false; throw e; }
}
export async function notificar(ped: any) {
  if (!ped) return;
  const m = mensagens(ped), cliente = ped.cliente_whats;
  try {
    if (ped.status === "pago" || ped.status === "concluido") {
      // Crítica: confirmação vai na hora. As demais seguem em segundo plano, com ~3 s entre mensagens.
      const enviou = await enviarUmaVez(ped.id, "pagamento_confirmado", cliente, m.pagamento_confirmado);
      const loja = normalizaWhats(env("WHATS_LOJA_AVISOS"));
      emSegundoPlano((async () => {
        if (loja) await enviarUmaVez(ped.id, "loja_novo_pedido", loja, m.loja_novo_pedido);
        if (enviou && await saudarSeNovo(cliente)) { await pausa(INTERVALO_MSG_MS); await enviarWhats(cliente, m.saudacao).catch(() => {}); }
        if (ped.status === "concluido") { await pausa(INTERVALO_MSG_MS); await enviarUmaVez(ped.id, "pedido_concluido", cliente, m.pedido_concluido); }
      })().catch(e => console.error("notificar bg", e)));
    } else if (ped.status === "recusado") await enviarUmaVez(ped.id, "pagamento_recusado", cliente, m.pagamento_recusado);
    else if (ped.status === "expirado") await enviarUmaVez(ped.id, "pix_expirado", cliente, m.pix_expirado);
  } catch (e) { console.error("notificar", e); }   // WhatsApp nunca derruba o pagamento
}

// ───────────────────────────── webhook ─────────────────────────────
async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// Validação oficial: manifest "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com a chave secreta do painel.
export async function assinaturaValida(req: Request, dataId: string, secret: string) {
  const sig = req.headers.get("x-signature") || "", reqId = req.headers.get("x-request-id") || "";
  const partes = Object.fromEntries(sig.split(",").map(p => p.split("=").map(s => s.trim())).filter(p => p.length === 2));
  if (!partes.ts || !partes.v1) return false;
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${partes.ts};`;
  const esperado = await hmacHex(secret, manifest);
  if (esperado.length !== partes.v1.length) return false;
  let dif = 0; for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}
export async function webhook(req: Request, url: URL) {
  const body = await req.json().catch(() => ({}));
  const tipo = String(body?.type || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  if (tipo !== "payment" || !/^\d+$/.test(dataId)) return json({ ok: true, ignorado: true });
  const secret = env("MP_WEBHOOK_SECRET");
  if (secret && !(await assinaturaValida(req, dataId, secret))) return json({ erro: "assinatura inválida" }, 401);
  const chave = req.headers.get("x-request-id") || `${tipo}:${dataId}:${body?.action || ""}:${body?.id || ""}`;
  try { await sbInsert("mp_eventos", { chave, tipo, recurso_id: dataId, payload: body }, "return=minimal"); }
  catch (e: any) { if (e?.status === 409) return json({ ok: true, repetido: true }); throw e; }
  // Nunca confia no corpo da notificação: busca o pagamento direto no Mercado Pago.
  const r = await mp(`/v1/payments/${dataId}`);
  if (!r.ok) { await sb(`mp_eventos?chave=eq.${encodeURIComponent(chave)}`, { method: "DELETE" }).catch(() => {}); return json({ erro: "consulta falhou" }, 502); }
  await processarPagamento(r.j);
  return json({ ok: true });
}

// ───────────────────────────── status / concluir ─────────────────────────────
export async function status(url: URL) {
  const id = url.searchParams.get("pedido") || "";
  if (!UUID.test(id)) return { erro: "Pedido inválido.", status: 400 };
  let [ped] = await sbGet(`pedidos?id=eq.${id}&select=id,numero,status,total,metodo,mp_payment_id,mp_status,mp_status_detail,pix_qr,pix_qr_base64,pix_expira_em,updated_at`);
  if (!ped) return { erro: "Pedido não encontrado.", status: 404 };
  // Rede de segurança caso o webhook atrase: reconsulta o Mercado Pago no máximo a cada 10 s.
  if (ped.status === "aguardando_pagamento" && ped.mp_payment_id && Date.now() - new Date(ped.updated_at).getTime() > 10e3) {
    const r = await mp(`/v1/payments/${ped.mp_payment_id}`);
    if (r.ok) { const a = await processarPagamento(r.j); if (a) ped = a; }
    if (ped.status === "aguardando_pagamento") await sbPatch(`pedidos?id=eq.${id}&status=eq.aguardando_pagamento`, { updated_at: new Date().toISOString() }).catch(() => {});
  }
  return { ok: true, numero: ped.numero, status: ped.status, total: ped.total, metodo: ped.metodo, mp_status: ped.mp_status, mp_status_detail: ped.mp_status_detail, pix: ped.pix_qr ? { qr_code: ped.pix_qr, qr_code_base64: ped.pix_qr_base64, expira_em: ped.pix_expira_em } : null };
}
async function ehStaff(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: SK(), Authorization: "Bearer " + token } });
  if (!r.ok) return false;
  const u = await r.json();
  return !!u?.id && (await sbGet(`staff?select=user_id&active=eq.true&user_id=eq.${u.id}`)).length > 0;
}
export async function concluir(req: Request, body: any) {
  if (!(await ehStaff(req))) return { erro: "sem permissão", status: 403 };
  const id = String(body?.pedido_id ?? "");
  if (!UUID.test(id)) return { erro: "Pedido inválido.", status: 400 };
  const rows = await sbPatch(`pedidos?id=eq.${id}&status=eq.pago`, { status: "concluido", concluido_em: new Date().toISOString() });
  if (!rows?.[0]) return { erro: "Só pedidos pagos podem ser concluídos.", status: 409 };
  await enviarUmaVez(rows[0].id, "pedido_concluido", rows[0].cliente_whats, mensagens(rows[0]).pedido_concluido);
  return { ok: true, numero: rows[0].numero, status: "concluido" };
}

// ───────────────────────────── roteador ─────────────────────────────
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url), acao = url.searchParams.get("acao") || "";
  const resp = (r: any) => r?.erro ? json({ erro: r.erro }, r.status || 400) : json(r);
  try {
    if (acao === "webhook" && req.method === "POST") return await webhook(req, url);
    if (acao === "status" && req.method === "GET") return resp(await status(url));
    if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
    if (!env("MP_ACCESS_TOKEN") && (acao === "criar" || acao === "pagar")) return json({ erro: "Pagamento online ainda não configurado." }, 503);
    const body = await req.json().catch(() => null);
    if (acao === "criar") return resp(await criarPedido(body));
    if (acao === "pagar") {
      const base = env("CHECKOUT_PUBLIC_URL") || `${SB()}/functions/v1/checkout`;
      return resp(await pagar(body, base));
    }
    if (acao === "concluir") return resp(await concluir(req, body));
    return json({ erro: "ação desconhecida" }, 404);
  } catch (e) {
    console.error("checkout", acao, e);
    return json({ erro: "Erro interno. Tente de novo em instantes." }, 500);
  }
}
if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(handler);
