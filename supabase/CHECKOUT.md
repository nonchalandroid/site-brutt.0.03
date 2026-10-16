# Checkout online (Mercado Pago) + avisos no WhatsApp (Evolution API)

Enquanto `window.__MP.publicKey` estiver vazio em `index.html`, o site continua no fluxo antigo
(pedido enviado pelo WhatsApp). Para ligar o pagamento online, faça os passos abaixo **nesta ordem**.

## 1. Banco (Supabase)
Aplicar `supabase/migrations/20261010120000_pedidos_pagamentos.sql` e, para a etapa de corrida, `supabase/migrations/20261016160000_pedidos_corrida_link.sql`.
Só cria tabelas novas (`pedidos`, `mp_eventos`, `wa_notificacoes`, `wa_contatos`); não mexe em
`products`, na sincronização NEX nem no `sync_config`.

## 2. Segredos da edge function `checkout`
Supabase → Edge Functions → Secrets (nunca no site):

> Instalação da Evolution API passo a passo (VPS, Docker, HTTPS, QR Code): veja [`EVOLUTION.md`](EVOLUTION.md).

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
6. **etapas manuais** — no admin, "💳 Pedidos online", a equipe avança as etapas com botões protegidos por login de staff: link da corrida recebido → motorista coletou → concluído (ou saiu para entrega → entregue quando a loja faz a entrega).

Para pedidos em que o cliente chama Uber Flash/99, o cliente envia o link pelo WhatsApp e a equipe clica em **Link da corrida recebido**. A tela de acompanhamento passa a mostrar: Pix confirmado → aguardando Uber/99 → link recebido → motorista coletou.

## Avisos para a equipe (sino e Windows)
- No painel, abra o sino → **Ativar notificações** e permita no Chrome/Edge; use **Testar** para validar o aparelho.
- `push_assinaturas` guarda uma inscrição por navegador/aparelho; `ativo = true`, `staff.active = true` e `ultimo_ok` recente indicam um destino válido.
- `push_config` guarda o par VAPID: a função `checkout` gera o par na primeira chamada e nunca envia a chave privada ao navegador. Não é necessário configurar VAPID no frontend.
- Com o painel minimizado ou fechado, o `admin/sw.js` mostra a notificação nativa do Windows; ao clicar, ele focaliza a janela existente ou abre `/admin/#/pedidos`.
- O sino piscando é o estado da janela aberta; ao retornar do segundo plano, o painel reconsulta os contadores imediatamente.

## Testes
`node --experimental-strip-types supabase/functions/checkout/checkout.test.mts`
(Supabase, Mercado Pago e Evolution simulados em memória).

## Brutt IA → mesmo checkout
- O site manda `pagamento_online: true` para a função `brutt-ia` quando o Mercado Pago está ligado
  naquele aparelho (produção, ou modo teste com `?mpteste=1`).
- Ao fechar o pedido, a IA devolve `checkout` (ids + quantidades, nome, entrega com coordenadas).
  O botão **Ir para o pagamento** carrega isso no carrinho e abre o checkout do site: daí em diante é o
  mesmo fluxo (WhatsApp do cliente → Pix/débito/crédito → webhook → confirmação no WhatsApp).
- Sem pagamento online, a IA continua com o botão "Enviar pedido no WhatsApp".
- Publicação: a função publicada só importa `supabase/functions/brutt-ia/index.ts` de um commit fixo
  deste repositório (público). Para atualizar, faça commit/push e publique um `index.ts` com o novo SHA.
  Para voltar atrás, publique apontando para um commit anterior.

## Ligado para todos (produção) — desde 11/10/2026
`MP_PRODUCAO` em `index.html` tem a Public Key de produção: todo cliente paga pelo Pix no site (QR Code + copia e cola)
e depois vê a tela "Acompanhe seu pedido". Se a função `checkout` responder 503 (sem `MP_ACCESS_TOKEN`), o site volta
sozinho para o pedido pelo WhatsApp.

**Para desligar** (voltar ao pedido pelo WhatsApp): deixe `MP_PRODUCAO=""` em `index.html`. Aí o pagamento online só
aparece para quem abrir `https://tabacariabrutt.com.br/?mpteste=1` (fica lembrado no aparelho; `?mpteste=0` desliga).
