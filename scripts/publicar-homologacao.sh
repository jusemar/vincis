#!/usr/bin/env bash
set -euo pipefail

BRANCH="homologacao"
REMOTE="origin"
HOMOLOG_HOST_1="ep-bitter-pine-acqv3tld-pooler.sa-east-1.aws.neon.tech"
HOMOLOG_HOST_2="ep-bitter-pine-acqv3tld.sa-east-1.aws.neon.tech"

falhar() {
  echo
  echo "❌ $*" >&2
  echo "Nenhum passo posterior será executado." >&2
  exit 1
}

etapa() {
  echo
  echo "[$1/7] $2"
}

raiz="$(git rev-parse --show-toplevel 2>/dev/null)" || falhar "Execute dentro do repositório Vincis."
cd "$raiz"

branch="$(git branch --show-current)"
[[ "$branch" == "$BRANCH" ]] || falhar "Branch atual: $branch. A publicação só aceita '$BRANCH'."

etapa 1 "Sincronizando homologação com o GitHub..."
git fetch "$REMOTE" "$BRANCH"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "$REMOTE/$BRANCH")"

if [[ "$local_sha" != "$remote_sha" ]]; then
  if git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
    : # local está à frente; segue normalmente
  elif git merge-base --is-ancestor "$local_sha" "$remote_sha"; then
    [[ -z "$(git status --porcelain --untracked-files=no)" ]] || \
      falhar "A branch local está atrás da remota e possui alterações rastreadas. Sincronização bloqueada para não perder trabalho."
    git merge --ff-only "$REMOTE/$BRANCH"
  else
    falhar "A branch local e a homologação remota divergiram."
  fi
fi

etapa 2 "Preparando alterações para commit..."
git add -u

ignorados=0
while IFS= read -r -d '' arquivo; do
  case "$arquivo" in
    public/images/rede-vincis/*)
      ignorados=$((ignorados + 1))
      ;;
    *)
      git add -- "$arquivo"
      ;;
  esac
done < <(git ls-files --others --exclude-standard -z)

(( ignorados == 0 )) || echo "✓ $ignorados arquivo(s) local(is) de referência ficaram fora do commit."

mapfile -t staged < <(git diff --cached --name-only)
for arquivo in "${staged[@]:-}"; do
  if [[ "$arquivo" =~ (^|/)(\.env($|\.)|\.pgpass$|.*\.(pem|key|p12|pfx)$|credentials?[^/]*$|secrets?[^/]*$) ]]; then
    falhar "Arquivo potencialmente sensível preparado para commit: $arquivo"
  fi
done

pendentes="$(git rev-list --count "$REMOTE/$BRANCH"..HEAD)"
if (( ${#staged[@]} == 0 && pendentes == 0 )); then
  echo
  echo "✓ Homologação já está sincronizada. Nada para publicar."
  exit 0
fi

etapa 3 "Validando projeto..."
npm run typecheck
npm test
npm run build

etapa 4 "Criando commit automaticamente..."
if (( ${#staged[@]} > 0 )); then
  mensagem="chore: atualiza homologacao"

  somente_testes=1
  somente_banco=1
  tem_migration=0
  features=()

  for arquivo in "${staged[@]}"; do
    [[ "$arquivo" == tests/* ]] || somente_testes=0
    [[ "$arquivo" == drizzle/* || "$arquivo" == src/db/* ]] || somente_banco=0
    [[ "$arquivo" == drizzle/* ]] && tem_migration=1
    if [[ "$arquivo" =~ ^src/features/([^/]+)/ ]]; then
      features+=("${BASH_REMATCH[1]}")
    fi
  done

  if (( somente_testes == 1 )); then
    mensagem="test: atualiza testes da homologacao"
  elif (( somente_banco == 1 )); then
    mensagem="chore: atualiza banco de dados da homologacao"
  else
    feature_unica="$(printf '%s\n' "${features[@]:-}" | sed '/^$/d' | sort -u | head -n 2)"
    if [[ -n "$feature_unica" && "$(printf '%s\n' "$feature_unica" | wc -l)" -eq 1 ]]; then
      mensagem="feat: atualiza ${feature_unica//-/ }"
    elif (( tem_migration == 1 )); then
      mensagem="feat: atualiza aplicacao e banco de dados"
    fi
  fi

  resumo="Publicação automática para homologação.\n\nArquivos (${#staged[@]}):"
  limite=12
  for ((i=0; i<${#staged[@]} && i<limite; i++)); do
    resumo+="\n- ${staged[$i]}"
  done
  if (( ${#staged[@]} > limite )); then
    resumo+="\n- ... e mais $((${#staged[@]} - limite)) arquivo(s)"
  fi

  git commit -m "$mensagem" -m "$(printf '%b' "$resumo")"
else
  echo "✓ Nenhuma alteração nova; há commit(s) local(is) pendente(s) de publicação."
fi

etapa 5 "Confirmando banco e aplicando migrations pendentes..."
[[ -n "${DATABASE_URL:-}" ]] || falhar "DATABASE_URL não foi carregada do .env."
host="$(node -e 'try{console.log(new URL(process.env.DATABASE_URL).hostname)}catch{process.exit(1)}')" || true
[[ -n "$host" ]] || falhar "DATABASE_URL inválida."
[[ "$host" == "$HOMOLOG_HOST_1" || "$host" == "$HOMOLOG_HOST_2" ]] || \
  falhar "PUBLICAÇÃO BLOQUEADA: DATABASE_URL aponta para '$host', não para o Neon de homologação."
echo "✓ Banco confirmado como homologação: $host"
npm run db:online:migrar

etapa 6 "Enviando commit para homologação..."
git push "$REMOTE" "$BRANCH"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" | awk '{print $1}')"
[[ "$local_sha" == "$remote_sha" ]] || falhar "O SHA remoto não corresponde ao commit local após o push."
echo "✓ GitHub confirmado no commit ${local_sha:0:8}."

etapa 7 "Deploy de homologação..."
if [[ -f .vercel/project.json ]]; then
  projeto="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).projectName||'')}catch{}")"
  if [[ -n "$projeto" && "$projeto" != "vincis-homologacao" ]]; then
    echo "⚠ Vercel local está vinculada a '$projeto'. O push foi concluído; não farei deploy manual."
  else
    echo "✓ Push concluído. A integração Git da Vercel inicia o deploy da homologação automaticamente."
  fi
else
  echo "✓ Push concluído. A integração Git da Vercel inicia o deploy da homologação automaticamente."
fi

echo
echo "✅ HOMOLOGAÇÃO PUBLICADA COM SUCESSO."
