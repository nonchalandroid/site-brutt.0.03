# Checkout online (Mercado Pago) + avisos no WhatsApp (Evolution API)

Enquanto `window.__MP.publicKey` estiver vazio em `index.html`, o site continua no fluxo antigo
(pedido enviado pelo WhatsApp). Para ligar o pagamento online, faça os passos abaixo **nesta ordem**.

## 1. Banco (Supabase)
Aplicar `supabase/migrations/20261010120000_pedidos_pagamentos.sql`.
Só cria tabelas novas (`pedidos`, `mp_eventos`, `wa_notificacoes`, `wa_contatos`); não mexe em
`products`, na sincronização NEX nem no `sync_config`.

## 2. Segredos da edge function `checkout`
Supabase → Edge Functions → Secrets (nunca no site):

| Variável | Onde pegar |
|---|---|
| `MP_ACCESS_TOKEN` | Mercado Pago → Suas integrações → (sua aplicação) → Credenciais de produção → Access Token |
| `MP_PUBLIC_KEY` | Mesma tela → Public Key (também vai no site, passo 4) |
| `MP_WEBHOOK_SECRET` | Mesma aplicação → Webhooks → "Assinatura secreta" (depois do passo 3) |
| `EVOLUTION_API_URL` | URL da sua Evolution API na VPS, ex.: `https://evo.seudominio.com.br` |
| `EVOLUTION_API_KEY` | `AUTHENTICATION_API_KEY` da Evolution (ou a apikey da instância) |
| `EVOLUTION_INSTANCE` | Nome da instância conectada ao WhatsApp da loja |
| `WHATS_LOJA_AVISOS` | (opcional) número que recebe o aviso "NOVO PEDIDO PAGO", com DDD. Use um número **diferente** do conectado na instância |
| `CHECKOUT_PUBLIC_URL` | (opcional) URL pública da função, se não for `https://<projeto>.supabase.co/functions/v1/checkout` |

## 3. Publicar a função
Deploy de `supabase/functions/checkout/index.ts` com **verify_jwt desligado**
(o webhook do Mercado Pago não manda JWT; a segurança vem da assinatura `x-signature`
e de a função sempre reconsultar o pagamento na API do Mercado Pago).

No painel do Mercado Pago → Webhooks:
- URL de produção: `https://vedlxtljilsanykmddtj.supabase.co/functions/v1/checkout?acao=webhook`
- Evento: **Pagamentos**
- Copie a "assinatura secreta" para `MP_WEBHOOK_SECRET`.

## 4. Ligar no site
Em `index.html`: `<script>window.__MP={publicKey:"APP_USR-..."};</script>` (Public Key é pública por definição).

## Como funciona
1. **criar** — o navegador manda só `id` + quantidade de cada item, nome, WhatsApp e endereço/geo.
   O servidor busca preço/promoção/estoque no banco, recalcula a taxa de entrega (mesmas regras de
   `ENTREGA_LOJA`) e grava o pedido.
2. **pagar** — o Payment Brick entrega o token do cartão (ou e-mail do Pix); o servidor cria o pagamento
   com o **valor do pedido gravado**, `installments: 1`, `X-Idempotency-Key` por tentativa e
   `external_reference` = id do pedido. Pix expira em 30 min.
3. **webhook** — confere `x-signature`, descarta `x-request-id` repetido (`mp_eventos`), busca o pagamento
   em `GET /v1/payments/{id}` e só então muda o status (UPDATE condicional = idempotente).
4. **WhatsApp** — cada mensagem (`pedido`, `tipo`) é reservada em `wa_notificacoes` antes de enviar:
   evento duplicado nunca gera mensagem duplicada. A confirmação sai na hora; aviso à loja e saudação
   de contato novo vão em segundo plano com ~3 s de intervalo.
5. **status** — o site consulta a cada 4 s enquanto espera o Pix; se o webhook atrasar, a função
   reconsulta o Mercado Pago (no máximo a cada 10 s).
6. **concluir** — no admin, "💳 Pedidos online" → "Marcar como concluído" (exige login de staff).

## Testes
`node --experimental-strip-types supabase/functions/checkout/checkout.test.mts`
(Supabase, Mercado Pago e Evolution simulados em memória).
