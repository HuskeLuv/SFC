# Composição raiz — produção no Lightsail (app + Postgres numa máquina só).
#
# Histórico: até 08/09/2026 a topologia era vpc -> rds -> ec2 + SSM (secrets) +
# role OIDC pro deploy via S3/SSM. Migrada pro Lightsail (plano, cutover e
# descomissionamento em docs/plano-migracao-lightsail-set2026.md); os módulos
# vpc/rds/ec2, os parâmetros SSM e a role OIDC foram destruídos na Fase 3
# (10/09/2026).

data "aws_caller_identity" "current" {}

locals {
  name = "${var.project}-${var.env}"
  tags = { Component = "infra" }
}

# Alerta de custo da conta inteira (uso bruto, sem créditos/impostos/suporte):
# só e-mail em 80% e 100% de var.budget_cap_usd. As ações automáticas de parada
# (EC2/RDS) saíram junto com essas máquinas.
module "budget" {
  source = "./modules/budget"

  name         = local.name
  limit_amount = var.budget_cap_usd
  alert_email  = var.alert_email

  tags = local.tags
}

# --- Lightsail: app + Postgres numa máquina só ---
module "lightsail" {
  count  = var.lightsail_enabled ? 1 : 0
  source = "./modules/lightsail"

  name           = local.name
  region         = var.region
  account_id     = data.aws_caller_identity.current.account_id
  bundle_id      = var.lightsail_bundle_id
  ssh_public_key = var.lightsail_ssh_public_key
  domain_name    = var.lightsail_domain_name
  db_name        = var.db_name
  db_username    = var.db_username
  alert_email    = var.alert_email

  tags = local.tags
}

# Alerta (só e-mail, não desliga nada) de orçamento do serviço Lightsail:
# plano small = US$12 fixo + snapshots/backup ~US$1; avisa em 80% e 100% de US$15.
resource "aws_budgets_budget" "lightsail" {
  count = var.lightsail_enabled ? 1 : 0

  name         = "${local.name}-lightsail-cap"
  budget_type  = "COST"
  limit_amount = "15"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Lightsail"]
  }

  dynamic "notification" {
    for_each = [80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}
