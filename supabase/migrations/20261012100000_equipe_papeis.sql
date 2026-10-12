-- Equipe com papéis. Quem pode o quê:
--   owner      (dono)          tudo, inclusive criar/alterar administradores
--   admin      (administrador) tudo, e gerencia atendentes
--   atendente                  vê e movimenta PEDIDOS; não mexe em produtos, preços, estoque, fotos, horários nem clientes
-- O "colaborador" antigo tinha acesso total: vira "admin" (nada muda para quem já usa o painel).
-- Só adiciona e altera. Ninguém sai do banco: desativar = active=false.

alter table public.staff drop constraint if exists staff_role_check;   -- antiga: só owner/colaborador
update public.staff set role = 'admin' where role is null or role not in ('owner','admin','atendente');
alter table public.staff alter column role set default 'atendente';
alter table public.staff alter column role set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_role_valida' and conrelid = 'public.staff'::regclass) then
    alter table public.staff add constraint staff_role_valida check (role in ('owner','admin','atendente'));
  end if;
end $$;
alter table public.staff add column if not exists updated_at timestamptz not null default now();
alter table public.staff add column if not exists alterado_por uuid;

-- Gestor = dono ou administrador ativo.
create or replace function public.is_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active = true and role in ('owner','admin'));
$$;
revoke all on function public.is_gestor() from public, anon;
grant execute on function public.is_gestor() to authenticated, service_role;

-- ── permissões: tudo que ALTERA catálogo, estoque, fotos, horários e clientes passa a exigir gestor ──
alter policy "Colaboradores podem gerenciar categorias" on public.categories using (public.is_gestor()) with check (public.is_gestor());
alter policy "Colaboradores podem cadastrar produto" on public.products with check (public.is_gestor());
alter policy "Colaboradores podem editar produto" on public.products using (public.is_gestor()) with check (public.is_gestor());
alter policy "Colaboradores podem gerenciar fotos" on public.product_images using (public.is_gestor()) with check (public.is_gestor());
alter policy "Horário: colaboradores editam" on public.loja_horarios using (public.is_gestor()) with check (public.is_gestor());
alter policy "product-images: colaboradores podem enviar" on storage.objects with check (bucket_id = 'product-images' and public.is_gestor());
alter policy "product-images: colaboradores podem atualizar" on storage.objects using (bucket_id = 'product-images' and public.is_gestor()) with check (bucket_id = 'product-images' and public.is_gestor());
alter policy "product-images: colaboradores podem apagar" on storage.objects using (bucket_id = 'product-images' and public.is_gestor());
-- clientes: atendente nem lê (dados pessoais); o nome/WhatsApp do pedido continua no próprio pedido
alter policy clientes_staff_le on public.clientes using (public.is_gestor());
alter policy clientes_staff_cria on public.clientes with check (public.is_gestor());
alter policy clientes_staff_edita on public.clientes using (public.is_gestor()) with check (public.is_gestor());
alter policy clientes_staff_apaga on public.clientes using (public.is_gestor());
alter policy sommelier_log_staff_cria on public.sommelier_log with check (public.is_gestor());
alter policy sommelier_log_staff_edita on public.sommelier_log using (public.is_gestor()) with check (public.is_gestor());
alter policy sommelier_log_staff_le on public.sommelier_log using (public.is_gestor());

-- estoque: mesma função, agora só gestor
create or replace function public.registrar_movimento_estoque(p_product_id uuid, p_type text, p_quantity integer, p_note text default null)
returns stock_movements language plpgsql security definer set search_path = public as $function$
declare
  v_before integer;
  v_after integer;
  v_row stock_movements;
