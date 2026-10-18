// DIAGNÓSTICO LOCAL DE PAGINAÇÃO DO NEX — SOMENTE LEITURA. Não faz parte da função em produção.
//
// O que faz:
//  1. Lê sync_config do Supabase com GET (mesmo critério de supabase/functions/sync-nex/index.ts).
//  2. Faz 3 POSTs ao endpoint sync_config.nex_url (páginas 1, 2 e 3) com o MESMO corpo e os MESMOS
//     cabeçalhos do sincronizador (perPage 600, stockControl conforme sync_config.nex_lista).
//  3. Imprime SOMENTE: número da página, HTTP, estrutura, contagens, repetições e NOMES de campos.
//
// O que NÃO faz: não imprime tokens, cabeçalhos, URLs, valores de produto ou respostas completas;
//  não grava nada (nenhum POST/PATCH/RPC no Supabase); não chama nex_aplicar; não altera estoque.
//
// Como executar (manualmente, no seu computador, com as variáveis no ambiente — NÃO cole a chave no chat):
//   SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> \
//   node --experimental-strip-types scripts/diagnostico-nex-paginacao.mts
//
// Observação de autenticação: o NEX usa shop-code, client e token guardados em sync_config (lidos aqui pela
// mesma chave de serviço que a função usa). O script só usa esses valores no cabeçalho da requisição.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. Nada foi consultado.");
  process.exit(2);
}

type Cfg = Record<string, string>;

async function lerConfig(): Promise<Cfg> {
  // somente GET
  // redirect: "error" impede que a chave de serviço seja reenviada a outro endereço
  let r: Response;
  try {
    r = await fetch(`${SB_URL}/rest/v1/sync_config?select=key,value`, {
      redirect: "error",
      headers: { apikey: SB_KEY!, Authorization: "Bearer " + SB_KEY! },
    });
  } catch {
    throw new Error("leitura de sync_config falhou (erro de rede ou redirecionamento bloqueado)");
  }
  if (!r.ok) throw new Error(`leitura de sync_config falhou (HTTP ${r.status})`);
  // Mensagem fixa: o erro do JSON.parse pode mostrar trechos do corpo (que contém tokens).
  let linhas: unknown;
  try { linhas = await r.json(); } catch { throw new Error("resposta de sync_config não é JSON válido"); }
  if (!Array.isArray(linhas)) throw new Error("resposta de sync_config com formato inesperado");
  const cfg: Cfg = {};
  for (const row of linhas as any[]) if (row && typeof row.key === "string") cfg[row.key] = row.value;
  for (const k of ["nex_url", "nex_shop_code", "nex_client", "nex_token"]) {
    if (!cfg[k]) throw new Error(`sync_config sem a chave obrigatória ${k}`);
  }
  return cfg;
}

// Espelho mínimo das regras de leitura de index.ts (sem importar o módulo de produção).
const ehProduto = (o: any) => !!o && typeof o === "object" && ("ProductCode" in o || "ProductName" in o);
function arraysDeObjetos(j: any, acc: any[][] = []): any[][] {
  if (Array.isArray(j)) { if (j.some(x => x && typeof x === "object")) acc.push(j); j.forEach(x => arraysDeObjetos(x, acc)); }
  else if (j && typeof j === "object") Object.values(j).forEach(v => arraysDeObjetos(v, acc));
  return acc;
}
function listaDePagina(j: any): { produtos: any[]; formatoOk: boolean; temArray: boolean } {
  const todos = arraysDeObjetos(j);
  const candidatos = todos.filter(a => a.some(ehProduto));
  if (!candidatos.length) return { produtos: [], formatoOk: todos.length === 0, temArray: todos.length > 0 };
  const principal = candidatos.reduce((m, a) => (a.length > m.length ? a : m));
  return { produtos: principal, formatoOk: principal.every(ehProduto), temArray: true };
}
// nomes de chaves (nunca valores) que sugerem total ou paginação, em qualquer profundidade
function nomesDeChaves(j: any, acc: Set<string> = new Set(), prof = 0): Set<string> {
  if (prof > 6 || !j || typeof j !== "object") return acc;
  if (Array.isArray(j)) { j.forEach(x => nomesDeChaves(x, acc, prof + 1)); return acc; }   // índices de array não são nomes de campo
  for (const [k, v] of Object.entries(j)) { acc.add(k); nomesDeChaves(v, acc, prof + 1); }
  return acc;
}

