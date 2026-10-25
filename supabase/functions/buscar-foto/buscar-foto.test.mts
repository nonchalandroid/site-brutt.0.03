// Testes da buscar-foto com a internet simulada (nenhuma chamada real).
// Rodar: node --experimental-strip-types supabase/functions/buscar-foto/buscar-foto.test.mts
import assert from "node:assert/strict";

const ENV: Record<string, string> = { SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon", GEMINI_API_KEY: "g" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };
const m = await import("./index.ts");

let gestor = true, rotas: Record<string, () => Response> = {}, pedidos: string[] = [];
const resp = (b: unknown, status = 200, h: Record<string, string> = { "content-type": "application/json" }) => new Response(typeof b === "string" || b instanceof Uint8Array ? b as any : JSON.stringify(b), { status, headers: h });
m._deps.fetch = async (u: string) => {
  pedidos.push(u);
  if (u.endsWith("/rpc/is_gestor")) return resp(gestor);
  for (const [k, f] of Object.entries(rotas)) if (u.startsWith(k)) return f();
  return resp("nada", 404, { "content-type": "text/plain" });
};
const chama = async (body: unknown) => { const r = await m.handler(new Request("https://f.test", { method: "POST", headers: { Authorization: "Bearer x" }, body: JSON.stringify(body) })); return { status: r.status, j: await r.json() }; };

// 1) urlSegura: só https e host público
assert.equal(m.urlSegura("https://loja.com/a.jpg"), true);
for (const u of ["http://loja.com/a.jpg", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://169.254.169.254/x", "https://172.20.0.1/x", "https://[::1]/x", "ftp://x.com/a", "lixo"])
  assert.equal(m.urlSegura(u), false, u);

// 2) extraiImagens: og:image, twitter, JSON-LD de Product; ignora logo/svg; caminho relativo vira absoluto
const html = `<html><head>
<meta property="og:image" content="https://cdn.loja.com/produto-1.jpg">
<meta content="/img/produto-2.webp" name="twitter:image">
<meta property="og:image" content="https://cdn.loja.com/logo.png">
<meta property="og:image" content="https://cdn.loja.com/x.svg">
<script type="application/ld+json">{"@graph":[{"@type":"Product","image":["https://cdn.loja.com/p3.jpg",{"url":"https://cdn.loja.com/p4.jpg"}]}]}</script>
<script type="application/ld+json">{quebrado</script></head></html>`;
assert.deepEqual(m.extraiImagens(html, "https://loja.com/produto"), ["https://cdn.loja.com/produto-1.jpg", "https://loja.com/img/produto-2.webp", "https://cdn.loja.com/p3.jpg", "https://cdn.loja.com/p4.jpg"]);

// 3) só dono/admin
gestor = false;
assert.equal((await chama({ name: "Essência Ziggy" })).status, 403);
gestor = true;
assert.equal((await chama({})).status, 400);

// 4) busca: Open Food Facts pelo EAN + páginas do Google (redirecionamento conferido), sem repetir foto
rotas = {
  "https://world.openfoodfacts.org/api/v2/product/7891234567895.json": () => resp({ product: { image_front_url: "https://images.openfoodfacts.org/f.jpg" } }),
  "https://generativelanguage.googleapis.com/": () => resp({ candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://redir.test/1" } }, { web: { uri: "https://redir.test/2" } }, { web: { uri: "https://redir.test/3" } }] } }] }),
  "https://redir.test/1": () => resp("", 302, { location: "https://loja-a.com.br/ziggy" }),
  "https://redir.test/2": () => resp("", 302, { location: "https://192.168.0.1/admin" }),          // destino interno: barrado
  "https://redir.test/3": () => resp("", 302, { location: "https://www.loja-b.com/p" }),
  "https://loja-a.com.br/ziggy": () => resp(`<meta property="og:image" content="https://loja-a.com.br/f1.jpg">`, 200, { "content-type": "text/html" }),
  "https://www.loja-b.com/p": () => resp(`<meta property="og:image" content="https://loja-a.com.br/f1.jpg"><meta name="twitter:image" content="https://www.loja-b.com/f2.png">`, 200, { "content-type": "text/html; charset=utf-8" }),
};
pedidos = [];
const b = await chama({ name: "Essência Ziggy Frutas Verdes", brand: "Ziggy", ean: "7891234567895" });
assert.equal(b.status, 200);
assert.deepEqual(b.j.candidatos.map((c: any) => c.url), ["https://images.openfoodfacts.org/f.jpg", "https://loja-a.com.br/f1.jpg", "https://www.loja-b.com/f2.png"]);
assert.equal(b.j.candidatos[1].site, "loja-a.com.br");
assert.equal(b.j.candidatos[2].site, "loja-b.com");
assert.ok(!pedidos.some((u) => u.includes("192.168")), "não pode acessar endereço interno");

// 5) nada achado: aviso
rotas = { "https://generativelanguage.googleapis.com/": () => resp({ candidates: [{}] }) };
const v = await chama({ name: "Produto inexistente" });
assert.equal(v.j.candidatos.length, 0); assert.ok(v.j.aviso);

// 6) baixar: só foto, devolve base64; recusa não-foto e endereço interno
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
rotas = { "https://cdn.x.com/a.png": () => resp(png, 200, { "content-type": "image/png" }), "https://cdn.x.com/p.html": () => resp("<html>", 200, { "content-type": "text/html" }) };
const ok = await chama({ acao: "baixar", url: "https://cdn.x.com/a.png" });
assert.equal(ok.status, 200); assert.equal(ok.j.tipo, "image/png"); assert.deepEqual([...Buffer.from(ok.j.b64, "base64")], [...png]);
assert.equal((await chama({ acao: "baixar", url: "https://cdn.x.com/p.html" })).status, 415);
assert.equal((await chama({ acao: "baixar", url: "https://127.0.0.1/a.png" })).status, 400);
assert.equal((await chama({ acao: "baixar", url: "https://cdn.x.com/nao-existe.png" })).status, 502);

console.log("buscar-foto: todos os testes passaram");
