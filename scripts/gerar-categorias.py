#!/usr/bin/env python3
"""Gera as páginas por categoria (SEO) em /categoria/<slug>/index.html.
Rodar da raiz do repositório:  python3 scripts/gerar-categorias.py
Os produtos NÃO ficam no HTML: js/categoria.js busca no Supabase na hora (preço e estoque sempre certos).
Mudou um texto ou categoria aqui, rode de novo e confira o sitemap.xml."""
import json, html, os

SITE = "https://tabacariabrutt.com.br"
CATS = [
  dict(slug="narguile", sec="narguile", fontes=["narguile"], nome="Narguile",
       titulo="Narguile e Acessórios em Campo Grande RJ · Tabacaria Brutt",
       desc="Narguiles, roshs, mangueiras, carvão de coco, alumínio e peças na Tabacaria Brutt, Conjunto Campinho, Campo Grande (RJ). Estoque atualizado e Pix.",
       h1="Narguile e acessórios em Campo Grande RJ",
       intro="Tudo para a sua sessão: <b>narguiles</b> completos, <b>roshs</b>, <b>mangueiras</b>, <b>carvão de coco</b>, alumínio, pegadores e peças de reposição. Escolha aqui, peça pelo site e pague no Pix: retire na loja do Conjunto Campinho ou receba em casa.",
       ord=["Narguiles","Roshs","Carvão","Mangueiras","Pegadores","Alumínio","Borrachas","Furadores","Peças e acessórios"]),
  dict(slug="essencias", sec="essencias", fontes=["essencias"], nome="Essências",
       titulo="Essências para Narguile em Campo Grande RJ · Tabacaria Brutt",
       desc="Essências Ziggy, Nay, Onix, Zomo, Sense e mais na Tabacaria Brutt, em Campo Grande (RJ). Sabores de frutas, menta e gelo com estoque atualizado.",
       h1="Essências para narguile em Campo Grande RJ",
       intro="As <b>essências</b> mais pedidas da região: <b>Ziggy</b>, <b>Nay</b>, <b>Onix</b>, <b>Zomo</b>, <b>Sense</b> e outras marcas, com sabores de frutas, menta e gelo. O estoque é o da loja, atualizado o dia todo.",
       ord=["Ziggy","Nay","Onix","Zomo","Sense","Predator"]),
  dict(slug="headshop", sec="headshop", fontes=["headshop"], nome="Headshop",
       titulo="Headshop em Campo Grande RJ: Sedas, Piteiras e Bongs · Brutt",
       desc="Sedas, piteiras, cuias, dichavadores, bongs, pipes, cases e bandejas na Tabacaria Brutt, Conjunto Campinho, Campo Grande (RJ). Peça online com Pix.",
       h1="Headshop em Campo Grande RJ",
       intro="O headshop da Brutt tem <b>sedas</b>, <b>piteiras</b>, <b>cuias</b>, <b>dichavadores</b>, <b>bongs</b>, pipes, slicks, cases, bandejas, cinzeiros e tudo para enrolar e guardar. Preço e estoque da loja, atualizados.",
       ord=["Sedas","Piteiras","Cuias","Cases","Slicks","Chaveiros","Pipes","Bongs","Dichavadores","Boladores","Tesouras","Bandejas","Cigarreiras","Cinzeiros","Odor e limpeza","Outros"]),
  dict(slug="tabacos", sec="tabacos", fontes=["tabacos"], nome="Tabacos",
       titulo="Tabacos para Enrolar em Campo Grande RJ · Tabacaria Brutt",
       desc="Tabacos em pacote, bolados, filtros e rapé na Tabacaria Brutt, no Conjunto Campinho, Campo Grande (RJ). Estoque atualizado, pedido online e Pix.",
       h1="Tabacos para enrolar em Campo Grande RJ",
       intro="<b>Tabacos</b> em pacote, <b>bolados</b> feitos na loja, <b>filtros</b> e <b>rapé</b>. Combine com as sedas e piteiras do headshop e receba tudo junto.",
       ord=["Pacotes","Bolados","Filtros","Rapé"]),
  dict(slug="charutos", sec="charutos", fontes=["charutos","cigarrilhas"], nome="Charutos e cigarrilhas",
       titulo="Charutos e Cigarrilhas em Campo Grande RJ · Tabacaria Brutt",
       desc="Charutos e cigarrilhas na Tabacaria Brutt, em Campo Grande (RJ): Phillies, Dona Flor, Quorum e mais. Estoque atualizado, pedido online e Pix.",
       h1="Charutos e cigarrilhas em Campo Grande RJ",
       intro="<b>Charutos</b> e <b>cigarrilhas</b> para presentear ou para o seu momento: Phillies, Jamm, Dona Flor, Quorum e outras marcas. Peça online e retire na loja do Conjunto Campinho ou receba em casa.",
       ord=["Charutos","Cigarrilhas"]),
  dict(slug="bebidas", sec="bebidas", fontes=["bebidas"], nome="Bebidas",
       titulo="Bebidas, Copão e Combos em Campo Grande RJ · Tabacaria Brutt",
       desc="Copão, combos, whisky, gin, energéticos, cervejas e gelo saborizado na Tabacaria Brutt, Campo Grande (RJ). Bebida gelada para acompanhar a sessão.",
       h1="Bebidas e copão em Campo Grande RJ",
       intro="Bebida gelada para acompanhar a sessão: <b>copão</b>, <b>combos</b>, <b>whisky</b>, <b>gin</b>, <b>energéticos</b>, cervejas, long necks e <b>gelo saborizado</b>. Venda só para maiores de 18 anos.",
       ord=["Copão","Combos","Whisky","Gin","Vodka","Licor","Vinho","Cervejas","LongNecks","Energéticos","Gelo Saborizado","Refri","Suco","Água","Descartáveis","Bebidas"]),
]

