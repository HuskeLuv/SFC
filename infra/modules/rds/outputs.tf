output "endpoint" {
  description = "Hostname do RDS (sem porta)"
  value       = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "security_group_id" {
  value = aws_security_group.rds.id
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "instance_identifier" {
  value = aws_db_instance.this.identifier
}

output "kms_key_arn" {
  value = aws_kms_key.rds.arn
}
