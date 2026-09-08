#!/usr/bin/env bash
#
# Leva pro Lightsail o que NÃO passa pelo Terraform nem pelo user_data:
#   - JWT_SECRET / BRAPI_API_KEY / CRON_SECRET (lidos do app.env da EC2 via SSM,
#     pra sessões e crons continuarem válidos após o cutover)
#   - credencial IAM do backup (terraform output) -> /root/.aws/credentials
#
# Roda da máquina do operador (profile myfinance + chave ~/.ssh/myfinance-lightsail).
# Idempotente: reescreve as 3 linhas no app.env e o arquivo de credenciais.
#
# Uso: bash infra/lightsail-push-env.sh <ip-do-lightsail>
set -euo pipefail

HOST="${1:?uso: lightsail-push-env.sh <ip>}"
PROFILE="${AWS_PROFILE:-myfinance}"
REGION=sa-east-1
EC2_ID=i-09099b2b041adcdb6
KEY="${SSH_KEY:-$HOME/.ssh/myfinance-lightsail}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$HOST"

log() { echo "[push-env] $*"; }

# 1) segredos compartilhados: lidos da EC2 por SSM, nunca impressos
log "lendo segredos da EC2 via SSM"
CID=$(aws ssm send-command --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$EC2_ID" --document-name AWS-RunShellScript \
  --parameters '{"commands":["grep -E \"^(JWT_SECRET|BRAPI_API_KEY|CRON_SECRET)=\" /etc/myfinance/app.env"]}' \
  --query Command.CommandId --output text)
for _ in $(seq 1 20); do
  ST=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$CID" --instance-id "$EC2_ID" --query Status --output text 2>/dev/null || echo Pending)
  case "$ST" in Success|Failed|Cancelled|TimedOut) break ;; esac
  sleep 2
done
[ "$ST" = Success ] || { log "SSM falhou: $ST"; exit 1; }
SECRETS=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
  --command-id "$CID" --instance-id "$EC2_ID" --query StandardOutputContent --output text)
[ "$(echo "$SECRETS" | grep -c '=')" = 3 ] || { log "esperava 3 segredos"; exit 1; }

# 2) credencial do backup: do state do terraform
log "lendo credencial de backup do terraform"
cd "$(dirname "$0")"
AK=$(terraform output -raw lightsail_backup_access_key_id)
SK=$(terraform output -raw lightsail_backup_secret_access_key)

# 3) aplica no host (sem eco dos valores)
log "gravando no host $HOST"
$SSH 'sudo bash -s' <<EOF
set -euo pipefail
ENV=/etc/myfinance/app.env
sed -i '/^\(JWT_SECRET\|BRAPI_API_KEY\|CRON_SECRET\)=/d' "\$ENV"
cat >>"\$ENV" <<'SEC'
$SECRETS
SEC
chmod 600 "\$ENV"; chown myfinance:myfinance "\$ENV"
mkdir -p /root/.aws; chmod 700 /root/.aws
cat >/root/.aws/credentials <<'CRED'
[default]
aws_access_key_id = $AK
aws_secret_access_key = $SK
CRED
chmod 600 /root/.aws/credentials
echo "app.env agora tem: \$(cut -d= -f1 \$ENV | grep -v '^#' | grep . | tr '\n' ' ')"
EOF
log "ok"
