#!/usr/bin/env bash
#
# Bootstrap do deploy por ARTEFATO — ponto de entrada rodado via SSM na EC2.
#
# Irmão do bootstrap-deploy.sh (que clona e builda no host): aqui a release
# chega PRONTA do runner do GitHub (fonte + .next buildado) num tarball no S3.
# O host só instala deps nativas (aarch64), valida e flipa — o build de
# 25-35min sai do t4g.micro.
#
# Passos:
#   1. garante swap (npm ci ainda aperta 1GB de RAM)
#   2. baixa e extrai o tarball em releases/<timestamp>-<sha>
#   3. executa infra/deploy.sh DENTRO da release com DEPLOY_PREBUILT=1
#      (npm ci + prisma generate + health 3001 + migrate + flip + rollback)
#
# Uso (via SSM send-command, como root):
#   bash infra/bootstrap-deploy-artifact.sh s3://<bucket>/deploys/<sha>.tar.gz <sha-curto>
set -euo pipefail

APP_ROOT=/opt/myfinance
RELEASES="$APP_ROOT/releases"

S3_URI="${1:?uso: bootstrap-deploy-artifact.sh s3://bucket/chave.tar.gz sha-curto}"
SHA="${2:?informe o sha curto do commit}"

log() { echo "[bootstrap-artifact] $*"; }

# 1. swap (mesma guarda do bootstrap clássico)
if ! swapon --show | grep -q /swapfile; then
  log "criando swap de 4G"
  dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >>/etc/fstab
fi

mkdir -p "$RELEASES"

# 2. baixa e extrai o artefato numa release nova
STAMP="$(date +%Y%m%d%H%M%S)"
REL="$RELEASES/${STAMP}-${SHA}"
TARBALL="/tmp/deploy-${SHA}.tar.gz"
log "baixando $S3_URI"
aws s3 cp "$S3_URI" "$TARBALL" --only-show-errors
mkdir -p "$REL"
tar -xzf "$TARBALL" -C "$REL"
rm -f "$TARBALL"
log "release extraída: $REL"

# 3. deploy atômico a partir da release (build já veio pronto)
cd "$REL"
DEPLOY_PREBUILT=1 exec bash infra/deploy.sh
