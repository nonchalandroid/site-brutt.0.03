-- Acompanhamento do pedido (tela "Acompanhe seu pedido" na loja): hora em que o pedido SAIU PARA ENTREGA
-- (só entrega feita pela loja). Quando o cliente chama Uber Flash/99, "Motoboy já retirou" = concluido_em.
alter table public.pedidos add column if not exists saiu_em timestamptz;
