-- CMS público: a vitrine só precisa ler a configuração pública da homepage.
-- Escrita fica restrita a gestores autenticados e permissões SQL seguem o princípio do menor privilégio.
alter table public.site_cms_config enable row level security;

drop policy if exists "CMS público pode ler configuração publicada" on public.site_cms_config;
create policy "CMS público pode ler configuração publicada"
  on public.site_cms_config for select to anon
  using (id = 'homepage');

drop policy if exists site_cms_gestor_le on public.site_cms_config;
create policy site_cms_gestor_le
  on public.site_cms_config for select to authenticated
  using (is_gestor());

drop policy if exists site_cms_gestor_cria on public.site_cms_config;
create policy site_cms_gestor_cria
  on public.site_cms_config for insert to authenticated
  with check (is_gestor());

drop policy if exists site_cms_gestor_edita on public.site_cms_config;
create policy site_cms_gestor_edita
  on public.site_cms_config for update to authenticated
  using (is_gestor()) with check (is_gestor());

revoke all on table public.site_cms_config from anon, authenticated, public;
grant select on table public.site_cms_config to anon;
grant select, insert, update on table public.site_cms_config to authenticated;
