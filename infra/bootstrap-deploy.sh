#!/usr/bin/env bash
#
# Bootstrap do deploy atômico — ponto de entrada rodado via SSM na EC2.
# Estável e pequeno (raramente muda); a lógica de verdade é versionada em
# infra/deploy.sh, executada a partir da release recém-clonada.
#
# Passos:
#   1. garante swap (build estoura 1GB de RAM na t4g.micro)
#   2. clona main em releases/<timestamp>-<sha> usando o token do SSM
#   3. executa infra/deploy.sh DENTRO da release (build → health → flip → rollback)
#
# Uso (via SSM send-command, como root):
#   bash infra/bootstrap-deploy.sh
set -euo pipefail

APP_ROOT=/opt/myfinance
RELEASES="$APP_ROOT/releases"
REGION=sa-east-1
REPO=HuskeLuv/SFC

log() { echo "[bootstrap] $*"; }

# 1. swap
if ! swapon --show | grep -q /swapfile; then
  log "criando swap de 4G"
  dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >>/etc/fstab
fi

mkdir -p "$RELEASES"

# 2. clona main numa release nova (token só vive aqui; nunca em log — sem set -x)
TOKEN="$(aws ssm get-parameter --name /myfinance/prod/GITHUB_TOKEN --with-decryption \
  --region "$REGION" --query Parameter.Value --output text)"
STAMP="$(date +%Y%m%d%H%M%S)"
REL_TMP="$RELEASES/${STAMP}-pending"
git clone --depth 1 -b main "https://${TOKEN}@github.com/${REPO}.git" "$REL_TMP" >/dev/null 2>&1
git -C "$REL_TMP" remote set-url origin "https://github.com/${REPO}.git" # scrub do token
SHA="$(git -C "$REL_TMP" rev-parse --short HEAD)"
REL="$RELEASES/${STAMP}-${SHA}"
mv "$REL_TMP" "$REL"
log "release clonada: $REL ($(git -C "$REL" log -1 --pretty=%s))"

# 3. deploy atômico a partir da release
cd "$REL"
exec bash infra/deploy.sh
