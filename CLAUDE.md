# Tabacaria Brutt — regras do projeto e do design system

Guia para quem (pessoa ou IA) for mexer no site, inclusive ao trazer designs do Figma via MCP.
Leia antes de alterar qualquer arquivo.

## 1. Visão geral

- **Site estático** publicado pelo **GitHub Pages** a partir da branch `main` (domínio em `CNAME`: tabacariabrutt.com.br).
- **Sem framework, sem build, sem bundler.** HTML + CSS + JavaScript puro. O que está no repositório é o que vai pro ar.
- **Backend:** Supabase (projeto `tabacaria-brutt`): Postgres + Edge Functions em `supabase/functions/`.
- **Não reescreva** o site em React/Vue/Tailwind nem introduza etapa de build. Mudanças são pontuais.

```
/
├── index.html            # LOJA inteira: <head>, CSS (3 blocos <style>), HTML base e o JS principal inline
├── js/
│   ├── fluidez.js        # Lenis (scroll suave), navegação ←/→ e gesto no modal de produto
│   ├── checkout-mp.js    # window.MPX: pagamento Mercado Pago (Payment Brick, Pix), campo WhatsApp, pin da loja
│   ├── acompanhar.js     # window.ACOMP: tela "Acompanhe seu pedido" (pós-pagamento, estilo iFood) + atalho no topo
│   └── sons.js           # window.SOM: sons das ações da loja + botão de som no topo (#somBtn)
├── vendor/lenis.min.js   # Lenis 1.3.26 servido localmente (sem CDN)
├── vendor/fonts/         # DejaVu Sans Mono (woff2, recorte Latin) para var(--mono)
├── sons/                 # sons de interface (mp3) + LEIA-ME.md com a tabela ação → arquivo
├── admin/index.html      # PAINEL interno (login Supabase), roteador por hash + abas
├── 404.html              # só redireciona /qualquer-rota → /?r=... (o index reescreve a URL)
├── favicon/              # ícones oficiais (ver §4)
├── site.webmanifest
├── imagens/              # fotos de produto locais (NNNNNN.webp, NNNNNN-WP.webp) — legado
├── fumaca.mp4            # vídeo de fundo, carregado sob demanda
├── assets/               # BUILD ANTIGO (React) que NÃO é usado por nenhuma página — não editar
└── supabase/
    ├── migrations/       # SQL das tabelas novas (pedidos, mp_eventos, wa_notificacoes, wa_contatos, clientes)
    ├── functions/checkout/  # pedido + Mercado Pago + webhook + WhatsApp (Evolution API) + testes
    ├── functions/brutt-ia/  # vendedor virtual (Gemini) + testes
    ├── functions/gerar-ficha-sommelier/  # Sommelier IA (ficha, perfil, categoria) + testes
    ├── functions/equipe/  # criar login da equipe e trocar senha (tela Equipe do admin) + testes
    ├── functions/sync-nex/  # estoque e preço Nex → site a cada 15 min (pg_cron) + botão no painel
    ├── CHECKOUT.md       # como ativar/operar o pagamento online
    └── EVOLUTION.md      # instalar a Evolution API (WhatsApp automático) no VPS
```

## 2. Tokens de design

### Loja (`index.html`, 1º `<style>`, regra `:root`)

```css
:root{
  --bg:#0e0806;  --surface:#170f0a;  --cocoa:#170e09;   /* fundos escuros */
  --ink:#f3e4c8; --muted:#b8a184;   --line:#2c1d14;    /* texto e divisórias */
  --brand:#e3ac3d; --brand-2:#efc25e; --gold:#e3ac3d;  /* dourado (identidade) */
  --hot:#d6392b;                                       /* alerta / esgotado */
  --ok:#1f7a4d;     /* fundo de botão de confirmação (Enviar pedido, Ir para o pagamento) */
  --ok-txt:#6fd3a0; /* texto verde sobre fundo escuro */
  --ok-line:#3fbf7f;/* borda/indicador verde (status "Aberto", barra do mínimo) */
  --ok-bg:#1c3a2b;  /* fundo verde suave */
  --head:"Anton",…; --body:"Inter",…; --mono:"DejaVu Sans Mono",…;
  --maxw:1200px;    /* cresce em telas grandes: 1380 / 1560 / 1760px */
  --ease-app:cubic-bezier(.16,1,.3,1);   /* curva padrão de TODAS as animações */
  --vvh / --vvt / --hh                   /* altura visível, topo da viewport e altura do header (setados via JS) */
}
```

