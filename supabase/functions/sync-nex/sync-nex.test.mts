// Testes da sync-nex com o Nex e o Supabase simulados em memória (nenhuma chamada real, nenhuma escrita).
// Rodar: node --experimental-strip-types supabase/functions/sync-nex/sync-nex.test.mts
// Garantias testadas:
//  - ajustes com valor informado pelo NEX só ocorrem com lista sem erro detectado (integra);
//  - ZERAMENTO automático só com fim de lista comprovado. Hoje o NEX não permite comprovar o fim, então fica suspenso;
//  - produto adm-* nunca entra na ligação automática (EAN ou nome); pNN sem correspondência mantém o saldo;
//  - CurrentStock ausente/nulo/vazio/inválido/negativo nunca vira zero; zero numérico válido continua válido;
//  - nenhuma gravação (rpc) antes da validação integral das páginas.
// Todos os cenários de integridade usam base com 120 produtos ASSOCIADOS (passam da trava "pares < 100"),
// para que a proteção testada seja a da integridade, e não a trava antiga.
import assert from "node:assert/strict";

const ENV: Record<string, string> = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

let nexLista: any[], prods: any[], rpcs: { nota: string; itens: any[] }[], logs: any[];
let eventos: string[];                       // ordem das chamadas: "nex" (leitura), "rpc" (gravação), "log"
let nexResposta: ((page: number) => Response) | null = null;
const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(url);
  if (u.host === "nex.test") {
    eventos.push("nex");
    const page = JSON.parse(init.body).filter.page;
    if (nexResposta) return nexResposta(page);
    return resp({ data: { list: page === 1 ? nexLista : [] } });
  }
  if (u.pathname === "/rest/v1/sync_config") return resp([{ key: "sync_secret", value: "seg" }, { key: "nex_url", value: "https://nex.test/x" }, { key: "nex_lista", value: "todos" },
    { key: "nex_shop_code", value: "s" }, { key: "nex_client", value: "c" }, { key: "nex_token", value: "t" }]);
  if (u.pathname === "/rest/v1/products") return resp(prods);
  if (u.pathname === "/rest/v1/nex_sync_log") {
    if ((init.method || "GET") === "POST") { eventos.push("log"); logs.push(JSON.parse(init.body)); return resp(null, 201); }
    return resp([{ nex_total: nexLista.length }]);
  }
  if (u.pathname === "/rest/v1/rpc/nex_aplicar") { eventos.push("rpc"); const b = JSON.parse(init.body); rpcs.push({ nota: b.p_nota, itens: b.p_itens }); return resp({ estoque_alterado: b.p_itens.length, preco_alterado: 0, zerados: 0 }); }
  throw new Error("fetch inesperado " + url);
};
const { handler, LIMITE_SEM_PAR, lerEstoque, nomeBonito, normaliza } = await import("./index.ts");
const roda = async (modo = "real") => { const r = await handler(new Request(`https://f.test/sync-nex?modo=${modo}`, { method: "POST", headers: { "x-sync-secret": "seg" } })); return r.json(); };

/** 120 produtos legados (pNN) ASSOCIADOS por EAN, todos já iguais ao Nex */
function base() {
  nexLista = []; prods = []; rpcs = []; logs = []; eventos = []; nexResposta = null;
  for (let i = 0; i < 120; i++) {
    const ean = String(7890000000000 + i);
    nexLista.push({ ProductCode: "N" + i, ProductName: "Produto " + i, BarCode: ean, CurrentStock: 5, SalePrice: 10 });
    prods.push({ id: "p" + i, site_product_id: "p" + (i + 1), name: "Produto " + i, ean, stock: 5, price: 10, promo_price: null, is_active: true });
  }
}
const itensDe = (nota: string) => rpcs.filter(r => r.nota === nota).flatMap(r => r.itens);
const idsDe = (nota: string) => itensDe(nota).map(x => x.id);
const cru = (n: number, pfx: string, est: any = 3) =>
  Array.from({ length: n }, (_, i) => ({ ProductCode: `${pfx}${i}`, ProductName: `Item ${pfx} ${i}`, BarCode: null, CurrentStock: est, SalePrice: 10 }));
