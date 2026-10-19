// geoapify-autocomplete — proxy do Address Autocomplete do Geoapify para o checkout da Tabacaria Brutt.
// Atende só a cidade do Rio de Janeiro, Zona Oeste (veja ZO / BAIRROS_OESTE / BAIRROS_FORA abaixo).
// Fonte principal: Geoapify (chave em GEOAPIFY_API_KEY). Reserva automática, sem chave: Photon (photon.komoot.io), feito para busca enquanto digita.
// A chave NUNCA vai pro site: ela fica no segredo GEOAPIFY_API_KEY (Supabase > Edge Functions > Secrets).
// v7: Geoapify e Photon são consultados EM PARALELO (antes era um depois do outro: quando o Geoapify recusava, o cliente pagava as duas esperas). Mede o tempo (ms_*), responde rápido a ?warm=1.
// v17 (19/10/2026): busca também por NOME DE LUGAR (condomínio, prédio, empresa, escola, shopping). O resultado traz `nome`
//   (ex.: "Condomínio Bosque do Tingui") além da rua/número do lugar; o site mostra o nome na sugestão e o põe no complemento.
//   Os dois serviços são consultados sempre: Geoapify é melhor em rua/número, Photon em nome de lugar; o resultado junta os dois.
// Publicada direto (não importa do GitHub): esta cópia no repositório é a fonte; mudou aqui, publique de novo.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
// Rua Dezoito, 145 — Campo Grande, Rio de Janeiro — 23067-030 (coordenadas confirmadas)
const BRUTT = { lat: -22.881522, lon: -43.613654 };
const ZO = { oeste: -43.90, sul: -23.10, leste: -43.31, norte: -22.80 };
const BAIRROS_OESTE = new Set(["anil","barra da tijuca","camorim","cidade de deus","curicica","freguesia","gardenia azul","grumari","itanhanga","jacarepagua","joa","pechincha","praca seca","recreio dos bandeirantes","recreio","tanque","taquara","vargem grande","vargem pequena","vila valqueire","rio das pedras","muzema","tijuquinha","bandeirantes","pau da fome","colonia",
  "bangu","barra de guaratiba","campo dos afonsos","campo grande","cosmos","deodoro","gericino","guaratiba","ilha de guaratiba","inhoaiba","jardim sulacap","sulacap","magalhaes bastos","mendanha","paciencia","padre miguel","pedra de guaratiba","realengo","santa cruz","santissimo","senador camara","senador vasconcelos","sepetiba","vila kennedy","vila militar",
  "vila alianca","jabour","piraquara","jardim novo","rio da prata","taquaral","cesarao","antares","urucania","carobinha","palmares","vila paciencia"]);
const BAIRROS_FORA = new Set(["madureira","oswaldo cruz","campinho","cascadura","quintino bocaiuva","cavalcanti","engenheiro leal","bento ribeiro","marechal hermes","honorio gurgel","rocha miranda","turiacu","guadalupe","anchieta","parque anchieta","ricardo de albuquerque","pavuna","costa barros","acari","coelho neto","iraja","vaz lobo","vicente de carvalho","vila da penha","penha","olaria","ramos","meier","todos os santos","engenho de dentro","piedade","abolicao","agua santa","inhauma","encantado","jacarezinho","lins de vasconcelos","cachambi","engenho novo","sampaio","riachuelo","tijuca","alto da boa vista","sao conrado","rocinha","vidigal","gavea","leblon","ipanema","copacabana","lagoa","jardim botanico","humaita","botafogo","catete","flamengo","centro","santa teresa","rio comprido","sao cristovao","maracana","vila isabel","grajau","andarai","usina"]);
const RAIO_REF_M = 17000;
const LIMITE_API = 20;
const LIMITE_SAIDA = 6;
const UF_POR_NOME: Record<string, string> = { acre:"AC", alagoas:"AL", amapa:"AP", amazonas:"AM", bahia:"BA", ceara:"CE", "distrito federal":"DF", "espirito santo":"ES", goias:"GO", maranhao:"MA", "mato grosso":"MT", "mato grosso do sul":"MS", "minas gerais":"MG", para:"PA", paraiba:"PB", parana:"PR", pernambuco:"PE", piaui:"PI", "rio de janeiro":"RJ", "rio grande do norte":"RN", "rio grande do sul":"RS", rondonia:"RO", roraima:"RR", "santa catarina":"SC", "sao paulo":"SP", sergipe:"SE", tocantins:"TO" };

