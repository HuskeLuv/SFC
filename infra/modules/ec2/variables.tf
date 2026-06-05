variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_id" {
  description = "Subnet pública onde o EC2 roda"
  type        = string
}

variable "instance_type" {
  description = "t3.micro (x86, free tier clássico) ou t4g.micro (ARM, modelo de créditos)"
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "GB do volume root gp3 (free tier EBS = 30GB)"
  type        = number
  default     = 20
}

variable "domain_name" {
  description = "Domínio do app (pro Caddy emitir TLS). Vazio = só HTTP até o DNS apontar."
  type        = string
  default     = ""
}

variable "ssm_parameter_arns" {
  description = "ARNs dos parâmetros SSM SecureString que o EC2 pode ler"
  type        = list(string)
}

variable "ssm_path_prefix" {
  description = "Prefixo dos parâmetros SSM (ex.: /myfinance/prod)"
  type        = string
}

variable "ssm_kms_key_arn" {
  description = "ARN da chave KMS que cifra os SecureString (aws/ssm por padrão)"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
