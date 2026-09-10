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
  description = "Nome do projeto (prefixo de recursos)"
  type        = string
  default     = "myfinance"
}

variable "alert_email" {
  description = "Email pra alertas de budget e alarmes do Lightsail"
  type        = string
  default     = "suporte@appmyfinance.com.br"
}

variable "budget_cap_usd" {
  # Alerta de RUNAWAY da conta inteira (uso bruto). Run-rate normal com o
  # Lightsail é ~US$13-15/mês; o teto fica bem acima pra só avisar em fuga real.
  # Desde a Fase 3 (10/09/2026) é só e-mail — não para nada.
  description = "Teto de uso bruto da conta (USD/mês). Só alerta por e-mail em 80% e 100%."
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

# --- Lightsail (migração set/2026) ---
variable "lightsail_enabled" {
  description = "Cria a máquina Lightsail (app + Postgres)."
  type        = bool
  default     = false
}

variable "lightsail_bundle_id" {
  description = "Plano Lightsail. small_3_1 = US$12 (2 vCPU, 2 GB, 60 GB). Subir = large_3_1 (US$44, 8 GB)."
  type        = string
  default     = "small_3_1"
}

variable "lightsail_ssh_public_key" {
  description = "Chave pública ed25519 do par usado pelo deploy (GitHub Actions) e pelo operador. Definir em prod.tfvars."
  type        = string
  default     = ""
}

variable "lightsail_domain_name" {
  description = "Domínio pro Caddy do Lightsail. Vazio no ensaio (só HTTP); preencher no cutover."
  type        = string
  default     = ""
}