/** os 120 associados + 480 avulsos = 600 itens (página cheia) */
const pagina600 = () => [...nexLista, ...cru(480, "Z", 3)];
const pagina = (lista: any[]) => resp({ data: { list: lista } });
const primeiroRpc = () => eventos.indexOf("rpc");
const ultimaLeitura = () => eventos.lastIndexOf("nex");

let total = 0;
const ok = (msg: string) => { total++; console.log("✓ " + msg); };

// 1) ≥100 associados ultrapassam a trava antiga; lista íntegra: ajuste continua funcionando; zeramento suspenso
base(); nexLista[0].CurrentStock = 2;   // p0: site 5, Nex 2
prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "GT Red Mix Long Neck", ean: null, stock: 216, price: 8, promo_price: 7, is_active: true });
let r = await roda();
assert.equal(r.resumo.casados, 120, "120 produtos associados (acima da trava de 100)");
assert.equal(r.ok, true, "lista íntegra não bloqueia o ciclo");
assert.deepEqual(itensDe("Sync Nex").find(x => x.id === "p0"), { id: "p0", stock: 2, price: 10, promo: null }, "lista íntegra: ajuste com valor do NEX continua");
assert.equal(r.resumo.zeragem_suspensa !== null, true, "zeragem suspensa enquanto o fim não é comprovado");
ok("120 associados passam da trava antiga; ajuste com valor do NEX continua");

// 2) nex-* sem correspondência NÃO é zerado, mesmo com lista íntegra (fim não comprovado)
base();
prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "GT Red Mix Long Neck", ean: null, stock: 216, price: 8, promo_price: 7, is_active: true });
r = await roda();
assert.equal(idsDe("Sync Nex: sem par no Nex").includes("semPar"), false, "nex-* sem par não zera");
assert.match(r.alerta_sem_par, /zeragem suspensa/);
ok("nex-* sem correspondência não zera: fim da lista não comprovado");

// 3) página vazia após 600 itens é AMBÍGUA: ajustes válidos continuam; zeramento de nex-* continua suspenso
base(); nexLista[0].CurrentStock = 2;
prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "Sem par", ean: null, stock: 50, price: 8, promo_price: null, is_active: true });
const lista600 = pagina600();
nexResposta = (p) => (p === 1 ? pagina(lista600) : pagina([]));
r = await roda();
assert.equal(r.ok, true, "fim ambíguo não é erro de integridade");
assert.equal(r.resumo.nex_total, 600);
assert.deepEqual(itensDe("Sync Nex").find(x => x.id === "p0"), { id: "p0", stock: 2, price: 10, promo: null }, "ajuste com valor informado pelo NEX continua");
assert.equal(idsDe("Sync Nex: sem par no Nex").includes("semPar"), false, "página vazia após 600 não autoriza zerar nex-*");
ok("fim ambíguo (página vazia após 600): ajustes continuam, zeramento suspenso");

// 4a) o Nex ignora a página e devolve a MESMA lista de novo: é o fim da lista (ajustes seguem, zeramento suspenso)
base(); nexLista[0].CurrentStock = 2;
prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "Sem par", ean: null, stock: 50, price: 8, promo_price: null, is_active: true });
const repetida = pagina600();
nexResposta = (p) => pagina(repetida);
r = await roda();
assert.equal(r.ok, true, "página igual à anterior = fim da lista, não erro");
assert.equal(r.resumo.nex_total, 600);
assert.deepEqual(itensDe("Sync Nex").find(x => x.id === "p0"), { id: "p0", stock: 2, price: 10, promo: null }, "ajuste com valor do Nex continua");
assert.equal(idsDe("Sync Nex: sem par no Nex").includes("semPar"), false, "lista repetida não autoriza zerar nex-*");
ok("Nex ignora a página (página 2 = página 1): ajustes continuam, zeramento suspenso");

