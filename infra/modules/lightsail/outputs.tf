output "instance_name" {
  value = aws_lightsail_instance.this.name
}

output "public_ip" {
  description = "IP estático — apontar o A do GoDaddy pra cá no cutover"
  value       = aws_lightsail_static_ip.this.ip_address
}

output "ssh_user" {
  value = aws_lightsail_instance.this.username
}

output "backup_bucket" {
  value = aws_s3_bucket.db_backups.bucket
}

output "backup_access_key_id" {
  value = aws_iam_access_key.backup.id
}

output "backup_secret_access_key" {
  value     = aws_iam_access_key.backup.secret
  sensitive = true
}