Regras:
- **Paleta:** escuro + dourado. Verde só para ações de confirmação/sucesso, sempre via `--ok*`. **Nunca** cole hex de verde solto.
- **WhatsApp:** usar a cor oficial `#25D366` (ou branco sobre fundo verde). É exceção de marca, não token.
- **Opções de entrega:** nenhuma vem marcada (`ship=""`). Ativa, "Entrega pela loja" fica dourada; "Prefiro eu mesmo solicitar a entrega" fica azul-claro (`--frete:#9fc3e6`, definido só em `.entrega`), para o cliente distinguir na hora.
- **Taxa de entrega** (`ENTREGA_LOJA` no `index.html`, igual em `supabase/functions/checkout` e `brutt-ia`; ponto da loja = o do Google Maps: -22.8814745, -43.6137391, Plus Code 499P+CG): R$ 5,00 até 2 km de rota; + R$ 1,50 por km fracionado; só até 2,5 km; teto R$ 8,00. Mudou num lugar, mude nos três.
- **Conjunto Campinho** ("o conjunto", "Conjunto Campinho", "Campinho" de Campo Grande; centro -22.882284, -43.6161089, ~250 m da loja): entrega pela loja = **taxa mínima**. Só vale o km rodado se a casa for achada no mapa com o número exato (aí, passou de 2 km, soma por km como qualquer endereço). Rua homônima achada a mais de 2,5 km do conjunto é ignorada. Mesma regra em `brutt-ia` (`CONJUNTO`, `ehConjunto`, `definir_entrega`) e no `checkout` (conferência do endereço). Ruas numeradas: "Rua Dezoito" = "Rua 18" (`NUMEROS` em `palavras()`), e a conferência só aceita resultado do mesmo bairro.
- **Brutt IA:** paleta própria roxa/azul em `.ia{--ia-a…--ia-d}` (identidade do assistente). Não misturar com o dourado.
- **Escala de fonte** (px inteiros, sem .5): 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24 · 26 · 28 · 30 · 32 · 34. Títulos display usam `var(--head)` em CAIXA ALTA.
- **Famílias:** só via `var(--head)`, `var(--body)`, `var(--mono)`. Títulos = **Anton** e texto = **Inter** (Google Fonts, no `<head>`); números/códigos = **DejaVu Sans Mono**, servida de `vendor/fonts/` (`@font-face` no fim do `#fluidez`, só caracteres do português, licença em `vendor/fonts/DEJAVU-LICENSE.txt`). O admin usa as mesmas Inter e DejaVu Sans Mono; só o menu lateral dele fica em Geist.
- **Raios:** 10–14px em botões/cards, 999px em chips/pílulas, 18px no topo de sheets/modais.

### Admin (`admin/index.html`, `:root` próprio)

**Paleta do painel (bloco "PALETA DO PAINEL", o último do CSS do admin, sobrescreve os tokens abaixo e o bloco "CORES"):** parte das cores da logo e explora tons vizinhos, cada um com variação clara (`-cl`) e escura (`-es`) e um papel fixo:
- **Ouro** (`--ouro`): ação principal (`.btn-gold`, uma por tela), item ativo do menu (texto + barrinha), títulos, valores em R$.
- **Bronze** (`--bronze-cl`): códigos, EAN, quantidades.
- **Bordô** (`--bordo`/`--bordo-cl`): pedido novo, badge do menu, ações destrutivas (`.btn-danger`, "Desfazer").
- **Petróleo** (`--petroleo`): botão secundário `.btn-sec` (Sommelier ✨), links, foco dos campos, etapas feitas em `.ped-linha`, grupo "Operação".
- **Índigo** (`--indigo`): "Pedidos a concluir", papel Administrador, `.btn-indigo` (Adicionar pessoa).
- **Ameixa** (`--ameixa`): clientes, estornos, grupo "Gestão".
- **Sálvia** (`--salvia`): bom/pago/concluído, Atendente, grupo "Planilhas", `.btn-salvia` (Ativar notificações, texto escuro).
- **Terracota** (`--terracota`): aviso (estoque baixo, Pix gerado sem pagar).
Cada KPI da visão geral tem classe `k-<ícone>` (filete e ícone no tom dele); `bom`/`alerta`/`ruim`/`novo` continuam pintando o número. WhatsApp segue `#25D366`. Texto colorido sempre com contraste ≥ 4,5.

