# Copie pra um arquivo gitignored (ex.: prod.tfvars) e preencha.
# NÃO commitar valores reais — *.tfvars (exceto este example) está no .gitignore.

aws_profile = "myfinance"
region      = "sa-east-1"
env         = "prod"
project     = "myfinance"

# Conta no free tier por créditos → t4g.micro (ARM) é o mais barato e estica os créditos.
instance_type = "t4g.micro"

# Deixe vazio no primeiro apply; preencha quando o DNS apontar pro Elastic IP.
domain_name = ""

# --- Secrets (gerar com: openssl rand -hex N) ---
db_password   = "TROCAR-min-8-chars"
jwt_secret    = "TROCAR-openssl-rand-hex-64"
brapi_api_key = "TROCAR-sua-chave-brapi"
cron_secret   = "TROCAR-openssl-rand-hex-32"

# --- Lightsail (migração set/2026; docs/plano-migracao-lightsail-set2026.md) ---
lightsail_enabled        = true
lightsail_bundle_id      = "small_3_1"
lightsail_ssh_public_key = "ssh-ed25519 AAAA... myfinance-lightsail-deploy" # ~/.ssh/myfinance-lightsail.pub
lightsail_domain_name    = ""                                               # vazio no ensaio; "appmyfinance.com.br" no cutover
