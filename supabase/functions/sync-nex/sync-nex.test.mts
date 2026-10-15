// Testes da sync-nex com o Nex e o Supabase simulados em memória.
// Rodar: node --experimental-strip-types supabase/functions/sync-nex/sync-nex.test.mts
// Regra testada: o site nunca mostra mais estoque que o Nex (tudo é AJUSTE via nex_aplicar).
import assert from "node:assert/strict";

const ENV: Record<string, string> = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

let nexLista: any[], prods: any[], rpcs: { nota: string; itens: any[] }[], logs: any[];
const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(url);
  if (u.host === "nex.test") return resp({ data: { list: nexLista } });
  if (u.pathname === "/rest/v1/sync_config") return resp([{ key: "sync_secret", value: "seg" }, { key: "nex_url", value: "https://nex.test/x" }, { key: "nex_lista", value: "todos" },
    { key: "nex_shop_code", value: "s" }, { key: "nex_client", value: "c" }, { key: "nex_token", value: "t" }]);
  if (u.pathname === "/rest/v1/products") return resp(prods);
  if (u.pathname === "/rest/v1/nex_sync_log") { if ((init.method || "GET") === "POST") { logs.push(JSON.parse(init.body)); return resp(null, 201); } return resp([{ nex_total: nexLista.length }]); }
  if (u.pathname === "/rest/v1/rpc/nex_aplicar") { const b = JSON.parse(init.body); rpcs.push({ nota: b.p_nota, itens: b.p_itens }); return resp({ estoque_alterado: b.p_itens.length, preco_alterado: 0, zerados: 0 }); }
  throw new Error("fetch inesperado " + url);
};
const { handler, LIMITE_SEM_PAR } = await import("./index.ts");
const roda = async (modo = "real") => { const r = await handler(new Request(`https://f.test/sync-nex?modo=${modo}`, { method: "POST", headers: { "x-sync-secret": "seg" } })); return r.json(); };

/** 120 produtos ligados por EAN (passa da trava de "poucos ligados"), todos já iguais ao Nex */
function base() {
  nexLista = []; prods = []; rpcs = []; logs = [];
  for (let i = 0; i < 120; i++) {
    const ean = String(7890000000000 + i);
    nexLista.push({ ProductCode: "N" + i, ProductName: "Produto " + i, BarCode: ean, CurrentStock: 5, SalePrice: 10 });
    prods.push({ id: "p" + i, name: "Produto " + i, ean, stock: 5, price: 10, promo_price: null, is_active: true });
  }
}
const itensDe = (nota: string) => rpcs.filter(r => r.nota === nota).flatMap(r => r.itens);

// 1) sem par zera; inativo não mexe; suspeito só desce; normal iguala
base();
prods.push({ id: "semPar", name: "GT Red Mix Long Neck", ean: null, stock: 216, price: 8, promo_price: 7, is_active: true });
prods.push({ id: "inativo", name: "Produto Velho", ean: null, stock: 5, price: 8, promo_price: null, is_active: false });
nexLista.push({ ProductCode: "S1", ProductName: "Suspeito Desce", BarCode: "111", CurrentStock: 3, SalePrice: 100 });
prods.push({ id: "susp1", name: "Suspeito Desce", ean: "111", stock: 9, price: 10, promo_price: 9, is_active: true });
nexLista.push({ ProductCode: "S2", ProductName: "Suspeito Sobe", BarCode: "222", CurrentStock: 7, SalePrice: 100 });
prods.push({ id: "susp2", name: "Suspeito Sobe", ean: "222", stock: 1, price: 10, promo_price: null, is_active: true });
nexLista[0].CurrentStock = 2;   // p0: site 5, Nex 2
let r = await roda();
assert.equal(r.ok, true);
assert.deepEqual(itensDe("Sync Nex: sem par no Nex"), [{ id: "semPar", stock: 0, price: null, promo: 7 }], "sem par zera e mantém preço/promo");
const normal = itensDe("Sync Nex");
assert.deepEqual(normal.find(x => x.id === "p0"), { id: "p0", stock: 2, price: 10, promo: null }, "normal iguala ao Nex");
assert.deepEqual(normal.find(x => x.id === "susp1"), { id: "susp1", stock: 3, price: null, promo: 9 }, "suspeito: estoque desce, preço parado");
assert.equal(normal.find(x => x.id === "susp2"), undefined, "suspeito com Nex maior não sobe o site");
assert.equal([...itensDe("Sync Nex"), ...itensDe("Sync Nex: sem par no Nex")].some(x => x.id === "inativo"), false, "inativo fora da loja não mexe");
assert.equal(r.resumo.sem_par_zerar, 1); assert.equal(r.alerta_sem_par, null);
console.log("✓ sem par zera, suspeito só desce, normal iguala, inativo intocado");

