-- Ajustes da tela "Compras e ponto de pedido" (#/compras): prazo de entrega do fornecedor, dias de estoque de segurança,
-- peso de sexta a domingo nas vendas, caixa fechada (lote mínimo) e para quantos dias comprar. Mesma linha do financeiro
-- (RLS is_gestor: só dono/admin).
alter table public.financeiro add column if not exists compras jsonb not null default '{}'::jsonb;
