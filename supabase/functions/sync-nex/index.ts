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
// Nome em CAIXA ALTA do Nex → padrão da loja ("ENERGETICO MONSTER 473ML" → "Energético Monster 473 ml"), ao importar produto novo.
// Mesma função do painel (admin/index.html, nomeBonito). Só vale se normaliza() não muda: o par por nome continua igual.
const NOME_MIN = new Set(["de","da","do","das","dos","e","em","com","para","por","sem","na","no","nas","nos","ou"]);
const NOME_ACENTO: Record<string, string> = { energetico:"energético", energeticos:"energéticos", aluminio:"alumínio", agua:"água", essencia:"essência", essencias:"essências", carvao:"carvão", ceramica:"cerâmica", acrilico:"acrílico", metalico:"metálico", copao:"copão", limao:"limão", maracuja:"maracujá", melao:"melão", pessego:"pêssego", tonabe:"tonabê", eletrico:"elétrico", eletronico:"eletrônico" };
const NOME_UN: Record<string, string> = { ml:"ml", l:"L", lt:"L", lts:"L", kg:"kg", g:"g", mm:"mm", cm:"cm", mah:"mAh" };
export function nomeCaixaAlta(n: unknown): boolean {
  const l = String(n ?? "").replace(/[^A-Za-zÀ-ÿ]/g, ""); if (l.length < 4) return false;
  return l.replace(/[^A-ZÀ-Þ]/g, "").length / l.length >= .8;
}
export function nomeBonito(n: unknown): string {
  const orig = String(n ?? "").replace(/\s+/g, " ").trim(); if (!nomeCaixaAlta(orig)) return orig;
  let dentroPar = false, prevNum = false;
  const fmt = (w0: string, i: number) => {
    const m0 = w0.match(/^([("'“]*)(.*?)([)"'”,.;:!?]*)$/), pre = m0 ? m0[1] : "", pos = m0 ? m0[3] : "", w = m0 ? m0[2] : w0;
    if (pre.includes("(")) dentroPar = true;
    const lo = w.toLowerCase(); let out: string, m: RegExpMatchArray | null;
    if (!w) out = w;
    else if ((m = lo.match(/^(\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)?)(ml|lts?|l|kg|g|mm|cm|mah)$/))) out = m[1] + " " + NOME_UN[m[2]];
    else if (prevNum && NOME_UN[lo]) out = NOME_UN[lo];
    else if (/^\d/.test(lo) || ["c/", "s/", "p/"].includes(lo)) out = lo;
    else if (/\./.test(w) && /^[A-Z.]+$/.test(w)) out = w;
    else if (w.length <= 4 && !/[aeiouyáéíóúâêôãõ]/i.test(w)) out = w.toUpperCase();
    else if (["og", "rgb", "led", "usb", "ipa"].includes(lo)) out = lo.toUpperCase();
    else if (dentroPar || (i > 0 && NOME_MIN.has(lo))) out = NOME_ACENTO[lo] || lo;
    else out = lo.split("-").map(x => { const a = NOME_ACENTO[x] || x; return a.charAt(0).toUpperCase() + a.slice(1); }).join("-");
    if (pos.includes(")")) dentroPar = false;
    prevNum = /^\d+([.,]\d+)?$/.test(w);
    return pre + out + pos;
  };
  const novo = orig.split(" ").map(fmt).join(" ");
  return normaliza(novo) === normaliza(orig) ? novo : orig;
}
export const eans = (s: unknown) => [...new Set(String(s ?? "").split(/[,;\s/|]+/).map(x => x.replace(/\D/g, "")).filter(x => x.length >= 8))];
const fichas = (s: string) => normaliza(s).split(" ").filter(w => w.length > 0).map(w => (w.length > 3 && w.endsWith("s") && !/^\d+$/.test(w)) ? w.slice(0, -1) : w);
export function parecido(a: string, b: string): number {
  const A = fichas(a), B = fichas(b); if (!A.length || !B.length) return 0;
  const nA = A.filter(w => /\d/.test(w)).sort().join(","), nB = B.filter(w => /\d/.test(w)).sort().join(",");
  if (nA !== nB) return 0;
  const SA = new Set(A), SB_ = new Set(B); let inter = 0; SA.forEach(w => { if (SB_.has(w)) inter++; });
  return inter / (SA.size + SB_.size - inter);
}

// estoque: number = valor informado pelo Nex (0 é zero válido); null = o Nex não informou um estoque utilizável (ausente, vazio, não numérico ou negativo).
type Nex = { code: string; eans: string[]; nome: string; estoque: number | null; preco: number; promo: number | null; combo: boolean };
// Regra de negativos (documentada): CurrentStock negativo é tratado como DESCONHECIDO (null), não como zero.
export function lerEstoque(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  // só decimal simples: Number() aceitaria "0x10", "1e3" etc. e transformaria texto em estoque
  if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Math.floor(Number(v));
  return null;
}
function extrair(j: any): any[] {
  if (Array.isArray(j)) return j.length && typeof j[0] === "object" && ("ProductCode" in j[0] || "ProductName" in j[0]) ? j : (j.flatMap(extrair));
  if (j && typeof j === "object") for (const v of Object.values(j)) { const r = extrair(v); if (r.length) return r; }
  return [];
}
export function lerNex(o: any): Nex | null {
  const nome = String(o?.ProductName ?? "").trim(); if (!nome) return null;
  const preco = Number(o?.SalePrice), promoV = Number(o?.PromoSalePrice);
  return { code: String(o?.ProductCode ?? ""), eans: eans(o?.BarCode), nome, estoque: lerEstoque(o?.CurrentStock), preco: Number.isFinite(preco) ? preco : 0,
    promo: o?.PromoActive && Number.isFinite(promoV) && promoV > 0 && promoV < preco ? promoV : null, combo: !!o?.Combo };
}
let CRU: any[] = [];   // última lista crua do Nex (só para diagnóstico em ?explorar=1)

// Detecta se um produto bruto do Nex está publicado no Catálogo Online.
// Pode ser configurado em sync_config: nex_online_field e nex_online_value.
function estaNoCatalogoOnline(o: any, cfg: Record<string, string>): boolean {
  const campo = cfg.nex_online_field?.trim();
  if (campo) {
    const v = o?.[campo];
    const esperado = cfg.nex_online_value;
    if (esperado !== undefined && esperado !== null && esperado !== "") return String(v).toLowerCase() === esperado.toLowerCase();
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v ?? "").toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "sim" || s === "online" || s === "publicado" || s === "ativo";
  }
  // Auto-detecta campos comuns, em ordem de prioridade.
  const candidatos = [
    "Online", "Published", "IsPublished", "ShowOnline", "InOnlineCatalog", "OnlineCatalog",
    "Ecommerce", "ECommerce", "Site", "LojaOnline", "CatalogoOnline",
    "online", "published", "isPublished", "showOnline", "inOnlineCatalog", "onlineCatalog",
    "ecommerce", "eCommerce", "site", "lojaOnline", "catalogoOnline"
  ];
  for (const k of candidatos) {
    const v = o?.[k];
    if (v === undefined) continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v).toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "sim" || s === "online" || s === "publicado" || s === "ativo") return true;
    if (s === "false" || s === "0" || s === "no" || s === "não" || s === "nao" || s === "offline" || s === "inativo") return false;
  }
  return true; // se não achou nada, não filtra (preserva comportamento antigo)
}

