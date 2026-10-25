// buscar-foto (25/10/2026): acha fotos do produto na internet para o painel (ficha do produto → "Buscar na internet").
// - só dono/administrador (is_gestor()), como o Sommelier (gasta a cota do Gemini);
// - fontes: (1) Open Food Facts pelo EAN (bebidas; banco aberto), (2) páginas achadas pela pesquisa do Google via Gemini
//   (loja do fabricante, revendas, marketplaces): de cada página sai a foto principal (og:image, twitter:image, JSON-LD);
// - {acao:"baixar", url} baixa a foto escolhida pelo servidor (o painel não acessa sites de fora) e devolve em base64;
// - NUNCA grava nada: quem sobe a foto é o painel (mesmo recorte/compressão do envio normal).
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MODELOS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_IMG = 8 * 1024 * 1024, MAX_HTML = 1_500_000, MAX_PAGINAS = 8, MAX_CAND = 12;
const RUIM = /(logo|icon|sprite|favicon|placeholder|banner|avatar|selo|badge|payment|pagamento|bandeira|whatsapp|facebook|instagram|loading|blank)/i;

export const _deps = { fetch: (u: string, i?: RequestInit) => fetch(u, i) };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Só https e só hosts públicos (nada de localhost, IP interno ou link-local) */
export function urlSegura(u: string): boolean {
  let x: URL; try { x = new URL(u); } catch { return false; }
  if (x.protocol !== "https:") return false;
  const h = x.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { const [a, b] = h.split(".").map(Number); if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false; }
  if (h.includes(":") || h.startsWith("[")) return false;   // IPv6 literal: fora
  return true;
}

const decodeHtml = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/gi, "/").trim();

/** Fotos principais de uma página de produto: og:image, twitter:image, link image_src, itemprop=image e "image" do JSON-LD */
export function extraiImagens(html: string, base: string): string[] {
  const out: string[] = [], add = (u: unknown) => {
    if (typeof u !== "string" || !u.trim()) return;
    let abs: string; try { abs = new URL(decodeHtml(u), base).href; } catch { return; }
    if (abs.startsWith("http://")) abs = "https://" + abs.slice(7);
    if (!urlSegura(abs) || /\.svg(\?|$)/i.test(abs) || RUIM.test(abs.split("?")[0]) || out.includes(abs)) return;
    out.push(abs);
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0], prop = (t.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1]?.toLowerCase(), cont = (t.match(/content\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (prop && cont && /^(og:image(:secure_url|:url)?|twitter:image(:src)?|image)$/.test(prop)) add(cont);
  }
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi)) add((m[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1]);
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const pega = (o: any): void => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(pega); return; }
        if (o["@graph"]) pega(o["@graph"]);
        const tipo = String(o["@type"] || "");
        if (/product/i.test(tipo) && o.image) { const im = o.image; (Array.isArray(im) ? im : [im]).forEach((x: any) => add(typeof x === "string" ? x : x?.url || x?.contentUrl)); }
      };
      pega(JSON.parse(m[1].trim()));
    } catch { /* JSON-LD quebrado: ignora */ }
  }
  return out.slice(0, 4);
}

/** Busca com tempo máximo; segue até 5 redirecionamentos, conferindo cada destino (nada de cair num endereço interno) */
export async function comTempo(u: string, ms: number, init: RequestInit = {}): Promise<Response & { urlFinal: string }> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    let atual = u;
    for (let i = 0; i <= 5; i++) {
      if (!urlSegura(atual)) throw new Error("destino não permitido");
      const r = await _deps.fetch(atual, { ...init, signal: c.signal, redirect: "manual", headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...(init.headers || {}) } });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!loc) return Object.assign(r, { urlFinal: atual });
      atual = new URL(loc, atual).href;
    }
    throw new Error("redirecionamentos demais");
  } finally { clearTimeout(t); }
}

