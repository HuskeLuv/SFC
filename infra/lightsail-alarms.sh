#!/usr/bin/env bash
#
# Alarmes do Lightsail (grátis). O provider Terraform não tem recurso pra
# alarme/contato do Lightsail, então vai por CLI. Idempotente (put-alarm sobrescreve).
#
#   - burst de CPU abaixo de 20% por 30 min  -> vai faltar CPU, subir de plano
#   - status check falhando por 10 min       -> máquina fora
#
# Uso: bash infra/lightsail-alarms.sh [nome-da-instancia] [email]
set -euo pipefail
INSTANCE="${1:-myfinance-prod-app}"
EMAIL="${2:-suporte@appmyfinance.com.br}"
PROFILE="${AWS_PROFILE:-myfinance}"
REGION=sa-east-1
A=(aws lightsail --profile "$PROFILE" --region "$REGION")

# contato por e-mail (precisa confirmar o e-mail uma vez, a AWS manda o link)
if ! "${A[@]}" get-contact-methods --protocols Email --query 'contactMethods[?contactEndpoint==`'"$EMAIL"'`].name' --output text | grep -q .; then
  "${A[@]}" create-contact-method --protocol Email --contact-endpoint "$EMAIL" >/dev/null
  echo "contato criado: confirme o e-mail enviado para $EMAIL"
fi

"${A[@]}" put-alarm --alarm-name "$INSTANCE-cpu-burst-low" \
  --monitored-resource-name "$INSTANCE" --metric-name BurstCapacityPercentage \
  --comparison-operator LessThanOrEqualToThreshold --threshold 20 \
  --evaluation-periods 6 --datapoints-to-alarm 6 \
  --contact-protocols Email --notification-triggers ALARM OK >/dev/null
"${A[@]}" put-alarm --alarm-name "$INSTANCE-status-check" \
  --monitored-resource-name "$INSTANCE" --metric-name StatusCheckFailed \
  --comparison-operator GreaterThanOrEqualToThreshold --threshold 1 \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --contact-protocols Email --notification-triggers ALARM OK >/dev/null
echo "alarmes ok:"; "${A[@]}" get-alarms --monitored-resource-name "$INSTANCE" --query 'alarms[].[name,state]' --output text