Paleta do painel = **variação** da loja (café/espresso + dourado-âmbar), não cópia dos mesmos valores. O dourado (`--accent`) é só para ação principal, item ativo e número que pede ação; alerta usa **cobre** (`--warn`) para não confundir com o dourado.

```css
--bg:#100a07; --side:#150e0a; --surface:#1c140f; --surface-2:#261b14; --field:#160f0b;
--line:#35271d; --line-2:#4c3929;                 /* bordas (normal / hover) */
--ink:#f6ead6; --muted:#c2ab8e; --muted-2:#8f7a62;
--accent:#eab54a; --accent-2:#cf962c; --accent-ink:#2a1704; --accent-soft:rgba(234,181,74,.10);
--ok:#79c48e; --warn:#e5843f; --danger:#e15a4a; --info:#a9b3bd;   /* + *-soft para fundos */
--gold / --gold-2 / --red / --green = apelidos antigos (templates do JS), apontam para os tokens acima
```
Fontes: **Inter** (texto e títulos, Google Fonts) + **DejaVu Sans Mono** (códigos, EAN, valores; servida de `/vendor/fonts/`, a mesma da loja). Só o **menu lateral** (`.side`) fica em **Geist** / **Geist Mono**: as variáveis `--font`/`--mono` são redefinidas no `.side`. Ícones: mapa `ICON` + `ic(nome)` (traço 24×24, desenho do Lucide/ISC). Os tokens do admin **não** são os da loja: não copie valores de um para o outro.

Não há sistema de transformação de tokens (Style Dictionary etc.). Ao importar do Figma, **mapeie as variáveis do Figma para as custom properties acima** em vez de criar novas cores.

## 3. Componentes (sem framework)

Componentes são **funções JS que devolvem template strings HTML**, renderizadas com `innerHTML`. Sempre escape dados com `esc()`.

```js
// index.html — card de produto
function card(p,ctx){ … return `<article class="card">
  <button class="thumb" data-open="${p.id}">${media(p)}${tag}</button>
  <div class="info"><h3 data-open="${p.id}">${esc(p.n)}</h3>
  <div class="price">${R(p.price)}</div>
  <button class="add" data-add="${p.id}">Adicionar</button></div></article>` }
```

Principais "componentes" da loja (todos em `index.html`):

| Função | O que desenha |
|---|---|
| `card()`, `railHTML()`, `secHTML()`, `render()` | vitrine, trilhos horizontais e seções |
| `openProduct(id)` | modal de produto `#pm` (+ `flavorBars`, `whiskyHTML`) |
| `drawCart(view)` / `drawCheckout()` / `rodapeCheckout()` | gaveta `#drawer` (carrinho e "Finalizar pedido") |
| `ensureDlv()` / `abrirEntregaModal()` / `entregaBoxHTML()` | modal de endereço `#dlv` e caixa "Entrega disponível" |
| `MPX.*` (`js/checkout-mp.js`) | forma de pagamento, Payment Brick, tela do Pix |
| Brutt IA (último `<script>` inline) | `#ia` barra/painel, `cartao()` do pedido |
| `ACOMP.*` (`js/acompanhar.js`) | tela `#acomp` "Acompanhe seu pedido" e atalho `#acompPill` |

Interação por **delegação de eventos**: um único `document.addEventListener("click", …)` lê atributos `data-*` (`data-add`, `data-open`, `data-ship`, `data-send`, `data-copy`…). Para um botão novo, use um `data-*` novo e trate na delegação (ou num listener próprio no seu módulo).

Admin: roteador por hash (`ROUTES`, `go("nome")`, `rotaAtual()`); cada tela é `renderX()` e começa com `topbarHTML(titulo)` + `bindTopbar()`, que desenham a **sidebar** (fixa a partir de 1024px; abaixo disso vira gaveta com o botão ☰) e a barra superior. A navegação vem de `NAV = [[grupo, [[rota, rótulo, ícone, badge?], …]], …]` (`ABAS` é derivado dele). **Tela nova = função `renderX` + entrada em `ROUTES` + item em `NAV`.** Padrão visual de tela: `<div class="pg"><h2 class="pg-t">…</h2><p class="pg-d">…</p>` + conteúdo. Entrada sem hash vai para `#/visao` (Visão geral); `#/` continua sendo Produtos.

