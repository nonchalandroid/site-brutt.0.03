-- Etapa intermediária para pedidos em que o cliente chama Uber Flash/99.
-- Não substitui saiu_em: saiu_em continua representando a coleta pelo motorista.
alter table public.pedidos add column if not exists corrida_link_em timestamptz;
