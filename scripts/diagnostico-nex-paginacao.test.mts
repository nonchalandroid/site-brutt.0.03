// Testes do diagnóstico de paginação com servidores LOCAIS simulados (127.0.0.1, portas aleatórias).
// Nenhuma chamada ao NEX ou ao Supabase real. Valores de segredo são fictícios.
// Rodar: node --experimental-strip-types scripts/diagnostico-nex-paginacao.test.mts
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";

const SEG = { token: "SEGREDO-TOKEN-7731", chave: "CHAVE-SERVICO-9913", loja: "LOJA-4420", cli: "CLIENTE-5566" };
const SCRIPT = new URL("./diagnostico-nex-paginacao.mts", import.meta.url).pathname;
const mk = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ ProductCode: `${p}${i}`, ProductName: `P ${p}${i}`, CurrentStock: 1 }));

type Opt = { lista?: string | null; sbStatus?: number; sbRaw?: string; sbRedirect?: string; semToken?: boolean; nexStatus?: number; nexHtml?: boolean; nexRedirect?: string };
type Reg = { m: string; p: string; body: string };

function ouvir(srv: http.Server): Promise<number> { return new Promise(ok => srv.listen(0, "127.0.0.1", () => ok((srv.address() as AddressInfo).port))); }

async function cenario(o: Opt, extraNex?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean) {
  const reqsNex: Reg[] = [], reqsSb: Reg[] = [];
  // servidor do NEX (primeiro, para conhecer a porta)
  const nex = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      reqsNex.push({ m: req.method!, p: req.url!, body });
      if (extraNex && extraNex(req, res)) return;
      if (o.nexRedirect) { res.writeHead(302, { Location: o.nexRedirect }); return res.end(); }
      if (o.nexStatus) { res.writeHead(o.nexStatus); return res.end(`{"erro":"${SEG.token}"}`); }
      if (o.nexHtml) { res.writeHead(200); return res.end(`<html>${SEG.token}</html>`); }
      const page = JSON.parse(body).filter.page;
      const lista = page === 1 ? mk("A", 600) : page === 2 ? mk("B", 600) : mk("C", 5);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: { list: lista } }));
    });
  });
  const portaNex = await ouvir(nex);
  const sb = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      reqsSb.push({ m: req.method!, p: req.url!, body });
      if (o.sbRedirect) { res.writeHead(302, { Location: o.sbRedirect }); return res.end(); }
      if (o.sbStatus) { res.writeHead(o.sbStatus); return res.end("erro"); }
      if (o.sbRaw !== undefined) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(o.sbRaw); }
      let cfg: { key: string; value: string }[] = [
        { key: "nex_url", value: `http://127.0.0.1:${portaNex}/nex` }, { key: "nex_shop_code", value: SEG.loja },
        { key: "nex_client", value: SEG.cli }, { key: "nex_token", value: SEG.token }];
      if (o.semToken) cfg = cfg.filter(x => x.key !== "nex_token");
      if (o.lista !== undefined && o.lista !== null) cfg.push({ key: "nex_lista", value: o.lista });
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(cfg));
    });
  });
  const portaSb = await ouvir(sb);
  const saida = await new Promise<{ code: number; out: string }>(ok => execFile("node", ["--experimental-strip-types", SCRIPT],
    { env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${portaSb}`, SUPABASE_SERVICE_ROLE_KEY: SEG.chave }, timeout: 40000 },
    (err, out, errOut) => ok({ code: err ? Number((err as any).code ?? 1) : 0, out: (out + errOut).split("\n").filter(l => !/warning|reparsing|trace-warnings|module type/i.test(l)).join("\n") })));
  sb.close(); nex.close();
  return { ...saida, reqsNex, reqsSb };
}

const vazouSegredo = (s: string) => Object.values(SEG).some(v => s.includes(v)) || s.includes("N-7731");
let total = 0;
const ok = (msg: string) => { total++; console.log("✓ " + msg); };

// 1) stockControl segue o sincronizador: ausente/vazio/outro → estoque (true); só "todos" → false
for (const [lista, esperado] of [[undefined, true], [null, true], ["", true], ["xyz", true], ["estoque", true], ["todos", false]] as [string | undefined | null, boolean][]) {
  const r = await cenario({ lista });
  const sc = r.reqsNex.map(x => JSON.parse(x.body).filter.stockControl);
  assert.deepEqual([...new Set(sc)], [esperado], `nex_lista=${JSON.stringify(lista)} → stockControl ${esperado}`);
}
ok("nex_lista ausente/vazio/outro = estoque (true); só 'todos' = false, igual ao sincronizador");

// 2) caso de JSON inválido em sync_config: mensagem fixa, sem trecho do corpo com o token
{
  const r = await cenario({ sbRaw: `[{"key":"nex_token","value":"${SEG.token}"}, x]` });
  assert.equal(r.code, 1);
  assert.match(r.out, /resposta de sync_config não é JSON válido/);
  assert.equal(vazouSegredo(r.out), false, "nenhum trecho do token no erro de JSON");
  assert.equal(r.reqsNex.length, 0, "sem configuração válida, nada é enviado ao NEX");
}
ok("JSON inválido em sync_config: mensagem fixa, sem trecho do token");

// 3) redirecionamento do NEX: o destino não recebe requisição (o token não sai) e a saída não mostra o token
{
  const destino: Reg[] = [];
  const alvo = http.createServer((req, res) => { destino.push({ m: req.method!, p: req.url!, body: "" }); res.end("{}"); });
  const portaAlvo = await ouvir(alvo);
  const r = await cenario({ nexRedirect: `http://127.0.0.1:${portaAlvo}/destino` });
  alvo.close();
  assert.equal(destino.length, 0, "destino do redirecionamento não recebe nenhuma requisição");
  assert.match(r.out, /redirecionamento bloqueado/);
  assert.equal(vazouSegredo(r.out), false);
}
ok("redirecionamento bloqueado: token não chega ao destino e não aparece na saída");

// 4) erro HTTP e resposta que não é JSON do NEX: sem token na saída
{
  const e500 = await cenario({ nexStatus: 500 });
  assert.match(e500.out, /HTTP: 500 · falha/);
  assert.equal(vazouSegredo(e500.out), false);
  const html = await cenario({ nexHtml: true });
  assert.match(html.out, /resposta não é JSON/);
  assert.equal(vazouSegredo(html.out), false);
}
ok("erro HTTP 500 e resposta HTML do NEX: sem token na saída");

// 5) limitado a 3 POSTs (páginas 1, 2 e 3); só GET no Supabase; nenhuma escrita
{
  const r = await cenario({});
  assert.equal(r.code, 0);
  const paginas = r.reqsNex.map(x => JSON.parse(x.body).filter.page);
  assert.deepEqual(paginas, [1, 2, 3]);
  assert.ok(r.reqsNex.every(x => x.m === "POST" && x.p === "/nex"));
  assert.ok(r.reqsSb.every(x => x.m === "GET" && x.p.startsWith("/rest/v1/sync_config")), "Supabase só recebe GET em sync_config");
  assert.equal(vazouSegredo(r.out), false, "saída normal sem segredos");
  assert.match(r.out, /Nenhuma escrita foi feita/);
}
ok("exatamente páginas 1, 2 e 3; só GET no Supabase; saída normal sem segredos");

// 6) redirecionamento do Supabase: o destino não recebe a chave de serviço e ela não aparece na saída
{
  const destino: Reg[] = [];
  const alvo = http.createServer((req, res) => { destino.push({ m: req.method!, p: req.url!, body: "" }); res.end("[]"); });
  const portaAlvo = await ouvir(alvo);
  const r = await cenario({ sbRedirect: `http://127.0.0.1:${portaAlvo}/destino` });
  alvo.close();
  assert.equal(destino.length, 0, "destino do redirecionamento do Supabase não recebe requisição");
  assert.equal(r.code, 1);
  assert.match(r.out, /redirecionamento bloqueado/);
  assert.equal(r.out.includes(SEG.chave), false, "chave de serviço não aparece na saída");
  assert.equal(vazouSegredo(r.out), false);
}
ok("redirecionamento do Supabase bloqueado: destino não recebe nada e a chave não aparece na saída");

// 7) ambiente sem variáveis: sai sem consultar nada
{
  const saida = await new Promise<{ code: number; out: string }>(ok2 => execFile("node", ["--experimental-strip-types", SCRIPT],
    { env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, timeout: 40000 },
    (err, out, errOut) => ok2({ code: err ? Number((err as any).code ?? 1) : 0, out: out + errOut })));
  assert.equal(saida.code, 2);
  assert.equal(vazouSegredo(saida.out), false);
}
ok("sem variáveis de ambiente: encerra com código 2 e sem consulta");

console.log(`${total} cenários OK`);
