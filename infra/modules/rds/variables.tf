variable "name" {
  description = "Prefixo de nome"
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  description = "IDs das 2 subnets privadas (subnet group precisa de 2 AZs)"
  type        = list(string)
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
  description = "Senha do usuário master do RDS (mín. 8 chars). Passar via tfvars gitignored."
  type        = string
  sensitive   = true
}

variable "instance_class" {
  description = "db.t4g.micro está no free tier de RDS na maioria das regiões"
  type        = string
  default     = "db.t4g.micro"
}

variable "engine_version" {
  description = "Versão major do Postgres (RDS escolhe o minor)"
  type        = string
  default     = "16"
}

variable "allocated_storage" {
  description = "GB iniciais (free tier RDS = 20GB)"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Teto do storage autoscaling"
  type        = number
  default     = 50
}

variable "backup_retention_period" {
  description = "Dias de retenção de backup automático"
  type        = number
  default     = 7
}

variable "skip_final_snapshot" {
  description = "MVP sem dados: true. Virar false em produção real."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "MVP: false. Virar true em produção real."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
