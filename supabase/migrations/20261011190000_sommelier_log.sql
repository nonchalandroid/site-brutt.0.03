-- Histórico do "Sommelier em massa": o que ERA e o que FICOU em cada produto, para a equipe poder desfazer.
-- Só ADICIONA. RLS: só a equipe lê/grava.
create table if not exists public.sommelier_log (
  id           bigserial primary key,
  product_id   uuid not null references public.products(id) on delete cascade,
  antes        jsonb not null,        -- valores anteriores só dos campos alterados
  depois       jsonb not null,        -- valores gravados
  confianca    text,
  avisos       jsonb,
  lote         text,                  -- identifica a rodada (para "desfazer o lote inteiro")
  criado_por   uuid default auth.uid(),
  criado_em    timestamptz not null default now(),
  desfeito_em  timestamptz
);
create index if not exists sommelier_log_lote_idx on public.sommelier_log (lote, id);
create index if not exists sommelier_log_prod_idx on public.sommelier_log (product_id, id desc);
alter table public.sommelier_log enable row level security;
create policy sommelier_log_staff_le on public.sommelier_log for select to authenticated using (public.is_staff());
create policy sommelier_log_staff_cria on public.sommelier_log for insert to authenticated with check (public.is_staff());
create policy sommelier_log_staff_edita on public.sommelier_log for update to authenticated using (public.is_staff()) with check (public.is_staff());
