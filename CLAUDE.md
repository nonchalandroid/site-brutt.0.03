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
│   ├── fluidez.js        # Lenis (scroll suave), rastro do mouse/dedo, navegação ←/→ e gesto no modal de produto
│   └── checkout-mp.js    # window.MPX: pagamento Mercado Pago (Payment Brick, Pix), campo WhatsApp, pin da loja
├── vendor/lenis.min.js   # Lenis 1.3.26 servido localmente (sem CDN)
├── admin/index.html      # PAINEL interno (login Supabase), roteador por hash + abas
├── 404.html              # só redireciona /qualquer-rota → /?r=... (o index reescreve a URL)
├── favicon/              # ícones oficiais (ver §4)
├── site.webmanifest
├── imagens/              # fotos de produto locais (NNNNNN.webp, NNNNNN-WP.webp) — legado
├── fumaca.mp4            # vídeo de fundo, carregado sob demanda
├── assets/               # BUILD ANTIGO (React) que NÃO é usado por nenhuma página — não editar
└── supabase/
    ├── migrations/       # SQL das tabelas novas (pedidos, mp_eventos, wa_notificacoes, wa_contatos)
    ├── functions/checkout/  # pedido + Mercado Pago + webhook + WhatsApp (Evolution API) + testes
    ├── functions/brutt-ia/  # vendedor virtual (Gemini) + testes
    └── CHECKOUT.md       # como ativar/operar o pagamento online
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
  --head:"Anton",…; --body:"Barlow",…; --mono:"Geist Mono",…;
  --maxw:1200px;    /* cresce em telas grandes: 1380 / 1560 / 1760px */
  --ease-app:cubic-bezier(.16,1,.3,1);   /* curva padrão de TODAS as animações */
  --vvh / --vvt / --hh                   /* altura visível, topo da viewport e altura do header (setados via JS) */
}
```

Regras:
- **Paleta:** escuro + dourado. Verde só para ações de confirmação/sucesso, sempre via `--ok*`. **Nunca** cole hex de verde solto.
- **WhatsApp:** usar a cor oficial `#25D366` (ou branco sobre fundo verde). É exceção de marca, não token.
- **Brutt IA:** paleta própria roxa/azul em `.ia{--ia-a…--ia-d}` (identidade do assistente). Não misturar com o dourado.
- **Escala de fonte** (px inteiros, sem .5): 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24 · 26 · 28 · 30 · 32 · 34. Títulos display usam `var(--head)` em CAIXA ALTA.
- **Famílias:** só via `var(--head)`, `var(--body)`, `var(--mono)`. Fontes carregadas do Google Fonts no `<head>`.
- **Raios:** 10–14px em botões/cards, 999px em chips/pílulas, 18px no topo de sheets/modais.

### Admin (`admin/index.html`, `:root` próprio)

```css
--bg:#120b07; --surface:#1c130c; --surface-2:#241a11; --line:#3a2a1a;
--gold:#d8a638; --gold-2:#f0cc74; --ink:#f3e4c8; --muted:#b8a184; --red:#c0453a; --green:#3f7a4e;
```
Fontes: Barlow + **Barlow Condensed** (títulos). Os tokens do admin são parecidos mas **não idênticos** aos da loja: não copie valores de um para o outro.

Não há sistema de transformação de tokens (Style Dictionary etc.). Ao importar do Figma, **mapeie as variáveis do Figma para as custom properties acima** em vez de criar novas cores.

## 3. Componentes (sem framework)

Componentes são **funções JS que devolvem template strings HTML**, renderizadas com `innerHTML`. Sempre escape dados com `esc()`.

