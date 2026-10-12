-- Custos da loja para a projeção de lucro da Visão geral (uma linha só, id = 1).
-- Só dono/administrador (is_gestor) leem e editam; atendente não vê.
create table if not exists public.financeiro (
  id               integer primary key default 1 check (id = 1),
  custos           jsonb not null default '[]'::jsonb,   -- custos fixos do mês: [{"nome":"Aluguel","valor":800}, …]
  dia_a_dia        numeric(12,2) not null default 0,     -- estimativa do mês: comida, combustível das entregas…
  faturamento      numeric(12,2),                        -- faturamento bruto médio do mês (manual ou da planilha do Nex)
  faturamento_obs  text,                                 -- de onde veio (ex.: "média jul–set, planilha Nex")
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid
);
alter table public.financeiro enable row level security;
create policy financeiro_gestor_le on public.financeiro for select to authenticated using (is_gestor());
create policy financeiro_gestor_cria on public.financeiro for insert to authenticated with check (is_gestor());
create policy financeiro_gestor_edita on public.financeiro for update to authenticated using (is_gestor()) with check (is_gestor());
revoke all on public.financeiro from anon;
insert into public.financeiro (id, custos) values (1, '[{"nome":"Funcionário","valor":1800},{"nome":"Aluguel","valor":800},{"nome":"Segurança","valor":100},{"nome":"Internet","valor":120}]')
  on conflict (id) do nothing;
