-- 19/10/2026: no checkout, WhatsApp e e-mail voltam como OPCIONAIS, mais a caixa (desmarcada) "Quero receber promoções e
-- cupons" (consentimento explícito, LGPD). O pedido guarda a escolha; o cadastro do cliente só passa a "aceita" quando
-- ele marca (nunca desmarca sozinho): usa a coluna que já existia, clientes.aceita_promocoes, e guarda a data do
-- consentimento em clientes.aceita_promos_em.
alter table public.pedidos add column if not exists aceita_promos boolean not null default false;
alter table public.clientes add column if not exists aceita_promos_em timestamptz;

create or replace function public.clientes_do_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare w text; ender text; cid uuid;
begin
  begin
    w := public.whats_normaliza(new.cliente_whats);
    if w is null then return new; end if;
    ender := case when new.entrega->>'tipo' = 'entrega' then nullif(btrim(new.entrega->>'endereco'),'') end;
    insert into clientes (nome, whatsapp, email, endereco_txt, origem, aceita_promocoes, aceita_promos_em)
    values (new.cliente_nome, w, lower(nullif(btrim(new.cliente_email),'')), ender, 'site', coalesce(new.aceita_promos,false), case when new.aceita_promos then now() end)
    on conflict (whatsapp) do update set
      email        = coalesce(clientes.email, excluded.email),
      endereco_txt = coalesce(clientes.endereco_txt, excluded.endereco_txt),
      aceita_promocoes = clientes.aceita_promocoes or excluded.aceita_promocoes,
      aceita_promos_em = case when not clientes.aceita_promocoes and excluded.aceita_promocoes then now() else clientes.aceita_promos_em end
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
end $function$;
