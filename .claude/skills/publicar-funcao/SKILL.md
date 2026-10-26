---
name: publicar-funcao
description: Publica de novo uma função do Supabase (checkout, brutt-ia, sync-nex…) depois que o código mudou no GitHub — roda os testes, troca o commit fixado, publica e confere que a versão subiu. Use sempre que um arquivo em supabase/functions/ mudar e for para a main.
argument-hint: "<nome-da-função> [commit]"
disable-model-invocation: true
---

# Publicar uma função do Supabase

Projeto Supabase: `vedlxtljilsanykmddtj`. Mudar o arquivo no GitHub **não** muda o servidor. Por isso o
CLAUDE.md repete "publique de novo `checkout` e `brutt-ia`": em 18/10/2026 o site já cobrava a taxa nova e o
servidor ainda recusava endereços.

Argumento: `$ARGUMENTS` = nome da função (pasta em `supabase/functions/`) e, opcional, o commit.
Mais de uma função (ex.: `checkout brutt-ia`) = repita os passos para cada uma.

## Como cada função é publicada

| Função | Jeito | verify_jwt |
|---|---|---|
| `checkout` | **commit fixado** (importa o `index.ts` do GitHub; o `push.ts` vem junto pelo import relativo) | **false** (webhook do Mercado Pago e loja sem login) |
| `brutt-ia` | commit fixado | true |
| `sync-nex` | commit fixado | true |
| `gerar-ficha-sommelier` | commit fixado | true |
| `equipe` | commit fixado | true |
| `buscar-foto` | **direto** (manda o arquivo inteiro) | true |
| `geoapify-autocomplete` | direto | true |
| `fotos-mini` | direto | **false** (chamada pelo banco com `x-sync-secret`) |
| `avaliacoes` | direto (sem uso) | true |

Na dúvida, leia a versão no ar com `get_edge_function` antes: se o `index.ts` publicado só tem um
`import "https://raw.githubusercontent.com/…"`, é commit fixado. **Mantenha o `verify_jwt` que está no ar**
(`list_edge_functions` mostra): trocar quebra o pagamento ou a sincronização.

## Passos

1. **Código na main.** Publique só código que já está na `main` do GitHub (o dono aprova os PRs).
   `git fetch origin main` e pegue o SHA: `git rev-parse origin/main`, ou o commit passado no argumento.
   Confira que o arquivo da função nesse commit é o esperado:
   `git show <sha>:supabase/functions/<fn>/index.ts | head`.
2. **Testes.** Se existir `supabase/functions/<fn>/*.test.mts`, rode cada um com
   `node --experimental-strip-types <arquivo>`. Falhou = **pare** e conserte (nunca publique com teste vermelho).
3. **Guarde a versão atual** (para voltar atrás): `get_edge_function` → anote o `version` e o commit do import.
4. **Publique** com `deploy_edge_function` (mesmo `name`, `entrypoint_path: "index.ts"`, `verify_jwt` igual ao atual):
   - *Commit fixado:* um único `index.ts` igual ao atual, só trocando o SHA:
     ```ts
     // Código versionado no GitHub (commit fixo): supabase/functions/<fn>/index.ts
     // Para atualizar, troque o commit abaixo e publique de novo (skill /publicar-funcao).
     import "https://raw.githubusercontent.com/nonchalandroid/site-brutt.0.03/<SHA>/supabase/functions/<fn>/index.ts";
     ```
   - *Direto:* mande o conteúdo de `supabase/functions/<fn>/index.ts` desse commit (e os outros arquivos da pasta
     que ele importa, menos os `.test.mts`).
5. **Confira:**
   - `list_edge_functions`: o `version` subiu e o status é `ACTIVE`.
   - `get_edge_function`: o import aponta para o SHA novo.
   - `query_logs` / `get_logs` do Supabase (serviço `edge-function`) alguns segundos depois: sem `boot error` / `worker failed`.
   - Quando der, uma chamada simples pelo banco (`net.http_get`/`net.http_post` e leitura em `net._http_response`),
     por exemplo `checkout?acao=push_chave` ou `geoapify-autocomplete?warm=1`, deve responder 200.
6. **Deu errado?** Publique de novo com o SHA (ou o conteúdo) anotado no passo 3 e avise o dono.
7. **Atualize o CLAUDE.md** se ele cita a versão publicada da função (ex.: "Publicada a v18").

## Relatório ao dono (português simples)

Uma linha por função: o nome, "publicada (versão N)", o que muda para a loja em uma frase e se a conferência passou.
Sem jargão: "a Brutt IA já está usando as regras novas", não "deploy do commit abc123".
