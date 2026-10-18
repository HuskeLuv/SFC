# Ativação em produção — Stocks e REITs na Análise de Ativos

Base: `desenho.json` → `final.plano_producao`, com as decisões do Wellington de 17/10 (universo
de stocks com float ≥ US$ 2 bi; Stocks e REITs juntos; Análise EUA sem preço). Detalhes dos jobs
de dados estão em `RUNBOOK-dados-sec.md`.

**Regra de todas as etapas:** cada escrita em prod só acontece depois de um **[OK]** explícito do
Wellington. Antes de cada escrita roda o **dry-run**, e a conferência SQL vem logo depois. Toda
mudança em prod (cron, app.env, migration, carga) vai para a memória de prod/AWS.

A branch `feat/analise-ativos-eua` já traz as fatias 0, A, B, C e D integradas. Ela entra num
único PR, que **não** liga nada: as duas chaves continuam desligadas e as linhas de cron EUA
continuam comentadas.

```bash
# atalho usado abaixo (no servidor, ssh -i ~/.ssh/myfinance-lightsail ubuntu@56.125.206.95)
cd /opt/myfinance/current
J='sudo -u myfinance env MALLOC_ARENA_MAX=2 NODE_OPTIONS=--max-old-space-size=256 node --env-file=/etc/myfinance/app.env --import tsx'
PSQL='sudo -u myfinance psql "$DATABASE_URL"'   # mesma conexão do app.env
```

## Pré-requisitos

- Respostas às perguntas 1–4 e 8 do desenho.
- Para o passo 7 (preço): texto **escrito** da BRAPI, ou de outro provedor, autorizando exibir
  cotação EUA.
- Antes do merge: CI verde (type-check → lint → test → build → e2e). Os e2e EUA **pulam** no CI
  enquanto `ANALISE_ATIVOS_EUA_HABILITADO` não estiver no `ci.yml` (decisão em aberto).

## 1. Merge, deploy e migration — [OK] do merge

O deploy (merge na main → GitHub Actions → Lightsail, ~4 min) roda `prisma migrate deploy` em
`infra/deploy.sh`. Por isso **o merge já aplica a migration** `20261017120000_analise_ativos_eua`.
Ela é aditiva e idempotente: tabelas `sec_companies`, `sec_company_tickers` e
`asset_quotes_daily_us`, mais colunas anuláveis em `asset_fundamentals_period` e
`analise_quadro_linhas`. Nada é apagado nem reescrito. O OK do merge vale como OK da migration.
Se ela precisar ser reaplicada à mão, use `apply-migration-eua.ts` em dry-run e depois `--apply`.

Conferência logo após o deploy:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations
 WHERE migration_name = '20261017120000_analise_ativos_eua';
SELECT to_regclass('sec_companies'), to_regclass('sec_company_tickers'), to_regclass('asset_quotes_daily_us');
-- Brasil intacto (anotar os números para comparar amanhã)
SELECT classe, count(*) FROM analise_quadro_linhas GROUP BY 1;
SELECT classe, count(*) FROM criteria_eval GROUP BY 1;
```

No **dia seguinte**, os jobs BR (scores 10:10, criterios 10:30, quadro 10:40, curadoria 10:55,
alertas 11:10) devem estar iguais em `analise_job_runs` e não pode haver linha `stock`/`reit`.

```sql
SELECT job, status, "linhasGravadas", "rssPicoMb", inicio FROM analise_job_runs
 WHERE inicio > now() - interval '1 day' ORDER BY inicio;
```

## 2. Template do Lightsail

`infra/modules/lightsail/provision.sh.tftpl` já traz as 3 linhas EUA **comentadas**
(`sec-cadastro` domingo 03:30 UTC, `eua-diario` 11:25 UTC e `cotacoes-eua` 22:30 UTC, seg–sex).
Nada muda em `/etc/cron.d/myfinance` neste passo.

## 3. Carga dos dados SEC (cada linha de escrita com [OK])

### 3.1 Cadastro e universo

```bash
$J scripts/analise-ativos/rodar-job.ts sec-cadastro --sem-aplicar --prazo-s=590   # dry-run
# [OK]
$J scripts/analise-ativos/rodar-job.ts sec-cadastro --prazo-s=590
```

São cerca de 1.400 submissions a 4 req/s (≈ 6 min). Se o prazo cortar no meio, rode de novo: a
segunda passada é incremental. Não pode haver `ANALISE_EUA_AMOSTRA_CIKS` no app.env de prod.

```sql
SELECT classe, count(*) total, count(*) FILTER (WHERE "noUniverso") no_universo
  FROM sec_companies GROUP BY 1;                     -- esperado ≈ 1.300 stocks e ≈ 75 REITs no universo