// Lista completa do Nex, com verificação de integridade em duas dimensões:
//  - integra=false: erro detectado (página repetida, erro HTTP, resposta sem lista, itens fora do formato,
//    teto de 20 páginas com a última cheia). Nada é gravado neste ciclo.
//  - completa=false: o fim da lista NÃO foi comprovado. O NEX não informa total e a regra de paginação não está
//    documentada no projeto, então uma página vazia ou curta pode ser fim legítimo OU corte. Com completa=false
//    os ZERAMENTOS automáticos ficam suspensos; ajustes com valor informado pelo próprio NEX continuam.
export type ListaNex = { itens: Nex[]; integra: boolean; completa: boolean; motivo: string | null; motivoIncompleta: string | null };
const MOTIVO_FIM = "o NEX não informa total de produtos e a regra de paginação não está documentada no projeto";
const ehProduto = (o: any) => !!o && typeof o === "object" && ("ProductCode" in o || "ProductName" in o);
function encontraArray(j: any): boolean {
  if (Array.isArray(j)) return true;
  return !!j && typeof j === "object" && Object.values(j).some(encontraArray);
}
// Arrays não vazios de objetos, em qualquer profundidade da resposta.
function arraysDeObjetos(j: any, acc: any[][] = []): any[][] {
  if (Array.isArray(j)) { if (j.some(x => x && typeof x === "object")) acc.push(j); j.forEach(x => arraysDeObjetos(x, acc)); }
  else if (j && typeof j === "object") Object.values(j).forEach(v => arraysDeObjetos(v, acc));
  return acc;
}
// Lista de produtos da página: o maior array que contém produtos. Arrays auxiliares sem produtos são ignorados.
// formatoOk=false quando há objetos de array que não são produtos (ou um produto sem os campos esperados).
function listaDePagina(j: any): { produtos: any[]; formatoOk: boolean } {
  const todos = arraysDeObjetos(j);
  const candidatos = todos.filter(a => a.some(ehProduto));
  if (!candidatos.length) return { produtos: [], formatoOk: todos.length === 0 };
  const principal = candidatos.reduce((m, a) => (a.length > m.length ? a : m));
  return { produtos: principal, formatoOk: principal.every(ehProduto) };
}
async function nexTodos(cfg: Record<string, string>, stockControl: boolean): Promise<ListaNex> {
  const cru: any[] = [];
  const recebidos = new Set<string>();
  let ultimaPagina = "";
  let motivo: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 30000);
    let r: Response; try {
      r = await fetch(cfg.nex_url, { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json", "shop-code": cfg.nex_shop_code, client: cfg.nex_client, token: cfg.nex_token },
        body: JSON.stringify({ filter: { category: "", subCategory: "", search: "", lowStock: false, stockControl, sort: { ProductName: 1 }, page, perPage: 600, onlyPromo: false, sortFilter: "" } }) });
    } finally { clearTimeout(t); }
    if (!r.ok) throw new Error(`Nex respondeu ${r.status} na página ${page}`);
    const json: any = await r.json();
    if (json === null || typeof json !== "object") throw new Error(`Nex devolveu resposta inválida na página ${page}`);
    if (!encontraArray(json)) throw new Error(`Nex devolveu a página ${page} sem lista de produtos`);
    const { produtos, formatoOk } = listaDePagina(json);
    if (!formatoOk) { motivo = `página ${page} com itens fora do formato esperado (sem ProductCode/ProductName)`; break; }
    const chaves = produtos.map(o => String(o.ProductCode ?? "") + "|" + String(o.ProductName ?? ""));
    const repetidos = chaves.filter(k => recebidos.has(k)).length;
    // O Nex ignora o número da página: a página 2 volta IGUAL à 1 (visto em 19/10/2026, 600 itens). Repetição inteira da
    // página anterior = fim da lista (a lista é a que já veio); repetição parcial continua sendo erro de integridade.
    if (repetidos > 0 && repetidos === chaves.length && chaves.join("\n") === ultimaPagina) break;
    if (repetidos > 0) { motivo = `página ${page} repete ${repetidos} itens já recebidos`; break; }
    ultimaPagina = chaves.join("\n");
    chaves.forEach(k => recebidos.add(k));
    cru.push(...produtos);
    if (produtos.length < 600) break;   // fim visto, mas NÃO comprovado (ver completa=false)
    if (page === 20) motivo = "chegou ao limite de 20 páginas com a última cheia; a lista pode estar cortada";
  }
  CRU = cru;
  const vistos = new Set<string>(); const res: Nex[] = [];
  for (const o of cru) {
    if (!estaNoCatalogoOnline(o, cfg)) continue;
    const n = lerNex(o); if (!n) continue;
    const k = n.code + "|" + n.nome; if (vistos.has(k)) continue; vistos.add(k); res.push(n);
  }
  const integra = motivo === null;
  return { itens: res, integra, completa: false, motivo, motivoIncompleta: integra ? MOTIVO_FIM : null };
}

