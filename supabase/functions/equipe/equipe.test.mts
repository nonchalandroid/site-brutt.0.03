// Testes da função equipe com o Supabase (auth + banco) simulado em memória.
// Rodar: node --experimental-strip-types supabase/functions/equipe/equipe.test.mts
import assert from "node:assert/strict";

const ENV: Record<string, string> = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srv" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

const DONO = "00000000-0000-4000-8000-000000000001", ADM = "00000000-0000-4000-8000-000000000002", ATD = "00000000-0000-4000-8000-000000000003";
const tokens: Record<string, string> = { "tk-dono": DONO, "tk-adm": ADM, "tk-atd": ATD };
let users: { id: string; email: string; password: string }[], staff: any[], chamadas: string[];
function zera() {
  users = [{ id: DONO, email: "dono@x.com", password: "x" }, { id: ADM, email: "adm@x.com", password: "x" }, { id: ATD, email: "atd@x.com", password: "x" },
    { id: "00000000-0000-4000-8000-000000000009", email: "antigo@x.com", password: "velha123", confirmado: true },
    { id: "00000000-0000-4000-8000-000000000010", email: "intruso@x.com", password: "doatacante" }];
  staff = [{ user_id: DONO, name: "Dono", role: "owner", active: true }, { user_id: ADM, name: "Adm", role: "admin", active: true }, { user_id: ATD, name: "Atd", role: "atendente", active: true }];
  chamadas = [];
}
// mesma regra do banco (equipe_pode)
function equipePode(uid: string | undefined, alvo: string | null, novo: string | null) {
  const eu = staff.find(s => s.user_id === uid && s.active)?.role;
  if (eu === "owner") return (alvo ?? "") !== "owner" && ["admin", "atendente"].includes(novo ?? "atendente");
  if (eu === "admin") return (alvo ?? "atendente") === "atendente" && (novo ?? "atendente") === "atendente";
  return false;
}
const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(url), auth = String(init.headers?.Authorization || "").replace("Bearer ", ""), corpo = init.body ? JSON.parse(init.body) : null;
  chamadas.push(`${init.method || "GET"} ${u.pathname}`);
  if (u.pathname === "/auth/v1/user") return tokens[auth] ? resp({ id: tokens[auth] }) : resp({ msg: "jwt" }, 401);
  if (u.pathname === "/rest/v1/rpc/equipe_pode") { assert.notEqual(auth, "srv", "equipe_pode tem que ir com o token de quem pediu"); return resp(equipePode(tokens[auth], corpo.p_alvo_papel, corpo.p_novo_papel)); }
  if (u.pathname === "/rest/v1/rpc/equipe_usuario_por_email") { assert.equal(auth, "srv"); return resp(users.find(x => x.email === corpo.p_email)?.id ?? null); }
  if (u.pathname === "/auth/v1/admin/users" && init.method === "POST") {
    assert.equal(auth, "srv"); assert.equal(corpo.email_confirm, true);
    const id = `00000000-0000-4000-8000-0000000001${String(users.length).padStart(2, "0")}`; users.push({ id, email: corpo.email, password: corpo.password }); return resp({ id });
  }
  const m = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
  if (m && (init.method || "GET") === "GET") { assert.equal(auth, "srv"); const x = users.find(y => y.id === m[1]); return x ? resp({ id: x.id, email_confirmed_at: x.confirmado ? "2026-01-01" : null }) : resp({}, 404); }
  if (m && init.method === "PUT") { assert.equal(auth, "srv"); const x = users.find(y => y.id === m[1]); if (!x) return resp({}, 404); if ("password" in corpo) x.password = corpo.password; if (corpo.email_confirm) x.confirmado = true; return resp({ id: x.id }); }
  if (u.pathname === "/rest/v1/staff" && init.method === "POST") {
    assert.equal(auth, "srv"); assert.match(init.headers.Prefer, /merge-duplicates/);
    const i = staff.findIndex(s => s.user_id === corpo.user_id); if (i >= 0) staff[i] = { ...staff[i], ...corpo }; else staff.push(corpo); return resp([corpo], 201);
  }
  if (u.pathname === "/rest/v1/staff") { const id = u.searchParams.get("user_id")!.slice(3); return resp(staff.filter(s => s.user_id === id)); }
  throw new Error("fetch inesperado " + url);
};

const { handler, validaSenha } = await import("./index.ts");
const chama = async (acao: string, token: string | null, body: unknown) => {
  const r = await handler(new Request(`https://fn.test/equipe?acao=${acao}`, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body) }));
  return { status: r.status, j: await r.json() };
};
let n = 0; const t = async (nome: string, fn: () => Promise<void> | void) => { zera(); await fn(); n++; console.log("✓ " + nome); };

