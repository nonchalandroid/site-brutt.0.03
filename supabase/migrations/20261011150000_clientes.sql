-- Cadastro de clientes: lista do Nex PDV (planilha/exportação) + quem compra pelo site.
-- Só ADICIONA. pedidos continua igual (ganha só a coluna opcional cliente_email).
-- RLS: só a equipe (is_staff) lê e edita. O site (anon) não enxerga nada daqui.

create table if not exists public.clientes (
  id                 uuid primary key default gen_random_uuid(),
  nex_uid            text unique,                 -- uid do cliente no Nex
  nex_codigo         text unique,                 -- "151-WC", "434"
  nome               text not null,
  whatsapp           text unique,                 -- só dígitos com DDI: 5521999998888 (celular)
  telefone_original  text,                        -- como veio da origem, quando não deu para normalizar
  email              text,
  cep                text,
  rua                text,
  numero             text,
  complemento        text,
  bairro             text,
  cidade             text,
  uf                 text,
  endereco_txt       text,                        -- endereço em uma linha (site/planilha sem partes)
  cpf_cnpj           text,
  genero             text,
  nascimento         date,
  aceita_promocoes   boolean not null default false,
  origem             text not null default 'site' check (origem in ('nex','planilha','site','admin')),
  obs                text,
  pedidos_qtd        integer not null default 0,  -- pedidos PAGOS no site
  total_gasto        numeric(10,2) not null default 0,
  primeiro_pedido_em timestamptz,
  ultimo_pedido_em   timestamptz,
  ultima_visita_nex  timestamptz,
  completo           boolean generated always as (
                       coalesce(btrim(nome),'') <> ''
                       and whatsapp is not null
                       and (coalesce(btrim(rua),'') <> '' or coalesce(btrim(endereco_txt),'') <> '')
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists clientes_nome_idx on public.clientes (lower(nome));
create index if not exists clientes_ultimo_idx on public.clientes (ultimo_pedido_em desc nulls last);

drop trigger if exists clientes_updated_at on public.clientes;
create trigger clientes_updated_at before update on public.clientes
  for each row execute function public.set_updated_at();

alter table public.clientes enable row level security;
drop policy if exists clientes_staff_le on public.clientes;
create policy clientes_staff_le on public.clientes for select to authenticated using (public.is_staff());
drop policy if exists clientes_staff_cria on public.clientes;
create policy clientes_staff_cria on public.clientes for insert to authenticated with check (public.is_staff());
drop policy if exists clientes_staff_edita on public.clientes;
create policy clientes_staff_edita on public.clientes for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists clientes_staff_apaga on public.clientes;
create policy clientes_staff_apaga on public.clientes for delete to authenticated using (public.is_staff());

-- E-mail digitado no pagamento (opcional; a função checkout grava quando existir).
alter table public.pedidos add column if not exists cliente_email text;

-- Telefone BR → celular de WhatsApp "55DDD9XXXXXXXX" (ou null se não for celular).
create or replace function public.whats_normaliza(t text, ddd_padrao text default '21')
returns text language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(t,''), '\D', '', 'g');
begin
  if length(d) in (12,13) and left(d,2) = '55' then d := substr(d,3); end if;
  if length(d) = 9 and left(d,1) = '9' then d := ddd_padrao || d; end if;            -- sem DDD
  if length(d) = 8 and left(d,1) between '6' and '9' then d := ddd_padrao || '9' || d; end if;
  if length(d) = 10 and substr(d,3,1) between '6' and '9' then d := left(d,2) || '9' || substr(d,3); end if; -- celular antigo sem o 9
  if length(d) = 11 and substr(d,3,1) = '9' and left(d,1) <> '0' then return '55' || d; end if;
  return null;
end $$;

-- Importa/mescla uma lista no formato da exportação do Nex:
-- [{uid, codigo, nome, email, whatsapp, endereco:{rua,numero,complemento,bairro,cidade,estado,cep}, endereco_txt?,
--   genero?, nascimento?, cpf_cnpj, ultima_visita}]
-- Casa por uid → código → WhatsApp. Cliente que já existe só tem os campos VAZIOS preenchidos
-- (nunca sobrescreve o que a equipe editou no admin).
create or replace function public.clientes_importar(lista jsonb, origem_padrao text default 'nex')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; e jsonb; alvo uuid; w text; novos int := 0; mesclados int := 0; ignorados int := 0;
  v_nome text; v_cod text; v_uid text; v_email text;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'sem permissão'; end if;
  if origem_padrao not in ('nex','planilha','site','admin') then raise exception 'origem inválida'; end if;
  for r in select * from jsonb_array_elements(coalesce(lista,'[]'::jsonb)) loop
    v_nome := nullif(btrim(r->>'nome'),'');
    if v_nome is null then ignorados := ignorados + 1; continue; end if;
    e := coalesce(r->'endereco','{}'::jsonb);
    v_uid := nullif(btrim(r->>'uid'),'');
    v_cod := nullif(btrim(r->>'codigo'),'');
    v_email := lower(nullif(btrim(r->>'email'),''));
    if v_email is not null and v_email !~ '^\S+@\S+\.\S+$' then v_email := null; end if;
    w := public.whats_normaliza(r->>'whatsapp');
    alvo := null;
    if v_uid is not null then select id into alvo from clientes where nex_uid = v_uid; end if;
    if alvo is null and v_cod is not null then select id into alvo from clientes where nex_codigo = v_cod; end if;
    if alvo is null and w is not null then select id into alvo from clientes where whatsapp = w; end if;
    if alvo is null then
      insert into clientes (nex_uid, nex_codigo, nome, whatsapp, telefone_original, email, cep, rua, numero, complemento,
                            bairro, cidade, uf, endereco_txt, cpf_cnpj, genero, nascimento, origem, ultima_visita_nex)
      values (v_uid, v_cod, v_nome, w,
              case when w is null then nullif(btrim(r->>'whatsapp'),'') end, v_email,
              nullif(regexp_replace(coalesce(e->>'cep',''),'\D','','g'),''),
              nullif(btrim(e->>'rua'),''), nullif(btrim(e->>'numero'),''), nullif(btrim(e->>'complemento'),''),
              nullif(btrim(e->>'bairro'),''), nullif(btrim(e->>'cidade'),''), nullif(upper(btrim(e->>'estado')),''),
              nullif(btrim(r->>'endereco_txt'),''), nullif(btrim(r->>'cpf_cnpj'),''), nullif(btrim(r->>'genero'),''),
              nullif(r->>'nascimento','')::date, origem_padrao, nullif(r->>'ultima_visita','')::timestamptz);
      novos := novos + 1;
    else
      update clientes c set
        nex_uid     = coalesce(c.nex_uid, v_uid),
        nex_codigo  = coalesce(c.nex_codigo, v_cod),
        whatsapp    = coalesce(c.whatsapp, case when not exists (select 1 from clientes x where x.whatsapp = w) then w end),
        email       = coalesce(c.email, v_email),
        cep         = coalesce(c.cep, nullif(regexp_replace(coalesce(e->>'cep',''),'\D','','g'),'')),
        rua         = coalesce(c.rua, nullif(btrim(e->>'rua'),'')),
        numero      = coalesce(c.numero, nullif(btrim(e->>'numero'),'')),
        complemento = coalesce(c.complemento, nullif(btrim(e->>'complemento'),'')),
        bairro      = coalesce(c.bairro, nullif(btrim(e->>'bairro'),'')),
        cidade      = coalesce(c.cidade, nullif(btrim(e->>'cidade'),'')),
        uf          = coalesce(c.uf, nullif(upper(btrim(e->>'estado')),'')),
        endereco_txt= coalesce(c.endereco_txt, nullif(btrim(r->>'endereco_txt'),'')),
        cpf_cnpj    = coalesce(c.cpf_cnpj, nullif(btrim(r->>'cpf_cnpj'),'')),
        genero      = coalesce(c.genero, nullif(btrim(r->>'genero'),'')),
        nascimento  = coalesce(c.nascimento, nullif(r->>'nascimento','')::date),
        ultima_visita_nex = greatest(c.ultima_visita_nex, nullif(r->>'ultima_visita','')::timestamptz)
      where c.id = alvo;
      mesclados := mesclados + 1;
    end if;
  end loop;
  return jsonb_build_object('novos', novos, 'mesclados', mesclados, 'ignorados', ignorados);
end $$;
revoke all on function public.clientes_importar(jsonb, text) from public, anon;
grant execute on function public.clientes_importar(jsonb, text) to authenticated;

-- Cliente do site: cada pedido cria/completa o cadastro; pedido PAGO soma nas estatísticas.
-- Nunca derruba o pedido: qualquer erro aqui só vira aviso no log.
create or replace function public.clientes_do_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare w text; ender text; cid uuid;
begin
  begin
    w := public.whats_normaliza(new.cliente_whats);
    if w is null then return new; end if;
    ender := case when new.entrega->>'tipo' = 'entrega' then nullif(btrim(new.entrega->>'endereco'),'') end;
    insert into clientes (nome, whatsapp, email, endereco_txt, origem)
    values (new.cliente_nome, w, lower(nullif(btrim(new.cliente_email),'')), ender, 'site')
    on conflict (whatsapp) do update set
      email        = coalesce(clientes.email, excluded.email),
      endereco_txt = coalesce(clientes.endereco_txt, excluded.endereco_txt)
    returning id into cid;
    if new.status = 'pago' and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
      update clientes set
        pedidos_qtd        = pedidos_qtd + 1,
        total_gasto        = total_gasto + coalesce(new.total,0),
        primeiro_pedido_em = coalesce(primeiro_pedido_em, coalesce(new.pago_em, now())),
        ultimo_pedido_em   = greatest(coalesce(ultimo_pedido_em, '-infinity'), coalesce(new.pago_em, now()))
      where id = cid;
    end if;
  exception when others then
    raise warning 'clientes_do_pedido %: %', new.numero, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.clientes_do_pedido() from public, anon, authenticated;

drop trigger if exists pedidos_cliente on public.pedidos;
create trigger pedidos_cliente after insert or update of status, cliente_email on public.pedidos
  for each row execute function public.clientes_do_pedido();
