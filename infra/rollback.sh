#!/usr/bin/env bash
#
# Rollback manual — aponta `current` pra release mais nova ANTERIOR à atual e
# reinicia o serviço. Uso (via SSM, como root):
#   bash /opt/myfinance/current/infra/rollback.sh
# (ou aponte pra qualquer release: bash infra/rollback.sh /opt/myfinance/releases/<dir>)
set -euo pipefail

APP_ROOT=/opt/myfinance
CURRENT="$APP_ROOT/current"
RELEASES="$APP_ROOT/releases"
SERVICE=myfinance

CUR="$(readlink -f "$CURRENT" 2>/dev/null || true)"
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  # release mais nova que não seja a atual
  TARGET="$(ls -1dt "$RELEASES"/*/ 2>/dev/null | while read -r d; do
    [ "$(readlink -f "$d")" != "$CUR" ] && echo "${d%/}" && break
  done)"
fi
[ -n "$TARGET" ] && [ -d "$TARGET" ] || {
  echo "[rollback] nenhuma release-alvo válida"
  exit 1
}

echo "[rollback] current: ${CUR:-nenhuma} -> $TARGET"
ln -sfn "$TARGET" "$CURRENT"
chown -h myfinance:myfinance "$CURRENT"
systemctl restart "$SERVICE"

ok=0
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:3000/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
[ "$ok" = 1 ] && echo "[rollback] OK -> $TARGET" || {
  echo "[rollback] health ainda falha após rollback"
  exit 1
}
