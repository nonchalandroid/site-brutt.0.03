-- Auditoria de segurança (12/10/2026): tabelas de teste/backup não podem ficar abertas pela API pública.
-- zz_teste_cli estava SEM RLS (qualquer visitante com a chave anon podia ler/gravar). Já aplicado no projeto.
alter table if exists public.zz_teste_cli enable row level security;
alter table if exists public.zz_bkp_desc_18 enable row level security;
revoke all on public.zz_teste_cli from anon, authenticated;
revoke all on public.zz_bkp_desc_18 from anon, authenticated;