**Equipe e papéis** (`#/equipe`, tabela `staff.role`): **Dono** (`owner`) faz tudo e cria/altera administradores; **Administrador** (`admin`) faz tudo e gerencia só atendentes; **Atendente** (`atendente`) só vê **Pedidos** (`ROTAS_ATENDENTE`, menu filtrado por `podeRota`). Quem barra de verdade é o banco: `is_gestor()` (dono/admin) nas políticas de produtos, categorias, fotos (tabela e storage), horários, clientes, `sommelier_log`, `registrar_movimento_estoque` e `clientes_importar`; pedidos continuam com `is_staff()`. Lista/nome/papel/ativo = RPCs `equipe_listar` e `equipe_alterar` (hierarquia em `equipe_pode`; ninguém muda o próprio papel nem se desativa; o dono não é alterável). Criar login e trocar senha = função `supabase/functions/equipe` (usa a chave de serviço; confere a permissão chamando `equipe_pode` com o token de quem pediu). Ninguém é apagado: sair da loja = desativar (`active=false`, perde o acesso na hora).

**Sincronização Nex** (`supabase/functions/sync-nex`, pg_cron `sync-nex-15min` → `nex_sync_disparar()`, log em `nex_sync_log`): o Nex manda no estoque e no preço. Liga por EAN e depois por nome. **`sync_config.nex_lista = 'todos'`** (desde 11/10/2026): pede ao Nex com `stockControl:false`, porque com `true` o Nex **esconde os produtos zerados** e o site ficava com o último estoque (vendia o que não tinha). `?modo=teste` simula sem gravar; `?explorar=1` compara as duas listas. Trava de segurança: não grava se o Nex devolver poucos produtos.

**Clientes** (`#/clientes`, tabela `clientes`, RLS só equipe): lista do Nex + quem compra no site. O gatilho `pedidos_cliente` cria/completa o cliente a cada pedido e soma pedidos pagos; `clientes_importar(lista, origem)` mescla a exportação do Nex (casa por uid → código → WhatsApp e só preenche campo vazio, nunca sobrescreve o que a equipe editou). WhatsApp é guardado como `55DDD9XXXXXXXX` (`whats_normaliza` no banco = `cliWhats` no admin). "Completo" = nome + WhatsApp + endereço (e-mail é opcional).

**Alerta de pedido novo:** pedido `pago` com `visto_em` vazio pisca em **verde** (`--al-pago`, etiqueta "✓ Pago") (badge do menu, visão geral e cartão em Pedidos, animação `piscaNovo` só de opacidade) até alguém da equipe tocar nele ou concluir (RPC `pedido_marcar_visto`). O painel confere a cada 30 s (`ligaVigia`): pedido novo dá aviso na tela, bipe curto e "(N) ✅ Pedido pago" no título da aba (Pix gerado: "(N) ⚠️ Pix gerado"). Cores dos alertas no bloco "ALERTAS" do CSS do admin: verde = pago, vermelho (`--al-pix`) = Pix gerado aguardando.

**Notificações no aparelho (Web Push):** `admin/manifest.webmanifest` (painel instalável) + `admin/sw.js` (mostra o aviso e abre `#/pedidos`). Cartão "Notificações neste aparelho" (`desenhaNotif`) em Pedidos e Visão geral: pede permissão, inscreve com a chave pública do servidor (`checkout?acao=push_chave`) e salva via RPC `push_registrar` (sair = `push_remover`). A função `checkout` (`push.ts`, sem bibliotecas: VAPID ES256 + aes128gcm) avisa "⚠️ Pix gerado" e "✅ Pedido PAGO", 1 vez por pedido (reserva em `wa_notificacoes`, tipo `push_*`). O par VAPID é gerado no servidor na 1ª vez e fica em `push_config` (RLS sem política: só a função lê). iPhone/iPad: só com o painel instalado na Tela de Início (iOS 16.4+). No painel, Pix gerado e não visto pisca em vermelho (`.pixnovo`); quando o pedido é pago, `visto_em` volta a vazio e ele pisca em verde.