await t("senha: mínimo 8, letras e números", () => {
  assert.ok(validaSenha("abc12")); assert.ok(validaSenha("abcdefgh")); assert.ok(validaSenha("12345678")); assert.equal(validaSenha("brutt2026"), "");
});
await t("sem login → 401; token de serviço não vale como login", async () => {
  assert.equal((await chama("criar", null, {})).status, 401);
  assert.equal((await chama("criar", "srv", {})).status, 401);
});
await t("dono cria ATENDENTE: login já confirmado + entra na equipe como atendente", async () => {
  const r = await chama("criar", "tk-dono", { email: " Joao@Loja.com ", nome: "João  balcão", papel: "atendente", senha: "brutt2026" });
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.ja_tinha_login, false);
  const u = users.find(x => x.email === "joao@loja.com")!; assert.ok(u); assert.equal(u.password, "brutt2026");
  const s = staff.find(x => x.user_id === u.id); assert.deepEqual([s.name, s.role, s.active, s.alterado_por], ["João balcão", "atendente", true, DONO]);
});
await t("dono cria ADMINISTRADOR", async () => {
  const r = await chama("criar", "tk-dono", { email: "gerente@loja.com", nome: "Gerente", papel: "admin", senha: "brutt2026" });
  assert.equal(r.status, 200); assert.equal(staff.at(-1).role, "admin");
});
await t("administrador cria atendente, mas NÃO cria administrador", async () => {
  assert.equal((await chama("criar", "tk-adm", { email: "a1@loja.com", nome: "A1", papel: "atendente", senha: "brutt2026" })).status, 200);
  const r = await chama("criar", "tk-adm", { email: "a2@loja.com", nome: "A2", papel: "admin", senha: "brutt2026" });
  assert.equal(r.status, 403); assert.match(r.j.erro, /Só o dono/); assert.ok(!users.some(x => x.email === "a2@loja.com"), "não pode criar o login antes de checar a permissão");
});
await t("atendente não adiciona ninguém", async () => {
  const r = await chama("criar", "tk-atd", { email: "a3@loja.com", nome: "A3", papel: "atendente", senha: "brutt2026" });
  assert.equal(r.status, 403); assert.equal(users.length, 5);
});
await t("validações: e-mail, nome, papel, senha fraca", async () => {
  assert.match((await chama("criar", "tk-dono", { email: "x@", nome: "X", papel: "atendente", senha: "brutt2026" })).j.erro, /E-mail/);
  assert.match((await chama("criar", "tk-dono", { email: "x@y.com", nome: "X", papel: "atendente", senha: "brutt2026" })).j.erro, /nome/);
  assert.match((await chama("criar", "tk-dono", { email: "x@y.com", nome: "Xx", papel: "owner", senha: "brutt2026" })).j.erro, /papel/);
  assert.match((await chama("criar", "tk-dono", { email: "x@y.com", nome: "Xx", papel: "atendente", senha: "123" })).j.erro, /8 caracteres/);
  assert.equal(users.length, 5);
});
await t("e-mail que já tem login: entra na equipe, e-mail confirmado (senha dele não muda)", async () => {
  const r = await chama("criar", "tk-dono", { email: "antigo@x.com", nome: "Antigo", papel: "atendente", senha: "outra2026" });
  assert.equal(r.status, 200); assert.equal(r.j.ja_tinha_login, true);
  const u = users.find(x => x.email === "antigo@x.com")!;
  assert.equal(u.password, "velha123"); assert.equal(u.confirmado, true); assert.ok(!chamadas.some(c => c.startsWith("POST /auth/v1/admin")));
});
await t("conta criada pelo cadastro público e nunca confirmada: a senha vira a do painel (sem tomada de conta)", async () => {
  const r = await chama("criar", "tk-dono", { email: "intruso@x.com", nome: "Novo", papel: "atendente", senha: "painel2026" });
  assert.equal(r.status, 200); assert.equal(r.j.ja_tinha_login, false);
  const u = users.find(x => x.email === "intruso@x.com")!;
  assert.equal(u.password, "painel2026"); assert.equal(u.confirmado, true);
});
await t("já na equipe → 409 (ativo) / pede para reativar (desativado)", async () => {
  assert.equal((await chama("criar", "tk-dono", { email: "atd@x.com", nome: "Atd", papel: "atendente", senha: "brutt2026" })).status, 409);
  staff[2].active = false;
  assert.match((await chama("criar", "tk-dono", { email: "atd@x.com", nome: "Atd", papel: "atendente", senha: "brutt2026" })).j.erro, /Reativar/);
});
await t("trocar senha: dono troca de admin e atendente; nunca a do dono por outro", async () => {
  assert.equal((await chama("senha", "tk-dono", { user_id: ATD, senha: "nova2026x" })).status, 200); assert.equal(users[2].password, "nova2026x"); assert.equal(users[2].confirmado, true);
  assert.equal((await chama("senha", "tk-dono", { user_id: ADM, senha: "nova2026y" })).status, 200);
  assert.equal((await chama("senha", "tk-adm", { user_id: DONO, senha: "nova2026z" })).status, 403); assert.equal(users[0].password, "x");
});
await t("trocar senha: administrador só de atendente; cada um troca a própria", async () => {
  assert.equal((await chama("senha", "tk-adm", { user_id: ATD, senha: "nova2026x" })).status, 200);
  staff.push({ user_id: "00000000-0000-4000-8000-000000000008", name: "Adm2", role: "admin", active: true });
  users.push({ id: "00000000-0000-4000-8000-000000000008", email: "adm2@x.com", password: "x" });
  assert.equal((await chama("senha", "tk-adm", { user_id: "00000000-0000-4000-8000-000000000008", senha: "nova2026x" })).status, 403);
  assert.equal((await chama("senha", "tk-atd", { user_id: ATD, senha: "minha2026" })).status, 200); assert.equal(users[2].password, "minha2026");
  assert.equal((await chama("senha", "tk-atd", { user_id: ADM, senha: "minha2026" })).status, 403);
});
await t("trocar senha: pessoa fora da equipe → 404; senha fraca → 400", async () => {
  assert.equal((await chama("senha", "tk-dono", { user_id: "00000000-0000-4000-8000-000000000009", senha: "nova2026x" })).status, 404);
  assert.equal((await chama("senha", "tk-dono", { user_id: ATD, senha: "fraca" })).status, 400);
});
console.log(`\n${n} testes OK`);
