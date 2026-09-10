# Budget de uso BRUTO (include_credit = false) da conta inteira, só alerta por
# e-mail em 80% e 100%. Até 10/09/2026 tinha duas ações automáticas (parar EC2
# e RDS via SSM); saíram na Fase 3 da migração pro Lightsail junto com as
# máquinas (docs/plano-migracao-lightsail-set2026.md).
# Atenção: dados de billing têm atraso (~6-24h).

resource "aws_budgets_budget" "this" {
  name         = "${var.name}-usage-cap"
  budget_type  = "COST"
  limit_amount = var.limit_amount
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Medir uso BRUTO de infraestrutura: não subtrair créditos (senão ficaria $0),
  # mas EXCLUIR o plano de Support ($29/mês), assinaturas e impostos — senão o
  # budget conta a taxa de suporte como "uso" e dispara à toa.
  cost_types {
    include_credit             = false
    include_refund             = false
    include_upfront            = true
    include_recurring          = true
    include_other_subscription = false
    include_subscription       = false
    include_support            = false
    include_tax                = false
    use_blended                = false
    use_amortized              = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