**Acompanhe seu pedido (loja + admin):** depois do Pix pago, `MPX` abre `ACOMP.abrir(id)` (tela `#acomp`: gaveta no celular, janela no PC). Etapas (4 nos dois casos): Recebemos seu pedido → Pagamento confirmado → (entrega da loja) Saiu para entrega → Pedido entregue · (cliente chama Uber/99) Separando · aguardando seu Uber/99 (cartão com o endereço de coleta para copiar + "Enviar link da corrida" para o WhatsApp da loja) → Motoboy já retirou seu pedido. Quando a loja **conclui**, o acompanhamento some do aparelho do cliente na hora (sai do atalho do topo e do `localStorage` ao fechar). Logo abaixo do status fica o botão verde **"Concluir pedido"** (símbolo oficial do WhatsApp), que abre o WhatsApp da loja com o pedido pago pronto (`msgLojaPago` → `txtLoja`); a mensagem é guardada no aparelho já quando o Pix é gerado (o celular pode recarregar a página enquanto o cliente paga no app do banco; sem ela, `msgPedido` monta com os dados do acompanhamento), "Falar com a loja" também leva o pedido completo enquanto não foi enviado, a 1ª tentativa de fechar sem concluir mostra um lembrete, e o atalho do topo mostra "Concluir ›" até o cliente tocar. Depois vira "✓ Pedido enviado à loja · reenviar". Dados de `checkout?acao=status` → `acomp` (sem endereço, telefone ou dados de pagamento). Pedidos ficam em `localStorage.brutt_pedidos`; atalho `#acompPill` no topo enquanto houver pedido em andamento (some 3 h depois de concluído); link `/?pedido=<uuid>` (capturado no `<head>` em `window.__PEDIDO_URL`, espera a confirmação +18). No admin, pedido pago tem o botão da próxima etapa (`data-etapa`): entrega da loja "🛵 Saiu para entrega" → "Pedido entregue"; Uber/99 "🛵 Motoboy retirou" → "✅ Concluir pedido". A 1ª é `checkout?acao=etapa` (grava `saiu_em`; mensagem `saiu_entrega` ou `motoboy_retirou`), a 2ª é `acao=concluir`. "Ver como o cliente vê" abre `/?pedido=<id>&equipe=1` (`window.__PEDIDO_EQUIPE`): mostra a tela com um aviso da equipe e não guarda nada no navegador. O botão "Avisar no WhatsApp" some depois de tocado. Cada etapa manda WhatsApp ao cliente pela Evolution; sem ela, o admin mostra "Avisar o cliente no WhatsApp" com a mensagem pronta (`whats.link`).

**Estornado:** pedido `cancelado` com `mp_status = 'refunded'` (o MP devolveu o valor inteiro) aparece como "Estornado · devolvido" (`pedSt()`), com filtro próprio, e sai das estatísticas do cliente. Pedido "Aguardando pagamento" sem Pix ou com Pix vencido pode ser cancelado pela equipe (botão "Cancelar pedido" → RPC `pedido_cancelar_aberto`, que recusa se houver Pix válido em aberto).

**Produtos em lote:** caixa "Selecionar todos" (`#bulkTodos`) acima da lista marca todos os produtos filtrados; fica "parcial" quando só alguns estão marcados.

**Sommelier em massa** (`#/sommelier`): fila no navegador (1–4 ao mesmo tempo) chamando a função `gerar-ficha-sommelier` (código em `supabase/functions/gerar-ficha-sommelier/`, publicada pelo padrão de import fixado num commit). Regra "só completar" (padrão: descrição ≤80 ou >170 caracteres, ficha ≤2 itens, perfil/whisky vazios) ou "reescrever tudo"; categoria só muda com confiança alta e para um slug que existe. Confiança baixa não grava (fica "para revisar"). Cada gravação vai antes para `sommelier_log` (antes/depois, lote) e pode ser desfeita por produto ou por lote.

**Fotos:** envio já comprime (WebP 88%, até 1000 px). "Otimizar fotos pesadas" (Fotos em lote) recomprime as acima de 100 KB em WebP 86% e só troca se ficar ≥20% menor.