// 2) produto em conflito (dois itens do Nex com o mesmo EAN do site) também zera
base();
nexLista.push({ ProductCode: "C1", ProductName: "Conflito A", BarCode: "333", CurrentStock: 1, SalePrice: 10 });
nexLista.push({ ProductCode: "C2", ProductName: "Conflito B", BarCode: "333", CurrentStock: 1, SalePrice: 10 });
prods.push({ id: "conf", name: "Conflito", ean: "333", stock: 40, price: 10, promo_price: null, is_active: true });
r = await roda();
assert.deepEqual(itensDe("Sync Nex: sem par no Nex").map(x => x.id), ["conf"]);
console.log("✓ par em conflito também vai a 0 até resolver");

// 3) muitos sem par: não zera nenhum, avisa, e o resto da sincronização segue
base();
for (let i = 0; i <= LIMITE_SEM_PAR; i++) prods.push({ id: "x" + i, name: "Avulso " + i, ean: null, stock: 3, price: 5, promo_price: null, is_active: true });
nexLista[1].CurrentStock = 0;
r = await roda();
assert.equal(r.ok, true); assert.equal(itensDe("Sync Nex: sem par no Nex").length, 0);
assert.match(r.alerta_sem_par, /não zerei/);
assert.deepEqual(itensDe("Sync Nex").map(x => x.id), ["p1"], "ajuste normal continua");
console.log("✓ acima do limite: não zera, avisa e segue igualando o resto");

// 4) modo teste não grava nada
base(); prods.push({ id: "semPar", name: "Sem Par", ean: null, stock: 4, price: 8, promo_price: null, is_active: true });
r = await roda("teste");
assert.equal(rpcs.length, 0); assert.equal(r.resumo.sem_par_zerar, 1);
console.log("✓ modo teste só mostra");

// 5) filtro de Catálogo Online: só sincroniza produtos publicados online
base();
nexLista.forEach((o, i) => { o.Online = i < 100; });   // 100 publicados, 20 não
prods.push({ id: "onlinePar", name: "Produto Online 100", ean: "7890000000100", stock: 10, price: 10, promo_price: null, is_active: true });
nexLista.push({ ProductCode: "O100", ProductName: "Produto Online 100", BarCode: "7890000000100", CurrentStock: 8, SalePrice: 12, Online: true });
prods.push({ id: "offlinePar", name: "Produto Online 101", ean: "7890000000101", stock: 10, price: 10, promo_price: null, is_active: true });
nexLista.push({ ProductCode: "O101", ProductName: "Produto Online 101", BarCode: "7890000000101", CurrentStock: 7, SalePrice: 12, Online: false });
r = await roda("teste");
assert.equal(r.resumo.nex_total, 101, "só conta os publicados online (+ o novo online)");
assert.equal(r.resumo.casados, 101, "liga só os online");
assert.equal(r.resumo.sem_par_site, 21, "20 base não-publicados + 1 site-only offlinePar");
assert.deepEqual(r.aplicado, null);
console.log("✓ filtro de Catálogo Online ignora produtos não publicados");

console.log("5 testes OK");
