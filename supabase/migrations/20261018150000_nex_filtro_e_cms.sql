-- Auditoria de 18/10/2026.
-- 1) "Salvar filtro" (Integrações Nex) gravava direto em sync_config pelo navegador, mas a tabela tem RLS sem política
--    (guarda o sync_secret e só a função lê): o botão sempre dava erro e o campo nunca carregava. Agora o painel usa duas
--    RPCs que mexem SÓ nas chaves nex_online_field / nex_online_value, e só para dono/admin.
create or replace function public.nex_filtro_ler()
returns table(campo text, valor text) language sql stable security definer set search_path = public as $$
  select (select value from sync_config where key = 'nex_online_field'), (select value from sync_config where key = 'nex_online_value')
  where public.is_gestor();
$$;
create or replace function public.nex_filtro_salvar(p_campo text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gestor() then raise exception 'sem permissão'; end if;
  p_campo := coalesce(trim(p_campo), ''); p_valor := coalesce(trim(p_valor), '');
  if length(p_campo) > 60 or p_campo !~ '^[A-Za-z0-9_]*$' then raise exception 'nome de campo inválido'; end if;
  if length(p_valor) > 60 then raise exception 'valor muito longo'; end if;
  insert into sync_config(key, value) values ('nex_online_field', p_campo), ('nex_online_value', case when p_campo = '' then '' else p_valor end)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.nex_filtro_ler() from public, anon;
revoke all on function public.nex_filtro_salvar(text, text) from public, anon;
grant execute on function public.nex_filtro_ler() to authenticated;
grant execute on function public.nex_filtro_salvar(text, text) to authenticated;

-- 2) CMS da página inicial: o banco real (migração site_cms_config de 16/10) deixa o site público LER a configuração
--    (a loja monta seções, títulos e banner com ela) e só dono/admin gravar. O arquivo 20261016170000 do repositório
--    revogava a leitura do anon: se fosse aplicado, o CMS sumia do site. Aqui fica o estado certo, e o anon perde os
--    privilégios de escrita que sobravam na tabela (a RLS já barrava; é só higiene).
alter table public.site_cms_config enable row level security;
drop policy if exists "CMS público pode ler configuração publicada" on public.site_cms_config;
create policy "CMS público pode ler configuração publicada" on public.site_cms_config for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, trigger, references on public.site_cms_config from anon;
grant select on public.site_cms_config to anon;
