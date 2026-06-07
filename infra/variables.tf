variable "aws_profile" {
  description = "Nome do profile da AWS CLI (aws configure --profile <nome>)"
  type        = string
  default     = "myfinance"
}

variable "region" {
  description = "Região AWS"
  type        = string
  default     = "sa-east-1"
}

variable "env" {
  description = "Ambiente (prod, staging)"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Nome do projeto (prefixo de recursos e dos paths SSM)"
  type        = string
  default     = "myfinance"
}

variable "instance_type" {
  description = "EC2 do app. t4g.micro (ARM, mais barato) — conta está no free tier por créditos"
  type        = string
  default     = "t4g.micro"
}

variable "domain_name" {
  description = "Domínio do app pro Caddy emitir TLS. Vazio = só HTTP até o DNS apontar."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email pra alertas de budget e confirmação das ações de parada"
  type        = string
  default     = "suporte@appmyfinance.com.br"
}

variable "budget_cap_usd" {
  # Circuit-breaker de RUNAWAY (não mais de "observação pré-launch"). A app está
  # live, então o teto fica acima do run-rate normal de prod (~$25-35/mês bruto)
  # pra só parar EC2/RDS em fuga real de custo, não no uso normal. Era "1" antes
  # do lançamento (que com a app no ar viraria um auto-stop do site).
  description = "Teto de uso bruto (USD/mês). Ao atingir, para EC2 e RDS (guard de runaway)."
  type        = string
  default     = "50"
}

variable "db_name" {
  type    = string
  default = "myfinance"
}

variable "db_username" {
  type    = string
  default = "myfinance_app"
}

variable "db_password" {
  description = "Senha master do RDS (mín. 8 chars). Definir em prod.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

# Secrets do app — ficam em SSM SecureString. Também acabam no tfstate local
# (gitignored). Definir em prod.tfvars.
variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "brapi_api_key" {
  type      = string
  sensitive = true
}

variable "cron_secret" {
  type      = string
  sensitive = true
}
