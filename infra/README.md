# infra/ — Terraform da produção (Lightsail)

Região: **sa-east-1**. State: **local** (gitignored).

> **Arquitetura (desde 08/09/2026):** uma instância **Lightsail small_3_1** (2 vCPU, 2 GB,
> 60 GB, IP estático 56.125.206.95) roda Next.js + PostgreSQL 16 na mesma máquina, com Caddy
> na frente (TLS automático) e crons em `/etc/cron.d/myfinance`. Backups: snapshot automático
> diário do Lightsail (7 retidos) + `pg_dump` 03:00 UTC → S3 (`myfinance-prod-db-backups-…`,
> versionado, 30 dias). Plano, cutover, rollback e descomissionamento:
> [`docs/plano-migracao-lightsail-set2026.md`](../docs/plano-migracao-lightsail-set2026.md).
>
> Histórico: de 06/2026 a 08/09/2026 a topologia era EC2 t4g.micro + RDS privado em VPC própria
> ([`docs/aws-migration-plan.md`](../docs/aws-migration-plan.md)); destruída na Fase 3
> (10/09/2026). Snapshots finais guardados: RDS `myfinance-prod-pg-final-20260910` (cópia
> `-awskey`, chave padrão da AWS) e EBS `myfinance-prod-app-final-20260910`.

## Pré-requisitos (fora do Terraform)

1. Conta AWS com MFA no root; IAM user admin + access key.
2. AWS CLI: `aws configure --profile myfinance` (região `sa-east-1`).
3. Par de chaves SSH do deploy/operador: `~/.ssh/myfinance-lightsail` (ed25519); a pública vai
   em `prod.tfvars` (`lightsail_ssh_public_key`) e a privada nos secrets do GitHub
   (`PROD_SSH_KEY`, com `PROD_SSH_HOST` e `PROD_SSH_KNOWN_HOSTS`).

Validar credencial antes de qualquer `terraform apply`:

```bash
aws sts get-caller-identity --profile myfinance
```

## Layout

```
infra/
  modules/
    lightsail/  # instância + IP estático + key pair + portas 22/80/443 + bucket de backup
                # + IAM user só-PutObject; provision.sh.tftpl (user_data: PG 16, Node, Caddy,
                # systemd, crons desabilitados, backup-cron)
    budget/     # budget de uso bruto da conta (só e-mail 80%/100%)
  main.tf / variables.tf / outputs.tf / providers.tf  # composição da raiz
  deploy.sh                    # deploy atômico (roda dentro da release; health → migrate → flip → rollback)
  bootstrap-deploy-local.sh    # entry point via SSH (sudo): swap + extrai tarball + deploy.sh
  rollback.sh                  # rollback manual pra release anterior
  lightsail-push-env.sh        # grava /etc/myfinance/app.env por SSH (segredos fora do Terraform)
  lightsail-alarms.sh          # alarmes Lightsail (CPU burst, status check) — provider não tem o recurso
```

Segredos do app (JWT, BRAPI, CRON, senha do Postgres) **não passam pelo Terraform**: vivem só em
`/etc/myfinance/app.env` na máquina. O `aws_budgets_budget.lightsail` (US$ 15, e-mail) fica na raiz.

## Comandos

```bash
export AWS_PROFILE=myfinance
terraform init
terraform plan -var-file=prod.tfvars      # SEMPRE revisar antes de aplicar
terraform apply -var-file=prod.tfvars
```

> State e `*.tfvars` são gitignored — contêm a chave pública e o access key do backup.
> `.terraform.lock.hcl` **é** versionado (trava versões/hashes do provider).
> `user_data` tem `ignore_changes`: mudar o `provision.sh.tftpl` não re-provisiona a máquina;
> aplicar à mão por SSH.

## Acesso operacional

```bash
ssh -i ~/.ssh/myfinance-lightsail ubuntu@56.125.206.95     # sudo sem senha
sudo -u postgres psql myfinance                            # banco de produção
cd /opt/myfinance/current && sudo -u myfinance npx --no-install tsx -e '...'
sudo tail -f /var/log/myfinance-cron.log                   # crons (só status HTTP)
```

Deploy: merge na `main` → `.github/workflows/deploy.yml` (build no runner, scp + ssh,
`bootstrap-deploy-local.sh`). Runbook detalhado em [`DEPLOY.md`](./DEPLOY.md).
