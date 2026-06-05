# RDS PostgreSQL privado, encryption-at-rest com CMK customer-managed.
# A regra de ingress (5432 a partir do SG do EC2) é criada na raiz pra
# evitar dependência circular entre os módulos rds e ec2.

resource "aws_kms_key" "rds" {
  description             = "${var.name} RDS encryption CMK"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  tags = merge(var.tags, { Name = "${var.name}-rds-cmk" })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.name}-rds"
  target_key_id = aws_kms_key.rds.id
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnet"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, { Name = "${var.name}-db-subnet" })
}

# SG do RDS — sem ingress aqui (adicionado na raiz, referenciando o SG do EC2).
# Sem egress: RDS não precisa de saída.
resource "aws_security_group" "rds" {
  name        = "${var.name}-rds-sg"
  description = "RDS Postgres - ingress apenas do EC2 da aplicacao"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name}-rds-sg" })
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-pg"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"

  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = var.backup_retention_period
  auto_minor_version_upgrade = true
  apply_immediately          = true

  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot
  final_snapshot_identifier = (
    var.skip_final_snapshot ? null : "${var.name}-pg-final"
  )

  tags = merge(var.tags, { Name = "${var.name}-pg" })
}
