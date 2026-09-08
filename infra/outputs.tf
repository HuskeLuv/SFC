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

# --- Lightsail ---
output "lightsail_public_ip" {
  description = "IP estático do Lightsail — apontar o A do GoDaddy pra cá no cutover"
  value       = var.lightsail_enabled ? module.lightsail[0].public_ip : null
}

output "lightsail_ssh" {
  value = var.lightsail_enabled ? "ssh -i ~/.ssh/myfinance-lightsail ${module.lightsail[0].ssh_user}@${module.lightsail[0].public_ip}" : null
}

output "lightsail_backup_bucket" {
  value = var.lightsail_enabled ? module.lightsail[0].backup_bucket : null
}

output "lightsail_backup_access_key_id" {
  value = var.lightsail_enabled ? module.lightsail[0].backup_access_key_id : null
}

output "lightsail_backup_secret_access_key" {
  value     = var.lightsail_enabled ? module.lightsail[0].backup_secret_access_key : null
  sensitive = true
}
