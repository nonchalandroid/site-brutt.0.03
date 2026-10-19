-- 19/10/2026: link da página do pedido para o cliente (/pedido/?id=<uuid>), salvo em cada pedido.
-- Coluna gerada pelo banco: existe em todos os pedidos (antigos e novos) e não precisa ser gravada pelo checkout.
-- O id é um UUID aleatório: o link não dá para adivinhar, e a página mostra só o que checkout?acao=status devolve
-- (sem endereço, telefone ou dados de pagamento).
alter table public.pedidos
  add column if not exists link_cliente text
  generated always as ('https://tabacariabrutt.com.br/pedido/?id=' || id::text) stored;

comment on column public.pedidos.link_cliente is 'Página do pedido para o cliente (pedido/index.html). Gerada pelo banco a partir do id.';
