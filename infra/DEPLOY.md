# Runbook de Deploy — EC2 (myfinance)

Como deployar o app no EC2 provisionado pelo Terraform. Documenta o processo
que foi feito manualmente em 2026-06-05/06 (o `user-data` prepara o runtime mas
**não** faz o deploy do código — ver "Limitação do user-data" no fim).

Contexto da infra: ver [`README.md`](./README.md) e
[`../docs/aws-migration-plan.md`](../docs/aws-migration-plan.md).

---

## Deploy atômico (Camada 2 — preferido)

> Substitui o `rm -rf $APP` + build-in-place + restart (que derrubava a app
> durante o build e não tinha rollback). Agora cada deploy é uma **release
> versionada** com **health-check antes do flip** e **rollback automático**.

**Layout em prod:**

```
/opt/myfinance/
  releases/<timestamp>-<sha>/   # cada deploy clona+builda aqui
  current -> releases/<...>      # symlink pra release ativa (systemd aponta aqui)
```

**Scripts versionados** (em `infra/`):

- `bootstrap-deploy.sh` — entry point via SSM: swap + clona main em `releases/` + chama `deploy.sh`.
- `deploy.sh` — roda na release nova: deps + build + **health-check na porta 3001** → `migrate deploy` → **flip do symlink** + restart → health na 3000 → **rollback automático** se falhar → prune (mantém 5).
- `rollback.sh` — volta `current` pra release anterior + restart.

**Disparar um deploy** (da máquina com o profile `myfinance`):

```bash
aws ssm send-command --document-name AWS-RunShellScript \
  --instance-ids i-09099b2b041adcdb6 --region sa-east-1 --profile myfinance \
  --parameters '{"commands":["set -e; TOKEN=$(aws ssm get-parameter --name /myfinance/prod/GITHUB_TOKEN --with-decryption --region sa-east-1 --query Parameter.Value --output text); D=$(mktemp -d); git clone --depth 1 -b main https://${TOKEN}@github.com/HuskeLuv/SFC.git $D >/dev/null 2>&1; bash $D/infra/bootstrap-deploy.sh; rm -rf $D"],"executionTimeout":["1800"]}'
```

> O `bootstrap-deploy.sh` re-clona a versão final em `releases/`; o clone do mktemp
> serve só pra obter o próprio bootstrap atualizado. A release antiga **continua
> servindo** durante todo o build — só o flip troca a versão.

**Rollback manual:**

```bash
aws ssm send-command --document-name AWS-RunShellScript \
  --instance-ids i-09099b2b041adcdb6 --region sa-east-1 --profile myfinance \
  --parameters '{"commands":["bash /opt/myfinance/current/infra/rollback.sh"]}'
```

### Migração one-time (passar do layout antigo `/opt/myfinance/app` pro releases/current)

1. `mkdir -p /opt/myfinance/releases`
2. Rodar `bootstrap-deploy.sh` UMA vez — ele cria `releases/<sha>` e tenta o flip;
   nesse primeiro run o systemd ainda aponta pra `/opt/myfinance/app`, então o
   "restart" reinicia a app antiga. Após o run, `current` já existe.
3. Apontar o systemd pra `current` e reiniciar:
   ```bash
   sed -i 's#WorkingDirectory=/opt/myfinance/app#WorkingDirectory=/opt/myfinance/current#' \
     /etc/systemd/system/myfinance.service
   systemctl daemon-reload && systemctl restart myfinance
   curl -sf http://localhost:3000/api/health   # confirmar
   ```
4. Validar e, se OK, o `/opt/myfinance/app` antigo pode ser removido depois.
   **Rollback da migração:** apontar `WorkingDirectory` de volta pra `/opt/myfinance/app`.

> **Build no CI (futuro):** hoje o build roda na box (em release isolada; o swap
> cobre a RAM e a release ativa não é afetada). Mover o build pro GitHub Actions
>
> - artefato (S3/OIDC) é otimização futura, não requisito de segurança.

> **Migrations:** `migrate deploy` roda antes do flip. Use migrations
> forward-compatible (expand/contract) — o health-check é raso e não cobre
> incompatibilidade de schema com a release anterior.

---

## Deploy manual legado (pré-Camada 2)

> Mantido como referência. **Prefira o deploy atômico acima.**

## Pré-requisitos

- `terraform apply` feito (EC2, RDS, SSM secrets, budget no ar).
- Secrets no SSM (`/myfinance/prod/*`): `DATABASE_URL`, `JWT_SECRET`,
  `BRAPI_API_KEY`, `CRON_SECRET`, `GITHUB_TOKEN` (PAT fine-grained, read-only no repo).
- Acesso via **Session Manager** (sem SSH):
  ```bash
  aws ssm start-session --target <instance-id> --profile myfinance --region sa-east-1
  ```
  Ou rodar comandos sem sessão interativa via `aws ssm send-command`.

> Valores atuais (2026-06): instance `i-09099b2b041adcdb6`, EIP `15.229.240.19`,
> domínio `appmyfinance.com.br`. App em `/opt/myfinance/app`, env em
> `/etc/myfinance/app.env`, serviços `myfinance.service` + `caddy.service`.

## 1. Swap (obrigatório — build estoura 1GB de RAM)

```bash
sudo bash -c '
  if ! swapon --show | grep -q /swapfile; then
    dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi'
```

## 2. Popular o env a partir do SSM

O `user-data` deveria fazer isso, mas aborta (ver fim). Gerar manualmente:

```bash
sudo bash -c '{
  echo NODE_ENV=production; echo PORT=3000
  aws ssm get-parameters-by-path --path /myfinance/prod --with-decryption --recursive \
    --region sa-east-1 --query "Parameters[].[Name,Value]" --output text \
  | while IFS=$'"'"'\t'"'"' read -r n v; do echo "${n##*/}=$v"; done
} > /etc/myfinance/app.env
chmod 600 /etc/myfinance/app.env && chown myfinance:myfinance /etc/myfinance/app.env'
```

> ⚠️ **Não** faça `source` desse arquivo em bash — a `DATABASE_URL` tem `&`
> (de `connection_limit=5&sslmode=require`) que o shell interpreta como
> background. O systemd lê via `EnvironmentFile` sem problema. Em scripts,
> extraia com `grep '^VAR=' app.env | cut -d= -f2-`.

## 3. Clonar / atualizar o código

```bash
sudo bash -c '
  APP=/opt/myfinance/app
  TOKEN=$(aws ssm get-parameter --name /myfinance/prod/GITHUB_TOKEN --with-decryption \
    --region sa-east-1 --query Parameter.Value --output text)
  rm -rf "$APP"
  git clone --depth 1 -b main "https://${TOKEN}@github.com/HuskeLuv/SFC.git" "$APP"
  git -C "$APP" remote set-url origin https://github.com/HuskeLuv/SFC.git  # scrub do token
  chown -R myfinance:myfinance /opt/myfinance'
```

> 🔒 **Nunca** use `set -x` em scripts que leem o token — ele vaza na saída
> (do SSM/CloudWatch). Use `set -e` apenas.

## 4. Instalar deps + migrar + buildar

```bash
sudo bash -c '
  cd /opt/myfinance/app
  while IFS="=" read -r k v; do [ -n "$k" ] && export "$k=$v"; done \
    < <(grep -E "^[A-Za-z_]+=" /etc/myfinance/app.env)
  npm ci --include=dev          # --include=dev: NODE_ENV=production faz npm pular devDeps
  npx prisma migrate deploy      # baseline 0_init cria o schema completo (drift já resolvido)
  export NODE_OPTIONS=--max-old-space-size=3072
  npm run build                  # build precisa de DATABASE_URL no env (PrismaClient no import)
  chown -R myfinance:myfinance /opt/myfinance'
```

> Banco do zero: `migrate deploy` aplica `0_init` e gera o schema correto.
> (Histórico: antes do baseline squash, `migrate deploy` deixava o schema
> incompleto e era preciso `prisma db push`. Não é mais necessário.)

## 5. systemd + Caddy

Units (criar se não existirem — o user-data deveria, mas aborta):

`/etc/systemd/system/myfinance.service`:

```ini
[Unit]
Description=MyFinance Next.js
After=network.target
[Service]
User=myfinance
Group=myfinance
WorkingDirectory=/opt/myfinance/app
EnvironmentFile=/etc/myfinance/app.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
```

`/etc/caddy/Caddyfile` (com domínio → TLS automático; antes do DNS apontar, usar `:80`):

```
{
  email suporte@appmyfinance.com.br
}
appmyfinance.com.br, www.appmyfinance.com.br {
  reverse_proxy localhost:3000
}
```

`/etc/systemd/system/caddy.service`:

```ini
[Unit]
Description=Caddy
After=network.target
[Service]
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=on-failure
AmbientCapabilities=CAP_NET_BIND_SERVICE
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myfinance caddy
```

## 6. DNS + HTTPS

1. No **GoDaddy**: A `@` → EIP (`15.229.240.19`) + CNAME `www` → `appmyfinance.com.br`.
   (`.com.br` exige nameservers delegados ao GoDaddy no Registro.br.)
2. Com o DNS apontando e o app de pé, o Caddy emite o cert Let's Encrypt sozinho.

## 7. Crons

`/etc/cron.d/myfinance` (AL2023 precisa `dnf install -y cronie && systemctl enable --now crond`).
Wrapper `/usr/local/bin/myfinance-cron.sh` lê `CRON_SECRET` do env e faz GET
autenticado em `localhost:3000/api/cron/<endpoint>`. Os 13 jobs (horários UTC =
mesmos do `vercel.json`) estão na seção de crons do plano.

## 8. Popular o banco (primeira vez)

Rodar os 13 crons na ordem catálogo → preços → dividendos → eventos →
fundamentals → snapshots. O `dividends` é o mais lento (~28 min, 1 call BRAPI por
papel) — o wrapper tem `-m 300`, curto pro 1º backfill, mas o servidor continua
inserindo mesmo se o curl desistir; nos dias seguintes é incremental.

## 9. Verificar

```bash
curl -s https://appmyfinance.com.br/api/health      # {"status":"ok",...}
```

## Limitação do user-data (a melhorar)

O `modules/ec2/user-data.sh.tftpl` roda com `set -euxo pipefail` e **aborta** no
fetch dos secrets do SSM se ele falhar — e por isso **nunca chega a criar os
systemd units / Caddyfile**. Por isso os passos acima são manuais.

Melhorias pendentes (não aplicar com a instância no ar — `user_data_replace_on_change`
recriaria a instância):

- Não abortar o user-data inteiro se o fetch falhar (criar units sempre).
- Mover clone/build pra um `deploy.sh` versionado, ou pra CI (GitHub Actions
  buildando e enviando artefato) em vez de buildar no t4g.micro.
