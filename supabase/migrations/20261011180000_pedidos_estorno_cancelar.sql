-- Estornado = pedido 'cancelado' cujo pagamento foi DEVOLVIDO inteiro pelo Mercado Pago (mp_status = 'refunded').
-- O admin mostra isso como categoria própria "Estornado"; o banco não ganha status novo.
--
-- 1) A equipe pode cancelar um pedido que ficou "Aguardando pagamento" (teste, desistência), mas SÓ quando não há
--    Pix válido em aberto: sem Pix gerado, ou com o Pix já vencido. Assim nenhum pagamento chega num pedido cancelado.
create or replace function public.pedido_cancelar_aberto(p_id uuid, p_motivo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare ped pedidos;
begin
  if not public.is_staff() then raise exception 'sem permissão'; end if;
  select * into ped from pedidos where id = p_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if ped.status <> 'aguardando_pagamento' then raise exception 'só dá para cancelar pedido que está aguardando pagamento'; end if;
  if ped.mp_payment_id is not null and (ped.pix_expira_em is null or ped.pix_expira_em > now()) then
    raise exception 'este pedido tem um Pix em aberto; espere o Pix vencer (30 min) para cancelar';
  end if;
  update pedidos set status = 'cancelado',
    mp_status_detail = left('cancelado pela equipe' || coalesce(': ' || nullif(btrim(p_motivo), ''), ''), 200),
    visto_em = coalesce(visto_em, now()), visto_por = coalesce(visto_por, auth.uid())
  where id = p_id;
  return 'cancelado';
end $$;
revoke all on function public.pedido_cancelar_aberto(uuid, text) from public, anon;
grant execute on function public.pedido_cancelar_aberto(uuid, text) to authenticated;

-- 2) Cadastro de clientes: pedido pago que depois foi estornado/cancelado sai de "pedidos" e "total gasto".
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
    elsif tg_op = 'UPDATE' and old.status in ('pago','concluido') and new.status in ('cancelado','recusado','expirado') then
      update clientes set
        pedidos_qtd = greatest(pedidos_qtd - 1, 0),
        total_gasto = greatest(total_gasto - coalesce(new.total,0), 0)
      where id = cid;
    end if;
  exception when others then
    raise warning 'clientes_do_pedido %: %', new.numero, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.clientes_do_pedido() from public, anon, authenticated;