// 4b) repetição PARCIAL: nada é gravado, nem o ajuste válido nem o zeramento
base(); nexLista[0].CurrentStock = 2;
prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "Sem par", ean: null, stock: 50, price: 8, promo_price: null, is_active: true });
const p1r = pagina600(), p2r = [...p1r.slice(0, 10), ...cru(590, "R", 3)];
nexResposta = (p) => (p === 1 ? pagina(p1r) : p === 2 ? pagina(p2r) : pagina([]));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0, "página parcialmente repetida: zero gravações");
assert.match(logs[logs.length - 1].erro, /repete/);
ok("página parcialmente repetida: nenhuma gravação, nem ajuste nem zeramento");

// 5) falha HTTP na página 3: páginas anteriores não são gravadas
base(); nexLista[0].CurrentStock = 2;
const p1 = pagina600(), p2 = cru(600, "B", 3);
nexResposta = (p) => (p === 1 ? pagina(p1) : p === 2 ? pagina(p2) : resp({ erro: "x" }, 500));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0, "falha na página 3: nada gravado das páginas 1 e 2");
assert.match(logs[logs.length - 1].erro, /página 3/);
ok("falha HTTP em página posterior: nenhuma gravação parcial");

// 6) formato inválido: itens sem ProductCode/ProductName não viram fim de lista silencioso
base(); nexLista[0].CurrentStock = 2;
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : resp({ data: { list: [{ outro: 1 }, { outro: 2 }] } }));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0, "formato inválido: zero gravações");
assert.match(logs[logs.length - 1].erro, /formato esperado/);
ok("itens sem campos esperados bloqueiam o ciclo (não viram fim de lista)");

// 7) resposta malformada ou sem lista: zero gravações
base();
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : resp("texto"));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0);
assert.match(logs[logs.length - 1].erro, /inválida na página 2/);
base();
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : resp({ erro: "sem lista" }));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0);
assert.match(logs[logs.length - 1].erro, /sem lista de produtos/);
ok("resposta malformada ou sem lista: zero gravações");

// 8) teto de 20 páginas com a última cheia: zero gravações
base(); nexLista[0].CurrentStock = 2;
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : pagina(cru(600, "T" + p + "-", 3)));
r = await roda();
assert.equal(r.ok, false); assert.equal(rpcs.length, 0);
assert.match(logs[logs.length - 1].erro, /limite de 20 páginas/);
ok("limite de 20 páginas sem término confirmado: zero gravações");

// 9) adm-* com EAN igual ao de um item do NEX (estoque 0): permanece intocado; nome igual também não casa
base();
nexLista.push({ ProductCode: "M1", ProductName: "Manual Teste", BarCode: "7898000000999", CurrentStock: 0, SalePrice: 10 });
nexLista.push({ ProductCode: "M2", ProductName: "Nome Igual Manual", BarCode: null, CurrentStock: 0, SalePrice: 10 });
prods.push({ id: "adm1", site_product_id: "adm-1", name: "Produto Manual", ean: "7898000000999", stock: 12, price: 10, promo_price: null, is_active: true });
prods.push({ id: "adm2", site_product_id: "adm-2", name: "Nome Igual Manual", ean: null, stock: 4, price: 10, promo_price: null, is_active: true });
r = await roda();
assert.equal(r.resumo.casados, 120, "manuais não entram na ligação");
assert.equal(idsDe("Sync Nex").includes("adm1") || idsDe("Sync Nex: sem par no Nex").includes("adm1"), false, "adm-* por EAN: intocado");
assert.equal(idsDe("Sync Nex").includes("adm2") || idsDe("Sync Nex: sem par no Nex").includes("adm2"), false, "adm-* por nome: intocado");
assert.equal(r.ok, true);
ok("manual adm-* com EAN ou nome iguais ao NEX: estoque e preço intocados");

