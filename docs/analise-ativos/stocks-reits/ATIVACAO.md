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

### Pendência da Carteira (decisão do Wellington antes do passo 6)

A Carteira guarda cada classe EUA numa unidade diferente, herdada do wizard: o **stock** em R$
(`valorInvestido` = q × US$ × câmbio, preço médio em R$, mas a aba Stocks soma a cotação da BRAPI
em US$) e o **REIT** em US$ (q × US$, sem câmbio, como o `Step4ReitFields`). A Carteira
consolidada soma o REIT como se fosse R$: 4 PLD a US$ 110 entram como "REIT's R$ 440,00", e não
≈ R$ 2.376 (QA de 18/10). A Análise não corrige a Carteira (ela fica intocada) e evita mostrar
números sem unidade única: o card "Na sua carteira" do stock mostra só a quantidade e o link para
a aba; o do REIT mostra valor e preço médio em US$, mas não mostra o "% da carteira". Falta
decidir se a Carteira converte o REIT pelo câmbio no total e grava o stock numa unidade só.

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

#### Balanço: de qual 10-K vem cada número (e o efeito nos critérios)

O balanço (dívida, caixa, aplicações, PL, ativo) vem do 10-K do **próprio exercício**. Sem nenhum
passo da cadeia nesse 10-K, vale o comparativo do 10-K seguinte, e um 10-K mais tardio que esse
nunca é usado (nota com o mesmo conceito: AMT 2019, PLD 2021, WELL 2020). Há três exceções, todas
anotadas no `sourceConcept`:

- **erro de escala** (`escalaCorrigida`): se o mesmo conceito, na mesma data, difere 100× ou mais
  no comparativo do 10-K seguinte, vale o comparativo. Caso real: TSLA 2016 tinha a dívida em
  milhares no próprio 10-K e agora fica com US$ 5.892 mi, não 5,9 mi;
- **passo de dívida irrisório** (`passoDescartado`): um passo abaixo de 1% de outro passo na mesma
  data, inclusive zero, conta como ausente. Casos reais: ORCL 2022 tinha `LongTermDebt` = 0 com
  75.859 mi combinados, e Dív. líq./EBITDA passa de −1,66× para 4,22×; AMD 2021 passa de 1 mi para
  313 mi;
- **caixa com aplicações num conceito só** (`CashCashEquivalentsAndShortTermInvestments`, último
  passo da cadeia do caixa): nesse ano as aplicações ficam null, para não descontar duas vezes na
  dívida líquida. Caso real: CAT 2013–2016, que estava sem caixa.

**Essa regra muda estados de critérios.** Não vale a afirmação de que a correção do balanço
(commit `1d0dd088`) não mudou nenhum critério. Ela corrigiu AMT, PLD e WELL, mas, antes das três
exceções acima, também deixou a CAT 2013–2016 sem caixa, a dívida da TSLA 2016 em 5,9 mi e a da
ORCL 2022 em zero. No DEV (amostra de 63 CIKs, `criterios-eua --versao-params=3`), as três
exceções mudaram 1 estado em 1.170: **CAT `dl` na janela 10, de `sem_dado` para `nao_atende`**
(3,7× em 2016). TSLA, ORCL e AMD mudaram de valor, mas não de estado.

Seguem sem caixa, por desenho, os anos que só aparecem num 10-K mais tardio que o comparativo:
AVGO 2016 e GOOGL 2013, porque o CIK atual nasceu depois e o 10-K da época é do CIK antecessor, e
AXP/JPM 2016, que são bancos: neles o `dl` é "sem dado" de qualquer forma. No universo completo,
compare os estados antes e depois do backfill:

```sql
-- antes do backfill (anotar) e depois do criterios-eua: estados por ticker/janela/critério
SELECT symbol, janela, r->>'id' criterio, r->>'estado' estado
  FROM criteria_eval, jsonb_array_elements(resultados) r
 WHERE classe IN ('stock','reit') ORDER BY 1,2,3;
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