**Celular e tablet (até 1023px):** mesma arquitetura da loja: barra do topo compacta de 54 px (☰ · logo · nome da tela · ver loja), o título `.pg-t` não se repete na página, o recuo do entalhe do iPhone entra **uma vez só** (na `.topbar`; `html`/`body` sem `padding-top`, antes somava três vezes no painel instalado), filtros em chips correm até a borda da tela, e na lista de produtos (até 560px) a caixa de seleção fica no canto da foto. Indicadores da visão geral: 3 + 2 no tablet, 2 por linha no celular (o último sozinho ocupa a largura toda). Em telas de toque, campos usam 16px (igual à loja) para o iPhone não dar zoom ao tocar.

Não há Storybook nem documentação de componentes além deste arquivo.

## 4. Assets

- **Fotos de produto:** vêm do Supabase (`product_images.url`); fallback local em `imagens/` via `fotoUrl()`. Sempre `loading="lazy" decoding="async"`.
- **Logo:** constante `LOGO` (WebP base64 inline) aplicada em `img[data-logo]`.
- **Vídeo** `fumaca.mp4`: só carrega após a 1ª interação (economia de dados).
- **Sons** (`sons/*.mp3`, `js/sons.js`, só na loja): `SOM.toca("ação")` (tabela ação → arquivo em `sons/LEIA-ME.md`). Nada toca nem é baixado antes do 1º toque do cliente; depois baixa os 24 sons (~50 KB). Um som por ação: o que for pedido na mesma tarefa vira um só, o de maior prioridade (pagar fecha a gaveta e abre o acompanhamento, mas só toca "pago"). Volume baixo, `audioSession` "ambient" (respeita o modo silencioso do iPhone e não pausa a música do cliente). Botão `#somBtn` na barra do topo liga/desliga (salvo em `localStorage.brutt_som`); até 480 px a barra fica compacta para o status "Aberto · até 00:00" não ser cortado. Cliques simples (setas, filtros, opções, copiar) tocam por delegação no `sons.js`; o resto é chamado no ponto do código onde a ação dá certo ou errado.
- **Intro** `#intro` (início do `<body>`): selo da marca + brasa animada (ritmo lento: brasa/pulso 3,8 s, anel 3,4 s, fagulhas 3,5 s); some quando o catálogo aparece (`js/fluidez.js`), mínimo ~2,2 s só na 1ª visita da sessão, saída de 0,9 s, e se remove sozinha em 9 s se algo falhar.
- **Favicons** (`favicon/`): `favicon.ico` (16–256), `favicon-16x16.png`/`32x32`/`48x48` (só o "B" dourado, legível em tamanho pequeno), `apple-touch-icon.png` 180 (opaco), `android-chrome-192/512`, `maskable-512` + `site.webmanifest`.
- **CDN permitida:** Google Fonts, `sdk.mercadopago.com/js/v2` (obrigatório ser do Mercado Pago, carregado sob demanda), Supabase. Bibliotecas JS novas → servir em `vendor/` (fixar versão).

## 5. Ícones

- Mapa `ICONS` (paths SVG 24×24, traço) + `ic(nome)` → `<svg class="ic" viewBox="0 0 24 24">` (herda `currentColor`, `stroke-width:1.6`).
- No HTML estático: `<span data-ic="pin"></span>` é preenchido no carregamento.
- Nomes curtos em inglês: `cart, chat, pin, copy, check, alert, trash, moto, card, drop, search…`.
- **WhatsApp = sempre o símbolo oficial** (simple-icons / kit de marca da Meta), **preenchido**, em `#25D366` ou branco sobre fundo verde (`.wa-logo`, `.ic-wa`; o `ic("chat")` já usa esse símbolo). Nunca redesenhar nem tingir de dourado; se não couber o oficial, não coloque.
- **Selos de pagamento seguro** (`MPX.selosHTML()` em `js/checkout-mp.js`): "Conexão segura SSL" (só aparece em https), Mercado Pago (símbolo oficial `#00B1EA`) e Pix, abaixo do botão "Gerar Pix"/"Reservar e pagar" e na tela do Pix.
- **Pix = símbolo oficial** (simple-icons, CC0) **preenchido em `#32BCAD`** (cor do Banco Central), em `PAY_IC.pix` de `js/checkout-mp.js`. Mesma regra: não redesenhar nem tingir.
- **Google Maps = símbolo oficial multicolorido** (`svg.gmaps` no botão `#goMapa` do topo, paths do pacote `@iconify-json/logos`). Mesma regra do WhatsApp: não redesenhar nem tingir.
- Ícones da Brutt IA: `<symbol>` no sprite `.ia-sprite` (`#iaI`, `#iaEye`) usados com `<use href>`.

