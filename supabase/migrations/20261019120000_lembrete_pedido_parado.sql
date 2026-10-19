-- 19/10/2026: lembrete de pedido parado. A cada 5 min o banco chama checkout?acao=lembretes (com o x-sync-secret,
-- o mesmo do sync-nex); a função avisa a equipe (Web Push) de pedido pago e parado há 20 e 45 min sem "Saiu para
-- entrega"/"Motoboy retirou", e de pedido que saiu há mais de 1 h sem ser concluído. 1 aviso de cada por pedido.
create or replace function public.pedidos_lembretes_disparar()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare seg text; id bigint;
begin
  select value into seg from sync_config where key = 'sync_secret';
  select net.http_post(url := 'https://vedlxtljilsanykmddtj.supabase.co/functions/v1/checkout?acao=lembretes',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-secret', seg),
    body := '{}'::jsonb, timeout_milliseconds := 30000) into id;
  return id;
end $function$;
revoke all on function public.pedidos_lembretes_disparar() from public, anon, authenticated;

select cron.schedule('pedidos-lembretes-5min', '*/5 * * * *', 'select public.pedidos_lembretes_disparar()');