export const LIMITE_SEM_PAR = 60;   // mais que isso sem par = algo errado na lista do Nex: trava em vez de zerar
type Prod = { id: string; site_product_id?: string; name: string; ean: string | null; stock: number; price: number; promo_price: number | null; is_active: boolean };
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


function candidatosParaImportacao(nex: Nex[], prods: any[], conflitos: any[]) {
  const nomesSite = new Set(prods.map(p => normaliza(p.name)));
  const eansSite = new Set(prods.flatMap(p => eans(p.ean)));
  const chavesSite = new Set(prods.map(p => String(p.site_product_id || "")));
  const skusSite = new Set(prods.map(p => String(p.sku || "")));
  const nomesConflito = new Set(conflitos.map(c => normaliza(c.nex)));
  const vistos = new Set<string>();
  return nex.filter(n => {
    if (n.estoque === null) return false;   // estoque desconhecido não vira produto novo com zero
    if (!n.code || nomesConflito.has(normaliza(n.nome)) || nomesSite.has(normaliza(n.nome))) return false;
    if (n.eans.some(e => eansSite.has(e)) || chavesSite.has("nex-" + n.code) || skusSite.has(n.code) || vistos.has(n.code)) return false;
    vistos.add(n.code);
    return true;
  });
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

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const acao = String(body?.action || "");
  if (acao === "list-unmatched" || acao === "import-unmatched") {
    try {
      const listaAtual = await nexTodos(cfg, false);
      if (!listaAtual.integra) return json({ ok: false, erro: "Lista do Nex incompleta (" + listaAtual.motivo + "). Nada foi listado." }, 502);
      const nexAtual = listaAtual.itens;
      const prodsAtual: any[] = await sbGet("products?select=id,name,ean,stock,price,promo_price,is_active,site_product_id,sku&limit=5000");
      const ligados = ligar(nexAtual, prodsAtual);
      const candidatos = candidatosParaImportacao(nexAtual, prodsAtual, ligados.conflitos);
      if (acao === "list-unmatched") {
        return json({ ok: true, nex_total: nexAtual.length, site_total: prodsAtual.length, candidatos: candidatos.map(n => ({ code:n.code, name:n.nome, ean:n.eans[0] || "", stock:n.estoque, price:n.preco, promo:n.promo, combo:n.combo })) });
      }
      const selecionados = Array.isArray(body.items) ? body.items : [];
      if (!selecionados.length) return json({ ok:false, erro:"Selecione pelo menos um produto." }, 400);
      if (selecionados.length > 30) return json({ ok:false, erro:"Importe no máximo 30 produtos por vez." }, 400);
      const categorias: any[] = await sbGet("categories?select=id&limit=500");
      const categoriasValidas = new Set(categorias.map(c => String(c.id)));
      let importados = 0;
      const erros: string[] = [];
      const codigosVistos = new Set<string>();
      for (const item of selecionados) {
        const code = String(item?.code || "").trim();
        const category_id = String(item?.category_id || "").trim();
        if (!code || codigosVistos.has(code)) { erros.push((code || "Sem código") + ": código ausente ou repetido na seleção."); continue; }
        codigosVistos.add(code);
        if (!categoriasValidas.has(category_id)) { erros.push(code + ": escolha uma categoria válida."); continue; }
        const n = candidatos.find(x => x.code === code);
        if (!n) { erros.push(code + ": o item não está mais disponível para importação ou já foi cadastrado."); continue; }
        const slugBase = normaliza(n.nome).replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 75) || "produto";
        const payload = {
          site_product_id: "nex-" + code, sku: code, ean: n.eans[0] || null,
          name: nomeBonito(n.nome), brand: null, category_id, price: n.preco, promo_price: n.promo,
          stock: n.estoque, description: null, specs: [], is_featured: false, sort_priority: 99,
          sales_count: 0, is_active: item.publish === true, icon: "📦", slug: slugBase + "-" + code.toLowerCase()
        };
        try { await sbInsert("products", payload); importados++; }
        catch (e) { erros.push(code + ": " + String((e as any)?.message || e).slice(0,180)); }
      }
      return json({ ok: erros.length === 0, importados, erros, restantes: Math.max(0,candidatos.length-importados) });
    } catch (e) {
      return json({ ok:false, erro:"Falha ao consultar/importar produtos do NEX: " + String((e as any)?.message || e).slice(0,220) }, 502);
    }
  }

  const modo = url.searchParams.get("modo") === "real" ? "real" : "teste";
  const origem = quem === "agenda" ? (url.searchParams.get("origem") === "manual" ? "manual" : "agenda") : "admin";
  // ?lista= só vale para a agenda/testes do servidor; quem chama pelo painel usa sempre a configuração (nex_lista)
  const lista = ((quem === "agenda" && url.searchParams.get("lista")) || cfg.nex_lista || "estoque") === "todos" ? "todos" : "estoque";
  const log: any = { origem, modo, ok: true };
  try {
    if (url.searchParams.get("explorar")) {
      const a = (await nexTodos(cfg, true)).itens, b = (await nexTodos(cfg, false)).itens;
      const z = (l: Nex[]) => l.filter(x => x.estoque === 0).length;
      const amostras = CRU.slice(0, 40);
      const campos = new Set<string>();
      amostras.forEach((o: any) => { if (o && typeof o === "object") Object.keys(o).forEach(k => campos.add(k)); });
      const valoresCampo = (nome: string) => {
        const vals = new Set<string>();
        amostras.forEach((o: any) => { const v = o?.[nome]; vals.add(v === null ? "null" : v === undefined ? "undefined" : typeof v === "object" ? JSON.stringify(v) : String(v)); });
        return [...vals].slice(0, 20);
      };
      const candidatosOnline = ["Online", "Published", "IsPublished", "ShowOnline", "InOnlineCatalog", "OnlineCatalog", "Ecommerce", "ECommerce", "Site", "LojaOnline", "CatalogoOnline", "online", "published", "showOnline", "inOnlineCatalog"];
      const filtrados = { com_estoque: CRU.filter(o => estaNoCatalogoOnline(o, cfg)).length, sem_filtro: CRU.length };
      return json({
        com_controle_de_estoque: { total: a.length, zerados: z(a), brutos: filtrados.com_estoque },
        sem_filtro: { total: b.length, zerados: z(b), brutos: filtrados.sem_filtro },
        filtrados_catalogo_online: filtrados,
        config_online: { field: cfg.nex_online_field || null, value: cfg.nex_online_value || null },
        so_no_sem_filtro: b.filter(x => !a.some(y => y.code === x.code)).slice(0, 15).map(x => `${x.code} ${x.nome} (est ${x.estoque})`),
        exemplo: a.slice(0, 3),
        campos_encontrados: [...campos].sort(),
        amostras_brutas: amostras,
        candidatos_online: Object.fromEntries(candidatosOnline.map(k => [k, valoresCampo(k)])),
        dica: "Procure um campo booleano/string que indique se o produto está publicado no Catálogo Online. Pode ser Online, Published, ShowOnline, etc. Depois configure sync_config.nex_online_field (e opcionalmente nex_online_value)."
      });
    }
    const listaNex = await nexTodos(cfg, lista === "estoque");
    const nex = listaNex.itens;
    // F3: manuais adm-* saem ANTES da ligação. Assim não casam por EAN nem por nome e não entram em "sem par".
    const prods: Prod[] = (await sbGet("products?select=id,site_product_id,name,ean,stock,price,promo_price,is_active&limit=5000"))
      .filter((p: Prod) => !String(p.site_product_id ?? "").startsWith("adm-"));
    const { pares, conflitos, semParNex, semParSite } = ligar(nex, prods);
    const ultimo = (await sbGet("nex_sync_log?select=nex_total&ok=eq.true&modo=eq.real&order=id.desc&limit=1"))[0]?.nex_total ?? 0;
    const avisos: string[] = [];
    // integridade: lista não comprovadamente completa => nenhuma gravação neste ciclo (a checagem de "avisos" bloqueia o modo real)
    if (!listaNex.integra) avisos.push(`lista do Nex não comprovadamente completa (${listaNex.motivo})`);
    if (nex.length < 50) avisos.push(`Nex devolveu só ${nex.length} produtos`);
    if (ultimo && nex.length < ultimo * 0.5) avisos.push(`Nex devolveu ${nex.length} (na última vez eram ${ultimo})`);
    if (pares.length < 100) avisos.push(`só ${pares.length} produtos foram ligados`);
    // REGRA: o site nunca mostra mais estoque que o Nex (o Nex é a fonte da verdade; tudo é AJUSTE, nunca entrada/saída).
    const suspeitos: any[] = [], aplicar: any[] = [];
    // casou mas o Nex não informou estoque utilizável: não altera nada (nem estoque, nem preço, nem zera)
    for (const p of pares.filter(x => x.nex.estoque !== null)) {
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
    const zeram = aplicar.filter(x => x.p.nex.estoque === 0 && x.p.prod.stock > 0);
    // Sem par zera SOMENTE produto nex-* (identificado estruturalmente pelo código). Legado (pNN) e manual (adm-*)
    // sem correspondência mantêm o saldo, porque ausência de correspondência não é prova de estoque zero.
    const ligados = new Set(pares.map(p => p.prod.id));   // inclui os casados sem estoque informado: não viram "sem par"
    const semPar = prods.filter(p => p.is_active && p.stock > 0 && !ligados.has(p.id));
    const ehNex = (p: Prod) => String(p.site_product_id ?? "").startsWith("nex-");
    const semParZeravel = semPar.filter(ehNex);
    const semParPreservado = semPar.filter(p => !ehNex(p));
    const muitosSemPar = semParZeravel.length > LIMITE_SEM_PAR;   // só trava o ZERAR; o resto da sincronização segue
    // ZERAMENTO AUTOMÁTICO SÓ COM FIM DE LISTA COMPROVADO (listaNex.completa). Hoje não há como comprovar o fim
    // (sem total informado pelo NEX e sem regra de paginação documentada): os zeramentos sem par ficam suspensos.
    // Ajustes com valor informado pelo próprio NEX continuam, porque não dependem do fim da lista.
    const motivoZeragem = !listaNex.completa ? `fim da lista não comprovado (${listaNex.motivoIncompleta ?? "lista com erro"})` : muitosSemPar ? `limite ${LIMITE_SEM_PAR} excedido` : null;
    const podeZerar = listaNex.completa && !muitosSemPar;
    const zerarSemPar = podeZerar ? semParZeravel.map(p => ({ id: p.id, stock: 0, price: null, promo: p.promo_price == null ? null : Number(p.promo_price) })) : [];
    const alertaSemPar = semParZeravel.length && motivoZeragem ? `${semParZeravel.length} produtos nex-* ativos sem par no Nex: zeragem suspensa (${motivoZeragem})` : null;
    const semEstoqueNex = pares.filter(p => p.nex.estoque === null);
    const resumo: any = { lista, nex_total: nex.length, site_total: prods.length, casados: pares.length, por_ean: pares.filter(p => p.metodo === "ean").length, por_nome: pares.filter(p => p.metodo !== "ean").length,
      sem_par_nex: semParNex.length, sem_par_site: semParSite.length, conflitos: conflitos.length, suspeitos: suspeitos.length, mudariam: aplicar.length, vao_zerar: zeram.length, sem_par_zerar: semParZeravel.length, sem_par_preservados: semParPreservado.length, casados_sem_estoque_nex: semEstoqueNex.length, zeragem_suspensa: motivoZeragem };
    const amostra = {
      nome_aproximado: pares.filter(p => p.metodo === "nome~").slice(0, 40).map(p => `${p.score} | Nex: ${p.nex.nome} ⇄ Site: ${p.prod.name}`),
      sem_par_nex: semParNex.slice(0, 60).map(n => `${n.code} ${n.nome} (est ${n.estoque}, ${brl(n.preco)}${n.eans.length ? ", ean " + n.eans[0] : ""})`),
      sem_par_site_ativos: semParSite.filter(p => p.is_active).slice(0, 60).map(p => `${p.name} (est ${p.stock}${p.ean ? ", ean " + p.ean : ""})`),
      suspeitos: suspeitos.slice(0, 30), conflitos: conflitos.slice(0, 30),
      maiores_mudancas_de_estoque: aplicar.map(x => ({ n: x.p.nex.nome, de: x.p.prod.stock, para: x.p.nex.estoque })).sort((a, b) => Math.abs(b.de - b.para) - Math.abs(a.de - a.para)).slice(0, 25),
      vao_zerar: zeram.slice(0, 80).map(x => `${x.p.prod.name} (era ${x.p.prod.stock}${x.p.nex.combo ? ", COMBO no Nex" : ""})`),
      sem_par_zerados: semParZeravel.slice(0, 80).map(p => `${p.name} (era ${p.stock}${p.ean ? ", ean " + p.ean : ""})`),
      sem_par_preservados: semParPreservado.slice(0, 80).map(p => `${p.name} (mantido ${p.stock}, ${p.site_product_id})`),
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
