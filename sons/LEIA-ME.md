# Sons da loja

Pacote de sons de interface enviado pela loja (os nomes são os do pacote original; os arquivos foram
convertidos para MP3 mono 64 kbps, que todo navegador toca, inclusive o Safari do iPhone).
Quem toca é `js/sons.js` (`SOM.toca("ação")`). Para trocar um som, mude o arquivo no `MAPA` de lá.

**Só sons graves e "ocos" (18/10/2026, pedido da loja).** Ficaram só os arquivos com quase toda a energia
abaixo de 800 Hz; cliques, setas, abrir/fechar, Brutt IA, copiar, Pix e as confirmações agudas saíram
(ação fora do `MAPA` fica em silêncio). Filtro passa-baixa em 2 kHz e volume geral `VOL` .29.

| Ação no site | Nome no `MAPA` | Arquivo |
|---|---|---|
| Produto adicionado ao carrinho (e ao ligar o som) | `add` | drop_002 |
| Item removido / carrinho limpo | `remove` | minimize_008 |
| "Toque de novo pra limpar" | `aviso` | question_004 |
| Falta preencher algo / esgotado / limite de estoque | `erro` | error_004 (0,8×) |
| Pagamento recusado / Pix vencido | `falha` | error_006 |
| Endereço de entrega confirmado | `confirma` | drop_002 (0,85×) |
| Pagamento confirmado | `pago` | drop_002 (0,7×, mais grave) |

Para pôr um som de volta numa ação, escolha um arquivo grave (meça antes) e acrescente a linha no `MAPA`.
