-- 18/10/2026: subseção Headshop › Odor e limpeza (desaromatizante para quem fuma em lugar fechado, limpadores).
-- O Limpador de Piteira de Vidro sai de Piteiras. Ordem na loja: SECOES[headshop].ord no index.html.
insert into categories (slug, name, parent_id)
select 'headshop-odor-e-limpeza', 'Odor e limpeza', id from categories where slug = 'headshop'
on conflict (slug) do update set name = excluded.name;

update products set category_id = (select id from categories where slug = 'headshop-odor-e-limpeza'), updated_at = now()
where name = 'Limpador de Piteira de Vidro';