```js
// index.html — card de produto
function card(p,ctx){ … return `<article class="card">
  <button class="thumb" data-open="${p.id}">${media(p)}${tag}</button>
  <div class="info"><h3 data-open="${p.id}">${esc(p.n)}</h3>
  <div class="price" data-trail="accent">${R(p.price)}</div>
  <button class="add" data-trail="accent" data-add="${p.id}">Adicionar</button></div></article>` }
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

Interação por **delegação de eventos**: um único `document.addEventListener("click", …)` lê atributos `data-*` (`data-add`, `data-open`, `data-ship`, `data-send`, `data-copy`…). Para um botão novo, use um `data-*` novo e trate na delegação (ou num listener próprio no seu módulo).

Admin: roteador por hash (`ROUTES`, `go("nome")`, `rotaAtual()`); cada tela é `renderX()`; cabeçalho comum `topbarHTML()` + abas `abasHTML()` (`ABAS = [[rota, rótulo], …]`). **Tela nova = função `renderX` + entrada em `ROUTES` + (se for seção principal) item em `ABAS`.** Padrão visual de tela: `<h2 style="font-size:20px">` + `<p style="font-size:12px;color:var(--muted)">` + conteúdo.

Não há Storybook nem documentação de componentes além deste arquivo.

## 4. Assets

- **Fotos de produto:** vêm do Supabase (`product_images.url`); fallback local em `imagens/` via `fotoUrl()`. Sempre `loading="lazy" decoding="async"`.
- **Logo:** constante `LOGO` (WebP base64 inline) aplicada em `img[data-logo]`.
- **Vídeo** `fumaca.mp4`: só carrega após a 1ª interação (economia de dados).
- **Favicons** (`favicon/`): `favicon.ico` (16–256), `favicon-16x16.png`/`32x32`/`48x48` (só o "B" dourado, legível em tamanho pequeno), `apple-touch-icon.png` 180 (opaco), `android-chrome-192/512`, `maskable-512` + `site.webmanifest`.
- **CDN permitida:** Google Fonts, `sdk.mercadopago.com/js/v2` (obrigatório ser do Mercado Pago, carregado sob demanda), Supabase. Bibliotecas JS novas → servir em `vendor/` (fixar versão).

## 5. Ícones

- Mapa `ICONS` (paths SVG 24×24, traço) + `ic(nome)` → `<svg class="ic" viewBox="0 0 24 24">` (herda `currentColor`, `stroke-width:1.6`).
- No HTML estático: `<span data-ic="pin"></span>` é preenchido no carregamento.
- Nomes curtos em inglês: `cart, chat, pin, copy, check, alert, trash, moto, card, drop, search…`.
- **WhatsApp = sempre o símbolo oficial** (simple-icons / kit de marca da Meta), **preenchido**, em `#25D366` ou branco sobre fundo verde (`.wa-logo`, `.ic-wa`; o `ic("chat")` já usa esse símbolo). Nunca redesenhar nem tingir de dourado; se não couber o oficial, não coloque.
- Ícones da Brutt IA: `<symbol>` no sprite `.ia-sprite` (`#iaI`, `#iaEye`) usados com `<use href>`.

## 6. Estilo

- **CSS global, sem metodologia formal** (nem BEM nem módulos). Classes curtas em português/abreviadas (`.eopt`, `.dlv-res`, `.pm-buy`, `.popt`).
- **Três blocos `<style>` no `index.html`, em ordem de cascata:**
  1. o original (minificado, uma linha),
  2. `#fluidez` (Lenis, rastro, micro-interações, checkout/pagamento),
  3. `#ajustes` (correções de alinhamento e responsividade).
  Regras posteriores sobrescrevem anteriores: **CSS novo vai no fim do bloco adequado**, não edite a linha minificada salvo para corrigir um valor.
- **Animações:** só `transform` e `opacity`, curva `var(--ease-app)`; sempre com alternativa em `@media(prefers-reduced-motion:reduce)`. Elevação/brilho no hover = pseudo-elemento cuja **opacidade** anima (não anime `box-shadow`).
- **Responsivo (mobile-first na prática):** quebras usadas `≤380px`, `≤420px`, `≤480px`, `≤640px` (gaveta vira bottom sheet), `≥641px`, `≥1700/2200/3000px` (alarga `--maxw`); toque vs. mouse com `(hover:hover) and (pointer:fine)`.
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
7. Segurança: nada de token/segredo no front. Só a **Public Key** do Mercado Pago (`window.__MP`) e a chave **anon** do Supabase podem ficar no HTML.
