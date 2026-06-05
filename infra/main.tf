# Composição raiz: vpc -> rds -> ec2 + SSM (secrets) + regra RDS<-EC2.

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# KMS key default do SSM (cifra os SecureString) — pro EC2 ter kms:Decrypt escopado.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

locals {
  name = "${var.project}-${var.env}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  tags = { Component = "infra" }

  # ARN do path SSM dos secrets. GetParametersByPath autoriza contra o path;
  # GetParameter contra os params folha (path/*). Concede os dois.
  ssm_path_arn = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/${var.env}"
}

module "vpc" {
  source = "./modules/vpc"

  name = local.name
  azs  = local.azs
  tags = local.tags
}

module "rds" {
  source = "./modules/rds"

  name               = local.name
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  db_name     = var.db_name
  db_username = var.db_username
  db_password = var.db_password

  tags = local.tags
}

# --- Secrets no SSM Parameter Store (SecureString) ---
resource "aws_ssm_parameter" "database_url" {
  name        = "/${var.project}/${var.env}/DATABASE_URL"
  description = "Connection string do app pro RDS"
  type        = "SecureString"
  value       = "postgresql://${var.db_username}:${var.db_password}@${module.rds.endpoint}:5432/${var.db_name}?connection_limit=5&sslmode=require"
  tags        = local.tags
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project}/${var.env}/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret
  tags  = local.tags
}

resource "aws_ssm_parameter" "brapi_api_key" {
  name  = "/${var.project}/${var.env}/BRAPI_API_KEY"
  type  = "SecureString"
  value = var.brapi_api_key
  tags  = local.tags
}

resource "aws_ssm_parameter" "cron_secret" {
  name  = "/${var.project}/${var.env}/CRON_SECRET"
  type  = "SecureString"
  value = var.cron_secret
  tags  = local.tags
}

module "ec2" {
  source = "./modules/ec2"

  name             = local.name
  vpc_id           = module.vpc.vpc_id
  public_subnet_id = module.vpc.public_subnet_ids[0]
  instance_type    = var.instance_type
  domain_name      = var.domain_name

  ssm_path_prefix = "/${var.project}/${var.env}"
  # Path + wildcard: cobre GetParametersByPath (path) e GetParameter (path/*),
  # e inclui params futuros sob o mesmo path (ex.: GITHUB_TOKEN).
  ssm_parameter_arns = [
    local.ssm_path_arn,
    "${local.ssm_path_arn}/*",
  ]
  ssm_kms_key_arn = data.aws_kms_alias.ssm.target_key_arn

  tags = local.tags
}

# Quebra o ciclo rds<->ec2: a regra de ingress fica aqui, depois dos dois SGs.
resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  security_group_id            = module.rds.security_group_id
  description                  = "Postgres a partir do EC2 da aplicacao"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = module.ec2.security_group_id
}

# Disjuntor de custo: budget de uso bruto $1 que para EC2+RDS automaticamente.
module "budget" {
  source = "./modules/budget"

  name                    = local.name
  limit_amount            = var.budget_cap_usd
  alert_email             = var.alert_email
  region                  = var.region
  ec2_instance_id         = module.ec2.instance_id
  rds_instance_identifier = module.rds.instance_identifier

  tags = local.tags
}
