// EQUIPE: criar login de quem trabalha na loja e trocar senha, direto pelo painel (tela "Equipe").
// Criar usuário e trocar senha exigem a chave de serviço do Supabase, então isso só pode rodar aqui no servidor.
// Listar, mudar papel, mudar nome e desativar são RPCs do banco (equipe_listar / equipe_alterar), sem passar por aqui.
//
// Rotas (POST /functions/v1/equipe?acao=...), sempre com o login de quem está no painel (Authorization: Bearer <token>):
//   criar  { email, nome, papel: "admin"|"atendente", senha } → cria o login (já confirmado) e põe na equipe
//   senha  { user_id, senha }                                  → define uma nova senha para alguém da equipe
//
// Quem pode o quê vem do banco (equipe_pode, chamada COM o token de quem pediu):
//   dono → cria/altera administradores e atendentes · administrador → só atendentes · atendente → nada.
// Cada um pode trocar a PRÓPRIA senha.

const env = (k: string) => String(((globalThis as any).Deno?.env?.get(k) as string | undefined) ?? "").trim().replace(/^["']|["']$/g, "");
const SB = () => env("SUPABASE_URL"), SK = () => env("SUPABASE_SERVICE_ROLE_KEY");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validaSenha(s: unknown) {
  const t = String(s ?? "");
  if (t.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (t.length > 72) return "Senha longa demais (máximo 72 caracteres).";
  if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return "Use letras e números na senha.";
  return "";
}

async function pede(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...resto } = init;
  const r = await fetch(`${SB()}${path}`, { ...resto, headers: { apikey: SK(), Authorization: "Bearer " + (token || SK()), "Content-Type": "application/json", ...((resto.headers as Record<string, string>) || {}) } });
  const txt = await r.text();
  let corpo: any = null; try { corpo = txt ? JSON.parse(txt) : null; } catch { corpo = txt; }
  return { ok: r.ok, status: r.status, corpo };
}

/** Quem está pedindo (pelo token do painel). */
async function quem(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token === SK()) return null;
  const u = await pede("/auth/v1/user", { token });
  if (!u.ok || !u.corpo?.id) return null;
  return { id: String(u.corpo.id), token };
}
/** Pergunta ao banco, com o token de quem pediu, se ele pode mexer nesse papel. */
async function pode(token: string, alvo: string | null, novo: string | null) {
  const r = await pede("/rest/v1/rpc/equipe_pode", { method: "POST", token, body: JSON.stringify({ p_alvo_papel: alvo, p_novo_papel: novo }) });
  return r.ok && r.corpo === true;
}
async function membro(userId: string) {
  const r = await pede(`/rest/v1/staff?user_id=eq.${userId}&select=user_id,name,role,active`);
  return r.ok && Array.isArray(r.corpo) ? r.corpo[0] || null : null;
}

export async function criar(req: Request, body: any) {
  const eu = await quem(req); if (!eu) return { erro: "Entre no painel de novo.", status: 401 };
  const email = String(body?.email ?? "").trim().toLowerCase(), nome = String(body?.nome ?? "").trim().replace(/\s+/g, " ");
  const papel = String(body?.papel ?? ""), senha = String(body?.senha ?? "");
  if (!EMAIL.test(email)) return { erro: "E-mail inválido.", status: 400 };
  if (nome.length < 2 || nome.length > 60) return { erro: "Escreva o nome (2 a 60 letras).", status: 400 };
  if (papel !== "admin" && papel !== "atendente") return { erro: "Escolha o papel: Administrador ou Atendente.", status: 400 };
  if (!(await pode(eu.token, null, papel))) return { erro: papel === "admin" ? "Só o dono pode criar administradores." : "Você não tem permissão para adicionar pessoas.", status: 403 };

  const achou = await pede("/rest/v1/rpc/equipe_usuario_por_email", { method: "POST", body: JSON.stringify({ p_email: email }) });
  let userId: string | null = achou.ok && typeof achou.corpo === "string" ? achou.corpo : null, jaTinha = !!userId;
  if (userId) {
    const m = await membro(userId);
    if (m) return { erro: m.active ? "Essa pessoa já está na equipe." : "Essa pessoa já está na lista, desativada. Use “Reativar” na lista.", status: 409 };
  } else {
    const s = validaSenha(senha); if (s) return { erro: s, status: 400 };
    const c = await pede("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }) });
    if (!c.ok || !c.corpo?.id) {
      console.error("equipe criar", c.status, JSON.stringify(c.corpo).slice(0, 300));
      return { erro: /password/i.test(JSON.stringify(c.corpo)) ? "O Supabase recusou a senha. Use uma senha mais forte." : "Não deu para criar o login agora. Tente de novo.", status: 502 };
    }
    userId = String(c.corpo.id);
  }
  // upsert: o gatilho antigo (allowed_staff_emails) pode já ter criado a linha
  const s = await pede("/rest/v1/staff?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, name: nome, role: papel, active: true, alterado_por: eu.id, updated_at: new Date().toISOString() }) });
  if (!s.ok) { console.error("equipe staff", s.status, JSON.stringify(s.corpo).slice(0, 300)); return { erro: "Login criado, mas não deu para pôr na equipe. Tente de novo.", status: 502 }; }
  return { ok: true, user_id: userId, ja_tinha_login: jaTinha };
}

export async function trocarSenha(req: Request, body: any) {
  const eu = await quem(req); if (!eu) return { erro: "Entre no painel de novo.", status: 401 };
  const alvo = String(body?.user_id ?? "");
  if (!UUID.test(alvo)) return { erro: "Pessoa inválida.", status: 400 };
  const s = validaSenha(body?.senha); if (s) return { erro: s, status: 400 };
  const m = await membro(alvo); if (!m) return { erro: "Pessoa não encontrada na equipe.", status: 404 };
  if (alvo !== eu.id && !(await pode(eu.token, m.role, m.role))) return { erro: "Você não tem permissão para trocar a senha dessa pessoa.", status: 403 };
  const r = await pede(`/auth/v1/admin/users/${alvo}`, { method: "PUT", body: JSON.stringify({ password: String(body.senha) }) });
  if (!r.ok) { console.error("equipe senha", r.status, JSON.stringify(r.corpo).slice(0, 300)); return { erro: "Não deu para trocar a senha agora.", status: 502 }; }
  return { ok: true };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
  const acao = new URL(req.url).searchParams.get("acao") || "";
  try {
    const body = await req.json().catch(() => null);
    const r: any = acao === "criar" ? await criar(req, body) : acao === "senha" ? await trocarSenha(req, body) : { erro: "ação desconhecida", status: 404 };
    return r?.erro ? json({ erro: r.erro }, r.status || 400) : json(r);
  } catch (e) {
    console.error("equipe", acao, e);
    return json({ erro: "Erro interno. Tente de novo em instantes." }, 500);
  }
}
if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve(handler);
