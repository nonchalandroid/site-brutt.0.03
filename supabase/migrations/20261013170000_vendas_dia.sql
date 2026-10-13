-- Vendas de cada dia (relatório "Resumo" do Nex: Dia, Vendas, Ticket médio, Lucro bruto, Faturamento), 13/10/2026.
-- Alimenta o Financeiro: linha real do mês no terminal do ponto de equilíbrio e o histórico (1M/3M/6M/1A/Tudo,
-- meses passados). Carga inicial: desde a abertura (03/11/2025) até 12/10/2026. Só dono/admin (is_gestor).
create table if not exists public.vendas_dia (
  dia date primary key,
  vendas int not null default 0,
  faturamento numeric(12,2) not null default 0,
  lucro_bruto numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.vendas_dia enable row level security;
drop policy if exists "gestor le vendas_dia" on public.vendas_dia;
create policy "gestor le vendas_dia" on public.vendas_dia for select to authenticated using (public.is_gestor());
drop policy if exists "gestor grava vendas_dia" on public.vendas_dia;
create policy "gestor grava vendas_dia" on public.vendas_dia for insert to authenticated with check (public.is_gestor());
drop policy if exists "gestor altera vendas_dia" on public.vendas_dia;
create policy "gestor altera vendas_dia" on public.vendas_dia for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
revoke all on public.vendas_dia from anon;
