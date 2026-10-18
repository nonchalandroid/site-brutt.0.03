-- Mantém a estrutura usada pelo CMS já publicado e pela etapa de separação do pedido.
-- Alterações aditivas: não removem nem alteram dados existentes.
alter table if exists public.pedidos
  add column if not exists separacao_em timestamptz;

create table if not exists public.site_cms_config (
  id         text primary key,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.site_cms_config enable row level security;

drop policy if exists site_cms_gestor_le on public.site_cms_config;
create policy site_cms_gestor_le on public.site_cms_config
  for select to authenticated using (is_gestor());

drop policy if exists site_cms_gestor_cria on public.site_cms_config;
create policy site_cms_gestor_cria on public.site_cms_config
  for insert to authenticated with check (is_gestor());

drop policy if exists site_cms_gestor_edita on public.site_cms_config;
create policy site_cms_gestor_edita on public.site_cms_config
  for update to authenticated using (is_gestor()) with check (is_gestor());

-- (18/10/2026) A leitura pública do CMS é necessária: a loja monta seções, títulos e banner com ela.
-- O "revoke all ... from anon" que estava aqui apagaria o CMS do site; o estado certo está em 20261018150000_nex_filtro_e_cms.sql.
revoke insert, update, delete, truncate, trigger, references on public.site_cms_config from anon;
