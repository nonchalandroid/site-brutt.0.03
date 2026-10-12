// AVALIAÇÕES DO GOOGLE → carrossel do rodapé da loja (#avaliacoes).
// Busca a nota, o total e as avaliações da Tabacaria Brutt na Places API (New) do Google e guarda em
// avaliacoes_cache por 12 h (cada visita lê o cache; o Google é chamado ~2x por dia).
// Segredo: GOOGLE_PLACES_KEY (Edge Functions → Secrets). Opcional: GOOGLE_PLACE_ID (senão acha pela busca e guarda).
// Sem chave ou com erro no Google: devolve o último cache que tiver; sem cache, 503 e a loja esconde a seção.
// O Google entrega no máximo 5 avaliações (as "mais relevantes").
const env = (k: string) => (globalThis as any).Deno?.env?.get(k) as string | undefined;
const SB = () => env("SUPABASE_URL")!, SK = () => env("SUPABASE_SERVICE_ROLE_KEY")!;
const hdr = (x: Record<string, string> = {}) => ({ apikey: SK(), Authorization: "Bearer " + SK(), "Content-Type": "application/json", ...x });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=600" : "no-store" } });

export const VALIDADE_MS = 12 * 3600e3;
const BUSCA = "Tabacaria Brutt, Rua 18, 145 - Campo Grande, Rio de Janeiro - RJ";
const LOJA = { latitude: -22.8814745, longitude: -43.6137391 };   // mesmo ponto do Google Maps usado no site
const PLACES = "https://places.googleapis.com/v1/";

async function lerCache(): Promise<any | null> {
  const r = await fetch(`${SB()}/rest/v1/avaliacoes_cache?id=eq.1&select=place_id,dados,atualizado_em`, { headers: hdr() });
  if (!r.ok) return null;
  const l = await r.json(); return Array.isArray(l) && l[0] ? l[0] : null;
}
async function gravarCache(place_id: string, dados: any) {
  await fetch(`${SB()}/rest/v1/avaliacoes_cache?on_conflict=id`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: 1, place_id, dados, atualizado_em: new Date().toISOString() }) });
}

async function acharLugar(key: string): Promise<string> {
  const r = await fetch(PLACES + "places:searchText", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName" },
    body: JSON.stringify({ textQuery: BUSCA, languageCode: "pt-BR", locationBias: { circle: { center: LOJA, radius: 500 } } }) });
  if (!r.ok) throw new Error(`Google busca ${r.status}`);
  const id = (await r.json())?.places?.[0]?.id;
  if (!id) throw new Error("Google não achou a loja");
  return id;
}

/** Converte a resposta do Google no formato que a loja desenha (só texto e URLs https). */
export function montar(lugar: any) {
  const https = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) ? u : "";
  const avaliacoes = (Array.isArray(lugar?.reviews) ? lugar.reviews : []).map((v: any) => ({
    nome: String(v?.authorAttribution?.displayName ?? "Cliente do Google").slice(0, 80),
    foto: https(v?.authorAttribution?.photoUri),
    perfil: https(v?.authorAttribution?.uri),
    nota: Math.max(0, Math.min(5, Math.round(Number(v?.rating) || 0))),
    texto: String(v?.text?.text ?? v?.originalText?.text ?? "").trim().slice(0, 1200),
    quando: String(v?.relativePublishTimeDescription ?? "").slice(0, 40),
    data: String(v?.publishTime ?? ""),
    link: https(v?.googleMapsUri),
  })).filter((v: any) => v.nota > 0);
  return {
    nome: String(lugar?.displayName?.text ?? "Tabacaria Brutt"),
    nota: Number.isFinite(Number(lugar?.rating)) ? Math.round(Number(lugar.rating) * 10) / 10 : null,
    total: Number.isFinite(Number(lugar?.userRatingCount)) ? Number(lugar.userRatingCount) : null,
    link: https(lugar?.googleMapsUri),
    avaliacoes,
  };
}

async function buscarGoogle(key: string, placeId: string) {
  const r = await fetch(`${PLACES}places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews" } });
  if (!r.ok) throw new Error(`Google detalhes ${r.status}`);
  return montar(await r.json());
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ erro: "método" }, 405);
  let cache: any = null;
  try { cache = await lerCache(); } catch { /* segue sem cache */ }
  const fresco = cache?.dados && Date.now() - Date.parse(cache.atualizado_em) < VALIDADE_MS;
  if (fresco) return json({ ok: true, ...cache.dados });
  const key = env("GOOGLE_PLACES_KEY");
  try {
    if (!key) throw new Error("GOOGLE_PLACES_KEY não configurada");
    const placeId = env("GOOGLE_PLACE_ID") || cache?.place_id || await acharLugar(key);
    const dados = await buscarGoogle(key, placeId);
    await gravarCache(placeId, dados);
    return json({ ok: true, ...dados });
  } catch (e) {
    console.error("avaliacoes:", String((e as any)?.message ?? e).slice(0, 200));   // erro só no log, não volta pra loja
    if (cache?.dados) return json({ ok: true, antigo: true, ...cache.dados });
    return json({ ok: false }, 503);
  }
}
if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(handler);
