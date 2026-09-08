variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "availability_zone" {
  description = "AZ do Lightsail em São Paulo"
  type        = string
  default     = "sa-east-1a"
}

variable "blueprint_id" {
  description = "Imagem base. Ubuntu 24.04 traz PostgreSQL 16 no apt."
  type        = string
  default     = "ubuntu_24_04"
}

variable "bundle_id" {
  description = "Plano. small_3_1 = US$12: 2 vCPU (20%/vCPU sustentável), 2 GB, 60 GB, 1,5 TB."
  type        = string
  default     = "small_3_1"
}

variable "ssh_public_key" {
  description = "Chave pública ed25519 usada pelo GitHub Actions (deploy) e pelo operador."
  type        = string
}

variable "domain_name" {
  description = "Domínio pro Caddy emitir TLS. Vazio = só HTTP (ensaio)."
  type        = string
  default     = ""
}

variable "db_name" {
  type    = string
  default = "myfinance"
}

variable "db_username" {
  description = "Mesmo usuário do RDS, pra pg_restore --role bater."
  type        = string
  default     = "myfinance_app"
}

variable "alert_email" {
  type = string
}

variable "snapshot_time_utc" {
  description = "Hora (UTC, HH:00) do snapshot automático diário. 06:00 UTC = 03:00 BRT, antes dos crons de mercado."
  type        = string
  default     = "06:00"
}

variable "backup_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
