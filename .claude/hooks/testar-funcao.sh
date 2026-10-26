#!/usr/bin/env bash
# Depois de editar um arquivo de supabase/functions/<nome>/, roda os testes dessa função.
# Teste falhou = devolve o erro para o Claude (exit 2) consertar antes de seguir.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$f" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in "$raiz"/*) rel="${f#"$raiz"/}" ;; *) rel="$f" ;; esac
case "$rel" in supabase/functions/*/*) ;; *) exit 0 ;; esac
fn=$(echo "$rel" | cut -d/ -f3)
shopt -s nullglob
testes=("$raiz/supabase/functions/$fn"/*.test.mts)
[ ${#testes[@]} -eq 0 ] && exit 0
for t in "${testes[@]}"; do
  if ! saida=$(cd "$raiz" && timeout 90 node --experimental-strip-types "$t" 2>&1); then
    echo "Os testes de $fn falharam ($(basename "$t")). Conserte antes de continuar:" >&2
    echo "$saida" | grep -v "MODULE_TYPELESS\|Reparsing as ES\|To eliminate this warning\|trace-warnings" | tail -40 >&2
    exit 2
  fi
done
exit 0
