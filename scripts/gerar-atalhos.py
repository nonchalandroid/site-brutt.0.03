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
MODELO = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Tabacaria Brutt · Tabacaria em Campo Grande RJ</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="{canon}">
<!-- gerado por scripts/gerar-atalhos.py: atalho de seção, leva à loja aberta em "{slug}" -->
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
    os.makedirs(os.path.join(RAIZ, s), exist_ok=True)
    with open(os.path.join(RAIZ, s, "index.html"), "w", encoding="utf-8") as f:
        f.write(MODELO.format(slug=s, canon=canon))
print(len(SLUGS), "atalhos gerados")
