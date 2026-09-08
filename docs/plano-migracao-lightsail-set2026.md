# Plano de migração: EC2 + RDS → Lightsail small (app + PostgreSQL na mesma máquina)

> Aprovado por Wellington em 08/09/2026 (opção C do levantamento de custos).
> Objetivo: fatura AWS de ~US$ 54/mês (R$ 281) para ~US$ 14/mês (R$ 73), mantendo o app em São Paulo,
> o mesmo domínio, o mesmo deploy por merge na `main` e backup diário.
> Nenhuma etapa deste plano foi executada ainda. Cada fase exige OK explícito antes de rodar.

## 1. Situação atual (verificada em 08/09/2026)

| Componente  | Hoje                                                                                                                | Custo/mês              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| App         | EC2 `i-09099b2b041adcdb6`, t4g.micro (ARM, 1 GB), Amazon Linux 2023, Node 20.20, Caddy, systemd `myfinance.service` | US$ 9,97               |
| Banco       | RDS `myfinance-prod-pg`, PostgreSQL 16.13, db.t4g.micro, 20 GB gp3, privado, backup 7 d, CMK KMS                    | US$ 30,33              |
| Rede        | VPC própria, Elastic IP 15.229.240.19, sem NAT                                                                      | US$ 3,72               |
| Disco/Chave | EBS 20 GB gp3 (81% usado), KMS                                                                                      | US$ 4,04               |
| Impostos    | ISS + PIS + COFINS = 12,15%                                                                                         | US$ 5,84               |
| **Total**   |                                                                                                                     | **US$ 53,90 ≈ R$ 281** |

Fatos que o plano depende:

- Deploy: merge na `main` dispara `.github/workflows/deploy.yml` → build no runner → tarball no S3 → SSM roda `infra/bootstrap-deploy-artifact.sh` → `infra/deploy.sh` (npm ci, health na porta 3001, `prisma migrate deploy`, flip do symlink `current`, rollback automático).
- Layout no host: `/opt/myfinance/releases/<stamp>-<sha>`, symlink `/opt/myfinance/current`, env em `/etc/myfinance/app.env` (NODE_ENV, PORT, BRAPI_API_KEY, CRON_SECRET, DATABASE_URL, JWT_SECRET, REGISTRATION_DISABLED), usuário `myfinance`.
- Caddy: `appmyfinance.com.br, www.appmyfinance.com.br` → `reverse_proxy localhost:3000`, TLS automático, log JSON em `/var/log/caddy/access.log`.
- Crons: `/etc/cron.d/myfinance` (16 entradas) chamando `/api/cron/*` em localhost com Bearer `CRON_SECRET` via `/usr/local/bin/myfinance-cron.sh` (`curl -m 300`).
- DNS: GoDaddy (A `@` → EIP, CNAME `www`). Não é Route 53.
- Banco: 685 MB, 11 usuários; 92% é dado global de mercado. RDS só é alcançável de dentro da VPC.
- `pg_dump` na EC2 é **15.16**; o servidor é 16.13. `pg_dump` 15 não exporta servidor 16 → instalar `postgresql16` na EC2 antes do dump.
- O código não usa SDK da AWS em runtime (nenhum `@aws-sdk` no `package.json`). Só o deploy usa S3/SSM.

## 2. Arquitetura alvo

