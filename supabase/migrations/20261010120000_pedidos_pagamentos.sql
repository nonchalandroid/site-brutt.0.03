-- Pedidos pagos online (Mercado Pago) + notificações de WhatsApp (Evolution API).
-- Só ADICIONA tabelas novas. Não mexe em products, nex_sync_log nem na sincronização NEX.
-- Todas as tabelas ficam com RLS ligado e SEM política para anon: só a edge function
-- "checkout" (service role) lê e grava. A equipe (is_staff) pode consultar pelo admin.

create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,                 -- "BR-000123" (usa a sequência de proximo_numero_pedido)
  status           text not null default 'aguardando_pagamento'
                   check (status in ('aguardando_pagamento','pago','recusado','expirado','cancelado','concluido')),
  reserva          boolean not null default false,       -- loja estava fechada quando o cliente pediu
  cliente_nome     text not null,
  cliente_whats    text not null,                        -- só dígitos, com DDI 55
  itens            jsonb not null,                       -- [{id, nome, qtd, preco, subtotal}] — preços do BANCO, não do navegador
  subtotal         numeric(10,2) not null,
  taxa_entrega     numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  entrega          jsonb not null,                       -- {tipo:'entrega'|'cliente', endereco, geo, km}
  metodo           text check (metodo in ('pix','debito','credito')),
  mp_payment_id    text,
  mp_status        text,
  mp_status_detail text,
  pix_qr           text,
  pix_qr_base64    text,
  pix_expira_em    timestamptz,
  tentativas       integer not null default 0,
  pago_em          timestamptz,
  concluido_em     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists pedidos_status_idx on public.pedidos (status, created_at desc);
create index if not exists pedidos_mp_payment_idx on public.pedidos (mp_payment_id);

drop trigger if exists pedidos_updated_at on public.pedidos;
create trigger pedidos_updated_at before update on public.pedidos
  for each row execute function public.set_updated_at();

-- Cada notificação de webhook recebida (para auditoria e para descartar repetidas).
create table if not exists public.mp_eventos (
  id           bigserial primary key,
  chave        text not null unique,      -- x-request-id do Mercado Pago (ou tipo:id:ação)
  tipo         text,
  recurso_id   text,
  payload      jsonb,
  recebido_em  timestamptz not null default now()
);

-- Idempotência das mensagens: cada (pedido, tipo) só é enviado UMA vez.
create table if not exists public.wa_notificacoes (
  id         bigserial primary key,
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  tipo       text not null,               -- pagamento_confirmado | loja_novo_pedido | pagamento_recusado | pix_expirado | pedido_concluido
  destino    text not null,
  ok         boolean,
  erro       text,
  created_at timestamptz not null default now(),
  unique (pedido_id, tipo)
);

-- Contatos que já receberam a saudação (evita repetir a cada pedido).
create table if not exists public.wa_contatos (
  numero      text primary key,
  saudado_em  timestamptz not null default now()
);

alter table public.pedidos         enable row level security;
alter table public.mp_eventos      enable row level security;
alter table public.wa_notificacoes enable row level security;
alter table public.wa_contatos     enable row level security;

drop policy if exists pedidos_staff_le on public.pedidos;
create policy pedidos_staff_le on public.pedidos for select to authenticated using (public.is_staff());
drop policy if exists wa_notificacoes_staff_le on public.wa_notificacoes;
create policy wa_notificacoes_staff_le on public.wa_notificacoes for select to authenticated using (public.is_staff());
