variable "name" {
  type = string
}

variable "limit_amount" {
  description = "Teto do budget em USD (uso bruto)"
  type        = string
  default     = "1"
}

variable "alert_email" {
  description = "Email pra alertas"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