/** Open Food Facts pelo EAN: banco aberto, bom para bebidas */
async function deOpenFoodFacts(ean: string): Promise<{ url: string; site: string; pagina: string }[]> {
  if (!/^\d{8,14}$/.test(ean)) return [];
  try {
    const r = await comTempo(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=image_front_url,image_url,selected_images`, 6000);
    if (!r.ok) return [];
    const d = await r.json(), p = d?.product || {};
    const urls = [p.image_front_url, p.image_url, ...Object.values(p.selected_images?.front?.display || {})].filter((x) => typeof x === "string") as string[];
    return [...new Set(urls)].filter(urlSegura).slice(0, 2).map((url) => ({ url, site: "Open Food Facts", pagina: `https://world.openfoodfacts.org/product/${ean}` }));
  } catch { return []; }
}

/** Pesquisa do Google (via Gemini) para achar páginas que vendem exatamente o produto */
async function paginasDoGoogle(apiKey: string, inp: any): Promise<string[]> {
  const q = ["Encontre páginas de lojas na internet (site oficial do fabricante, revendas, marketplaces, tabacarias) que vendem EXATAMENTE este produto, com foto.",
    `Produto: ${inp.name}`, inp.brand ? `Marca: ${inp.brand}` : "", inp.ean ? `Código de barras (EAN): ${inp.ean}` : "",
    "Responda só com uma lista curta dos sites encontrados."].filter(Boolean).join("\n");
  for (const modelo of MODELOS) {
    try {
      const r = await _deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: q }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } }) });
      if (r.status === 404) continue;
      if (!r.ok) return [];
      const d = await r.json(), ch = d?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      return [...new Set(ch.map((c: any) => c?.web?.uri).filter((u: any) => typeof u === "string" && urlSegura(u)))].slice(0, MAX_PAGINAS) as string[];
    } catch { /* tenta o próximo modelo */ }
  }
  return [];
}

async function fotosDaPagina(u: string): Promise<{ url: string; site: string; pagina: string }[]> {
  try {
    const r = await comTempo(u, 7000, { headers: { accept: "text/html,application/xhtml+xml" } });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return [];
    const final = r.urlFinal;
    const html = (await r.text()).slice(0, MAX_HTML), site = new URL(final).hostname.replace(/^www\./, "");
    return extraiImagens(html, final).map((url) => ({ url, site, pagina: final }));
  } catch { return []; }
}

function b64(buf: Uint8Array): string {
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function baixar(url: string) {
  if (!urlSegura(url)) return { erro: "Endereço da foto não permitido.", status: 400 };
  const r = await comTempo(url, 10000, { headers: { accept: "image/avif,image/webp,image/png,image/jpeg,*/*" } }).catch(() => null);
  if (!r || !r.ok) return { erro: "Não consegui baixar essa foto. Escolha outra.", status: 502 };
  const tipo = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(tipo)) return { erro: "Esse link não é uma foto. Escolha outra.", status: 415 };
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_IMG) return { erro: "Foto grande demais (mais de 8 MB).", status: 413 };
  return { tipo, b64: b64(buf) };
}

export async function buscar(inp: any, apiKey: string) {
  const [off, paginas] = await Promise.all([deOpenFoodFacts(String(inp.ean || "").replace(/\D/g, "")), apiKey ? paginasDoGoogle(apiKey, inp) : Promise.resolve([])]);
  const daWeb = (await Promise.all(paginas.map(fotosDaPagina))).flat();
  const vistos = new Set<string>(), candidatos = [...off, ...daWeb].filter((c) => !vistos.has(c.url) && (vistos.add(c.url), true)).slice(0, MAX_CAND);
  return { candidatos, paginas: paginas.length, aviso: candidatos.length ? null : "Não achei fotos desse produto na internet. Tente outro nome no cadastro (com a marca) ou envie uma foto sua." };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const env = (k: string) => ((globalThis as any).Deno?.env?.get(k) as string | undefined) || "";
    const rs = await _deps.fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/is_gestor`, { method: "POST",
      headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: req.headers.get("Authorization") || "", "Content-Type": "application/json" }, body: "{}" });
    if ((rs.ok ? await rs.json().catch(() => null) : null) !== true) return json({ erro: "Só o dono e os administradores podem buscar fotos." }, 403);
    const inp = await req.json().catch(() => ({}));
    if (inp?.acao === "baixar") { const r: any = await baixar(String(inp.url || "")); return r.erro ? json({ erro: r.erro }, r.status) : json(r); }
    if (!inp?.name || !String(inp.name).trim()) return json({ erro: "Falta o nome do produto." }, 400);
    return json(await buscar({ name: String(inp.name).slice(0, 140), brand: String(inp.brand || "").slice(0, 60), ean: String(inp.ean || "").slice(0, 20) }, env("GEMINI_API_KEY")));
  } catch (e) { console.error("buscar-foto", e); return json({ erro: "Algo deu errado na busca. Tente de novo." }, 500); }
}

if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(handler);
