# Budget de uso BRUTO (include_credit = false) com 2 ações automáticas:
# para o EC2 e o RDS quando o uso atinge o limite. Durável, nativo da AWS.
# Atenção: dados de billing têm atraso (~6-24h), então a parada não é instantânea.

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

  # Avisos por email antes de parar.
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

# --- Role que o AWS Budgets assume pra executar as ações ---
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "budget_action" {
  name               = "${var.name}-budget-action"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

# Managed policy da AWS com as permissões pra parar EC2/RDS via SSM.
resource "aws_iam_role_policy_attachment" "budget_action" {
  role       = aws_iam_role.budget_action.name
  policy_arn = "arn:aws:iam::aws:policy/AWSBudgetsActionsWithAWSResourceControlAccess"
}

# --- Ação 1: parar o EC2 ao atingir $1 (absoluto) ---
resource "aws_budgets_budget_action" "stop_ec2" {
  budget_name        = aws_budgets_budget.this.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "ABSOLUTE_VALUE"
    action_threshold_value = var.limit_amount
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      region          = var.region
      instance_ids    = [var.ec2_instance_id]
    }
  }

  subscriber {
    address           = var.alert_email
    subscription_type = "EMAIL"
  }
}

# --- Ação 2: parar o RDS ao atingir $1 (absoluto) ---
resource "aws_budgets_budget_action" "stop_rds" {
  budget_name        = aws_budgets_budget.this.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "ABSOLUTE_VALUE"
    action_threshold_value = var.limit_amount
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_RDS_INSTANCES"
      region          = var.region
      instance_ids    = [var.rds_instance_identifier]
    }
  }

  subscriber {
    address           = var.alert_email
    subscription_type = "EMAIL"
  }
}
