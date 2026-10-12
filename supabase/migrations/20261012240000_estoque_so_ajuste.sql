-- Estoque: o Nex é a fonte da verdade. O painel não dá mais "entrada" nem "saída": só AJUSTE (iguala ao Nex).
-- A sincronização (nex_aplicar) já grava 'ajuste' direto em stock_movements; esta função é a do painel.
create or replace function public.registrar_movimento_estoque(p_product_id uuid, p_type text, p_quantity integer, p_note text default null)
returns stock_movements language plpgsql security definer set search_path = public as $function$
declare
  v_before integer;
  v_row stock_movements;
begin
  if not is_gestor() then
    raise exception 'Apenas administradores podem registrar movimentações de estoque';
  end if;
  if p_type is distinct from 'ajuste' then
    raise exception 'Só é permitido AJUSTE: o estoque segue o Nex (recebido: %)', p_type;
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'A quantidade deve ser 0 ou mais';
  end if;

  select stock into v_before from products where id = p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado: %', p_product_id;
  end if;

  update products set stock = p_quantity where id = p_product_id;   -- ajuste = novo saldo total

  insert into stock_movements (product_id, type, quantity, stock_before, stock_after, note, created_by)
  values (p_product_id, 'ajuste', p_quantity, v_before, p_quantity, p_note, auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$;
