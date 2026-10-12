-- Cota diária da Brutt IA (cada mensagem pode virar várias chamadas pagas ao Gemini).
-- Contador por dia (fuso de Brasília) e por chave: 'total' (a loja toda) e 'ip:<hash>' (cada aparelho).
-- O limite em memória da função zera quando ela reinicia e não vale entre cópias; este vale sempre.
create table if not exists public.ia_uso (
  dia    date not null,
  chave  text not null,
  n      integer not null default 0,
  primary key (dia, chave)
);
alter table public.ia_uso enable row level security;            -- sem política: só a função (chave de serviço) usa
revoke all on public.ia_uso from anon, authenticated;

-- Soma 1 no aparelho e no total do dia e diz se ainda pode. Só a chave de serviço chama.
create or replace function public.ia_cota(p_chave text, p_lim_ip integer, p_lim_total integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date; t integer; i integer;
begin
  insert into ia_uso(dia, chave, n) values (d, 'total', 1)
    on conflict (dia, chave) do update set n = ia_uso.n + 1 returning n into t;
  insert into ia_uso(dia, chave, n) values (d, 'ip:' || left(coalesce(p_chave, '?'), 64), 1)
    on conflict (dia, chave) do update set n = ia_uso.n + 1 returning n into i;
  return jsonb_build_object('ok', t <= p_lim_total and i <= p_lim_ip, 'total', t, 'ip', i);
end $$;
revoke all on function public.ia_cota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ia_cota(text, integer, integer) to service_role;