function semAcento(s: unknown) { return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
// nome de lugar que vale mostrar: não é a própria rua, nem um nome genérico ("Condominio", "Prédio") sem mais nada
function nomeLugar(nome: unknown, rua: string): string {
  const n = String(nome ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 80 || semAcento(n) === semAcento(rua)) return "";
  if (/^(condominio|predio|edificio|residencial|casa|loja|building|yes)$/.test(semAcento(n))) return "";
  return n;
}

export function montaUrl(text: string, apiKey: string): string {
  const p = new URLSearchParams({
    text, format: "json", lang: "pt", limit: String(LIMITE_API),
    filter: `rect:${ZO.oeste},${ZO.sul},${ZO.leste},${ZO.norte}`,
    bias: `proximity:${BRUTT.lon},${BRUTT.lat}`,
    apiKey,
  });
  return "https://api.geoapify.com/v1/geocode/autocomplete?" + p.toString();
}

function haversineM(la1: number, lo1: number, la2: number, lo2: number) {
  const r = 6371000, d = Math.PI / 180, a = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function normaliza(r: any) {
  const rua = String(r?.street || (r?.result_type === "street" ? r?.name : "") || "").trim();
  const lat = Number(r?.lat), lon = Number(r?.lon);
  if (!rua || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const uf = String(r.state_code || "").toUpperCase().slice(0, 2) || UF_POR_NOME[semAcento(r.state)] || "";
  const cep = String(r.postcode || "").replace(/\D/g, "");
  const dist = Number.isFinite(Number(r.distance)) ? Number(r.distance) : haversineM(BRUTT.lat, BRUTT.lon, lat, lon);
  return {
    rua, numero: String(r.housenumber || "").trim(),
    nome: r.result_type === "street" ? "" : nomeLugar(r.name, rua),
    bairro: String(r.suburb || r.district || r.neighbourhood || r.quarter || "").trim(),
    cidade: String(r.city || r.town || r.village || r.municipality || r.county || "").trim(),
    uf, cep: cep.length === 8 ? cep : "", lat, lng: lon,
    formatado: String(r.formatted || "").trim(), distancia: Math.round(dist),
  };
}

export function dentroZonaOeste(x: any): boolean {
  if (semAcento(x.cidade) !== "rio de janeiro") return false;
  if (x.uf && x.uf !== "RJ") return false;
  if (!(x.lng >= ZO.oeste && x.lng <= ZO.leste && x.lat >= ZO.sul && x.lat <= ZO.norte)) return false;
  const b = semAcento(x.bairro);
  if (b && BAIRROS_OESTE.has(b)) return true;
  if (b && BAIRROS_FORA.has(b)) return false;
  return true;
}

export function ordena(lista: any[]) {
  const vistos = new Set<string>(), unicos: any[] = [];
  for (const x of lista) {
    const k = [x.nome, x.rua, x.numero, x.bairro, x.cidade].map((v: string) => semAcento(v).replace(/\s+/g, " ")).join("|");
    if (!vistos.has(k)) { vistos.add(k); unicos.push(x); }
  }
  return [...unicos.filter(x => x.distancia <= RAIO_REF_M), ...unicos.filter(x => x.distancia > RAIO_REF_M)].slice(0, LIMITE_SAIDA);
}

// junta Geoapify (rua/número) e Photon (nome de lugar): lugares com nome que o Geoapify não trouxe entram logo depois dos dele
export function junta(geo: any[], pho: any[]) {
  if (!geo.length) return pho;
  const lugares = pho.filter(x => x.nome && !geo.some(g => semAcento(g.nome) === semAcento(x.nome)));
  return [...geo.slice(0, 3), ...lugares.slice(0, 3), ...geo.slice(3)];
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const acessos = new Map<string, { n: number; t: number }>();
const cache = new Map<string, { t: number; v: any }>();
const LIMITE_POR_MIN = 90, CACHE_MS = 5 * 60 * 1000;
let geoapifyOffAte = 0;
export function _reset() { acessos.clear(); cache.clear(); geoapifyOffAte = 0; }

export function montaUrlPhoton(text: string): string {
  const p = new URLSearchParams({ q: text, limit: "20", lat: String(BRUTT.lat), lon: String(BRUTT.lon), bbox: `${ZO.oeste},${ZO.sul},${ZO.leste},${ZO.norte}` });
  return "https://photon.komoot.io/api/?" + p.toString();
}
export function normalizaPhoton(f: any) {
  const p = f?.properties || {}, c = f?.geometry?.coordinates || [];
  const lon = Number(c[0]), lat = Number(c[1]);
  const rua = String(p.street || (p.osm_key === "highway" ? p.name : "") || "").trim();
  if (!rua || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cep = String(p.postcode || "").replace(/\D/g, "");
  return {
    rua, numero: String(p.housenumber || "").trim(),
    nome: p.osm_key === "highway" ? "" : nomeLugar(p.name, rua),
    bairro: String(p.district || p.locality || p.suburb || "").trim(),
    cidade: String(p.city || p.town || p.village || p.county || "").trim(),
    uf: UF_POR_NOME[semAcento(p.state)] || "", cep: cep.length === 8 ? cep : "", lat, lng: lon,
    formatado: "", distancia: Math.round(haversineM(BRUTT.lat, BRUTT.lon, lat, lon)),
  };
}
async function comTempo(url: string) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try { return await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(t); }
}
async function porGeoapify(texto: string, apiKey: string) {
  const r = await comTempo(montaUrl(texto, apiKey));
  if (!r.ok) { console.error("Geoapify", r.status); throw { status: r.status }; }
  const d = await r.json();
  return (Array.isArray(d?.results) ? d.results : []).map(normaliza).filter(Boolean);
}
async function porPhoton(texto: string) {
  const r = await comTempo(montaUrlPhoton(texto));
  if (!r.ok) { console.error("Photon", r.status); throw { status: r.status }; }
  const d = await r.json();
  return (Array.isArray(d?.features) ? d.features : []).map(normalizaPhoton).filter(Boolean);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ erro: "método não permitido" }, 405);
  const t0 = Date.now();
  try {
    let texto = "";
    if (req.method === "GET") {
      const u = new URL(req.url);
      if (u.searchParams.get("warm")) return json({ ok: true, warm: true });
      texto = u.searchParams.get("text") || "";
    } else { try { texto = (await req.json())?.text || ""; } catch { texto = ""; } }
    texto = String(texto).replace(/\s+/g, " ").trim();
    if (texto.length < 3 || texto.length > 100) return json({ erro: "Digite de 3 a 100 caracteres." }, 400);

    const apiKey = Deno.env.get("GEOAPIFY_API_KEY") || "";

    const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim(), agora = Date.now();
    const a = acessos.get(ip);
    if (!a || agora - a.t > 60000) acessos.set(ip, { n: 1, t: agora });
    else if (++a.n > LIMITE_POR_MIN) return json({ erro: "Muitas buscas seguidas. Aguarde um instante." }, 429);

    const chave = semAcento(texto), c = cache.get(chave);
    if (c && agora - c.t < CACHE_MS) return json({ ...c.v, cache: true, ms_total: Date.now() - t0 });

    // Geoapify (se há chave e não está de castigo) e Photon saem JUNTOS e os dois resultados se somam (junta).
    let geo: any[] = [], pho: any[] = [], fonte = "", diag = apiKey ? "" : "sem GEOAPIFY_API_KEY", falhouPho = false;
    const ms: Record<string, number> = {};
    const usaGeo = !!apiKey && agora > geoapifyOffAte;
    if (apiKey && !usaGeo) diag = "Geoapify em pausa (recusou há pouco)";
    const i0 = Date.now();
    const pGeo = usaGeo ? porGeoapify(texto, apiKey).then(r => { ms.geoapify = Date.now() - i0; return r; }) : null;
    const pPho = porPhoton(texto).then(r => { ms.photon = Date.now() - i0; return r; });
    pPho.catch(() => {}); if (pGeo) pGeo.catch(() => {});      // evita erro não tratado quando o outro já resolveu
    if (pGeo) {
      try { geo = (await pGeo).filter(dentroZonaOeste); fonte = "geoapify"; diag = "ok"; }
      catch (e: any) {
        const st = e?.status; diag = "Geoapify recusou" + (st ? " (" + st + ")" : "");
        geoapifyOffAte = agora + (st === 401 || st === 403 ? 60 * 60000 : st === 429 ? 60000 : 30000);
      }
    }
    try { pho = (await pPho).filter(dentroZonaOeste); } catch { falhouPho = true; }
    if (falhouPho && !fonte) return json({ erro: "Nenhuma busca de endereço respondeu agora.", diag }, 502);
    if (!geo.length && pho.length) fonte = "photon"; else if (geo.length && pho.some(x => x.nome)) fonte = "geoapify+photon";
    const lista = ordena(junta(geo, pho));
    const saida = { resultados: lista, fonte, diag };
    if (cache.size > 300) cache.clear();
    cache.set(chave, { t: agora, v: saida });
    return json({ ...saida, ms_total: Date.now() - t0, ...Object.fromEntries(Object.entries(ms).map(([k, v]) => ["ms_" + k, v])) });
  } catch (e) {
    console.error(e);
    return json({ erro: "Falha ao buscar o endereço: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
}

// @ts-ignore (Deno)
if (typeof Deno !== "undefined" && (Deno as any).serve) (Deno as any).serve(handler);
