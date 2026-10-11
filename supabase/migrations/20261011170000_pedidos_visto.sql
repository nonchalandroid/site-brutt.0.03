-- Alerta de pedido novo no admin: o pedido PAGO pisca em vermelho até alguém da equipe abrir/clicar nele.
-- Só ADICIONA colunas e uma função. O site (anon) não enxerga nem chama nada disso.
alter table public.pedidos add column if not exists visto_em  timestamptz;
alter table public.pedidos add column if not exists visto_por uuid;

-- A equipe só lê pedidos (RLS); marcar como visto passa por esta função, que grava SÓ as duas colunas.
create or replace function public.pedido_marcar_visto(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if not public.is_staff() then raise exception 'sem permissão'; end if;
  update pedidos set visto_em = coalesce(visto_em, now()), visto_por = coalesce(visto_por, auth.uid())
  where id = p_id returning visto_em into t;
  return t;
end $$;
revoke all on function public.pedido_marcar_visto(uuid) from public, anon;
grant execute on function public.pedido_marcar_visto(uuid) to authenticated;

