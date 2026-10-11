-- Notificações no celular/PC da equipe (Web Push, padrão dos navegadores) quando um Pix é gerado ou pago.
-- Só ADICIONA. As duas tabelas ficam com RLS ligado e SEM política: só a função "checkout" (service role) lê.
-- A equipe se inscreve/sai pelas funções abaixo (security definer + is_staff()).

-- Par de chaves VAPID do servidor. É gerado DENTRO da função checkout na 1ª vez (a chave privada nunca sai do servidor).
create table if not exists public.push_config (
  id                int primary key default 1 check (id = 1),
  vapid_public      text not null,      -- base64url, 65 bytes (vai para o navegador)
  vapid_private_jwk jsonb not null,     -- só o servidor usa
  criado_em         timestamptz not null default now()
);
alter table public.push_config enable row level security;

-- Cada aparelho da equipe que ativou as notificações.
create table if not exists public.push_assinaturas (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_id    uuid,
  aparelho   text,
  criado_em  timestamptz not null default now(),
  ultimo_ok  timestamptz,
  falhas     int not null default 0,
  ativo      boolean not null default true   -- false = o aparelho saiu (ou o navegador recusou a inscrição)
);
alter table public.push_assinaturas enable row level security;

create or replace function public.push_registrar(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'sem permissão'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) not between 80 and 100 or length(p_auth) not between 16 and 30 then
    raise exception 'inscrição inválida';
  end if;
  insert into push_assinaturas (endpoint, p256dh, auth, user_id, aparelho)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), left(p_aparelho, 120))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    aparelho = excluded.aparelho, falhas = 0, ativo = true;
  return true;
end $$;
create or replace function public.push_remover(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'sem permissão'; end if;
  update push_assinaturas set ativo = false where endpoint = p_endpoint;
  return true;
end $$;
revoke all on function public.push_registrar(text, text, text, text) from public, anon;
revoke all on function public.push_remover(text) from public, anon;
grant execute on function public.push_registrar(text, text, text, text) to authenticated;
grant execute on function public.push_remover(text) to authenticated;