| Item                            | Escolha                                                                                                                                      | Por quê                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Plano                           | Lightsail `small_3_1` (US$ 12): 2 vCPU (20% sustentável cada), 2 GB RAM, 60 GB SSD, 1,5 TB tráfego, IP estático incluso                      | 2× CPU e 2× RAM do web server atual; aguenta ~300 DAU com folga, ~800 no burst                                |
| Região                          | `sa-east-1a` (São Paulo)                                                                                                                     | Mesma latência e mesma jurisdição de dados de hoje                                                            |
| SO                              | Ubuntu 24.04 LTS (x86_64)                                                                                                                    | PostgreSQL 16 nativo no apt; Caddy e Node 20 via repositórios oficiais                                        |
| Banco                           | PostgreSQL 16 local, só em `localhost`, usuário `myfinance`, senha scram                                                                     | Mesma versão major do RDS; zero exposição de rede                                                             |
| Tuning PG (2 GB compartilhados) | `shared_buffers=384MB`, `effective_cache_size=1GB`, `work_mem=8MB`, `maintenance_work_mem=128MB`, `max_connections=40`, `wal_compression=on` | Deixa ~1 GB para Next + SO                                                                                    |
| Swap                            | 2 GB                                                                                                                                         | `npm ci` e picos de build nativo                                                                              |
| App                             | Mesmo layout (`releases/` + `current` + `app.env` + systemd + Caddy + cron.d)                                                                | `infra/deploy.sh` roda sem alteração                                                                          |
| Firewall Lightsail              | 22 (chave SSH apenas), 80, 443                                                                                                               | 22 fica aberto porque os runners do GitHub não têm IP fixo; mitigação: `PasswordAuthentication no` + fail2ban |
| Deploy                          | GitHub Actions: build no runner → `scp` do tarball → `ssh` roda o bootstrap local                                                            | Lightsail não tem SSM nem instance role; remove S3/OIDC do caminho                                            |
| Backup 1                        | Snapshot automático diário do Lightsail (7 retidos)                                                                                          | Máquina inteira, restaurável em ~10 min; ~US$ 0,05/GB usado (~US$ 0,50/mês)                                   |
| Backup 2                        | `pg_dump` diário 03:00 → gzip → S3 (bucket novo, lifecycle 30 d) com usuário IAM só-escrita                                                  | Cópia lógica fora da máquina (~US$ 0,10/mês)                                                                  |
| Monitoramento                   | Alarmes Lightsail (grátis): CPU burst capacity < 20%, status check falho, e-mail para suporte@                                               | Aviso antes de faltar CPU                                                                                     |
| Secrets                         | `app.env` no disco (já é assim hoje)                                                                                                         | SSM Parameter Store deixa de ser lido                                                                         |

**Custo alvo:** US$ 12 (instância) + ~US$ 0,50 (snapshots) + ~US$ 0,10 (S3) = US$ 12,60 + 12,15% ≈ **US$ 14,1/mês ≈ R$ 73**.
Durante a semana de sobreposição (fase 4): + ~US$ 10 pró-rata (EC2 parada mantém EBS e EIP; RDS parado mantém disco).

Escada de crescimento (troca de plano por snapshot, ~15 min de parada, sem migrar nada):
small US$ 12 (~300 DAU folgado, ~800 no pico) → large US$ 44 (8 GB, 30% sustentável, ~1.200 DAU) → xlarge US$ 84 (4 vCPU, 16 GB, ~3.000 DAU ou voltar o banco para gerenciado).

## 3. Mudanças de código (PR antes da migração)

1. **`.github/workflows/deploy.yml`** — trocar o bloco OIDC + S3 + SSM por:
   - `scp` do tarball para `ubuntu@<ip>:/tmp/deploy-<sha>.tar.gz`
   - `ssh ubuntu@<ip> sudo bash /opt/myfinance/app/infra/bootstrap-deploy-local.sh /tmp/deploy-<sha>.tar.gz <sha>`
   - secrets novos: `PROD_SSH_HOST`, `PROD_SSH_KEY` (chave privada gerada só para o deploy), `PROD_SSH_KNOWN_HOSTS`
   - manter `concurrency: deploy-prod` e a verificação do site público ao final
2. **`infra/bootstrap-deploy-local.sh`** — cópia do `bootstrap-deploy-artifact.sh` que recebe um caminho local em vez de `s3://` (swap 2 G em vez de 4 G). `infra/deploy.sh` não muda.
3. **`infra/lightsail/`** — Terraform: `aws_lightsail_instance`, `aws_lightsail_static_ip` + attachment, `aws_lightsail_instance_public_ports`, `aws_lightsail_alarm`, bucket S3 de backup + usuário IAM só-escrita. `user_data` chama `infra/lightsail/provision.sh`.
4. **`infra/lightsail/provision.sh`** — idempotente: apt (postgresql-16, caddy, fail2ban, cron), Node 20 (NodeSource), usuário `myfinance`, diretórios, systemd unit, Caddyfile, cron.d, swap, `postgresql.conf` com o tuning acima, `pg_hba` só local, script `myfinance-pg-backup.sh` + cron 03:00.
5. **`infra/DEPLOY.md` e `docs/aws-migration-plan.md`** — atualizar para o novo host.
6. **Cron de snapshots em lotes** (PR separado, não bloqueia): `/api/cron/portfolio-snapshots` processa usuários em lotes com continuação, para não estourar o `curl -m 300` quando passar de ~200 usuários. Vale em qualquer hospedagem.

## 4. Fases de execução