## 6. Estilo

- **CSS global, sem metodologia formal** (nem BEM nem módulos). Classes curtas em português/abreviadas (`.eopt`, `.dlv-res`, `.pm-buy`, `.popt`).
- **Três blocos `<style>` no `index.html`, em ordem de cascata:**
  1. o original (minificado, uma linha),
  2. `#fluidez` (Lenis, micro-interações, checkout/pagamento),
  3. `#ajustes` (correções de alinhamento e responsividade).
  Regras posteriores sobrescrevem anteriores: **CSS novo vai no fim do bloco adequado**, não edite a linha minificada salvo para corrigir um valor.
- **Animações:** só `transform` e `opacity`, curva `var(--ease-app)`; sempre com alternativa em `@media(prefers-reduced-motion:reduce)`. Elevação/brilho no hover = pseudo-elemento cuja **opacidade** anima (não anime `box-shadow`).
- **Responsivo (mobile-first na prática):** quebras usadas `≤380px`, `≤420px`, `≤480px`, `≤640px` (gaveta vira bottom sheet), `≥641px`, `≥1700/2200/3000px` (alarga `--maxw`); toque vs. mouse com `(hover:hover) and (pointer:fine)`.
- **Trilhos (`.rail`):** têm margem negativa e espaçamento interno iguais (16 px; 10 px no `.fire` até 640 px) e `scroll-padding-inline` com o MESMO valor. Mudou um, mude o outro: senão o encaixe da rolagem abre o trilho andado e o 1º card fica cortado. A seção (`section.sec`, que usa `content-visibility:auto` e por isso recorta o que passa da borda dela) tem a MESMA sobra (`margin-inline` negativa + `padding-inline` igual): sem isso os cards aparecem cortados por uma linha reta antes da borda da tela ou do quadro dourado.
- **Ícones SVG:** a linha minificada tem `*{scrollbar-gutter:stable}`, que no PC (barra de rolagem clássica) reservava a faixa da barra DENTRO de ícones pequenos e os apagava (a setinha do "Horários" sumia). O `#ajustes` desfaz isso com `svg{scrollbar-gutter:auto}`; não remova.
- **Botões:** do tamanho do texto (não esticam na largura toda), centralizados na loja e à direita nas gavetas do painel; 44 px de altura no toque / 40–42 px no mouse. Textos curtos: "Voltar", "Saber mais", "Adicionar", "Gerar Pix", "Copiar código", "Salvar".
- **Topo:** busca com 36 px de altura (menor que os ícones redondos de 42 px; texto 16 px) e texto "Buscar". Botão "Horários" com relógio no PC (some até 480 px, junto com a setinha, para o status não ser cortado).
- Modais/gavetas travam a página com `html.is-locked` (JS `syncLock`); o Lenis pausa junto. Contêineres com rolagem própria precisam estar no `prevent` do Lenis (`js/fluidez.js`).
- Teclado virtual: alturas via `--vvh`/`--vvt` (loja) e `--ia-vh`/`--ia-kb` (Brutt IA), medidas com `visualViewport`.

## 7. Ao implementar um design do Figma

1. Reaproveite tokens (§2) e componentes (§3); não crie paleta nova nem fonte nova.
2. Converta medidas do Figma para a escala de fonte inteira e para os raios usados.
3. Ícones: use `ICONS`/`ic()`; logotipos de marca só na versão oficial.
4. Coloque o CSS novo no bloco certo (`#fluidez` para recurso novo, `#ajustes` para correção).
5. Valide em **320, 360, 390, 414, 768, 1024, 1366 e 1920px**: nenhum elemento pode vazar da tela ou do painel; nada de texto quebrando no meio de valores (`R$ 8,30`) ou códigos (`#BR-000123`).
6. Rode os testes:
   - `node --experimental-strip-types supabase/functions/checkout/checkout.test.mts`
   - `node --experimental-strip-types supabase/functions/brutt-ia/brutt-ia.test.mts`
   - `node --experimental-strip-types supabase/functions/gerar-ficha-sommelier/sommelier.test.mts`
   - `node --experimental-strip-types supabase/functions/equipe/equipe.test.mts`
