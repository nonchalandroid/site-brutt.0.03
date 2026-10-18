-- 18/10/2026
-- 1) O checkout da loja pede só o NOME: WhatsApp do cliente passa a ser opcional no pedido
--    (o contato chega quando ele manda o pedido no WhatsApp da loja). O gatilho clientes_do_pedido já ignora pedido sem WhatsApp.
alter table public.pedidos alter column cliente_whats drop not null;

-- 2) Cancelar pedido pelo painel: qualquer pedido que não foi concluído nem já cancelado.
--    aguardando_pagamento / expirado / recusado: qualquer pessoa ativa da equipe (mesmo com Pix ainda valendo:
--    se o cliente pagar depois, a função checkout devolve o pedido a "pago" e ele pisca no painel).
--    pago: só dono/admin, com motivo; o dinheiro é devolvido à mão no app do Mercado Pago.
create or replace function public.pedido_cancelar(p_id uuid, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ped pedidos; motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_staff() then raise exception 'sem permissão'; end if;
  select * into ped from pedidos where id = p_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if ped.status in ('concluido', 'cancelado') then raise exception 'este pedido já está %', ped.status; end if;
  if ped.status = 'pago' then
    if not public.is_gestor() then raise exception 'só dono ou administrador cancela pedido pago'; end if;
    if motivo is null then raise exception 'escreva o motivo para cancelar um pedido pago'; end if;
  end if;
  update pedidos set status = 'cancelado',
    mp_status_detail = left(case when ped.status = 'pago' then 'cancelado pela equipe (devolver o Pix no Mercado Pago)' else 'cancelado pela equipe' end
                            || coalesce(': ' || motivo, ''), 200),
    visto_em = coalesce(visto_em, now()), visto_por = coalesce(visto_por, auth.uid())
  where id = p_id;
  return 'cancelado';
end $function$;

revoke all on function public.pedido_cancelar(uuid, text) from public, anon;
grant execute on function public.pedido_cancelar(uuid, text) to authenticated;

-- nome antigo (painel em cache) continua funcionando com a regra nova
create or replace function public.pedido_cancelar_aberto(p_id uuid, p_motivo text default null)
returns text
language sql
security definer
set search_path to 'public'
as $function$ select public.pedido_cancelar(p_id, p_motivo) $function$;