Cada fase começa só com OK explícito. Tempo estimado entre parênteses.

### Fase 0 — Preparação, sem impacto em produção (D-2, ~3 h)

1. PR com os itens 1 a 5 da seção 3, revisado e mergeado **sem** disparar deploy na EC2 (workflow ganha `if` por variável até o cutover).
2. `terraform apply` só do módulo Lightsail: cria instância, IP estático, firewall, alarmes, bucket e usuário de backup.
3. Provisionamento roda via `user_data`; validar por SSH: `psql --version` = 16.x, `node -v` = 20, `caddy version`, `systemctl status cron`, swap ativo.
4. Na EC2 atual: `dnf install postgresql16` (só o cliente; não mexe no app).
5. **Ensaio completo** (o passo mais importante):
   - `pg_dump -Fc` do RDS a partir da EC2 → S3 → Lightsail → `pg_restore` no banco novo. Medir o tempo (esperado: 2 a 5 min no total para 685 MB).
   - Conferir contagem de linhas das 14 maiores tabelas e de `User` (script de checagem) entre origem e destino.
   - Deploy da release atual (`23062e1`) pelo pipeline novo apontando para o Lightsail. Health 200 na porta 3000.
   - Teste funcional com `Host: appmyfinance.com.br` via `/etc/hosts` local: login `qa.teste`, carteira, análises, fluxo de caixa. Só leitura.
   - Disparar manualmente `economic-indexes` e `brapi-sync/catalog` no host novo para provar saída para BRAPI/Bacen.
   - Restaurar um snapshot Lightsail numa instância temporária e apagar (prova o backup 1). Baixar o dump do S3 e restaurar num banco vazio (prova o backup 2).
6. Reduzir o TTL dos registros A/CNAME no GoDaddy para 600 s.
7. Apagar o banco do ensaio (`dropdb` + `createdb`) para receber o dump final limpo.

Critério de saída: ensaio passou em todos os pontos, tempos anotados, TTL baixo há pelo menos 1 h.

### Fase 1 — Cutover (D, janela de ~30 min, fora do horário dos testers)

| #   | Passo                                                                                                                                       | Tempo      | Verificação                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| 1   | Avisar testers (Pedro) do horário                                                                                                           | —          | —                                                        |
| 2   | Na EC2: `systemctl stop myfinance` (site fora; Caddy responde 502) e `crond` parado                                                         | 1 min      | `curl` → 502                                             |
| 3   | Dump final `pg_dump -Fc` do RDS → S3 → Lightsail                                                                                            | 3 min      | tamanho ≈ ensaio                                         |
| 4   | `pg_restore` no banco novo                                                                                                                  | 5 min      | contagens batem com a origem                             |
| 5   | `app.env` no Lightsail com `DATABASE_URL` local e os mesmos segredos; `systemctl start myfinance`; `prisma migrate status` = sem pendências | 2 min      | `/api/health` 200 em localhost                           |
| 6   | GoDaddy: A `@` → IP estático do Lightsail; CNAME `www` mantém                                                                               | 1 min      | `dig +short appmyfinance.com.br` no 1.1.1.1 e 8.8.8.8    |
| 7   | Caddy emite certificado (HTTP-01) assim que o DNS propaga                                                                                   | 2 a 10 min | `https://appmyfinance.com.br` com cadeado                |
| 8   | Smoke: login qa.teste, resumo da carteira, análises, fluxo, versão em `/api/version`                                                        | 5 min      | tudo 200, dados iguais aos da EC2                        |
| 9   | Habilitar cron no Lightsail (`/etc/cron.d/myfinance`)                                                                                       | 1 min      | próximo `market-data/refresh` de hora cheia → 200 no log |
| 10  | Ativar o workflow de deploy para o host novo (remover o `if`)                                                                               | 1 min      | —                                                        |
| 11  | Na AWS: `aws rds stop-db-instance` (para até 7 dias; só cobra disco) e `aws ec2 stop-instances`                                             | 2 min      | status `stopped`                                         |

Se qualquer passo de 3 a 8 falhar: rollback (seção 5). Ninguém perde dado porque a EC2/RDS estão intactas.

### Fase 2 — Observação (D+1 a D+7)

- Diário: `/api/health`, log do cron (16 jobs → 200), alarmes Lightsail sem disparo, `free -m` e CPU burst capacity no console Lightsail.
- Conferir que o snapshot automático e o dump para o S3 foram gerados nos dias D+1 e D+2.
- Primeiro deploy real pelo pipeline novo (qualquer PR pequeno) e confirmar flip + health.
- Anotar o run-rate no Cost Explorer: a linha "Amazon Lightsail" deve aparecer com ~US$ 0,40/dia.

