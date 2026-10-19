// Testes da busca de endereço (geoapify-autocomplete) com Geoapify e Photon simulados (nenhuma chamada real).
// Rodar: node --experimental-strip-types supabase/functions/geoapify-autocomplete/autocomplete.test.mts
import assert from "node:assert/strict";

const ENV: Record<string, string> = { GEOAPIFY_API_KEY: "k" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
const { handler, normalizaPhoton, normaliza, _reset } = await import("./index.ts");

const pho = (name: string, key: string, street: string, hn = "", district = "Campo Grande") =>
  ({ properties: { name, osm_key: key, street, housenumber: hn, district, city: "Rio de Janeiro", state: "Rio de Janeiro" }, geometry: { coordinates: [-43.60, -22.87] } });
let GEO: any[] = [], PHO: any[] = [];
(globalThis as any).fetch = async (u: string) => {
  if (String(u).includes("geoapify")) return new Response(JSON.stringify({ results: GEO }));
  return new Response(JSON.stringify({ features: PHO }));
};
const busca = async (t: string) => { _reset(); return (await (await handler(new Request("https://x/?text=" + encodeURIComponent(t)))).json()).resultados; };
let ok = 0; const t = async (n: string, f: () => Promise<void> | void) => { await f(); ok++; console.log("ok -", n); };

await t("condomínio vem com o nome e a rua/número dele", async () => {
  GEO = []; PHO = [pho("Condomínio Bosque do Tingui", "landuse", "Estrada do Tingui", "2490")];
  const r = await busca("bosque do tingui");
  assert.equal(r.length, 1); assert.equal(r[0].nome, "Condomínio Bosque do Tingui"); assert.equal(r[0].rua, "Estrada do Tingui"); assert.equal(r[0].numero, "2490");
});
await t("rua sem a palavra 'Rua': rua não ganha nome de lugar", async () => {
  GEO = []; PHO = [pho("Rua Frei Timótheo", "highway", "")];
  const r = await busca("frei timotheo");
  assert.equal(r[0].rua, "Rua Frei Timótheo"); assert.equal(r[0].nome, "");
});
await t("nome genérico ('Condominio') não aparece como nome", () => {
  assert.equal(normalizaPhoton(pho("Condominio", "building", "Rua Aladim"))!.nome, "");
});
await t("Geoapify com rua + Photon com lugar: os dois aparecem", async () => {
  GEO = [{ street: "Estrada do Mendanha", housenumber: "555", result_type: "building", lat: -22.88, lon: -43.56, city: "Rio de Janeiro", state_code: "RJ", suburb: "Campo Grande", name: "" }];
  PHO = [pho("West Shopping", "shop", "Estrada do Mendanha", "555")];
  const r = await busca("west shopping");
  assert.equal(r.length, 2); assert.equal(r[1].nome, "West Shopping");
});
await t("lugar sem rua é descartado (não dá para entregar)", async () => {
  GEO = []; PHO = [pho("Condomínio Parque Dourado", "landuse", "")];
  assert.equal((await busca("parque dourado")).length, 0);
});
await t("Geoapify: resultado tipo rua não vira nome", () => {
  assert.equal(normaliza({ street: "Rua Dez", name: "Rua Dez", result_type: "street", lat: 1, lon: 1, city: "Rio de Janeiro" })!.nome, "");
  assert.equal(normaliza({ street: "Rua Dez", name: "Escola X", result_type: "amenity", lat: 1, lon: 1, city: "Rio de Janeiro" })!.nome, "Escola X");
});
await t("fora da Zona Oeste continua fora", async () => {
  GEO = []; PHO = [pho("Prédio Y", "building", "Rua Z", "1", "Tijuca")];
  assert.equal((await busca("predio y")).length, 0);
});
console.log(`\n${ok} testes passaram`);
