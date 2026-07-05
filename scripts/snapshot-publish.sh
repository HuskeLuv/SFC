#!/usr/bin/env bash
#
# snapshot-publish.sh — Publica um snapshot limpo do HEAD para um repositório
# de destino (GitLab/Bitbucket/etc.), sem levar o histórico interno.
#
# - Pega APENAS os arquivos commitados no HEAD da main (git archive).
# - Trabalha numa pasta temporária: NUNCA toca no seu working tree.
# - Não inclui .env, arquivos não versionados nem nada fora do HEAD.
#
# Uso:
#   scripts/snapshot-publish.sh <URL_DESTINO> [--overwrite] [--branch main]
#
# Modos:
#   (padrão)      append   -> adiciona um novo commit "Snapshot <data>" no destino.
#   --overwrite            -> destino fica com 1 único commit (force-push). Apaga histórico/branch.
#
# Exemplos:
#   scripts/snapshot-publish.sh git@gitlab.com:grupo/projeto.git
#   scripts/snapshot-publish.sh git@gitlab.com:grupo/projeto.git --overwrite
#
set -euo pipefail

DEST="${1:-}"
if [ -z "$DEST" ]; then
  echo "ERRO: informe a URL do repositório de destino." >&2
  echo "Uso: $0 <URL_DESTINO> [--overwrite] [--branch main]" >&2
  exit 1
fi
shift

MODE="append"
BRANCH="main"
while [ $# -gt 0 ]; do
  case "$1" in
    --overwrite) MODE="overwrite"; shift ;;
    --branch)    BRANCH="${2:?--branch precisa de um valor}"; shift 2 ;;
    *) echo "ERRO: argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

SRC="$(git rev-parse --show-toplevel)"
REV="$(git -C "$SRC" rev-parse --short HEAD)"
DATE="$(date +%Y-%m-%d)"
MSG="Snapshot $DATE (origem $REV)"

# Identidade para os commits de snapshot (o repo temporário não herda a config
# local do repo de origem). Usa a do repo de origem, com fallback genérico.
GIT_NAME="$(git -C "$SRC" config user.name || true)"
GIT_EMAIL="$(git -C "$SRC" config user.email || true)"
GIT_NAME="${GIT_NAME:-snapshot-bot}"
GIT_EMAIL="${GIT_EMAIL:-snapshot@localhost}"
export GIT_AUTHOR_NAME="$GIT_NAME"  GIT_AUTHOR_EMAIL="$GIT_EMAIL"
export GIT_COMMITTER_NAME="$GIT_NAME" GIT_COMMITTER_EMAIL="$GIT_EMAIL"

# Caminhos (relativos à raiz do repo) a NÃO incluir no snapshot, mesmo estando
# commitados no SFC. Útil para não expor docs internos no repo de handoff.
EXCLUDES=(
  "README.md"
)

strip_excludes() {
  local dest="$1" path
  for path in "${EXCLUDES[@]}"; do
    rm -rf "$dest/$path"
  done
}

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo ">> Origem:  $SRC @ $REV"
echo ">> Destino: $DEST (branch $BRANCH, modo $MODE)"

if [ "$MODE" = "append" ]; then
  # Tenta clonar o destino para acumular um novo commit sobre o que já existe.
  if git clone --quiet --depth 1 --branch "$BRANCH" "$DEST" "$TMP/dest" 2>/dev/null; then
    cd "$TMP/dest"
    # Limpa tudo (exceto .git) e repõe com o conteúdo do HEAD de origem.
    find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
  else
    # Destino vazio/sem a branch: inicializa do zero.
    mkdir -p "$TMP/dest"
    cd "$TMP/dest"
    git init --quiet -b "$BRANCH"
    git remote add origin "$DEST"
  fi
  git -C "$SRC" archive --format=tar HEAD | tar -x -C "$TMP/dest"
  strip_excludes "$TMP/dest"
  git add -A
  if git diff --cached --quiet; then
    echo ">> Nenhuma mudança desde o último snapshot. Nada a publicar."
    exit 0
  fi
  git commit --quiet -m "$MSG"
  git push origin "HEAD:$BRANCH"
else
  # overwrite: repo novo a cada vez, 1 commit só, force-push.
  mkdir -p "$TMP/dest"
  cd "$TMP/dest"
  git init --quiet -b "$BRANCH"
  git -C "$SRC" archive --format=tar HEAD | tar -x -C "$TMP/dest"
  strip_excludes "$TMP/dest"
  git add -A
  git commit --quiet -m "$MSG"
  git remote add origin "$DEST"
  git push --force origin "HEAD:$BRANCH"
fi

echo ">> Snapshot publicado: $MSG"