SELECT count(*) FROM sec_company_tickers WHERE "validTo" IS NULL;
SELECT alertas FROM analise_job_runs WHERE job = 'sec-cadastro'
 ORDER BY inicio DESC LIMIT 1;                 -- float suspeito, CIK sem 10-K, override sem ticker
-- as gigantes ficam DENTRO (a sanidade por float ÷ ativo > 40× não as corta)
SELECT t.symbol, c.classe, c."noUniverso" FROM sec_company_tickers t JOIN sec_companies c USING (cik)
 WHERE t.symbol IN ('AAPL','MSFT','NVDA','GOOGL','BRK-B','JPM','O','PLD','SPG');
```

### 3.2 Fundamentos (backfill em lote)

O caminho em lote usa o `companyfacts.zip` da SEC, baixado uma única vez, sem nada por CIK na
rede durante o processamento:

```bash
# fora do repositório; ~1,4 GB; User-Agent obrigatório
curl -fL -A 'MyFinance suporte@appmyfinance.com.br' -o /tmp/companyfacts.zip \
  https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip
$J scripts/analise-ativos/backfill-sec-fundamentos.ts --zip=/tmp/companyfacts.zip           # dry-run (conta, não grava)
# [OK]
$J scripts/analise-ativos/backfill-sec-fundamentos.ts --zip=/tmp/companyfacts.zip --apply
rm /tmp/companyfacts.zip
```

Se aparecer o erro `zip64_nao_suportado`, use o caminho por CIK (≈ 7 min a 4 req/s, mesma
gravação): `backfill-sec-fundamentos.ts` e depois `--apply`, sem `--zip`. Pico de memória
esperado: < 300 MB (`rssPicoMb`).

```sql
SELECT count(DISTINCT "emissorId") emissores, count(*) linhas, min("anoFiscal"), max("anoFiscal")
  FROM asset_fundamentals_period WHERE source = 'SEC';
SELECT job, status, "linhasGravadas", "rssPicoMb", "duracaoMs" FROM analise_job_runs
 WHERE job = 'backfill:sec-fundamentos' ORDER BY inicio DESC LIMIT 1;
