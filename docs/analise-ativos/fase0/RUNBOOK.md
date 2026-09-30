# RUNBOOK — Análise de Ativos, Fase 0 em produção (Lightsail)

> Fase 0 = só dados (22 tabelas novas, jobs CVM/B3, cálculos). **Nenhuma tela**, nenhuma tabela
> existente é alterada. Todo passo aqui é **humano**, com OK explícito, em janela noturna.
> Spec: `docs/analise-ativos/fase0/spec-fase0.json` (backfill.ordem, jobs, jobsComum).

Convenções deste documento:

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
# roda um script da fase 0 como o usuário do app, com teto de memória e prioridade baixa
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 npx --no-install tsx --env-file="$ENVF" "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

Todos os scripts de backfill são **dry-run por padrão** (imprimem plano, linhas e bytes) e só
gravam com `--apply`. São idempotentes e retomáveis: se cair no meio, rodar o mesmo comando de novo.
Em produção sempre `--perfil=completo` (o `dev` recorta AssetStatementLine/quotes para o Neon).

---

## 0. Janela e o que NÃO fazer

- Janela: **01:00–05:00 BRT** (04:00–08:00 UTC). Parar às 05:00 BRT mesmo no meio (retomável).
  Atenção: 05:00 UTC de domingo tem `cvm-catalog-sync`/`lgpd-retention`; 06:00–08:30 UTC tem
  BRAPI/snapshots — não emendar backfill nesse horário.
- **Não** rodar backfill em horário de pregão (10:00–18:00 BRT) nem com o app sob carga.
- **Não** rodar dois backfills ao mesmo tempo (um passo por vez, na ordem abaixo).
- **Não** ligar `ANALISE_ATIVOS_HABILITADA` antes da Fase 1 (a Agenda passaria a mostrar eventos).
- **Não** ligar `ANALISE_ATIVOS_ALERTA_ADMIN` sem combinar (escreve no sino dos admins).
- **Não** subir `--max-old-space-size` acima de 512 (1,9 GB de RAM compartilhados com o app + Postgres).
- **Não** apagar dados de `asset_price_history`, `asset_dividend_history`, `asset_corporate_actions`,
  `asset_fundamentals`: a fase 0 só LÊ essas tabelas.

## 1. Pré-checagens (antes de cada noite de backfill)

```bash
df -h /                     # exigir ≥ 5 GB livres (a fase 0 soma ~0,8 GB ao Postgres + dumps maiores)
free -m                     # exigir ≥ 600 MB "available"; se menor, não começar
uptime                      # load baixo
$PSQL -c "select pg_size_pretty(pg_database_size('myfinance'));"   # anotar (esperado ~+0,8 GB no fim)
systemctl is-active myfinance postgresql
```

Backup manual **antes** do primeiro passo da noite (além do dump diário das 03:00 UTC):

```bash
sudo /usr/local/bin/myfinance-pg-backup.sh && tail -1 /var/log/myfinance-backup.log
```

## 2. Migration (via pipeline, não à mão)

