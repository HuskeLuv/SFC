# Copie pra um arquivo gitignored (ex.: prod.tfvars) e preencha.
# NÃO commitar valores reais — *.tfvars (exceto este example) está no .gitignore.

aws_profile = "myfinance"
region      = "sa-east-1"
env         = "prod"
project     = "myfinance"

# --- Lightsail (produção desde 08/09/2026; docs/plano-migracao-lightsail-set2026.md) ---
# Segredos do app (JWT, BRAPI, CRON, senha do Postgres) NÃO passam pelo Terraform:
# vivem só em /etc/myfinance/app.env na máquina (infra/lightsail-push-env.sh).
lightsail_enabled        = true
lightsail_bundle_id      = "small_3_1"
lightsail_ssh_public_key = "ssh-ed25519 AAAA... myfinance-lightsail-deploy" # ~/.ssh/myfinance-lightsail.pub
lightsail_domain_name    = ""                                               # vazio no ensaio; "appmyfinance.com.br" no cutover