7. Segurança: nada de token/segredo no front. Só a **Public Key** do Mercado Pago (`window.__MP`) e a chave **anon** do Supabase podem ficar no HTML.

**Pix online ligado para todos** (desde 11/10/2026): `MP_PRODUCAO` em `index.html` tem a Public Key de produção. Para voltar ao pedido pelo WhatsApp, deixe `MP_PRODUCAO=""` (ver `supabase/CHECKOUT.md`).

## 8. Segurança (auditoria de 12/10/2026)

- **Escapar sempre:** todo dado do banco ou do cliente que vai para `innerHTML` passa por `esc()` (loja e painel escapam `& < > " '`), inclusive nomes de categoria, URLs de imagem e números. Link vindo de fora só se começar com `https://`.
- **Filtros `.or()` do PostgREST no painel:** valor digitado ou de planilha passa por `pgv()` (tira vírgula, parênteses e aspas).
- **Bibliotecas do painel em `vendor/`, versão fixa, sem CDN:** `supabase-js-2.117.2.js`, `xlsx-0.18.5.full.min.js`, `html5-qrcode-2.3.8.min.js`. Atualizar = baixar a versão nova (npm pack confere o hash do registro) e trocar o nome do arquivo.
- **Planilhas (xlsx/xls/csv) são lidas num Web Worker descartável** (`vendor/planilha-worker.js`, função `lerPlanilha()` no painel, tempo máximo 20 s). A SheetJS 0.18.5 (última no npm) tem falhas conhecidas com arquivo malicioso (CVE-2023-30533, CVE-2024-22363); no worker elas não alcançam a página nem o login. Não carregue a SheetJS direto na página.
- **CSP do painel** (`<meta http-equiv="Content-Security-Policy">` no `admin/index.html`): só scripts do próprio site, conexões só com o Supabase do projeto, fontes do Google. Serviço externo novo no painel = acrescentar o domínio no `connect-src`/`img-src`, senão o navegador bloqueia. **Anti-clickjacking:** o painel não aparece dentro de iframe de outro site (`#antiFrame`). A loja tem CSP mínima (`object-src 'none'; base-uri 'self'`) para não quebrar o Payment Brick do Mercado Pago.
- **Função `checkout` (pública):** preço, estoque e total sempre do banco; pagamento só vira "pago" depois de consultar o MP (valor e moeda conferidos). Freio de pedidos: 12 por IP a cada 10 min, 4 pedidos em aberto por WhatsApp por hora, 15 por dia (`LIMITE`). Nome do cliente sem links (`nomeLimpo`: ele volta nas mensagens do WhatsApp da loja). O estoque é conferido de novo no `pagar`. Aviso no celular só para aparelho de quem está **ativo** na equipe.
- **Taxa de entrega conferida no servidor:** o `checkout` acha o endereço digitado no mesmo mapa do site (`geoapify-autocomplete`, número exato) e compara com a coordenada que o navegador mandou. Mais de 0,6 km de diferença = vale a distância maior (fora dos 2,5 km = recusa) e o pedido mostra o aviso para a equipe (`entrega.conferencia`, `pedGeo()` no painel). Número que o mapa não conhece não bloqueia: aparece "endereço não achado no mapa: confira antes de sair".
- **Cota diária da Brutt IA:** tabela `ia_uso` + RPC `ia_cota` (só chave de serviço): 1.500 mensagens por dia na loja toda e 120 por aparelho (`COTA` em `brutt-ia`, IP guardado só como hash). Passou, a IA não chama o Gemini e oferece o WhatsApp da equipe. Uso normal: até ~100 por dia.
- **Equipe:** e-mail que já tinha conta e **nunca foi confirmado** recebe a senha definida no painel (impede alguém de criar a conta antes pelo cadastro público e entrar como equipe).
- **`sync-nex` manual e Sommelier:** só dono/administrador ativos (atendente não roda sincronização nem gasta cota do Gemini). Erros internos não voltam para quem chamou (só no log).
- **Banco:** toda tabela no `public` com RLS ligada; tabela nova de teste também. `proximo_numero_pedido` é pública de propósito (a loja reserva o número no fluxo do WhatsApp).
- **Painel do Supabase (manual, pelo dono):** Authentication → Sign In / Providers → desligar "Allow new users to sign up" (a equipe é criada só pela tela Equipe) e ligar "Leaked password protection" se o plano permitir.