A migration `prisma/migrations/20260930180000_analise_ativos_fase0` é aditiva (22 tabelas novas,
nenhuma coluna em tabela existente). Entra no merge na `main`: `deploy.sh` roda
`prisma migrate deploy` antes do flip (rollback automático se falhar). Conferir depois do deploy:

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations where migration_name like '%analise_ativos_fase0';"
$PSQL -c "select count(*) from information_schema.tables where table_name in ('scoring_params','analise_job_runs','analise_fonte_arquivos','cvm_companies','cvm_company_tickers','asset_fundamentals_period','asset_statement_lines','asset_share_counts','fii_ticker_map','fii_monthly','fii_quarterly','fii_tipo_override','asset_quotes_daily','asset_quote_resumo','asset_setores_b3','asset_proventos_auditados','asset_corporate_action_checks','asset_per_share_yearly','asset_multiples_yearly','asset_multiples_current','asset_scores','asset_eventos');"   # = 22
```

(`scripts/analise-ativos/apply-migration-fase0.ts` é só para o banco de DEV com drift — não usar em prod.)

## 3. Seed do ScoringParams v1

```bash
rodar scripts/analise-ativos/seed-scoring-params.ts            # dry-run: "v1 ausente; seria inserida"
rodar scripts/analise-ativos/seed-scoring-params.ts --apply
$PSQL -c "select version, created_by, valid_from from scoring_params order by version;"   # 1 linha, v1
```

## 4. Ordem do backfill (spec backfill.ordem) — dry-run → `--apply`, um ano por vez

Para cada comando: rodar **sem** `--apply`, conferir o plano impresso (linhas, bytes, anos), rodar
**com** `--apply`, executar a verificação SQL e anotar tempo/RSS (o script imprime `rssPico`).
Onde há `--anos=A-B`, fazer **um ano por vez** (`--anos=2015`, depois `--anos=2016`…). Antes de
cada script, conferir no cabeçalho do arquivo (`head -40 $APP/<script>`) as opções da versão em
produção.

| Passo | Comando (sem/ com `--apply`)                                                                                                                                                                    | Verificação SQL                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2     | `rodar scripts/analise-ativos/backfill-cotahist.ts --so-cadastro --perfil=completo`                                                                                                             | `select count(*), max("atualizadoEm") from asset_setores_b3;` (≈ 400–500 raízes)                                                                       |
| 3     | `rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=fca --perfil=completo`                                                                                                                | `select count(*) from cvm_companies; select count(*) from cvm_company_tickers where "validTo" is null;` (≈ 300–350 emissores listados)                 |
| 4     | `rodar scripts/analise-ativos/backfill-fii.ts --so-cadastro --perfil=completo`                                                                                                                  | `select conferido, origem, count(*) from fii_ticker_map where "validTo" is null group by 1,2;`                                                         |
| 5     | `rodar scripts/analise-ativos/backfill-cotahist.ts --anos=2015 --perfil=completo` … `--anos=2026`, depois repetir o passo 4 com `--reconferir`                                                  | `select extract(year from date) a, count(*) from asset_quotes_daily group by 1 order by 1;` (≈ 170–190 mil linhas/ano)                                 |
| 6     | `rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=dfp,fre --anos=2014 --perfil=completo` … `--anos=2025`; depois `--docs=itr --anos=2024`, `--anos=2025` e `--docs=dfp,itr --anos=2026` | `select "docTipo", "anoFiscal", count(distinct "emissorId") from asset_fundamentals_period group by 1,2 order by 1,2;` (≈ 211 cias com 10 anos de DFP) |
| 7     | `rodar scripts/analise-ativos/backfill-fii.ts --desde=2016 --perfil=completo`                                                                                                                   | `select extract(year from "refMonth") a, count(*) from fii_monthly group by 1 order by 1;` e VP/cota do HGLG11 batendo com o relatório da Fase A       |
| 8     | `rodar scripts/analise-ativos/backfill-ipe.ts --anos=2024`, `--anos=2025`, `--anos=2026`                                                                                                        | ver bloco "Passo 8" abaixo                                                                                                                             |
| 9     | `rodar scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos`                                                                                                                 | `select status, count(*) from asset_proventos_auditados group by 1;`                                                                                   |
| 10    | `rodar scripts/analise-ativos/recalcular-analise.ts --etapas=derivados,scores`                                                                                                                  | `select "dataRef", count(*) from asset_scores group by 1 order by 1 desc limit 3;`                                                                     |
| 11    | `rodar scripts/analise-ativos/relatorio-notas-prototipo.ts`                                                                                                                                     | (gera a tabela de notas reais para o Pedro — decisão 1; nada a gravar)                                                                                 |

Depois de **cada** passo:

```bash
$PSQL -c "select job, origem, status, \"duracaoMs\", \"linhasGravadas\", rejeitadas, \"rssPicoMb\", erro from analise_job_runs order by inicio desc limit 5;"
$PSQL -c "select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables where relname like any (array['asset_%','fii_%','cvm_%','analise_%','scoring_%']) order by pg_total_relation_size(relid) desc limit 12;"
df -h /
```

Parar e investigar se: `status` = `falha`; `rssPicoMb` − início > 300; disco livre < 3 GB;
o banco cresceu muito além da estimativa da spec (`backfill.estimativas`, total ≈ 0,8 GB).

### Passo 8 — IPE (fatia E): assembleias e datas de resultado

Depende dos passos 3 (universo = `cvm_company_tickers` vigente) e 6 (entregas de DFP/ITR). O arquivo
tem ~1,7 MB/ano; o backfill dos 3 anos leva segundos (medido no dev: 3 anos em ~7 s com gravação,
~2 s em dry-run; RSS de pico ~260 MB no processo tsx, que já inclui ~120 MB de base).

```bash
rodar scripts/analise-ativos/backfill-ipe.ts --anos=2024          # dry-run: plano por arquivo
rodar scripts/analise-ativos/backfill-ipe.ts --anos=2024 --apply
rodar scripts/analise-ativos/backfill-ipe.ts --anos=2025 --apply
rodar scripts/analise-ativos/backfill-ipe.ts --anos=2026 --apply
rodar scripts/analise-ativos/backfill-ipe.ts --anos=2026 --apply  # 2ª vez: deve gravar 0 (idempotente)
```

```sql
select tipo, count(*), count(distinct cnpj) from asset_eventos group by 1;
-- aceite: assembleias 2026 de ≥ 250 emissores; estimativas para ≥ 280 emissores
select count(distinct cnpj) from asset_eventos where tipo = 'assembleia' and data >= '2026-01-01';
select count(distinct cnpj) from asset_eventos where tipo = 'resultado_estimado' and "substituidoEm" is null;
-- WEGE3: 3T26 estimado em 22/10/2026 (entrega do 3T25 em 22/10/2025)
select tipo, subtipo, chave, data, "substituidoEm" from asset_eventos where cnpj = '84429695000111' order by data;
```

(No dev, com o universo do FCA 2026: 340 emissores listados; 338 com assembleia em 2026; 338 com
estimativa; ~6,8 mil eventos em 3 anos ≈ 5 MB.)

## 5. Instalar os crons (passo humano, depois do backfill completo)

As 11 linhas já estão no template (`infra/modules/lightsail/provision.sh.tftpl`, dentro de
`/etc/cron.d/myfinance.disabled`), mas o `user_data` tem `ignore_changes`: a máquina atual **não**
recebe a mudança sozinha. Copiar à mão para o arquivo ATIVO:

```bash
sudo cp /etc/cron.d/myfinance /root/myfinance.cron.bak.$(date +%F)
sudo tee -a /etc/cron.d/myfinance >/dev/null <<'EOF'
# Análise de Ativos (Fase 0) — dados CVM/B3; ver docs/analise-ativos/fase0/RUNBOOK.md
30 5 * * 0 root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/b3-cadastro
40 5 * * 0 root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/fii-cadastro
50 5 * * 0 root /usr/local/bin/myfinance-cron.sh '/api/cron/analise-ativos/cvm-cias?doc=fca'
5 9 * * * root /usr/local/bin/myfinance-cron.sh '/api/cron/analise-ativos/cvm-cias?doc=dfp'
10 9 * * * root /usr/local/bin/myfinance-cron.sh '/api/cron/analise-ativos/cvm-cias?doc=itr'
25 9 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/cvm-ipe
35 9 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/fii-mensal
45 9 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/fii-trimestral
55 9 * * 2-6 root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/cotahist
5 23 * * 1-5 root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/cotahist
10 10 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/scores
EOF
sudo chmod 644 /etc/cron.d/myfinance
grep -c analise-ativos /etc/cron.d/myfinance     # 11
```

Primeiro teste manual de cada rota (fora do horário do cron), com o mesmo script do cron:

```bash
sudo /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/cvm-ipe && tail -1 /var/log/myfinance-cron.log   # "-> 200"
```

## 6. Monitoramento

- `/var/log/myfinance-cron.log`: uma linha por chamada (`<ts> <rota> -> <HTTP>`); 500 = job falhou,
  `ERR` = curl cortou em 300 s (o job tem prazo interno de 240 s — investigar).
- `analise_job_runs`: fonte da verdade de cada execução.

```sql
select job, status, inicio, "duracaoMs", "linhasLidas", "linhasGravadas", rejeitadas, "rssPicoMb", erro
from analise_job_runs where inicio > now() - interval '2 days' order by inicio desc;
-- 2 falhas seguidas de um job = alerta '[analise-ativos][ALERTA]' no log do app
select job, count(*) filter (where status in ('falha','abandonado')) falhas, max(inicio) from analise_job_runs
where inicio > now() - interval '7 days' group by 1 order by 2 desc;
```

- Log do app: `sudo journalctl -u myfinance --since today | grep 'analise-ativos'` (`[ALERTA]` =
  2 falhas seguidas ou layout da CVM mudou — este último falha alto e não grava nada).
- Frescor por camada: `obterPainelFrescor` (src/services/analiseAtivos/observabilidade/frescor.ts),
  sem tela nesta fase.
- Alerta no sino dos admins: só se `ANALISE_ATIVOS_ALERTA_ADMIN=true` em `/etc/myfinance/app.env`
  (desligado por padrão) + restart.

## 7. Rollback

Nenhum dado existente é afetado pela fase 0; o rollback é apagar o que ela criou.

1. Tirar as 11 linhas do `/etc/cron.d/myfinance` (restaurar `/root/myfinance.cron.bak.*`).
2. Garantir as flags desligadas (`ANALISE_ATIVOS_HABILITADA`, `ANALISE_ATIVOS_ALERTA_ADMIN`).
3. Backup manual (passo 1) e então:

```sql
begin;
drop table if exists scoring_params, analise_job_runs, analise_fonte_arquivos, cvm_companies,
  cvm_company_tickers, asset_fundamentals_period, asset_statement_lines, asset_share_counts,
  fii_ticker_map, fii_monthly, fii_quarterly, fii_tipo_override, asset_quotes_daily,
  asset_quote_resumo, asset_setores_b3, asset_proventos_auditados, asset_corporate_action_checks,
  asset_per_share_yearly, asset_multiples_yearly, asset_multiples_current, asset_scores,
  asset_eventos;
delete from _prisma_migrations where migration_name = '20260930180000_analise_ativos_fase0';
commit;
```

4. Reverter o código num PR (senão o próximo `migrate deploy` recria as tabelas — o que é inofensivo,
   mas deixa o estado confuso).

Rollback parcial (um passo do backfill saiu errado): as tabelas têm um escritor só; apagar as linhas
da tabela daquele passo (ex.: `delete from asset_eventos;`) e rodar o passo de novo.