def e(s): return html.escape(s, quote=True)

def pagina(c):
    url = f"{SITE}/categoria/{c['slug']}/"
    ld = [
      {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Tabacaria Brutt","item":SITE+"/"},
        {"@type":"ListItem","position":2,"name":c["nome"],"item":url}]},
      {"@context":"https://schema.org","@type":"CollectionPage","name":c["h1"],"description":c["desc"],"url":url,"inLanguage":"pt-BR",
       "isPartOf":{"@id":SITE+"/#site"},"about":{"@id":SITE+"/#loja"}}]
    outras = "".join(f'<li><a href="/categoria/{o["slug"]}/">{e(o["nome"])}</a></li>' for o in CATS if o is not c)
    return f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- Gerado por scripts/gerar-categorias.py: edite lá e rode de novo. -->
<title>{e(c["titulo"])}</title>
<meta name="description" content="{e(c["desc"])}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Tabacaria Brutt">
<meta property="og:title" content="{e(c["titulo"])}">
<meta property="og:description" content="{e(c["desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/imagens/og-brutt.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0e0806">
<link rel="icon" href="/favicon/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
<link rel="preconnect" href="https://vedlxtljilsanykmddtj.supabase.co" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/categoria/categoria.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(",",":"))}</script>
</head>
<body>
<header class="topo"><div class="wrap"><a class="logo" href="/"><img src="/favicon/selo-brutt.webp" alt="Tabacaria Brutt" width="40" height="40"><span>Tabacaria Brutt</span></a><a class="ir" href="/">Ver catálogo<span class="lg"> completo</span></a></div></header>
<main class="wrap">
  <nav class="migalha" aria-label="Você está em"><ol><li><a href="/">Início</a></li><li aria-current="page">{e(c["nome"])}</li></ol></nav>
  <h1>{e(c["h1"])}</h1>
  <p class="intro">{c["intro"]}</p>
  <nav class="subs" id="subs" aria-label="Tipos de produto"></nav>
  <div id="produtos"><p class="carrega">Carregando os produtos…</p></div>
  <noscript><p class="vazio">Para ver os produtos e preços, <a href="/#{c["sec"]}">abra o catálogo</a>.</p></noscript>
  <section class="como"><h2>Como comprar</h2><ol>
    <li>Toque no produto para abrir no catálogo e adicionar ao carrinho.</li>
    <li>Escolha como receber: você mesmo pede o Uber Flash ou 99, ou a entrega pela loja.</li>
    <li>Pague no Pix e acompanhe o pedido pelo link que você recebe.</li></ol>
    <a class="cta" href="/#{c["sec"]}">Ver {e(c["nome"].lower())} no catálogo</a></section>
  <nav class="outras" aria-label="Outras categorias"><h2>Veja também</h2><ul>{outras}</ul></nav>
</main>
<footer><div class="wrap">Tabacaria Brutt · Rua 18, 145 · Conjunto Campinho, Campo Grande, Rio de Janeiro (RJ) · <a href="https://wa.me/5521996600243" rel="noopener">WhatsApp</a> · <a href="https://www.instagram.com/tabacariabrutt/" rel="noopener">@tabacariabrutt</a><br>Venda proibida para menores de 18 anos. Fumar faz mal à saúde.</div></footer>
<div class="idade" id="idade" role="dialog" aria-modal="true" aria-labelledby="idadeT" hidden><div><b>18+</b><h2 id="idadeT">Você tem 18 anos ou mais?</h2><p>A venda de tabaco e artigos para fumantes é proibida para menores.</p><button type="button" id="idadeSim">Sim, tenho 18+</button></div></div>
<script>window.__CAT={json.dumps({"slugs":c["fontes"],"ord":c["ord"]}, ensure_ascii=False)};</script>
<script src="/js/categoria.js" defer></script>
</body>
</html>
'''

for c in CATS:
    d = os.path.join("categoria", c["slug"]); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f: f.write(pagina(c))
    print("ok", d, len(c["titulo"]), len(c["desc"]))
