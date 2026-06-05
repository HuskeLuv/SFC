output "app_public_ip" {
  description = "Elastic IP do EC2 — apontar o A record do Registro.br pra cá"
  value       = module.ec2.public_ip
}

output "instance_id" {
  description = "Pra acessar via: aws ssm start-session --target <id> --profile myfinance"
  value       = module.ec2.instance_id
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "vpc_id" {
  value = module.vpc.vpc_id
}
