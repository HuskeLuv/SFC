variable "name" {
  type = string
}

variable "limit_amount" {
  description = "Teto do budget em USD (uso bruto)"
  type        = string
  default     = "1"
}

variable "alert_email" {
  description = "Email pra alertas e confirmação das ações"
  type        = string
}

variable "region" {
  type = string
}

variable "ec2_instance_id" {
  type = string
}

variable "rds_instance_identifier" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
