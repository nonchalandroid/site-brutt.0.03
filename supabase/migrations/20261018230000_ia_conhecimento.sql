-- 18/10/2026: o que a equipe ensina à Brutt IA pelo painel (tela "Brutt IA", #/ia).
-- Cada linha é um cartão (título + texto); os ativos entram no prompt da função brutt-ia (lidos com a chave de
-- serviço, cache de 60 s). Só dono/admin leem e editam (o navegador da loja não lê esta tabela).
create table if not exists public.ia_conhecimento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default '' check (char_length(titulo) <= 80),
  texto text not null check (char_length(texto) between 1 and 800),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.ia_conhecimento enable row level security;
drop policy if exists ia_conhecimento_gestor on public.ia_conhecimento;
create policy ia_conhecimento_gestor on public.ia_conhecimento for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());
revoke all on public.ia_conhecimento from anon;
grant select, insert, update, delete on public.ia_conhecimento to authenticated;
drop trigger if exists ia_conhecimento_updated_at on public.ia_conhecimento;
create trigger ia_conhecimento_updated_at before update on public.ia_conhecimento
  for each row execute function public.set_updated_at();

-- cartão inicial: o que a IA já sabia por código e a loja pediu (18/10/2026)
insert into public.ia_conhecimento (titulo, texto, ordem)
select 'Onde fica a loja', 'A loja é do Conjunto Campinho, em Campo Grande (RJ): Rua Dezoito, 145.', 0
where not exists (select 1 from public.ia_conhecimento);
