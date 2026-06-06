# Plano de Migração — Vercel + Neon → AWS (sa-east-1)

> Definido em 2026-05-25. Última revisão: 2026-06-05.
> Domínio **appmyfinance.com.br** — registrado no Registro.br (.com.br), DNS gerenciado no **GoDaddy** (nameservers delegados). Estratégia: começar com menor custo possível e fazer upgrade só quando a dor real aparecer.

## ⚠️ PIVOT 2026-06-05 — compute mudou de Amplify para EC2

**Amplify Hosting SSR não alcança RDS privado em VPC.** A issue oficial [aws-amplify/amplify-hosting#3362](https://github.com/aws-amplify/amplify-hosting/issues/3362) ("VPC Access for SSR Compute Runtime") está **aberta desde mar/2023, sem implementação**. O recurso "IAM compute roles for SSR" é só permissão IAM pra chamar APIs AWS — **não** abre caminho de rede TCP 5432 pro Postgres que o Prisma usa. A topologia original (Amplify → VPC connector → RDS privado) era inviável.

**Nova arquitetura escolhida:** **EC2 t4g.micro** rodando o Next.js na VPC, RDS privado. Ganho colateral: **o fck-nat foi eliminado** — o EC2 fica em subnet pública com Elastic IP e egressa direto pela Internet Gateway; o RDS é alcançado dentro da própria VPC. Sem NAT, sem aquele ponto único de falha.

**✅ Free tier confirmado (2026-06-05):** conta criada em **2026-05-30** → está no **novo free tier por créditos** ($100, até $200; janela ~6 meses, encerrando por volta de **2026-11-30** ou quando os créditos acabarem). `freeTierUsages` vazio confirma (modelo clássico popularia). Cartão cadastrado → após os créditos, vira cobrança normal (sem suspensão).

**Instância:** como no modelo de créditos **não há "instância grátis"** (tudo consome crédito), usamos a mais barata: **`t4g.micro` (ARM)** pro EC2 e `db.t4g.micro` pro RDS.

## Decisões tomadas

| Tópico      | Decisão                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting** | AWS Amplify Hosting (Next.js SSR nativo, mais próximo do UX da Vercel)                                                                                     |
| **Compute** | **EC2 t4g.micro** (ou t3.micro, ver free tier) em subnet pública com Elastic IP, rodando Next.js (`next start` via systemd) atrás de Caddy (TLS auto)      |
| **DB**      | RDS PostgreSQL `t4g.micro` **Single-AZ privada** (alcançado intra-VPC pelo EC2)                                                                            |
| **Pricing** | Mirar **$0** dentro do free tier (ver alerta sobre modelo de créditos vs 12 meses); upgrade incremental                                                    |
| **NAT**     | **Não precisa** — EC2 em subnet pública egressa pela IGW. RDS privado não tem rota de saída (não precisa).                                                 |
| **Secrets** | SSM Parameter Store SecureString (KMS, free tier) ou `.env` chmod 600 no EC2                                                                               |
| **DNS**     | Gerenciado no **GoDaddy**: **A record `@` → Elastic IP** + CNAME `www` (não usa Route 53). `.com.br` exige nameservers delegados ao GoDaddy no Registro.br |
| **Crons**   | **crontab do sistema** no EC2 batendo em `localhost:3000/api/cron/*` via `Bearer CRON_SECRET` (host único — mais simples que EventBridge)                  |
| **Dados**   | Popular RDS do zero (sem dados de produção ainda — não há migração Neon→RDS de conteúdo)                                                                   |
| **Email**   | AWS SES sa-east-1 (destrava reset de senha e confirmação de email — itens LGPD #10/#11)                                                                    |
| **Cripto**  | RDS encryption-at-rest com CMK customer-managed na criação + cripto de campo (`totpSecret`, `cpf` futuro) via KMS                                          |

## Custos esperados

| Fase                                                                         | Mensal   |
| ---------------------------------------------------------------------------- | -------- |
| Dentro do free tier (EC2 + RDS + EBS grátis)                                 | $0       |
| Pós free tier (EC2 t4g.micro ~$6 + RDS t4g.micro ~$16 + EBS/storage)         | ~$25–35  |
| Versão paga "padrão fintech" (compute redundante, Multi-AZ, RDS Proxy, etc.) | $140–160 |

SES é à parte e praticamente grátis (<62k emails/mês ≈ $0,10/1000). Elastic IP é grátis enquanto associado a uma instância em execução.

---

## Status

### ✅ Fase 0 — Preparação do repo (completo, commit `9f3f669`)

Validado contra o código em 2026-06-05:

- [x] `.env.example` completo (`BRAPI_API_KEY`, `CRON_SECRET`, opcionais documentados)
- [x] `/api/health` endpoint (faz `SELECT 1`, retorna 503 se DB cair) + adicionado ao `isPublicRoute()` no middleware
- [x] `/api/cron/*` marcado como rota pública no middleware; 14/14 rotas autenticam via `Bearer CRON_SECRET`
- [x] npm script `db:migrate:prod` (`prisma migrate deploy`)
- [x] Tooling local: AWS CLI 2.34.63 + Terraform 1.15.5 (`~/.local/bin`); profile `myfinance` validado (`sts get-caller-identity` ok, AdministratorAccess)
- [x] Scaffold IaC em `infra/` (provider aws ~>6, sa-east-1, state local) — validado
- [ ] ~~`amplify.yml`~~ — irrelevante após o pivot pra EC2 (build roda no EC2)

### ⏳ Fase 1 — Infra AWS via Terraform (em andamento)

Tudo em `infra/` (ver `infra/README.md`). `terraform plan` revisado a cada `apply`.

1. **Pré-requisitos** — ✅ feito (profile `myfinance` validado).
2. **VPC** — 2 subnets públicas + 2 privadas, IGW, route table pública → IGW. Privada sem rota de saída.
3. **Security Groups** — EC2: inbound 443/80 (mundo) + 22 (seu IP); RDS: 5432 só do SG do EC2.
4. **RDS PostgreSQL** privado (2 subnets privadas pro subnet group) — **Encryption com CMK customer-managed na criação** (não dá pra ligar depois sem snapshot→copy→restore).
5. **EC2 t4g.micro** em subnet pública + Elastic IP; user-data instala Node + Caddy + clona/builda o app + systemd.
6. **Deploy + migrations**: build no EC2, `prisma migrate deploy`, `next start` via systemd atrás de Caddy (TLS Let's Encrypt).
7. **AWS SES**: verificar domínio (DKIM/SPF no **GoDaddy**), release de sandbox, identidade `noreply@appmyfinance.com.br`.
8. **DNS**: GoDaddy → **A record `@`** pro Elastic IP `15.229.240.19` + CNAME `www`.

**Critérios de "pronto":** passo 4 ok = `psql` conecta do EC2 no RDS; passo 6 ok = `curl https://<dominio>/api/health` retorna 200.

### ⏳ Fase 2 — Crons

Configurar **crontab do sistema** no EC2 batendo nos 13 endpoints `/api/cron/*` em `localhost:3000` com `Bearer CRON_SECRET` (ver tabela abaixo). EventBridge fica como opção futura se o compute deixar de ser host único.

---

## Pontos de cuidado

- **EC2 único = SPOF do compute** — se a instância cair, o app fica fora até reciclar. Aceitável até clientes pagantes. Mitigação futura: AMI + Auto Scaling Group, ou mover pra ECS/App Runner.
- **Modelo de free tier** — confirmar no console Billing se é o clássico (12 meses) ou o novo por créditos (~6 meses). Define até quando é $0 e qual instância usar (t3.micro x86 no clássico; t4g.micro no de créditos).
- **Sem Multi-AZ no MVP** — se a AZ cair, ~10 min de downtime (na verdade mais, já que EC2 e RDS estariam na mesma AZ). Aceitável até ter clientes pagantes.
- **Sem RDS Proxy** — usar `?connection_limit=5` na `DATABASE_URL` pra não esgotar as conexões do `t4g.micro`.
- **Pós free tier** — anotar no calendário a data de virada. Depois EC2 (~$6) + RDS (~$16) deixam de ser grátis.
- **RDS sem rota de saída** — subnets privadas do RDS não precisam de NAT (RDS não faz outbound). Se algum dia precisar (ex.: extensão que baixa algo), aí sim reavaliar NAT.
- **TLS no EC2** — Caddy renova Let's Encrypt sozinho, mas depende da porta 80/443 abertas e do DNS já apontando. Subir DNS antes do primeiro cert.

---

## Criptografia (entra na Fase 1)

**(A) Em repouso no RDS** — fazer na **criação** da instância (passo 5). Marcar Encryption com **CMK customer-managed** (não a default `aws/rds`) — dá rotação, auditoria CloudTrail e revogação. Pegadinha: não dá pra ligar cripto numa RDS já criada — só via snapshot → copy-with-encryption → restore. Como nasce do zero, é só marcar. Custo ~zero. Destrava a Política dizer "AES-256 em repouso".

**(B) Em nível de campo na app** — escopo apertado. Alvos: `totpSecret` (débito em `prisma/schema.prisma:80-84`, hoje plain text) e `cpf` quando o billing Stripe entrar. **NÃO** cifrar `cnpj` (dado público de fundos/instituições). Dados de IR são calculados, não persistidos — confirmar antes. Implementação: `aes-256-gcm` (Node crypto) + envelope encryption via KMS (data key) + blind index (HMAC-SHA256) se precisar buscar por valor cifrado. Lib `prisma-field-encryption` é atalho viável (perde `@unique`/índice no valor original). IAM role da app com `kms:Decrypt`/`kms:GenerateDataKey` só na CMK. Só afirmar cripto de campo na Política se (B) for entregue.

---

## Os 13 crons a recriar no EventBridge

Fonte de verdade: `vercel.json`. Todos batem em `/api/cron/...` com `Authorization: Bearer CRON_SECRET`.

| Schedule (UTC) | Endpoint                    |
| -------------- | --------------------------- |
| `0 6 * * *`    | `economic-indexes`          |
| `15 6 * * *`   | `tesouro-direto-sync`       |
| `30 6 * * *`   | `cvm-fund-sync`             |
| `0 5 * * 0`    | `cvm-catalog-sync`          |
| `0 4 * * 0`    | `brapi-sync/backfill-names` |
| `0 7 * * *`    | `brapi-sync/catalog`        |
| `5 7 * * *`    | `brapi-sync/prices-other`   |
| `10 7 * * *`   | `brapi-sync/prices-stocks`  |
| `20 7 * * *`   | `brapi-sync/dividends`      |
| `25 7 * * *`   | `apply-corporate-actions`   |
| `30 7 * * *`   | `brapi-sync/fundamentals`   |
| `0 8 * * *`    | `portfolio-snapshots`       |
| `0 5 * * 0`    | `lgpd-retention`            |

> Há 14 route handlers em `src/app/api/cron/`; o 14º é o pai `brapi-sync/route.ts`, que **não** é agendado.

---

## Arquivos relevantes pra retomar

- `vercel.json` — os 13 crons configurados (recriar como EventBridge schedules)
- `amplify.yml` — build spec pronto
- `.env.example` — variáveis obrigatórias + exemplo de `DATABASE_URL` AWS (MVP, sem Proxy: `?connection_limit=5&sslmode=require`)
- `src/middleware.ts` — `/api/health` e `/api/cron/*` já públicos (`isPublicRoute()`)
- `src/app/api/cron/*/route.ts` — todos autenticam via `Bearer CRON_SECRET`
- `prisma/schema.prisma:80-84` — débito de cripto do `totpSecret`

## Relação com outros planos

- **LGPD** — a migração Neon→RDS endereça o item #13 (transferência internacional). SES destrava #10 (reset senha) e #11 (confirmação email). Ver `docs/lgpd-audit-mai28.md`.
- **Cripto "AES-256"** da Política depende da entrega de (A) e (B) acima. Ver `docs/relatorio-lgpd-revisao-tecnica-v2-jun2026.md`.
