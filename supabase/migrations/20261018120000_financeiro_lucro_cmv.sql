-- Lucro bruto e custo das mercadorias digitados à mão no Financeiro (opcionais).
-- Nulo = automático (faturamento × margem do catálogo). Guarda-se um dos dois por vez:
-- digitar o lucro bruto zera o custo e vice-versa; apagar o campo volta ao automático.
alter table public.financeiro
  add column if not exists lucro_bruto numeric(12,2),
  add column if not exists cmv          numeric(12,2);
