output "security_group_id" {
  value = aws_security_group.app.id
}

output "public_ip" {
  description = "Elastic IP — apontar o A record do Registro.br pra cá"
  value       = aws_eip.this.public_ip
}

output "instance_id" {
  value = aws_instance.this.id
}

output "role_name" {
  value = aws_iam_role.this.name
}