```

### 3.3 Cobertura (só leitura)

```bash
$J scripts/analise-ativos/relatorio-cobertura-eua.ts --saida=/tmp/cobertura-eua.txt
```

Metas (fatia A): stocks não financeiras ≥ 90% em ebitda e fcl e ≥ 85% em dl; REITs ≥ 85% em dl;
≥ 95% dos CIKs com receita e lucro em 10 de 11 anos. Na amostra do DEV, o fcl ficou em 87,2% e
receita+lucro em 90,5%. **Se o universo completo ficar abaixo, pare e leve ao Wellington** antes
de seguir.

## 4. Parâmetros v3

```bash
$J scripts/analise-ativos/seed-criteria-params.ts --versao=3                                 # dry-run
$J scripts/analise-ativos/rodar-job.ts criterios-eua --versao-params=3 --sem-aplicar          # dry-run
$J scripts/analise-ativos/relatorio-criterios-eua.ts                                          # distribuição
$J scripts/analise-ativos/relatorio-criterios.ts --comparar=2,3                               # BR: 0 diferenças
# [OK] — grava a v3 já vigente
$J scripts/analise-ativos/seed-criteria-params.ts --versao=3 --valid-from=$(date -u +%F) --apply
```

```sql
SELECT version, "validFrom" FROM criteria_params ORDER BY version;
```

A v3 repete a v2 para o Brasil. O `--comparar=2,3` precisa dar 0 diferenças em `acao`/`fii`.
Antes disso, nada de gravar a v3 com vigência.

## 5. Critérios, Quadro e crons

```bash
# [OK]
$J scripts/analise-ativos/rodar-job.ts criterios-eua
$J scripts/analise-ativos/rodar-job.ts quadro-eua
# prova do isolamento: o job BR depois do EUA não apaga stock/reit
$J scripts/analise-ativos/rodar-job.ts criterios
$J scripts/analise-ativos/rodar-job.ts quadro
```

```sql
-- rodar antes e depois do criterios/quadro BR: as contagens stock/reit não podem mudar
SELECT classe, count(*), max("geradoEm") FROM analise_quadro_linhas GROUP BY 1 ORDER BY 1;
SELECT classe, count(*), max("computedAt") FROM criteria_eval GROUP BY 1 ORDER BY 1;
```

No DEV, isso foi conferido nos dois sentidos com hash das linhas: o BR depois do EUA não muda as
linhas stock/reit, e o EUA depois do BR não muda as linhas acao/fii.

[OK] para o cron: descomente no `/etc/cron.d/myfinance` (e no template)

```
30 3 * * 0 root /usr/local/bin/myfinance-job.sh sec-cadastro
25 11 * * * root /usr/local/bin/myfinance-job.sh eua-diario
```

O `eua-diario` encadeia sec-fundamentos (incremental pelo `form.idx`) → criterios-eua →
quadro-eua num só processo, às 08:25 BRT, depois do alertas-salvos das 11:10 UTC. No dia
seguinte, confira os dois blocos em `analise_job_runs`: BR das 10:10 às 11:10 e EUA às 11:25.
Os três registros precisam ter status ok e `rssPicoMb` < 300.

## 6. Beta — [OK]

```bash
# /etc/myfinance/app.env
ANALISE_ATIVOS_EUA_HABILITADO=true
# restart do app (systemd), depois:
curl -s localhost:3000/api/health
```

O acesso segue o `ANALISE_ATIVOS_ACESSO` atual ('beta': Pedro + admins). O QA do Pedro cobre
desktop e celular: Quadro Stocks/REITs, página do AAPL e do O, Comparador, Planejar e Registrar.
O roteiro diz explicitamente duas coisas: FCO/ação não é FFO, e quase nenhum REIT atende o "caixa
op./ação crescente" na janela 5. Para desligar, basta tirar a chave e reiniciar: as abas somem e
as rotas EUA respondem 404/400.

## 7. Preço — só depois da licença escrita

1. `ANALISE_EUA_PRECO_FONTE=brapi` no app.env. As fontes `eodhd` e `twelvedata` não estão
   implementadas e o job termina 'pulado'.
2. Backfill de 10 anos de cotação. [OK]
3. Descomentar `30 22 * * 1-5 … cotacoes-eua`. [OK]
4. `ANALISE_ATIVOS_EUA_PRECO_HABILITADO=true` + restart. [OK]

Se a licença for **negada**, vale o mesmo para a Carteira atual: decidir junto se a aba
Stocks/REIT's volta ao preço médio (pergunta 1).

## 8. Fase 2 (fora deste PR)

Extrair FFO, AFFO e ocupação do 10-K para a fonte `sec_10k`, com curadoria, e criar a params v4:
fco_acao → ffo_acao, pay sobre o AFFO e ocup ativa. Com isso as colunas escondidas do Essencial
voltam.

## Rollback

- **Telas:** `ANALISE_ATIVOS_EUA_HABILITADO=false` (e a de preço) + restart, com efeito imediato.
  O Brasil fica idêntico com a chave desligada; isso foi conferido no DEV com a resposta das APIs
  BR igual, byte a byte, exceto `recursos.eua` e as contagens EUA.
- **Jobs:** comente a linha `eua-diario` (e a `sec-cadastro`) no `/etc/cron.d/myfinance`.
- **Dados:** ficam isolados por classe, porque os gravadores apagam só as classes do próprio job.
  Para limpar (só com [OK]; antes, rode um `SELECT count(*)` com o mesmo `WHERE`):

```sql
BEGIN;
DELETE FROM analise_quadro_linhas WHERE classe IN ('stock','reit');
DELETE FROM criteria_eval WHERE classe IN ('stock','reit');
DELETE FROM asset_fundamentals_period WHERE source = 'SEC';
-- COMMIT só depois de conferir as contagens; senão ROLLBACK
```

- **Migration:** é aditiva e não tem reversão. As tabelas e colunas vazias não afetam nada.
