-- 18/10/2026: subseções novas em Tabacos (pedido da loja). Filtros saem de Headshop › Piteiras (não misturar com piteira)
-- e o Rapé Moeda sai de Incensos e mais. A loja ordena as subseções por SECOES[tabacos].ord no index.html.
insert into categories (slug, name, parent_id)
select v.slug, v.name, t.id from (values ('tabacos-filtros','Filtros'), ('tabacos-rape','Rapé')) v(slug,name)
cross join (select id from categories where slug = 'tabacos') t
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id;

update products set category_id = (select id from categories where slug = 'tabacos-filtros'), updated_at = now()
where category_id = (select id from categories where slug = 'headshop-piteiras') and name ilike 'filtro %';

update products set category_id = (select id from categories where slug = 'tabacos-rape'), updated_at = now()
where name ilike 'rap_ moeda%';