begin
  if not is_gestor() then
    raise exception 'Apenas administradores podem registrar movimentações de estoque';
  end if;
  if p_type not in ('entrada','saida','ajuste') then
    raise exception 'Tipo de movimentação inválido: %', p_type;
  end if;
  if p_quantity < 0 then
    raise exception 'A quantidade deve ser positiva';
  end if;

  select stock into v_before from products where id = p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado: %', p_product_id;
  end if;

  if p_type = 'entrada' then
    v_after := v_before + p_quantity;
  elsif p_type = 'saida' then
    v_after := v_before - p_quantity;
    if v_after < 0 then
      raise exception 'Estoque insuficiente: atual %, tentando baixar %', v_before, p_quantity;
    end if;
  else
    v_after := p_quantity; -- ajuste = novo saldo total
  end if;

  update products set stock = v_after where id = p_product_id;

  insert into stock_movements (product_id, type, quantity, stock_before, stock_after, note, created_by)
  values (p_product_id, p_type, p_quantity, v_before, v_after, p_note, auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$;

-- importar clientes do Nex: só gestor (mesma função, troca a checagem)
do $$ begin
  execute replace(pg_get_functiondef('public.clientes_importar(jsonb,text)'::regprocedure), 'not public.is_staff()', 'not public.is_gestor()');
end $$;

-- ── hierarquia: quem pode mexer em quem ──
-- dono mexe em todos (menos no próprio papel/ativo); administrador só em atendentes; ninguém em si mesmo.
create or replace function public.equipe_pode(p_alvo_papel text, p_novo_papel text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select case (select role from staff where user_id = auth.uid() and active = true)
    when 'owner' then coalesce(p_alvo_papel,'') <> 'owner' and coalesce(p_novo_papel,'atendente') in ('admin','atendente')
    when 'admin' then coalesce(p_alvo_papel,'atendente') = 'atendente' and coalesce(p_novo_papel,'atendente') = 'atendente'
    else false end;
$$;
revoke all on function public.equipe_pode(text, text) from public, anon;
grant execute on function public.equipe_pode(text, text) to authenticated, service_role;

-- Lista da equipe com e-mail e último acesso (o e-mail fica em auth.users, que o painel não lê direto).
create or replace function public.equipe_listar()
returns table (user_id uuid, nome text, papel text, ativo boolean, email text, ultimo_acesso timestamptz, criado_em timestamptz, eu boolean, posso_editar boolean)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, s.active, u.email::text, u.last_sign_in_at, s.created_at,
         s.user_id = auth.uid(), s.user_id <> auth.uid() and public.equipe_pode(s.role)
  from staff s left join auth.users u on u.id = s.user_id
  where public.is_gestor()
  order by s.active desc, case s.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(s.name);
$$;
revoke all on function public.equipe_listar() from public, anon;
grant execute on function public.equipe_listar() to authenticated;

-- Muda nome, papel ou ativo de alguém (respeitando a hierarquia). Nome da própria conta pode mudar.
create or replace function public.equipe_alterar(p_user uuid, p_nome text default null, p_papel text default null, p_ativo boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare alvo staff;
begin
  if not public.is_gestor() then raise exception 'Só administradores mexem na equipe.'; end if;
  select * into alvo from staff where user_id = p_user;
  if not found then raise exception 'Pessoa não encontrada na equipe.'; end if;
  if p_papel is not null and p_papel not in ('admin','atendente') then raise exception 'Papel inválido.'; end if;
  if p_user = auth.uid() then
    if p_papel is not null and p_papel <> alvo.role or p_ativo is not null and p_ativo <> alvo.active then
      raise exception 'Você não pode mudar o próprio papel nem se desativar.';
    end if;
  elsif not public.equipe_pode(alvo.role, coalesce(p_papel, alvo.role)) then
    raise exception 'Você não tem permissão para alterar essa pessoa.';
  end if;
  update staff set
    name = coalesce(nullif(btrim(p_nome),''), name),
    role = coalesce(p_papel, role),
    active = coalesce(p_ativo, active),
    updated_at = now(), alterado_por = auth.uid()
  where user_id = p_user;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.equipe_alterar(uuid, text, text, boolean) from public, anon;
grant execute on function public.equipe_alterar(uuid, text, text, boolean) to authenticated;

-- Para a função "equipe" (servidor): acha o usuário pelo e-mail. Só o service_role executa.
create or replace function public.equipe_usuario_por_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.equipe_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.equipe_usuario_por_email(text) to service_role;