async function main() {
  const cfg = await lerConfig();
  // Igual a index.ts (linha 270): valor ausente ou vazio vira "estoque"; só "todos" desliga o stockControl.
  const stockControl = (cfg.nex_lista || "estoque") !== "todos";
  const vistos = new Set<string>();
  const camposProduto = new Set<string>();

  console.log(`Diagnóstico de paginação NEX · somente leitura · stockControl=${stockControl}`);
  for (const pagina of [1, 2, 3]) {
    console.log(`\n— Página ${pagina}`);
    const c = new AbortController(), t = setTimeout(() => c.abort(), 30000);
    let r: Response | null = null;
    try {
      r = await fetch(cfg.nex_url, {
        method: "POST", signal: c.signal,
        redirect: "error",   // não seguir redirecionamento: o token não é enviado a outro endereço
        headers: { "Content-Type": "application/json", "shop-code": cfg.nex_shop_code, client: cfg.nex_client, token: cfg.nex_token },
        body: JSON.stringify({ filter: { category: "", subCategory: "", search: "", lowStock: false, stockControl, sort: { ProductName: 1 }, page: pagina, perPage: 600, onlyPromo: false, sortFilter: "" } }),
      });
    } catch (e: any) {
      const motivo = e?.name === "AbortError" ? "tempo esgotado" : "erro de rede ou redirecionamento bloqueado";
      console.log(`  requisição: FALHOU (${motivo})`);
      continue;
    } finally { clearTimeout(t); }

    console.log(`  HTTP: ${r.status} · ${r.ok ? "sucesso" : "falha"}`);
    if (!r.ok) continue;

    let j: any;
    try { j = await r.json(); } catch { console.log("  estrutura: resposta não é JSON"); continue; }
    const estruturaOk = j !== null && typeof j === "object";
    const { produtos, formatoOk, temArray } = listaDePagina(j);
    console.log(`  estrutura: ${!estruturaOk ? "inválida (não é objeto)" : !temArray ? "sem lista de produtos" : formatoOk ? "esperada (lista de objetos com ProductCode/ProductName)" : "lista com itens fora do formato esperado"}`);
    console.log(`  produtos encontrados: ${produtos.length}`);
    const codigos = produtos.map(o => String(o.ProductCode ?? ""));
    const distintos = new Set(codigos);
    const repetidosAntes = codigos.filter(c2 => vistos.has(c2)).length;
    console.log(`  códigos distintos: ${distintos.size}`);
    console.log(`  códigos repetidos em relação às páginas anteriores: ${repetidosAntes}`);
    codigos.forEach(c2 => vistos.add(c2));
    produtos.forEach(o => Object.keys(o).forEach(k => camposProduto.add(k)));
    console.log(`  campos na resposta (nomes): ${[...nomesDeChaves(j)].sort().join(", ") || "(nenhum)"}`);
    const suspeitos = [...nomesDeChaves(j)].filter(k => /total|count|page|pag|next|last|more|qtd|quant/i.test(k));
    console.log(`  campos de total/paginação encontrados (nomes): ${suspeitos.join(", ") || "nenhum"}`);
    if (produtos.length < 600) console.log(`  (página com menos de 600 itens: o sincronizador trataria como fim visto, mas isso NÃO comprova o fim)`);
  }
  console.log(`\nCampos de produto vistos em todas as páginas (nomes): ${[...camposProduto].sort().join(", ") || "(nenhum)"}`);
  console.log("Fim do diagnóstico. Nenhuma escrita foi feita.");
}

main().catch(e => { console.error("Diagnóstico interrompido:", e?.message ?? "erro desconhecido"); process.exit(1); });
