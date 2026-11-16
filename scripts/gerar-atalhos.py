#!/usr/bin/env python3
"""Páginas de atalho das seções da loja (/essencias, /tabacos, ...).

A loja escreve esses endereços na barra enquanto a pessoa rola (urlPelaRolagem).
Sem um arquivo de verdade, o GitHub Pages responde 404 para o Google (o 404.html
leva a pessoa à loja, mas o Google registra "Não encontrado"). Cada atalho responde
200, aponta o canonical para a página da categoria (ou para a loja) e manda o
visitante para a loja do mesmo jeito que o 404.html.
Rode: python3 scripts/gerar-atalhos.py  (lista = GRUPOS do index.html)"""
import os
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SLUGS = ["em-alta", "essencias", "narguile", "headshop", "tabacos", "charutos", "cigarros", "isqueiros",
         "bebidas", "doces", "incensos", "conveniencia", "palha", "cigarrilhas", "outros", "como-chegar"]
COM_CATEGORIA = {"narguile", "essencias", "headshop", "tabacos", "charutos", "bebidas"}
NOMES = {
    "em-alta": "Em alta", "essencias": "Essências", "narguile": "Narguilé",
    "headshop": "Headshop", "tabacos": "Tabacos", "charutos": "Charutos",
    "cigarros": "Cigarros", "isqueiros": "Isqueiros", "bebidas": "Bebidas",
    "doces": "Doces", "incensos": "Incensos", "conveniencia": "Conveniência",
    "palha": "Cigarros de palha", "cigarrilhas": "Cigarrilhas",
    "outros": "Outros itens", "como-chegar": "Como chegar",
}
MODELO = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{description}">
<link rel="canonical" href="{canon}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Tabacaria Brutt">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="https://tabacariabrutt.com.br/{slug}/">
<meta property="og:image" content="https://tabacariabrutt.com.br/imagens/og-brutt.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Logotipo da Tabacaria Brutt">
<script>
var _nv = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
var _rl = _nv && _nv.type !== "navigate" ? "&rl=1" : "";
location.replace("/?r=" + encodeURIComponent("{slug}" + location.search + location.hash) + _rl);
</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</head>
<body style="background:#0e0806"><a href="/" style="color:#e3ac3d">Abrir a Tabacaria Brutt</a></body>
</html>
"""
for s in SLUGS:
    canon = f"https://tabacariabrutt.com.br/categoria/{s}/" if s in COM_CATEGORIA else "https://tabacariabrutt.com.br/"
    title = f"{NOMES[s]} · Tabacaria Brutt"
    description = (
        "Veja como chegar à Tabacaria Brutt no Conjunto Campinho, em Campo Grande, Rio de Janeiro."
        if s == "como-chegar"
        else f"Confira a seção {NOMES[s]} da Tabacaria Brutt, no Conjunto Campinho, em Campo Grande, Rio de Janeiro."
    )
    os.makedirs(os.path.join(RAIZ, s), exist_ok=True)
    with open(os.path.join(RAIZ, s, "index.html"), "w", encoding="utf-8") as f:
        f.write(MODELO.format(slug=s, canon=canon, title=title, description=description))
print(len(SLUGS), "atalhos gerados")
