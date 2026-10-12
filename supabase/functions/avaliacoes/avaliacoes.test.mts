// Testes da função avaliacoes com o Google e o Supabase simulados em memória.
// Rodar: node --experimental-strip-types supabase/functions/avaliacoes/avaliacoes.test.mts
import assert from "node:assert/strict";

const ENV: Record<string, string> = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv", GOOGLE_PLACES_KEY: "gk" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

let cache: any, chamadas: string[], googleFalha: boolean;
const LUGAR = { id: "ChIJbrutt", displayName: { text: "Tabacaria Brutt" }, rating: 4.86, userRatingCount: 132, googleMapsUri: "https://maps.google.com/?cid=1",
  reviews: [
    { rating: 5, text: { text: "Atendimento top, essências geladas!" }, relativePublishTimeDescription: "há 2 semanas", publishTime: "2026-09-28T10:00:00Z",
      authorAttribution: { displayName: "Ana", uri: "https://www.google.com/maps/contrib/1", photoUri: "https://lh3.googleusercontent.com/a" }, googleMapsUri: "https://www.google.com/maps/reviews/1" },
    { rating: 4, originalText: { text: "Bom" }, authorAttribution: { displayName: "Beto", uri: "javascript:alert(1)", photoUri: "http://inseguro/x" } },
    { rating: 0, text: { text: "sem nota" } },
  ] };
const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(url); chamadas.push(`${init.method || "GET"} ${u.host}${u.pathname}`);
  if (u.host === "sb.test") {
    if ((init.method || "GET") === "GET") return resp(cache ? [cache] : []);
    cache = JSON.parse(init.body); return resp(null, 201);
  }
  if (u.host === "places.googleapis.com") {
    assert.equal(init.headers["X-Goog-Api-Key"], "gk");
    if (googleFalha) return resp({ error: "x" }, 403);
    if (u.pathname.endsWith("places:searchText")) return resp({ places: [{ id: "ChIJbrutt" }] });
    assert.ok(init.headers["X-Goog-FieldMask"].includes("reviews"));
    return resp(LUGAR);
  }
  throw new Error("fetch inesperado " + url);
};
const { handler } = await import("./index.ts");
const chama = async () => { const r = await handler(new Request("https://f.test/avaliacoes")); return { status: r.status, corpo: await r.json() }; };
const zera = () => { cache = null; chamadas = []; googleFalha = false; ENV.GOOGLE_PLACES_KEY = "gk"; delete ENV.GOOGLE_PLACE_ID; };

// 1) sem cache: acha o lugar, busca detalhes, grava cache e devolve no formato da loja
zera();
let r = await chama();
assert.equal(r.status, 200); assert.equal(r.corpo.nota, 4.9); assert.equal(r.corpo.total, 132);
assert.equal(r.corpo.avaliacoes.length, 2, "avaliação sem nota sai");
assert.deepEqual(r.corpo.avaliacoes[0], { nome: "Ana", foto: "https://lh3.googleusercontent.com/a", perfil: "https://www.google.com/maps/contrib/1", nota: 5,
  texto: "Atendimento top, essências geladas!", quando: "há 2 semanas", data: "2026-09-28T10:00:00Z", link: "https://www.google.com/maps/reviews/1" });
assert.equal(r.corpo.avaliacoes[1].perfil, "", "link que não é https não passa"); assert.equal(r.corpo.avaliacoes[1].foto, "");
assert.equal(r.corpo.avaliacoes[1].texto, "Bom");
assert.equal(cache.place_id, "ChIJbrutt");
assert.ok(chamadas.some(c => c.includes("places:searchText")));
console.log("✓ busca no Google, filtra e grava o cache");

// 2) cache fresco: não chama o Google
chamadas = [];
r = await chama();
assert.equal(r.corpo.total, 132); assert.ok(!chamadas.some(c => c.includes("googleapis")), "cache fresco não chama o Google");
console.log("✓ cache de 12 h evita chamar o Google");

// 3) cache vencido: reaproveita o place_id guardado (sem nova busca)
cache.atualizado_em = new Date(Date.now() - 13 * 3600e3).toISOString(); chamadas = [];
r = await chama();
assert.equal(r.status, 200); assert.ok(!chamadas.some(c => c.includes("searchText"))); assert.ok(chamadas.some(c => c.includes("/v1/places/ChIJbrutt")));
console.log("✓ cache vencido renova usando o place_id guardado");

// 4) Google falhando com cache antigo: devolve o antigo
cache.atualizado_em = new Date(Date.now() - 30 * 3600e3).toISOString(); googleFalha = true;
r = await chama();
assert.equal(r.status, 200); assert.equal(r.corpo.antigo, true); assert.equal(r.corpo.total, 132);
console.log("✓ Google fora do ar: mostra o último cache");

// 5) sem chave e sem cache: 503 (a loja esconde a seção)
zera(); delete ENV.GOOGLE_PLACES_KEY;
r = await chama();
assert.equal(r.status, 503); assert.equal(r.corpo.ok, false); assert.ok(!chamadas.some(c => c.includes("googleapis")));
console.log("✓ sem chave: 503 sem chamar o Google");

console.log("5 testes OK");
