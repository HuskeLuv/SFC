#!/usr/bin/env bash
#
# Deploy atômico — roda DENTRO da release já clonada (cwd = a release nova).
#
# Fluxo seguro:
#   1. instala deps + builda NA release nova (a release atual segue servindo)
#   2. valida /api/health numa PORTA ALTERNATIVA antes de qualquer flip
#   3. prisma migrate deploy
#   4. troca o symlink `current` atomicamente + reinicia o serviço
#   5. valida /api/health na porta real; se falhar, ROLLBACK automático pro symlink anterior
#   6. mantém só as últimas N releases
#
# Pré-condições (criadas pela migração one-time — ver infra/DEPLOY.md):
#   - /opt/myfinance/releases/      (releases versionadas)
#   - /opt/myfinance/current        (symlink pra release ativa; systemd aponta aqui)
#   - /etc/myfinance/app.env        (EnvironmentFile do systemd)
#
# NÃO lida com o token do GitHub — quem clona é o bootstrap (infra/bootstrap-deploy.sh).
set -euo pipefail

APP_ROOT=/opt/myfinance
CURRENT="$APP_ROOT/current"
RELEASES="$APP_ROOT/releases"
SERVICE=myfinance
ENV_FILE=/etc/myfinance/app.env
HEALTH_PORT=3001
KEEP=5

REL="$(pwd)"
log() { echo "[deploy] $*"; }

[ -f "$ENV_FILE" ] || {
  echo "[deploy] ERRO: env $ENV_FILE ausente"
  exit 1
}
case "$REL" in
  "$RELEASES"/*) : ;;
  *)
    echo "[deploy] ERRO: cwd ($REL) não está em $RELEASES — rode dentro da release clonada"
    exit 1
    ;;
esac

# Carrega env SEM `source` (DATABASE_URL tem & que o shell interpretaria).
set -a
while IFS='=' read -r k v; do case "$k" in [A-Za-z_]*) export "$k=$v" ;; esac; done <"$ENV_FILE"
set +a

log "deps em $REL"
npm ci --include=dev
npx prisma generate
export NODE_OPTIONS=--max-old-space-size=3072
log "build (release atual segue servindo)"
npm run build

log "health-check da nova release na porta $HEALTH_PORT (antes do flip)"
npm run start -- -p "$HEALTH_PORT" >/tmp/deploy-healthcheck.log 2>&1 &
HC_PID=$!
ok=0
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$HEALTH_PORT/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
kill "$HC_PID" 2>/dev/null || true
wait "$HC_PID" 2>/dev/null || true
[ "$ok" = 1 ] || {
  log "ABORTADO: nova release não passou no health-check (porta $HEALTH_PORT) — current intocado"
  exit 1
}
log "nova release saudável na porta alternativa"

log "prisma migrate deploy"
npx prisma migrate deploy

PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"
log "flip atômico: current -> $REL (anterior: ${PREV:-nenhuma})"
ln -sfn "$REL" "$CURRENT"
chown -h myfinance:myfinance "$CURRENT"
chown -R myfinance:myfinance "$REL"
systemctl restart "$SERVICE"

log "health pós-restart (porta 3000)"
ok=0
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:3000/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  log "HEALTH PÓS-RESTART FALHOU"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    log "ROLLBACK -> $PREV"
    ln -sfn "$PREV" "$CURRENT"
    chown -h myfinance:myfinance "$CURRENT"
    systemctl restart "$SERVICE"
    log "rollback aplicado"
  else
    log "sem release anterior pra rollback — INTERVENÇÃO MANUAL necessária"
  fi
  exit 1
fi
log "DEPLOY OK -> $REL"

# Prune: mantém as KEEP releases mais novas (nunca remove a current).
mapfile -t old < <(ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)))
for d in "${old[@]:-}"; do
  [ -z "$d" ] && continue
  [ "$(readlink -f "$d")" = "$(readlink -f "$CURRENT")" ] && continue
  rm -rf "$d" && log "pruned $d"
done
