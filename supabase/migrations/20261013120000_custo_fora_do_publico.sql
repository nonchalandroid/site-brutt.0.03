-- Preço de custo fora do alcance do público (13/10/2026).
-- Antes, qualquer pessoa com a chave anon (que fica no HTML da loja) lia products.cost_price pela API.
-- Agora o anon só lê as colunas que a loja usa; custo fica só para a equipe (authenticated + is_staff, pela RLS)
-- e para as funções (chave de serviço). A loja pede as colunas por nome (index.html, window.__buscaCatalogo):
-- "select=*" com o anon passa a dar erro de permissão, então não volte a usar "*" na loja.
-- O anon também perde escrita na tabela (nunca escreveu; a RLS já barrava, isto é só higiene).
revoke select, insert, update, delete, truncate, trigger, references on public.products from anon;
grant select (id, site_product_id, sku, ean, name, slug, brand, icon, description, specs, flavor_profile, whisky_details,
  category_id, price, promo_price, stock, is_active, is_featured, sales_count, sort_priority, created_at, updated_at)
  on public.products to anon;
