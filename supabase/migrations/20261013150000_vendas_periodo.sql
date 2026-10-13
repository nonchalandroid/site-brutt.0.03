-- Período do relatório de vendas do Nex importado em "Mais vendidos" (13/10/2026).
-- products.sales_count = unidades vendidas NESTE período; com os dias dá para calcular venda/dia, dias de estoque
-- (cobertura), sugestão de compra e curva ABC (tela Giro e reposição do painel). Uma linha só (id = 1). Só dono/admin.
create table if not exists public.vendas_periodo (
  id int primary key default 1 check (id = 1),
  inicio date not null,
  fim date not null,
  dias int generated always as (greatest(1, fim - inicio + 1)) stored,
  arquivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.vendas_periodo enable row level security;
drop policy if exists "gestor le periodo" on public.vendas_periodo;
create policy "gestor le periodo" on public.vendas_periodo for select to authenticated using (public.is_gestor());
drop policy if exists "gestor grava periodo" on public.vendas_periodo;
create policy "gestor grava periodo" on public.vendas_periodo for insert to authenticated with check (public.is_gestor());
drop policy if exists "gestor altera periodo" on public.vendas_periodo;
create policy "gestor altera periodo" on public.vendas_periodo for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
revoke all on public.vendas_periodo from anon;