// 10) pNN sem correspondência: permanece intocado
base();
prods.push({ id: "leg", site_product_id: "p9001", name: "Legado Sem Par", ean: null, stock: 50, price: 8, promo_price: null, is_active: true });
r = await roda();
const todos = [...idsDe("Sync Nex"), ...idsDe("Sync Nex: sem par no Nex")];
assert.equal(todos.includes("leg"), false, "pNN sem correspondência: intocado");
assert.equal(r.resumo.sem_par_preservados, 1);
ok("legado pNN sem correspondência: saldo preservado");

// 11) nex-* em conflito de EAN também não zera (fim não comprovado)
base();
nexLista.push({ ProductCode: "C1", ProductName: "Conflito A", BarCode: "333", CurrentStock: 1, SalePrice: 10 });
nexLista.push({ ProductCode: "C2", ProductName: "Conflito B", BarCode: "333", CurrentStock: 1, SalePrice: 10 });
prods.push({ id: "conf", site_product_id: "nex-conf", name: "Conflito", ean: "333", stock: 40, price: 10, promo_price: null, is_active: true });
r = await roda();
assert.equal(idsDe("Sync Nex: sem par no Nex").includes("conf"), false);
ok("nex-* em conflito: zeramento suspenso");

// 12) CurrentStock: ausente, null, vazio, inválido e negativo não viram zero; zero válido é aplicado
base();
delete nexLista[10].CurrentStock; nexLista[11].CurrentStock = null; nexLista[12].CurrentStock = ""; nexLista[13].CurrentStock = "abc"; nexLista[14].CurrentStock = -3;
nexLista[15].CurrentStock = 0;
r = await roda();
const ajustados = idsDe("Sync Nex"), zerados = idsDe("Sync Nex: sem par no Nex");
for (const id of ["p10", "p11", "p12", "p13", "p14"]) {
  assert.equal(ajustados.includes(id), false, `${id}: estoque desconhecido não altera o produto`);
  assert.equal(zerados.includes(id), false, `${id}: estoque desconhecido não zera`);
}
assert.deepEqual(itensDe("Sync Nex").find(x => x.id === "p15"), { id: "p15", stock: 0, price: 10, promo: null }, "zero numérico válido é aplicado");
assert.equal(lerEstoque(undefined), null); assert.equal(lerEstoque(null), null); assert.equal(lerEstoque(""), null); assert.equal(lerEstoque("  "), null);
assert.equal(lerEstoque("abc"), null); assert.equal(lerEstoque(-3), null); assert.equal(lerEstoque(Number.NaN), null); assert.equal(lerEstoque("0x10"), null);
assert.equal(lerEstoque(0), 0); assert.equal(lerEstoque("0"), 0); assert.equal(lerEstoque(3.9), 3);
ok("CurrentStock: ausente/null/vazio/inválido/negativo = desconhecido; zero válido = zero");

// 13) nenhuma gravação antes da validação integral: todas as leituras do NEX precedem a primeira gravação
base(); nexLista[0].CurrentStock = 2;
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : pagina([]));
await roda();
assert.ok(primeiroRpc() === -1 || ultimaLeitura() < primeiroRpc(), "todas as páginas lidas antes da primeira gravação");
base(); nexLista[0].CurrentStock = 2;
nexResposta = (p) => (p === 1 ? pagina(pagina600()) : p === 2 ? pagina(cru(600, "B", 3)) : resp({ erro: "x" }, 500));
await roda();
assert.equal(primeiroRpc(), -1, "falha em página posterior: nenhuma gravação");
ok("nenhuma gravação antes da validação integral das páginas");

// 14) modo teste nunca grava
base(); prods.push({ id: "semPar", site_product_id: "nex-semPar", name: "Sem Par", ean: null, stock: 4, price: 8, promo_price: null, is_active: true });
r = await roda("teste");
assert.equal(rpcs.length, 0); assert.equal(r.resumo.sem_par_zerar, 1);
ok("modo teste só mostra");

