// SYNC NEX → SITE (estoque e preço). O NEX MANDA; o Supabase só copia.
// Roda a cada 15 min (pg_cron "sync-nex-15min" → nex_sync_disparar()) e pelo botão "Sincronizar agora" do painel.
//
// Lista do Nex (sync_config.nex_lista ou ?lista=):
//   "estoque" (antigo)  filtro stockControl:true. O Nex ESCONDE os produtos com estoque 0, então o site nunca
//                       recebia o zero e ficava com o último número (ex.: charuto zerado no Nex com 5 no site).
//   "todos"             filtro stockControl:false. Vêm também os zerados e o site zera junto. (11/10/2026)
const env = (k: string) => (globalThis as any).Deno?.env?.get(k) as string | undefined;
const SB = () => env("SUPABASE_URL")!, SK = () => env("SUPABASE_SERVICE_ROLE_KEY")!;
const hdr = (x: Record<string, string> = {}) => ({ apikey: SK(), Authorization: "Bearer " + SK(), "Content-Type": "application/json", ...x });
async function sbGet(path: string) { const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: hdr() }); if (!r.ok) throw new Error(`get ${path.split("?")[0]}: ${r.status}`); return r.json(); }
async function sbRpc(nome: string, args: any) { const r = await fetch(`${SB()}/rest/v1/rpc/${nome}`, { method: "POST", headers: hdr(), body: JSON.stringify(args ?? {}) }); if (!r.ok) throw new Error(`rpc ${nome}: ${r.status} ${(await r.text()).slice(0, 150)}`); return r.json(); }
async function sbInsert(path: string, body: any) { const r = await fetch(`${SB()}/rest/v1/${path}`, { method: "POST", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`insert ${path}: ${r.status}`); }

export const semAcento = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const normaliza = (s: unknown) => {
  let t = semAcento(s).replace(/['’`´]/g, "").replace(/\(\s*sem\s+preco\s*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  t = t.replace(/red bull/g, "redbull").replace(/\bsave now\b/g, " ");
  t = t.replace(/(\d)\s+(kg|g|ml|l|lt|lts|litro|litros|mah|cm|mm)\b/g, "$1$2").replace(/(\d)(lts?|litros?)\b/g, "$1l");
  return t.replace(/\s+/g, " ").trim();
};
export const eans = (s: unknown) => [...new Set(String(s ?? "").split(/[,;\s/|]+/).map(x => x.replace(/\D/g, "")).filter(x => x.length >= 8))];
const fichas = (s: string) => normaliza(s).split(" ").filter(w => w.length > 0).map(w => (w.length > 3 && w.endsWith("s") && !/^\d+$/.test(w)) ? w.slice(0, -1) : w);
export function parecido(a: string, b: string): number {
  const A = fichas(a), B = fichas(b); if (!A.length || !B.length) return 0;
  const nA = A.filter(w => /\d/.test(w)).sort().join(","), nB = B.filter(w => /\d/.test(w)).sort().join(",");
  if (nA !== nB) return 0;
  const SA = new Set(A), SB_ = new Set(B); let inter = 0; SA.forEach(w => { if (SB_.has(w)) inter++; });
  return inter / (SA.size + SB_.size - inter);
}

type Nex = { code: string; eans: string[]; nome: string; estoque: number; preco: number; promo: number | null; combo: boolean };
function extrair(j: any): any[] {
  if (Array.isArray(j)) return j.length && typeof j[0] === "object" && ("ProductCode" in j[0] || "ProductName" in j[0]) ? j : (j.flatMap(extrair));
  if (j && typeof j === "object") for (const v of Object.values(j)) { const r = extrair(v); if (r.length) return r; }
  return [];
}
export function lerNex(o: any): Nex | null {
  const nome = String(o?.ProductName ?? "").trim(); if (!nome) return null;
  const preco = Number(o?.SalePrice), promoV = Number(o?.PromoSalePrice);
  return { code: String(o?.ProductCode ?? ""), eans: eans(o?.BarCode), nome, estoque: Math.max(0, Math.floor(Number(o?.CurrentStock) || 0)), preco: Number.isFinite(preco) ? preco : 0,
    promo: o?.PromoActive && Number.isFinite(promoV) && promoV > 0 && promoV < preco ? promoV : null, combo: !!o?.Combo };
}
let CRU: any[] = [];   // última lista crua do Nex (só para diagnóstico em ?explorar=1)
async function nexTodos(cfg: Record<string, string>, stockControl: boolean): Promise<Nex[]> {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 30000);
    let r: Response; try {
      r = await fetch(cfg.nex_url, { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json", "shop-code": cfg.nex_shop_code, client: cfg.nex_client, token: cfg.nex_token },
        body: JSON.stringify({ filter: { category: "", subCategory: "", search: "", lowStock: false, stockControl, sort: { ProductName: 1 }, page, perPage: 600, onlyPromo: false, sortFilter: "" } }) });
    } finally { clearTimeout(t); }
    if (!r.ok) throw new Error(`Nex respondeu ${r.status}`);
    const lista = extrair(await r.json()); out.push(...lista);
    if (lista.length < 600) break;
  }
  CRU = out;
  const vistos = new Set<string>(); const res: Nex[] = [];
  for (const o of out) { const n = lerNex(o); if (!n) continue; const k = n.code + "|" + n.nome; if (vistos.has(k)) continue; vistos.add(k); res.push(n); }
  return res;
}

export const LIMITE_SEM_PAR = 60;   // mais que isso sem par = algo errado na lista do Nex: trava em vez de zerar
type Prod = { id: string; name: string; ean: string | null; stock: number; price: number; promo_price: number | null; is_active: boolean };
type Par = { nex: Nex; prod: Prod; metodo: "ean" | "nome" | "nome~"; score?: number };
export function ligar(nex: Nex[], prods: Prod[]) {
  const pares: Par[] = [], conflitos: any[] = [], usadoP = new Map<string, number>(), usadoN = new Set<number>();
  const idxEan = new Map<string, Prod[]>();
  prods.forEach(p => eans(p.ean).forEach(e => { const l = idxEan.get(e) ?? []; l.push(p); idxEan.set(e, l); }));
  const cand = new Map<number, Par>();
  nex.forEach((n, i) => {
    const hit = new Map<string, Prod>(); n.eans.forEach(e => (idxEan.get(e) ?? []).forEach(p => hit.set(p.id, p)));
    if (hit.size === 1) cand.set(i, { nex: n, prod: [...hit.values()][0], metodo: "ean" });
    else if (hit.size > 1) conflitos.push({ nex: n.nome, motivo: "mesmo EAN em " + hit.size + " produtos do site" });
  });
  const porProd = new Map<string, number[]>(); cand.forEach((par, i) => { const l = porProd.get(par.prod.id) ?? []; l.push(i); porProd.set(par.prod.id, l); });
  porProd.forEach((is, pid) => { if (is.length > 1) { is.forEach(i => { conflitos.push({ nex: nex[i].nome, motivo: "outro item do Nex aponta pro mesmo produto do site" }); cand.delete(i); }); usadoP.set(pid, 99); } });
  cand.forEach((par, i) => { pares.push(par); usadoN.add(i); usadoP.set(par.prod.id, 1); });
  const livresP = prods.filter(p => !usadoP.has(p.id));
  const exato = new Map<string, Prod[]>(); livresP.forEach(p => { const k = normaliza(p.name); const l = exato.get(k) ?? []; l.push(p); exato.set(k, l); });
  const nomeCand: Array<[number, Par]> = [];
  nex.forEach((n, i) => {
    if (usadoN.has(i)) return;
    const e = exato.get(normaliza(n.nome));
    if (e && e.length === 1) { nomeCand.push([i, { nex: n, prod: e[0], metodo: "nome", score: 1 }]); return; }
    let melhor: Prod | null = null, s1 = 0, s2 = 0;
    for (const p of livresP) { const s = parecido(n.nome, p.name); if (s > s1) { s2 = s1; s1 = s; melhor = p; } else if (s > s2) s2 = s; }
    if (melhor && s1 >= 0.8 && s1 - s2 >= 0.15) nomeCand.push([i, { nex: n, prod: melhor, metodo: "nome~", score: Math.round(s1 * 100) / 100 }]);
  });
  const cont = new Map<string, number>(); nomeCand.forEach(([, p]) => cont.set(p.prod.id, (cont.get(p.prod.id) ?? 0) + 1));
  nomeCand.forEach(([i, par]) => { if ((cont.get(par.prod.id) ?? 0) > 1) conflitos.push({ nex: par.nex.nome, motivo: "dois itens do Nex parecem o mesmo produto do site" }); else { pares.push(par); usadoN.add(i); usadoP.set(par.prod.id, 1); } });
  return { pares, conflitos, semParNex: nex.filter((_, i) => !usadoN.has(i)), semParSite: prods.filter(p => !usadoP.has(p.id)) };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

async function autorizado(req: Request, cfg: Record<string, string>): Promise<string | null> {
  const seg = req.headers.get("x-sync-secret"); if (seg && seg === cfg.sync_secret) return "agenda";
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: SK(), Authorization: "Bearer " + token } });
      if (r.ok) { const u = await r.json(); if (u?.id && (await sbGet(`staff?select=user_id&user_id=eq.${u.id}&active=eq.true&role=in.(owner,admin)`)).length) return "admin"; }   // só dono/administrador ativos
    } catch { /* nega */ }
  }
  return null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const t0 = Date.now(), url = new URL(req.url);
  let cfg: Record<string, string> = {};
  try { (await sbGet("sync_config?select=key,value")).forEach((r: any) => cfg[r.key] = r.value); } catch (e) { return json({ erro: "config indisponível" }, 500); }
  const quem = await autorizado(req, cfg); if (!quem) return json({ erro: "sem permissão" }, 403);
  const modo = url.searchParams.get("modo") === "real" ? "real" : "teste";
  const origem = quem === "agenda" ? (url.searchParams.get("origem") === "manual" ? "manual" : "agenda") : "admin";
  // ?lista= só vale para a agenda/testes do servidor; quem chama pelo painel usa sempre a configuração (nex_lista)
  const lista = ((quem === "agenda" && url.searchParams.get("lista")) || cfg.nex_lista || "estoque") === "todos" ? "todos" : "estoque";
  const log: any = { origem, modo, ok: true };
  try {
    if (url.searchParams.get("explorar")) {
      const a = await nexTodos(cfg, true), b = await nexTodos(cfg, false);
      const z = (l: Nex[]) => l.filter(x => x.estoque === 0).length;
      return json({ com_controle_de_estoque: { total: a.length, zerados: z(a) }, sem_filtro: { total: b.length, zerados: z(b) }, so_no_sem_filtro: b.filter(x => !a.some(y => y.code === x.code)).slice(0, 15).map(x => `${x.code} ${x.nome} (est ${x.estoque})`), exemplo: a.slice(0, 3), cru: CRU.filter((o: any) => /CARLTON BLEND|CAMEL KRETEK MENTHOL|GUDANG GARAM INTER/i.test(String(o?.ProductName))).slice(0, 3) });
    }
    const nex = await nexTodos(cfg, lista === "estoque");
    const prods: Prod[] = await sbGet("products?select=id,name,ean,stock,price,promo_price,is_active&limit=5000");
    const { pares, conflitos, semParNex, semParSite } = ligar(nex, prods);
    const ultimo = (await sbGet("nex_sync_log?select=nex_total&ok=eq.true&modo=eq.real&order=id.desc&limit=1"))[0]?.nex_total ?? 0;
    const avisos: string[] = [];
    if (nex.length < 50) avisos.push(`Nex devolveu só ${nex.length} produtos`);
    if (ultimo && nex.length < ultimo * 0.5) avisos.push(`Nex devolveu ${nex.length} (na última vez eram ${ultimo})`);
    if (pares.length < 100) avisos.push(`só ${pares.length} produtos foram ligados`);
    // REGRA: o site nunca mostra mais estoque que o Nex (o Nex é a fonte da verdade; tudo é AJUSTE, nunca entrada/saída).
    const suspeitos: any[] = [], aplicar: any[] = [];
    for (const p of pares) {
      const a = Number(p.prod.price), b = p.nex.preco;
      const promoSite = p.prod.promo_price == null ? null : Number(p.prod.promo_price);
      if (b > 0 && a > 0 && (b / a > 3 || b / a < 0.33)) {
        suspeitos.push({ nex: p.nex.nome, site: p.prod.name, preco_site: a, preco_nex: b, metodo: p.metodo });
        // preço fica parado para conferência; o estoque só DESCE até o do Nex (par duvidoso não pode inflar o site)
        if (p.prod.stock > p.nex.estoque) aplicar.push({ p, item: { id: p.prod.id, stock: p.nex.estoque, price: null, promo: promoSite } });
        continue;
      }
      if (p.prod.stock !== p.nex.estoque || (b > 0 && a !== b) || promoSite !== p.nex.promo) aplicar.push({ p, item: { id: p.prod.id, stock: p.nex.estoque, price: b > 0 ? b : null, promo: p.nex.promo } });
    }
    const zeram = aplicar.filter(x => x.p.nex.estoque <= 0 && x.p.prod.stock > 0);
    // ativo no site, com estoque, sem par confiável no Nex (sem par ou em conflito): estoque 0 até ligar (EAN/nome)
    const ligados = new Set(pares.map(p => p.prod.id));
    const semPar = prods.filter(p => p.is_active && p.stock > 0 && !ligados.has(p.id));
    const muitosSemPar = semPar.length > LIMITE_SEM_PAR;   // só trava o ZERAR; o resto da sincronização segue
    const zerarSemPar = muitosSemPar ? [] : semPar.map(p => ({ id: p.id, stock: 0, price: null, promo: p.promo_price == null ? null : Number(p.promo_price) }));
    const alertaSemPar = muitosSemPar ? `${semPar.length} produtos ativos sem par no Nex (limite ${LIMITE_SEM_PAR}): não zerei nenhum, confira a ligação` : null;
    const resumo: any = { lista, nex_total: nex.length, site_total: prods.length, casados: pares.length, por_ean: pares.filter(p => p.metodo === "ean").length, por_nome: pares.filter(p => p.metodo !== "ean").length,
      sem_par_nex: semParNex.length, sem_par_site: semParSite.length, conflitos: conflitos.length, suspeitos: suspeitos.length, mudariam: aplicar.length, vao_zerar: zeram.length, sem_par_zerar: semPar.length };
    const amostra = {
      nome_aproximado: pares.filter(p => p.metodo === "nome~").slice(0, 40).map(p => `${p.score} | Nex: ${p.nex.nome} ⇄ Site: ${p.prod.name}`),
      sem_par_nex: semParNex.slice(0, 60).map(n => `${n.code} ${n.nome} (est ${n.estoque}, ${brl(n.preco)}${n.eans.length ? ", ean " + n.eans[0] : ""})`),
      sem_par_site_ativos: semParSite.filter(p => p.is_active).slice(0, 60).map(p => `${p.name} (est ${p.stock}${p.ean ? ", ean " + p.ean : ""})`),
      suspeitos: suspeitos.slice(0, 30), conflitos: conflitos.slice(0, 30),
      maiores_mudancas_de_estoque: aplicar.map(x => ({ n: x.p.nex.nome, de: x.p.prod.stock, para: x.p.nex.estoque })).sort((a, b) => Math.abs(b.de - b.para) - Math.abs(a.de - a.para)).slice(0, 25),
      vao_zerar: zeram.slice(0, 80).map(x => `${x.p.prod.name} (era ${x.p.prod.stock}${x.p.nex.combo ? ", COMBO no Nex" : ""})`),
      sem_par_zerados: semPar.slice(0, 80).map(p => `${p.name} (era ${p.stock}${p.ean ? ", ean " + p.ean : ""})`),
    };
    let aplicado: any = null;
    if (modo === "real") {
      if (avisos.length) { log.ok = false; log.erro = "Trava de segurança: " + avisos.join("; ") + ". Nada foi gravado."; }
      else {
        aplicado = { estoque_alterado: 0, preco_alterado: 0, zerados: 0 };
        for (let i = 0; i < aplicar.length; i += 150) { const r = await sbRpc("nex_aplicar", { p_itens: aplicar.slice(i, i + 150).map(x => x.item), p_nota: "Sync Nex" }); for (const k of Object.keys(aplicado)) aplicado[k] += r[k] ?? 0; }
        for (let i = 0; i < zerarSemPar.length; i += 150) { const r = await sbRpc("nex_aplicar", { p_itens: zerarSemPar.slice(i, i + 150), p_nota: "Sync Nex: sem par no Nex" }); for (const k of Object.keys(aplicado)) aplicado[k] += r[k] ?? 0; }
      }
    }
    Object.assign(log, { nex_total: nex.length, casados: pares.length, por_ean: resumo.por_ean, por_nome: resumo.por_nome, estoque_alterado: aplicado?.estoque_alterado ?? null, preco_alterado: aplicado?.preco_alterado ?? null, zerados: aplicado?.zerados ?? null,
      sem_par_nex: semParNex.length, sem_par_site: semParSite.filter(p => p.is_active).length, ms: Date.now() - t0, detalhe: { resumo, avisos, alerta_sem_par: alertaSemPar, ...amostra } });
    await sbInsert("nex_sync_log", log);
    return json({ ok: log.ok, modo, ...(log.erro ? { erro: log.erro } : {}), resumo, aplicado, avisos, alerta_sem_par: alertaSemPar, ...amostra });
  } catch (e) {
    const msg = String((e as any)?.message ?? e).slice(0, 300);
    try { await sbInsert("nex_sync_log", { ...log, ok: false, erro: msg, ms: Date.now() - t0 }); } catch { /* ok */ }
    return json({ ok: false, erro: msg }, 502);
  }
}
if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(handler);