### Fase 3 — Descomissionar (D+7, ~1 h, irreversível: OK separado)

1. Snapshot manual final do RDS (guardar 30 dias, ~US$ 2) e AMI/snapshot final da EC2 (~US$ 1).
2. `terraform destroy` dos módulos `ec2`, `rds`, `vpc` e das actions do budget (o budget em si fica). Liberar o Elastic IP. Agendar exclusão da chave KMS (30 dias). Apagar os parâmetros SSM `/myfinance/prod/*`.
3. Bucket `myfinance-deploy-artifacts-…`: apagar (não é mais usado) ou reaproveitar como bucket de backup.
4. Role OIDC `myfinance-prod-github-deploy`: apagar (deploy passa a ser por SSH).
5. Atualizar memória, `docs/aws-migration-plan.md` e `infra/DEPLOY.md`.

## 5. Rollback

| Quando                                   | Como                                                                                                                                                                                                                                       | Perda                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Durante a Fase 1, antes do passo 6 (DNS) | `systemctl start myfinance` e `crond` na EC2. Nada mais mudou.                                                                                                                                                                             | Zero                                                               |
| Após o DNS, dentro de D+7                | GoDaddy A `@` → 15.229.240.19; `start-db-instance` + `start-instances`; `systemctl start myfinance`. Se houve escrita de usuários no Lightsail no intervalo: `pg_dump` reverso do Lightsail → RDS (mesmo procedimento, sentido contrário). | Zero com o dump reverso; sem ele, o que foi gravado após o cutover |
| Após D+7                                 | Recriar EC2/RDS pelo Terraform e restaurar o snapshot final.                                                                                                                                                                               | Horas de trabalho, não dados                                       |

## 6. Riscos e mitigação

| Risco                                   | Mitigação                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pg_dump` 15 não lê servidor 16         | Instalar `postgresql16` na EC2 na Fase 0 e validar no ensaio                                                               |
| ARM → x86                               | Node/Next são independentes de arquitetura; `npm ci` no host reinstala binários nativos (Prisma, sharp). Provado no ensaio |
| Certificado demora após trocar o DNS    | TTL 600 s desde D-2; Caddy tenta de novo sozinho; janela prevê até 10 min                                                  |
| Postgres e Next disputando 2 GB         | Tuning do PG limita a ~600 MB; swap 2 G; alarme de memória. Se apertar: plano large (8 GB) por snapshot                    |
| Porta 22 exposta para o deploy          | Só chave, sem senha; fail2ban; chave dedicada ao Actions; opcional depois: túnel Cloudflare                                |
| Credencial IAM no disco (backup S3)     | Usuário com política de `PutObject` num único bucket, sem leitura, sem outras permissões                                   |
| Snapshot cron > 5 min com mais usuários | PR de lotes (seção 3, item 6); independe da migração                                                                       |
| Perder rastro dos custos                | Budget `myfinance-prod-usage-cap` mantido; Lightsail aparece no Cost Explorer                                              |

## 7. O que muda para quem opera

- Deploy continua sendo merge na `main`. Nada muda para o time.
- Acesso ao servidor e ao banco: `ssh ubuntu@<ip>` com a chave do Lightsail (antes era SSM). A receita de consulta a prod (`reference-prod-db-access`) muda para `sudo -u postgres psql myfinance` ou `tsx` na release atual.
- Não existe mais console do RDS: backups são o snapshot do Lightsail e o dump no S3.
- Escalar = trocar de plano no console Lightsail a partir de um snapshot.

## 8. Cronograma proposto

| Dia       | O quê                                                         | Quem                                           |
| --------- | ------------------------------------------------------------- | ---------------------------------------------- |
| D-2       | Fase 0 completa (PR, Terraform, ensaio, TTL)                  | Claude executa, Wellington aprova cada `apply` |
| D-1       | Revisão dos resultados do ensaio; confirmar horário com Pedro | Wellington                                     |
| D (noite) | Fase 1, 30 min                                                | Claude executa com Wellington acompanhando     |
| D+1 a D+7 | Fase 2                                                        | Claude verifica diariamente                    |
| D+7       | Fase 3 (OK separado)                                          | Wellington aprova, Claude executa              |
