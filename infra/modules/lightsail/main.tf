# Lightsail: UMA máquina (app Next.js + PostgreSQL 16 local) em São Paulo.
# Substitui EC2 + RDS (plano em docs/plano-migracao-lightsail-set2026.md).
#
# O que fica aqui: instância + IP estático + firewall + chave SSH + bucket S3
# de backup do banco + usuário IAM só-escrita pra esse bucket.
# O que NÃO tem recurso no provider e vai por CLI: alarmes (infra/lightsail-alarms.sh).
#
# Segredos NÃO passam pelo user_data nem pelo tfstate: o provision gera a senha
# local do Postgres na própria máquina e os demais (JWT/BRAPI/CRON) são copiados
# da EC2 atual por SSH no ensaio (infra/lightsail-push-env.sh).

resource "aws_lightsail_key_pair" "deploy" {
  name       = "${var.name}-deploy"
  public_key = var.ssh_public_key
  tags       = var.tags
}

resource "aws_lightsail_instance" "this" {
  name              = "${var.name}-app"
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = aws_lightsail_key_pair.deploy.name
  ip_address_type   = "dualstack"

  user_data = templatefile("${path.module}/provision.sh.tftpl", {
    domain_name   = var.domain_name
    db_name       = var.db_name
    db_username   = var.db_username
    alert_email   = var.alert_email
    backup_bucket = aws_s3_bucket.db_backups.bucket
    aws_region    = var.region
  })

  # Backup 1: snapshot automático diário da máquina inteira (7 retidos).
  add_on {
    type          = "AutoSnapshot"
    snapshot_time = var.snapshot_time_utc
    status        = "Enabled"
  }

  # O blueprint "ubuntu_24_04" aponta sempre pra imagem mais nova; uma troca de
  # versão da imagem forçaria REPLACEMENT da máquina de prod. Só recriar de propósito.
  lifecycle {
    ignore_changes = [blueprint_id, user_data]
  }

  tags = merge(var.tags, { Name = "${var.name}-app" })
}

resource "aws_lightsail_static_ip" "this" {
  name = "${var.name}-ip"
}

resource "aws_lightsail_static_ip_attachment" "this" {
  static_ip_name = aws_lightsail_static_ip.this.name
  instance_name  = aws_lightsail_instance.this.name
}

# Firewall: 22 (só chave; os runners do GitHub não têm IP fixo), 80 e 443.
resource "aws_lightsail_instance_public_ports" "this" {
  instance_name = aws_lightsail_instance.this.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = ["0.0.0.0/0"]
  }
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }
}

# --- Backup 2: pg_dump diário -> S3 (lifecycle 30 dias) ---
resource "aws_s3_bucket" "db_backups" {
  bucket        = "${var.name}-db-backups-${var.account_id}"
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "db_backups" {
  bucket                  = aws_s3_bucket.db_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    id     = "expire-30d"
    status = "Enabled"
    filter {}
    expiration {
      days = var.backup_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }
}

# Usuário IAM da máquina: SÓ PutObject no bucket de backup. Sem leitura, sem
# listagem, sem delete — uma credencial vazada não consegue apagar nem ler backups.
resource "aws_iam_user" "backup" {
  name = "${var.name}-lightsail-backup"
  tags = var.tags
}

data "aws_iam_policy_document" "backup" {
  statement {
    sid       = "PutBackupsOnly"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.db_backups.arn}/pg/*"]
  }
}

resource "aws_iam_user_policy" "backup" {
  name   = "${var.name}-put-db-backups"
  user   = aws_iam_user.backup.name
  policy = data.aws_iam_policy_document.backup.json
}

resource "aws_iam_access_key" "backup" {
  user = aws_iam_user.backup.name
}
