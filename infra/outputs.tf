# --- Lightsail ---
output "lightsail_public_ip" {
  description = "IP estático do Lightsail — o A do GoDaddy aponta pra cá"
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
