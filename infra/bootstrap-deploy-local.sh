#!/usr/bin/env bash
#
# Bootstrap do deploy por ARTEFATO LOCAL — ponto de entrada rodado por SSH no
# Lightsail (sudo). Irmão do bootstrap-deploy-artifact.sh (que baixa do S3 via
# SSM na EC2): aqui o tarball já chegou por scp.
#
# Passos:
#   1. garante swap (npm ci aperta 2 GB dividido com o Postgres)
#   2. extrai o tarball em releases/<timestamp>-<sha>
#   3. executa infra/deploy.sh DENTRO da release com DEPLOY_PREBUILT=1
#      (npm ci + prisma generate + health 3001 + migrate + flip + rollback)
#
# Uso (como root):
#   bash infra/bootstrap-deploy-local.sh /tmp/deploy-<sha>.tar.gz <sha-curto>
set -euo pipefail

APP_ROOT=/opt/myfinance
RELEASES="$APP_ROOT/releases"

TARBALL="${1:?uso: bootstrap-deploy-local.sh /caminho/deploy.tar.gz sha-curto}"
SHA="${2:?informe o sha curto do commit}"
[ -s "$TARBALL" ] || { echo "[bootstrap-local] tarball ausente: $TARBALL"; exit 1; }

log() { echo "[bootstrap-local] $*"; }

# 1. swap (o provision já cria 2 G; guarda pra máquina reprovisionada à mão)
if ! swapon --show | grep -q /swapfile; then
  log "criando swap de 2G"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >>/etc/fstab
fi

mkdir -p "$RELEASES"

# 2. extrai numa release nova
STAMP="$(date +%Y%m%d%H%M%S)"
REL="$RELEASES/${STAMP}-${SHA}"
mkdir -p "$REL"
tar -xzf "$TARBALL" -C "$REL"
rm -f "$TARBALL"
log "release extraída: $REL"

# 3. deploy atômico (build já veio pronto do runner)
cd "$REL"
DEPLOY_PREBUILT=1 exec bash infra/deploy.sh
