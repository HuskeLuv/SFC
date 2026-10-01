# Chaves órfãs com CNPJ mascarado no banco DEV (rodada 2, 30/09/2026)

A rodada 2 padronizou o CNPJ em **14 dígitos sem máscara** em todas as tabelas da fase
(`src/services/analiseAtivos/regras/comum/cnpj.ts`). O dev foi regravado por reprocessamento
idempotente (FCA, DFP/FRE 2014–2025, ITR 2024–2026, DFP 2026, informes de FII desde 2016, IPE
2024–2026 e `recalcular-analise.ts --tudo`). O que é chave nova foi gravado de novo com 14 dígitos.
As linhas antigas com a máscara da CVM (`84.429.695/0001-11`) ficaram **órfãs**: nada do código lê
essas linhas (o universo vem de `cvm_company_tickers`/`fii_ticker_map`, já migrados no lugar). Apagá-las
exige DELETE em massa, que fica para um humano autorizar.

Produção não é afetada: o backfill de produção ainda não rodou e já vai gravar 14 dígitos.

## Contagem (dev, depois da regravação)

| Tabela                                                                                        | Mascarado (órfão) | 14 dígitos (vigente) | Observação                                        |
| --------------------------------------------------------------------------------------------- | ----------------: | -------------------: | ------------------------------------------------- |
| `cvm_companies`                                                                               |               330 |                  330 | PK `cnpj`                                         |
| `asset_fundamentals_period`                                                                   |            21.904 |               22.503 | chave `emissorId`                                 |
| `asset_statement_lines`                                                                       |           126.562 |              126.562 | Raio-X (subconjunto dev)                          |
| `asset_share_counts`                                                                          |             5.836 |                5.836 | chave `(cnpj, data)`                              |
| `fii_monthly`                                                                                 |            34.338 |               34.246 | chave `(cnpj, refMonth)`                          |
| `fii_quarterly`                                                                               |            11.307 |               11.276 | chave `(cnpj, refQuarter)`                        |
| `asset_eventos`                                                                               |             5.731 |                5.413 | chave `(cnpj, tipo, chave)`                       |
| `fii_ticker_map`                                                                              |                 1 |                  527 | IRDM11 histórico (manual, fechado em 31/10/2025)  |
| `cvm_company_tickers`                                                                         |                 0 |                  427 | migrado no lugar pelo FCA (sem nova vigência)     |
| `asset_corporate_action_checks`                                                               |                 0 |                  950 | regravado (a impressão digital passou a ter CNPJ) |
| `asset_per_share_yearly`, `asset_multiples_yearly`, `asset_multiples_current`, `asset_scores` |                 0 |                    — | regravados pelo `--tudo`                          |

Banco dev: 289 MB antes da rodada 2, **350 MB** depois (limite 450 MB). As órfãs somam ~60 MB.

## SQL para um humano rodar (dev; conferir as contagens antes)

```sql
-- conferência: as contagens têm de bater com a tabela acima
select 'cvm_companies' t, count(*) from cvm_companies where cnpj ~ '\D'
union all select 'asset_fundamentals_period', count(*) from asset_fundamentals_period where "emissorId" ~ '\D'
union all select 'asset_statement_lines', count(*) from asset_statement_lines where "emissorId" ~ '\D'
union all select 'asset_share_counts', count(*) from asset_share_counts where cnpj ~ '\D'
union all select 'fii_monthly', count(*) from fii_monthly where cnpj ~ '\D'
union all select 'fii_quarterly', count(*) from fii_quarterly where cnpj ~ '\D'
union all select 'asset_eventos', count(*) from asset_eventos where cnpj ~ '\D'
union all select 'fii_ticker_map', count(*) from fii_ticker_map where cnpj ~ '\D';

begin;
delete from asset_statement_lines where "emissorId" ~ '\D';
delete from asset_fundamentals_period where "emissorId" ~ '\D';
delete from asset_share_counts where cnpj ~ '\D';
delete from fii_monthly where cnpj ~ '\D';
delete from fii_quarterly where cnpj ~ '\D';
delete from asset_eventos where cnpj ~ '\D';
delete from cvm_companies where cnpj ~ '\D';
-- a linha histórica do IRDM11 não é órfã: só muda o formato
update fii_ticker_map set cnpj = regexp_replace(cnpj, '\D', '', 'g') where cnpj ~ '\D';
commit;
vacuum analyze;
```

Não há chave estrangeira entre as tabelas da fase (migration `20260930180000_analise_ativos_fase0`),
então a ordem dos `delete` é livre.