// 15) suspeito: estoque só desce até o do NEX; preço fica parado
base();
nexLista.push({ ProductCode: "S1", ProductName: "Suspeito Desce", BarCode: "111", CurrentStock: 3, SalePrice: 100 });
prods.push({ id: "susp1", site_product_id: "p9003", name: "Suspeito Desce", ean: "111", stock: 9, price: 10, promo_price: 9, is_active: true });
nexLista.push({ ProductCode: "S2", ProductName: "Suspeito Sobe", BarCode: "222", CurrentStock: 7, SalePrice: 100 });
prods.push({ id: "susp2", site_product_id: "p9004", name: "Suspeito Sobe", ean: "222", stock: 1, price: 10, promo_price: null, is_active: true });
r = await roda();
assert.deepEqual(itensDe("Sync Nex").find(x => x.id === "susp1"), { id: "susp1", stock: 3, price: null, promo: 9 }, "suspeito: estoque desce, preço parado");
assert.equal(itensDe("Sync Nex").find(x => x.id === "susp2"), undefined, "suspeito com Nex maior não sobe o site");
ok("suspeito: estoque só desce, preço parado");

// 16) filtro de Catálogo Online continua valendo
base();
nexLista.forEach((o, i) => { o.Online = i < 100; });
nexLista.push({ ProductCode: "O100", ProductName: "Produto Online 100", BarCode: "7890000000100", CurrentStock: 8, SalePrice: 12, Online: true });
prods.push({ id: "onlinePar", name: "Produto Online 100", ean: "7890000000100", stock: 10, price: 10, promo_price: null, is_active: true });
nexLista.push({ ProductCode: "O101", ProductName: "Produto Online 101", BarCode: "7890000000101", CurrentStock: 7, SalePrice: 12, Online: false });
prods.push({ id: "offlinePar", name: "Produto Online 101", ean: "7890000000101", stock: 10, price: 10, promo_price: null, is_active: true });
r = await roda("teste");
assert.equal(r.resumo.nex_total, 101, "só conta os publicados online (+ o novo online)");
assert.equal(r.resumo.casados, 101, "liga só os online");
ok("filtro de Catálogo Online ignora produtos não publicados");

// nome em CAIXA ALTA do Nex → padrão da loja, sem mudar a chave de ligação por nome
{
  const casos: [string, string][] = [
    ["ENERGETICO MONSTER MANGO LOCO 473ML", "Energético Monster Mango Loco 473 ml"],
    ["BOLINHA DE RESPIRO NARGUILÉ 6MM (UNIDADE)", "Bolinha de Respiro Narguilé 6 mm (unidade)"],
    ["COMBO QN + ENERGÉTICO 2 L + 5 GELOS SABORIZADOS", "Combo QN + Energético 2 L + 5 Gelos Saborizados"],
    ["FILTRO THE OG SLIM  6X22MM", "Filtro The OG Slim 6x22 mm"],
    ["JACK PAIOLS GOLD PREMIUM C/ PITEIRA", "Jack Paiols Gold Premium c/ Piteira"],
    ["WHISKY JAMERSON 750 ML", "Whisky Jamerson 750 ml"],
    ["L.A MENTHOL", "L.A Menthol"],
    ["Essência Ziggy Menta", "Essência Ziggy Menta"],          // já no padrão: não mexe
    ["Copão 500 Jameson + RedBull + Gelo", "Copão 500 Jameson + RedBull + Gelo"],
  ];
  for (const [de, para] of casos) { assert.equal(nomeBonito(de), para, de); assert.equal(normaliza(nomeBonito(de)), normaliza(de), "chave do Nex igual: " + de); }
  ok("nome em CAIXA ALTA vira o padrão da loja sem mudar a chave do Nex");
}

console.log(`${total} testes OK`);
