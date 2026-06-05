# infra/ — Terraform da migração AWS

IaC da topologia descrita em [`docs/aws-migration-plan.md`](../docs/aws-migration-plan.md).
Região: **sa-east-1**. State: **local primeiro** (migra pra S3+DynamoDB quando firmar).

> **Arquitetura (pivot 2026-06-05):** Amplify SSR não alcança RDS privado em VPC
> ([issue #3362](https://github.com/aws-amplify/amplify-hosting/issues/3362)), então o
> compute é um **EC2 t4g.micro** em subnet pública rodando Next.js, com **RDS privado**
> alcançado intra-VPC. Sem NAT.

## Pré-requisitos (feitos por você, fora do Terraform)

1. Conta AWS com MFA no root. ✅
2. IAM user admin + access key. ✅
3. AWS CLI configurado: `aws configure --profile myfinance` (região `sa-east-1`). ✅
4. Billing alert / budget de $50 (ou criar via Terraform).

Validar credencial antes de qualquer `terraform apply`:

```bash
aws sts get-caller-identity --profile myfinance   # ✅ já validado
```

## Layout

```
infra/
  modules/
    vpc/    # 2 subnets públicas + 2 privadas, IGW, route tables (privada sem saída)
    ec2/    # EC2 t4g.micro pública + Elastic IP + SG + user-data (Node, Caddy, app, systemd)
    rds/    # PostgreSQL t4g.micro privado, encryption CMK customer-managed, SG só do EC2
    ses/    # identidade noreply@ + DKIM/SPF (Fase 1, passo 7)
  # main.tf / providers.tf / variables.tf da raiz compõem os módulos
```

## Ordem de execução

1. `vpc` → `rds` → `ec2` (o EC2 depende do SG do RDS e das subnets).
2. Validar: `psql` do EC2 no RDS; `curl https://<dominio>/api/health` → 200.
3. `ses` + DNS no Registro.br.

## Comandos

```bash
export AWS_PROFILE=myfinance
terraform init
terraform plan      # SEMPRE revisar antes de aplicar
terraform apply
```

> State e `*.tfvars` são gitignored — contêm secrets. Nunca commitar.
> `.terraform.lock.hcl` **é** versionado (trava versões/hashes do provider).
