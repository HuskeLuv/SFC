variable "name" {
  description = "Prefixo de nome dos recursos"
  type        = string
}

variable "cidr_block" {
  description = "CIDR da VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones (2) — públicas e privadas usam as mesmas AZs por índice"
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDRs das 2 subnets públicas"
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs das 2 subnets privadas (RDS)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "tags" {
  description = "Tags extras"
  type        = map(string)
  default     = {}
}
