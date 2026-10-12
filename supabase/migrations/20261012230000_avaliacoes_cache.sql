-- Cache das avaliações do Google (função avaliacoes): uma linha só (id = 1).
-- A função busca no Google no máximo a cada 12 h e guarda aqui; a loja lê pela função, nunca direto.
-- RLS ligada e sem política: só a chave de serviço (a função) lê e grava.
create table if not exists public.avaliacoes_cache (
  id             integer primary key default 1 check (id = 1),
  place_id       text,                                  -- id do lugar no Google (achado pela busca na 1ª vez)
  dados          jsonb,                                 -- {nota, total, link, avaliacoes:[…]}
  atualizado_em  timestamptz not null default now()
);
alter table public.avaliacoes_cache enable row level security;
revoke all on public.avaliacoes_cache from anon, authenticated;
