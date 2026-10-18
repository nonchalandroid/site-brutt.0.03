-- Miniatura de cada foto para os cards da loja (13/10/2026).
-- As fotos são de até 1000 px e o card mostra ~180 px: o celular baixava e decodificava 5× mais pixels que precisava,
-- e quase todas tinham cache de só 1 h (max-age=3600). A miniatura (WebP 400 px, cache de 1 ano) fica em
-- product-images/mini/<id>.webp e a loja usa mini_url nos cards; a foto grande só abre no produto e no zoom.
-- O painel gera a miniatura ao enviar a foto e o botão "Preparar fotos da loja" (Fotos em lote) gera as que faltam.
alter table public.product_images add column if not exists mini_url text;
