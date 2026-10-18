# ATIVAÇÃO — correções do backtest de 18/10/2026 (Análise de Ativos)

Roteiro único das quatro fatias integradas na branch `fix/analise-ativos-backtest`:

| Fatia         | Itens do backtest           | Precisa de ação em prod além do deploy?                                   |
| ------------- | --------------------------- | ------------------------------------------------------------------------- |
| proventos     | A1a–A1f, A2, A5/M7, M9      | sim: migration + limpeza + espelhos órfãos + restart **[OK]**             |
| acoes-eventos | A3, A6, A7, A8              | não: tudo é derivado e sai no recálculo                                   |
| fii-rotina    | A4 (vacância), M13 (01/jan) | não: detecção na leitura; M13 só age a partir de 01/01/2027               |
| universo-itau | A9 (universo), A10 (Itaú)   | sim: reprocessar o FCA 2026 e baixar balanços das empresas novas **[OK]** |

Todo passo marcado **[OK]** é humano, com OK explícito do Wellington, rodado com `!`, um por vez,
**primeiro sem `--apply`** (conferir o plano) e só depois com `--apply`, fora do pregão. Em
produção, só o que está escrito aqui, nesta ordem. Ninguém edita cron nem `app.env`.

Nenhuma regra de método que depende de decisão do Pedro mudou (reapresentação no crescimento,
exercício fora de dezembro, mês de pagamento × competência/RZTR11, seguradoras, GARE11, lucro
contábil × ajustado). Os limiares novos têm default no schema (`sanidade.proventos.somaParcelas`,
`plausibilidade.orfaMinDias/orfaFator`, `sanidade.fii.vacancia*`, `financeiras.escopoPorRaiz`): as
ScoringParams v1/v2 gravadas no banco não precisam ser regravadas.

## Convenções

Iguais às de `docs/analise-ativos/blocoC/ATIVACAO.md` e `docs/analise-ativos/fase0/RUNBOOK.md` §1:

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

As conferências SQL são só leitura e também podem ser feitas de fora:
`ssh -i ~/.ssh/myfinance-lightsail ubuntu@56.125.206.95 "sudo -u postgres psql -d myfinance -At -c \"…\""`.

---

## Roteiro

### Passo 1 — Merge e deploy (a migration roda sozinha)

O merge na `main` faz o deploy (~4 min). `infra/deploy.sh` roda `prisma migrate deploy` antes do
flip. A migration `20261018000000_proventos_chave_datacom` é idempotente e **não mexe em dado**:
troca o índice único de `asset_dividend_history` de `(symbol, date, tipo)` para
`(symbol, date, tipo, dataCom) NULLS NOT DISTINCT` (as linhas atuais já satisfazem a chave nova).

**Horário:** não fazer o merge perto das 07:20 UTC (cron de proventos BRAPI). Entre o
`migrate deploy` e o flip o código antigo ainda está no ar; se coincidir com o cron, o lote daquele
símbolo falha e o próximo ciclo refaz.

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name = '20261018000000_proventos_chave_datacom';"
$PSQL -c "select indexname from pg_indexes where tablename = 'asset_dividend_history';"
# esperado: ..._symbol_date_tipo_dataCom_key presente e ..._symbol_date_tipo_key ausente
```

A partir daqui, sem nenhum passo manual, os crons já aplicam aos poucos: o `market-data/refresh`
reconcilia os proventos de cada símbolo que visita; o `scores` (10:10) reaudita proventos,
regrava eventos corporativos, derivados e múltiplos (A1–A8) e grava a flag de vacância (A4); o
`curadoria` abre os casos `fii_vacancia`; `criterios` (10:30) e `quadro` (10:40) leem tudo. O ITUB
pelo consolidado (A10) também sai no cron do dia seguinte. Os passos 2–5 antecipam e completam o
que o cron não faz sozinho (limpeza de uma vez e o universo da B3).

### Passo 2 — Limpeza das linhas de proventos somadas **[OK]**

Script `scripts/analise-ativos/limpar-proventos-somados.ts`: reconcilia as linhas BRAPI já gravadas
pelo mesmo caminho do sync (`gravarProventosBrapi` → `proventosBrapiPlano`), com 1 GET na BRAPI por
símbolo (≈ 813 símbolos, ~10 min). Dry-run por padrão; símbolo sem resposta da BRAPI é pulado.
Nunca apaga linha sem pagamento do legado, linha YAHOO nem histórico que a resposta não cobre.

```bash
# 2a. dry-run (só leitura no banco)
rodar scripts/analise-ativos/limpar-proventos-somados.ts > /tmp/limpeza-dry.txt
rodar scripts/analise-ativos/limpar-proventos-somados.ts --symbols=VIVT3,SAPR11,CMIG4,ITUB4,ISAE4
```

O que conferir no dry-run (volume esperado na tabela do Anexo A):

- `sem resposta da BRAPI` baixo;
- `linhas a apagar (versao_antiga (valor sai da base))` pequeno perto de `versao_antiga`: a maioria
  das versões antigas é o mesmo provento com a data-com do legado e ganha a linha certa em `criar`;
- na amostra, `apaga …*` = o valor sai da base sem provento igual na fonte (soma antiga, parcela
  que a fonte trocou pelo total).

```bash
# 2b. com o OK
rodar scripts/analise-ativos/limpar-proventos-somados.ts --apply > /tmp/limpeza-apply.txt
# 2c. idempotência: a 2ª passada deve dar 0 (ou só o que a BRAPI publicou entre as duas)
rodar scripts/analise-ativos/limpar-proventos-somados.ts | grep -E 'com mudança|criar|atualizar|apagar'
```

```bash
$PSQL -c "select symbol, date::date pag, \"dataCom\"::date com, tipo, \"valorUnitario\"
          from asset_dividend_history where symbol in ('SAPR11','VIVT3')
          and date >= '2026-04-01' order by 1,2,3;"
# SAPR11 em 26/06/2026: 1,408226885 (com 30/06/2025) e 0,552412806 (com 30/12/2025), sem o 1,9606
```

**2d. Espelhos órfãos da Carteira [OK].** A limpeza apaga linhas do histórico global, mas a cópia
que a Carteira guarda em `portfolio_proventos` (source `brapi`) do mesmo (pagamento, tipo) não é
apagada por nenhum sync (`ensurePortfolioProventosFromMarket` só cria ou atualiza). A aba Proventos e
o IR contam essas cópias; o Resumo e a rentabilidade não. O script
`scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts` apaga só a linha `brapi` não
dispensada, com pagamento até hoje, cujo (pagamento, tipo) não está mais no histórico do símbolo.
Nunca toca em `manual`, dispensada, símbolo sem histórico nem linha já creditada no Caixa para
Investir (essas aparecem à parte no relatório). Rodar DEPOIS do 2b.

```bash
rodar scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts > /tmp/orfaos-dry.txt   # dry-run
# cópia das linhas brapi antes de apagar (volta atrás = reinserir pelo id)
$PSQL -c "\copy (select * from portfolio_proventos where source = 'brapi') to '/tmp/portfolio_proventos_brapi_pre2d.csv' csv header"
rodar scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts --apply > /tmp/orfaos-apply.txt
rodar scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts | grep 'órfãs a apagar'   # 0
```

```sql
-- conferência (só leitura): cópias 'brapi' sem o (pagamento, tipo) no histórico
select a.symbol, count(*), count(distinct pp."userId"), round(sum(pp."valorTotal")::numeric, 2)
  from portfolio_proventos pp join portfolios p on p.id = pp."portfolioId"
  join assets a on a.id = p."assetId"
 where pp.source = 'brapi' and not pp.dismissed and pp."dataPagamento" <= now()
   and not exists (select 1 from asset_dividend_history h where h.symbol = upper(a.symbol)
                   and h.date = pp."dataPagamento" and h.tipo = pp.tipo)
 group by 1 order by 1;
-- antes do passo 2 (18/10, só leitura): 111 linhas, 3 usuários, R$ 14.563,69 — HFOF11 (75),
-- CPTI11 (21), BDIF11 (13), JSAF11 (2): cópias 'Dividendo' do YAHOO que o refresh da BRAPI trocou
-- por 'RENDIMENTO' em outra data (a irmã igual continua). Depois do 2b entram ~17 da limpeza (4
-- usuários; BBDC4, FLRY3, ITSA4, KFOF11, MXRF11, PRIO3, WEGE3; R$ 1.606,63). Depois do 2d: 0.
-- A consulta não aplica o filtro de fantasma mensal de FII que o script aplica (getDividendsFromDb):
-- o número exato é o do dry-run.
```

**2e. Reiniciar o app [OK].** A aba Proventos (`/api/analises/proventos`) guarda o histórico de
cada símbolo num cache em memória de 7 dias (`dividendsBySymbol`); o script roda em outro processo
e não o invalida. Sem reiniciar, a aba lê o histórico antigo por até 7 dias enquanto Resumo e IR já
leem o novo. Fora do pregão:

```bash
sudo systemctl restart myfinance
for i in $(seq 1 30); do curl -sf http://localhost:3000/api/health >/dev/null && echo ok && break; sleep 2; done
```

Conferir na tela (usuário de QA com SAPR11/VIVT3): a aba Proventos por data-com mostra as parcelas
de SAPR11 de 26/06/2026 em jun/2025 e dez/2025.

### Passo 3 — Universo de ações completado pela B3 (FCA 2026) **[OK]**

O FCA 2026 já foi processado em 02/10; sem `--reprocessar` o job pula o arquivo.

```bash
rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=fca --anos=2026 --perfil=completo --reprocessar
# conferir no detalhe: cadastro.tickersCompletadosB3 ≈ 29, tickersNovos ≈ 30, ciasNovas ≈ 15,
# tickersFechados = 0; alertas ticker_completado_b3 (29) e ticker_b3_sem_emissor (WDCN3)
rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=fca --anos=2026 --perfil=completo --reprocessar --apply
```

```sql
select origem, count(*) from cvm_company_tickers where "validTo" is null group by 1;
-- fca ≈ 426, b3 ≈ 29
select symbol, cnpj from cvm_company_tickers
 where symbol in ('BPAC11','CSNA3','CMIN3','CEAB3','MBRF3','RAIZ4') and "validTo" is null;
```

### Passo 4 — Balanços das ~15 empresas novas **[OK]**

Com `--reprocessar`, só os documentos que faltam são gravados: os das empresas novas e também
documentos que faltavam de empresas que já estavam no universo. Na base de 18/10 entram o ITR 2T26
da Camil (CAML3: P/L 19,9 → 30,2, ROE 3,69% → 2,38%, margem 1,00% → 0,67%), os ITRs de 2026 da
Rossi (margem do RSID3 −602% → −846%), o ITR 3T25 da Oi e a B100 (B1003). Essas mudanças vêm de
dado novo da CVM, não são regressão. Um ano por
vez, como no passo 6 do RUNBOOK, cada comando sem e depois com `--apply`:

```bash
rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=dfp,fre --anos=2014 --perfil=completo --reprocessar   # … até --anos=2025
rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=itr --anos=2024 --perfil=completo --reprocessar       # e --anos=2025
rodar scripts/analise-ativos/backfill-cvm-cias.ts --docs=dfp,itr --anos=2026 --perfil=completo --reprocessar
```

```sql
select "emissorId", count(*) filter (where "tipoPeriodo"='FY') fy, max("dtFim")
  from asset_fundamentals_period
 where "emissorId" in ('30306294000145','33042730000104','08902291000115','45242914000105',
                       '03853896000140','33453598000123')
 group by 1;
```

### Passo 5 — Recalcular a Análise e regerar critérios e Quadro **[OK]**

Uma rodada só cobre as quatro fatias (proventos regravados, eventos com data ex/cotação, contagem
de ações, vacância, universo novo e escopo do ITUB). `--tudo` é necessário: o ITUB não teve dado
novo, só mudou o escopo.

```bash
rodar scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --tudo
rodar scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --tudo --apply
sudo /usr/local/bin/myfinance-job.sh criterios
sudo /usr/local/bin/myfinance-job.sh quadro
```

Os casos de curadoria `fii_vacancia` abrem na rodada seguinte do job `curadoria` (cron). O
Essencial tem cache de 30 min, renovado quando sai uma nova versão do Quadro.

### Passo 6 — Conferências (só leitura)

**Proventos (A1, A2, M9)** — DY 12m em `asset_multiples_current.dy12mPct`:

```sql
select symbol, round("dy12mPct"::numeric, 2), flags from asset_multiples_current
 where symbol in ('SAPR11','VIVT3','CMIG4','CPFE3','BBDC4','BRSR6','ITUB4','ABEV3','ITSA4',
                  'RADL3','ISAE4','RBTS11','XLPR11','REME11') order by 1;
-- esperado ≈ B3: SAPR11 1,38; VIVT3 4,08; CMIG4 9,63; CPFE3 7,56; BBDC4 7,93; BRSR6 8,83;
-- ITUB4 6,45; ABEV3 5,03; ITSA4 7,31; RADL3 2,19; ISAE4 7,16; RBTS11 3,49; XLPR11 8,46; REME11 7,00
-- o flag proventos_em_conferencia_linha_suspeita só deve sobrar em EALT3/EALT4
select symbol from asset_multiples_current
 where array_to_string(flags, ',') like '%linha_suspeita%' order by 1;
```

**"Rendimento todos os meses" (A5/M7)**: KNRI11 10 anos e BTHF11 2023–2025 passam a "sem dado";
RZTR11 continua "59 de 60, não atende" (M8, decisão do Pedro).

**Eventos corporativos (A3, A6):**

```sql
-- A3: ALZR11 com um só evento, em 06/05/2025, confirmado (antes: 01/04 confirmado + 06/05 descartado)
SELECT symbol, "dataEvento", fator, status, fontes FROM asset_corporate_action_checks
 WHERE symbol IN ('ALZR11','CXRI11','EQIR11','GAME11','MAXR11','TSNC11','RZAT11') ORDER BY 1, 2;
-- esperado: ALZR11 2025-05-06; CXRI11 2020-09-10; EQIR11 2022-09-29; GAME11 2022-03-11;
-- MAXR11 2021-04-27; TSNC11 2022-07-16 (salto_rendimento); RZAT11 2021-01-01 (sem cotação nem salto)

-- A3: rendimento por cota do ALZR11 em 2025: ~1,00 (era 1,73)
SELECT symbol, "anoFiscal", "rendCota" FROM asset_per_share_yearly
 WHERE symbol = 'ALZR11' AND "anoFiscal" = 2025;

-- A6: eventos confirmados pela cotação
SELECT symbol, "dataEvento", fator, status, "razaoCvm", fontes FROM asset_corporate_action_checks
 WHERE 'cotacao_b3' = ANY(fontes) ORDER BY 1, 2;
-- esperado (17/10): AMBP3 2025-08-05, AZTE3 2026-07-09, ENJU3 2026-10-09, ORVR3 2026-08-11,
-- RCSL3/RCSL4 2026-10-05. IFCM3 2025-11-07 é PENDÊNCIA: na base de 18/10 continua
-- 'nao_validavel' (fonte YAHOO, razão 3,51)
```

**Contagem de ações, múltiplos e valor de mercado (A6–A8):**

```sql
SELECT m.symbol, round(m.pl::numeric, 2) pl, round(m.pvp::numeric, 2) pvp,
       round(q."valorMercado" / 1e9, 3) vm_bi, m.flags
  FROM asset_multiples_current m JOIN analise_quadro_linhas q USING (symbol)
 WHERE m.symbol IN ('ORVR3','ENJU3','TEND3','KLBN11','ALUP11','BRBI11','INEP3','CBAV3','SIMH3');
-- esperado (preço de 16/10): ORVR3 P/L ~218,6, P/VP ~2,26, VM ~11,0 bi; ENJU3 P/VP ~0,73;
-- TEND3 P/L ~5,7, P/VP ~2,15; KLBN11 VM ~22,3 bi; ALUP11 ~12,7 bi; BRBI11 ~1,9 bi;
-- INEP3 ~0,065 bi; CBAV3 ~7,4 bi (P/VP ~1,45); SIMH3 ~8,5 bi
```

Flags novas em `asset_multiples_current.flags`, só informativas (fora do Índice):
`acoes_evento_apos_contagem`, `acoes_alerta_lpa_confirma_anterior`, `acoes_escala_x1000_volume`,
`acoes_cotacao_anterior_evento` e `acoes_alerta_sem_lpa_destoa_ok`.

```sql
-- correções da revisão do QA (base de 18/10, prova local: só estes 5 tickers mudam no Quadro)
SELECT q.symbol, q."noQuadro", round(q."valorMercado" / 1e6, 1) vm_mi, round(m.pvp::numeric, 2) pvp,
       round(m.dpa12m::numeric, 4) dpa12m, round(m."dy12mPct"::numeric, 2) dy, m.flags
  FROM analise_quadro_linhas q JOIN asset_multiples_current m USING (symbol)
 WHERE q.symbol IN ('AMBP3','LUPA3','AGXY3','RAIZ4','HYPE3') ORDER BY 1;
-- esperado: AMBP3 VM ~21.669 mi (era 216.690), P/VP ~19,8 (era 198,2) — cotação de 30/12/2024
-- antes do ×10 de 05/08/2025; LUPA3 ~47,3 mi (era 4,7) e AGXY3 ~911,7 mi (era 60,8), com
-- acoes_cotacao_anterior_evento (o grupamento já na contagem é desfeito para a cotação antiga; no
-- AGXY3 a emissão de 2024 não é evento e fica); RAIZ4 ~3.827 mi (era 1.683) com
-- acoes_alerta_sem_lpa_destoa_ok (ITR 2T26 com 4,55 bi de ações; vale o DFP de 31/03/2026, 10,34
-- bi); HYPE3 DPA 12m 1,0816 = B3 (era 0,7891), DY ~4,23%
```

**Vacância de FII (A4):**

```sql
SELECT symbol, array_to_string(array(SELECT f FROM unnest(flags) f WHERE f LIKE 'conf:fii_vacancia%'), ',')
  FROM analise_quadro_linhas WHERE array_to_string(flags, ',') LIKE '%conf:fii_vacancia%' ORDER BY 1;
-- esperado (base de 18/10): 10 FIIs — ALMI11, APXM11, BRCR11, CCME11, HSML11, HTMX11, LASC11,
-- PLTB11, RBRK11, RZAT11; HSML11 com conf:fii_vacancia:vacancia_ocupacao@2025-12. BTHR11 e LKDV11
-- (100% em 4T25 e 1T26) voltaram a 0,0% no 2T26 e o episódio fecha sozinho; com dado mais antigo
-- eles aparecem (12 FIIs)

SELECT symbol, janela, (SELECT r->>'estado' || ' · ' || coalesce(r->>'fato','')
  FROM jsonb_array_elements(resultados::jsonb) r WHERE r->>'id'='vac')
  FROM criteria_eval WHERE symbol IN ('HSML11','TRBL11','PLTB11') ORDER BY 1,2;
-- esperado: HSML11 3 e 5 anos "sem dado" (antes "não atende · máx. 91,4%"); TRBL11 3 e 5 anos e
-- PLTB11 3 anos "sem dado"
```

**Universo e Itaú (A9, A10):**

```sql
-- ITUB4 janela 5: receita "atende" (173.757 → 387.118 R$ mi); margem mín. ~10,5%
-- BRBI11: receita e margem saem de "sem dado"
select symbol, janela, r->>'id', r->>'estado', r->>'fato'
  from criteria_eval, jsonb_array_elements(resultados) r
 where symbol in ('ITUB4','BRBI11') and r->>'id' in ('rec','mg') order by symbol, janela;
select symbol, "noQuadro" from analise_quadro_linhas
 where symbol in ('BPAC11','CSNA3','CEAB3','MBRF3','CMIN3','RAIZ4');
```

### Passo 7 — Semana de 01/01/2027 (M13, virada do ano)

Nada a fazer antes. Na primeira semana de 2027:

```sql
SELECT job, status, inicio::date FROM analise_job_runs
 WHERE inicio >= '2027-01-01' AND job IN ('cvm-cias:dfp','cvm-cias:itr','cvm-cias:fca','cvm-ipe',
                                          'fii-mensal','fii-trimestral','fii-cadastro')
 ORDER BY inicio DESC LIMIT 30;
```

Esperado: status `ok`, com o alerta `arquivo_ano_nao_publicado` (nível aviso) enquanto a CVM não
publicar o zip de 2027. Um 404 de arquivo de ano já passado, qualquer outro erro HTTP e o FRE
continuam dando `falha`.

---

## Efeito para o usuário da Carteira

Só a fatia de proventos mexe em código compartilhado (`dividendService`, `asset_dividend_history`,
`resolveProventos`, a aba Proventos). As outras três ficam dentro da Análise de Ativos.

- **Chave nova (passo 1).** Proventos pagos no mesmo dia com datas-com diferentes viram linhas
  separadas: cada parcela usa a quantidade que o usuário tinha na SUA data-com (antes, a soma inteira
  usava a quantidade de uma data-com só). Ex.: 100 cotas de SAPR11 em jun/2025 e 200 em dez/2025
  recebem 251,31 = 100 × 1,4082 + 200 × 0,5524 (antes 392,13). `ensurePortfolioProventosFromMarket`
  continua gravando um provento por (pagamento, tipo) — a soma das parcelas — e o override manual
  vale para todas as parcelas do mesmo dia (`resolveProventos`), sem duplicar.
- **O que a limpeza (passo 2) muda de fato.** Na maior parte, ela quebra a soma em parcelas SEM mudar
  o total do dia: na prova, só 5 chaves (symbol, pagamento, tipo) mudam de soma; as outras ~660
  atualizações e ~940 criações preservam o total. O valor recebido na Carteira só muda para quem
  comprou ou vendeu entre as datas-com das parcelas (SAPR11 acima), para quem comprou depois de
  uma parcela antiga, ou quando uma linha duplicada (`versao_antiga`) é apagada.
- **Ainda não fica igual à B3 em todos os símbolos.** A Carteira (`resolveProventoEvents`) conta a
  linha legada "sem pagamento" (pagamento = data-com) ao lado da linha paga equivalente — a Análise
  descarta essa linha (`duplicata_sem_pagamento`), a Carteira não. Prova local (100 ações compradas
  em 01/10/2025, data-com entre 17/10/2025 e 16/10/2026, por ação, antes → depois (B3)): SAPR11
  2,5131 → 1,1048 (0,5524); CPFE3 9,55 → 7,46 (3,73); CMIG4 2,43 → 1,37 (1,14); VIVT3 3,04 → 1,41
  (1,30); CSMG3 2,36 (1,99); BRSR6 2,37 → 2,37 (1,54), a Carteira continua com o valor da PNA. No
  total, 19 → 23 de 34 símbolos iguais à B3: melhora, mas não corrige tudo. Follow-up abaixo.
- **Espelhos órfãos (passo 2d).** Sem o 2d, as cópias em `portfolio_proventos` de proventos que a
  fonte trocou de data continuam na aba Proventos e no IR (e divergem do Resumo). O usuário não teria
  como saber qual linha é a fantasma; o 2d apaga essas cópias (contagem no passo 2d).
- **Aba Proventos por data-com.** O espelho com várias datas-com no mesmo pagamento passa a abrir
  nas parcelas do histórico, cada uma no mês da sua data-com e com o seu valor unitário, como o
  Resumo (SAPR11: 140,82 em jun/2025 + 110,48 em dez/2025, em vez de 251,31 em jun/2025; VIVT3: os
  JCPs mensais de 2025 pagos em 14/04/2026 em cada mês, não todos em abr/2025). Por pagamento nada
  muda. Linha `manual` não abre.
- **IR anual muda por dois motivos.** Pela limpeza (o valor certo de cada parcela) e porque o
  `ir-resumo-anual` já somava, antes desta branch, `getDividends × quantidade atual` E todas as
  linhas de `portfolio_proventos` não dispensadas, inclusive as copiadas (`brapi`): todo provento
  que o cron já copiou conta duas vezes (demo local: R$ 1.837,28 antes do cron de cópias, R$ 4.523,35
  depois; prod tem 1.602 cópias ativas de 8 usuários). Não é desta branch; follow-up abaixo.
- **Cache da aba Proventos:** só some com o restart do 2e.
- **Eventos corporativos da Carteira** não usam as correções da Análise (9e420b41): VIVT3 tem em
  prod DESDOBRAMENTO 80 + GRUPAMENTO 0,025 (BRAPI, 14/04/2025) e DESDOBRAMENTO 2 (YAHOO, 15/04/2025);
  `buildQuantityTimeline` aplica os três (×4 em vez de ×2). Nenhum usuário de prod tem VIVT3 hoje.
- O fantasma mensal de FII na Carteira continua com a regra de antes (só o mesmo mês); a Análise
  usa também o informe da CVM, que a Carteira não tem.

### Follow-ups da Carteira (fora desta branch)

1. A Carteira ignorar a linha legada "sem pagamento" quando houver a linha paga equivalente, com a
   mesma regra `duplicata_sem_pagamento` da Análise (corrige SAPR11, CPFE3, CMIG4, VIVT3, CSMG3 e
   o BRSR6/PNA acima).
2. `ir-resumo-anual`: contar só `source = 'manual'` de `portfolio_proventos` (ou deduplicar por
   (symbol, pagamento, tipo), como a aba Proventos faz).
3. O cron `brapi-sync/dividends` (modo `sync`) apagar sozinho os espelhos órfãos, com a mesma regra
   do 2d (`src/services/portfolio/proventosEspelhoOrfaos.ts`), para correções futuras da fonte. Não
   ligado nesta branch porque apagaria dado de usuário em prod sem o OK do passo 2d.
4. Eventos corporativos da Carteira sem dedup entre BRAPI e YAHOO em datas vizinhas (VIVT3).

## Comunicado ao Pedro (números que mudam na tela)

- BAZA3 e BGIP3/4 passam de "calculado" para "incompleto": o DY 12m está igual à B3, mas a
  deduplicação do JCP repetido de 2024 (BAZA3 2024: 12,77 → 6,39) faz o DY atual parecer um salto e
  entra o selo `proventos_em_conferencia_salto_recente`.
- 16 ações ficam sem valor de mercado por não terem contagem validada (Anexo B), entre elas SBSP3
  (R$ 22,5 bi antes) e AZUL3.
- GFSA3 continua com P/VP 0,006 (pendência conhecida, M10).
- O DY 12m de FII pode contar 13 datas-com quando o fundo paga perto do dia 16 ou 17 (ALZR11 1,089
  contra 12 parcelas) — já existia antes.
- IGTA3 (ticker extinto, fora do Quadro): P/L 18,0 → 9,0.
- GMAT3: com a limpeza a BRAPI passa a ter os JCPs de jun e set/2025 pagos em dez/2025 e a última
  data-com (19/11/2025) fica a mais de 300 dias; o ativo ganha `proventos_defasados_pagador_recorrente_parado`
  e o DY some (Índice "incompleto"), embora o DPA 12m (0,0496) seja igual ao da B3, que também não
  tem provento novo em 2026. O detector segue a regra aprovada; curadoria se o Pedro quiser liberar.
- CAML3, RSID3 e as empresas da Oi mudam pelo passo 4 (documentos novos da CVM).

## Volta atrás

- **Índice de proventos (se o app voltar para o código antigo depois da migration):** o código
  antigo faz `upsert` na chave antiga, que não existe mais, e o sync de proventos falha até um novo
  deploy. Recriar o índice antigo SÓ se não houver duas linhas na mesma (symbol, date, tipo) — o
  que deixa de valer depois do passo 2:

  ```bash
  $PSQL -c "select count(*) from (select 1 from asset_dividend_history
            group by symbol, date, tipo having count(*) > 1) x;"   # 0 = pode recriar
  $PSQL -c 'create unique index if not exists "asset_dividend_history_symbol_date_tipo_key"
            on asset_dividend_history (symbol, date, tipo);'
  ```

- **A10 (Itaú/BRBI):** gravar uma versão nova do ScoringParams com `financeiras.escopoPorRaiz = {}`.
- **A9 (universo):** fechar a vigência (`validTo`) das linhas `origem = 'b3'` em
  `cvm_company_tickers`. Uma linha `origem = 'manual'` vence FCA e B3.
- **A4 (vacância):** liberar o episódio na curadoria (o número volta a aparecer e a contar).
- acoes-eventos e M13 não gravam nada que precise desfazer: um deploy anterior + o cron recalculam.

## Gotcha do schema

O Prisma não representa `NULLS NOT DISTINCT` no `schema.prisma`: um `prisma migrate dev` futuro
pode propor recriar o índice `asset_dividend_history_symbol_date_tipo_dataCom_key` sem ele —
conferir o diff e não aceitar.

---

## Anexo A — Proventos (A1, A2, A5/M7, M9): prova e volume

Prova com os dados de prod de 17/10/2026 copiados para um schema isolado do banco local, BRAPI de
18/10. DY 12m (soma por data-com em 16/10/2025–16/10/2026) contra a B3:

| Ticker | Antes           | Só a auditoria nova | Auditoria + limpeza | B3             |
| ------ | --------------- | ------------------- | ------------------- | -------------- |
| SAPR11 | 2,5131 (6,28%)  | 0,5524 (1,38%)      | 0,5524 (1,38%)      | 0,5524 (1,38%) |
| VIVT3  | 3,0366 (9,56%)  | 2,0325 (6,40%)      | 1,2951 (4,08%)      | 1,2951 (4,08%) |
| CMIG4  | 2,4295 (20,54%) | 2,3113 (19,54%)     | 1,1394 (9,63%)      | 1,1394 (9,63%) |
| CPFE3  | 5,8144 (11,78%) | 3,7315 (7,56%)      | 3,7315 (7,56%)      | 3,7315 (7,56%) |
| BBDC4  | 2,2587 (11,09%) | 1,6145 (7,93%)      | 1,6145 (7,93%)      | 1,6145 (7,93%) |
| BRSR6  | 2,0004 (11,49%) | 1,5379 (8,83%)      | 1,5379 (8,83%)      | 1,5379 (8,83%) |
| ITUB4  | 4,1694 (8,67%)  | 3,4586 (7,19%)      | 3,0996 (6,45%)      | 3,0996 (6,45%) |
| ABEV3  | 1,1154 (6,62%)  | 0,8464 (5,03%)      | 0,8464 (5,03%)      | 0,8464 (5,03%) |
| ITSA4  | 1,1456 (7,42%)  | 1,1278 (7,31%)      | 1,1278 (7,31%)      | 1,1278 (7,31%) |
| RADL3  | 0,6171 (3,00%)  | 0,6171 (3,00%)      | 0,4506 (2,19%)      | 0,4538 (2,21%) |
| ISAE4  | 1,8506 (6,50%)  | 1,8506 (6,50%)      | 2,0395 (7,16%)      | 2,0395 (7,16%) |

Amostra do auditor (23 ações): **12 → 18 → 23 de 23** iguais à B3 (±1%). DPA anual 2023–2025 (62
combinações): **38 → 45 → 51**. FIIs: RBTS11 22,99 → 7,34 (B3 7,34); XLPR11 8,35 → 6,01 (B3 6,01);
ZAVI11 1,53 → 1,39 (B3 ~1,39); REME11 8,23 → 6,09 (B3 6,09).

Universo inteiro (só a auditoria nova, antes da limpeza): 74 símbolos mudam de DY 12m; dos 70 com
proventos no suplemento da B3, 65 ficam iguais ou mais perto (50 iguais, ±1%) e os 5 restantes
(GLCR11, ITSA4, MDNE3, TRIS3, ZAVI11) só parecem piores na conta crua do suplemento (provento que a
base ainda não tem, desdobramento não ajustado ou parcela que a B3 lista uma vez). Selo
`linha_suspeita`: 11 ações antes da limpeza (CEEB3/5, CMIG3/4, EALT3/4, EKTR4, HYPE3, RADL3, VITT3,
VIVT3) e 2 depois (EALT3/4, soma ainda na própria BRAPI).

Volume da limpeza completa na cópia de prod (813 símbolos com linha BRAPI):

| Medida                                                        |      Valor |
| ------------------------------------------------------------- | ---------: |
| sem resposta da BRAPI (pulados)                               |          5 |
| símbolos com mudança                                          |        399 |
| linhas criadas (parcelas que a soma escondia, chave certa)    |        941 |
| linhas atualizadas (soma → valor da parcela)                  |        665 |
| apagadas `versao_antiga` (mesmo provento, chave certa criada) |      3.059 |
| apagadas `versao_antiga` (valor sai da base)                  |        280 |
| apagadas `soma_orfa`                                          |          1 |
| 2ª passada                                                    | 0 mudanças |

As 280 "valor sai da base" se espalham por 117 símbolos e 1997–2026; conferidas na B3: totais que
a fonte trocou pelo cronograma de parcelas (CPFE3 2,7540 de 2024), parcelas trocadas pelo total
(CPFE3 30/04/2025 e 30/04/2026), somas antigas (VIVT3 0,8559; ITUB4 0,71076 de 31/08/2026), valor
velho (CURY3 0,3571 → 0,4545 de 04/02/2026), a escala errada da HBTS5 (259,97/ação) e tranches que
a fonte separou (VITT3 0,0647 de 03/11/2025 = 0,0326 + 0,0321). O número exato em prod é o do
dry-run do passo 2 (a BRAPI muda dia a dia).

Ainda erram no DPA anual (histórico, erro da fonte): BRSR6 2025, PETR4 2024 (JCP 0,6536 de
23/12/2024 publicado também como JCP), ITSA4 2023–2025, ISAE4 2025, CPFE3 2023, TAEE11 2023, KLBN11
2024, CMIG4 2024, ITUB4 2025. ISAE4 e ITUB4 só ficam certas depois do passo 2 e não ganham o selo
antes dele.

## Anexo B — acoes-eventos (A3, A6, A7, A8): o que muda e efeito medido

- **A3:** o evento `cvm_cotas` (salto de cotas no Informe Mensal) passa a ser datado pelo pregão ex
  (salto da cotação no COTAHIST, mês do informe ± 1); sem cotação, pelo salto do rendimento. O
  `anoBase` continua o ano do informe. Informe adiantado confirma o evento bruto (ALZR11).
- **A6:** evento posterior à última contagem de ações é confirmado pelo salto da cotação
  (`razaoCvm` nulo, fonte `cotacao_b3`) e multiplica o nº de ações vigente (ORVR3, ENJU3, RCSL3/4).
- **A7:** contagem 'alerta' desmentida pelo LPA publicado sai da conta (TEND3). As 'alerta' certas
  (ORVR3, SIMH3, MOVI3) continuam valendo.
- **A8:** Quadro e múltiplos usam a mesma contagem (`regras/calculo/contagemVigente.ts`): divide
  pelo nº de ações da unit (KLBN11, ALUP11, BRBI11), corrige escala de milhares pelo volume (INEP3,
  CBAV3), deixa de usar a última 'ok' antiga (SIMH3, MOVI3, HYPE3, PGMN3, VTRU3, BMGB4). Sem nº de
  ações validado, o valor de mercado some, como já sumia o P/L: 16 ações do Quadro em 17/10
  (ARND3, AZEV3/4, AZUL3, BSLI3/4, CBEE3, CSUD3, IFCM3, LAVV3, PDGR3, SAUD3, SBSP3, SEQL3, SOJA3,
  WEST3). Aparece em PINE3/4.

Efeito (dados de prod de 17/10): P/L e P/VP dos 31 tickers do auditor + KLBN11: 30 → 32 de 32
dentro de 1%. FIIs: 21 fundos com eventos alterados — rendimento por cota ALZR11 2025 1,73 → 1,00;
CXRI11 2020 20,46 → 14,16; EQIR11 2022 2,31 → 1,32; GAME11 2022 2,53 → 1,45; MAXR11 2021 17,77 →
8,03; TSNC11 2022 44,44 → 7,51; RBVA11, VIUR11, XPSF11 ~−7%; BTYU11 ×0,01 e FLMA11 ×0,02 passam a
ajustar. Ações (331 no Quadro): 7 eventos mudam de status; P/L e P/VP mudam em 9 tickers; valor de
mercado muda > 5% em 20.

Pendências: RZAT11 (sem cotação nem salto limpo, data fica no dia 1º); GFSA3 depende do ITR 2T26
(M10); INEP3 histórico por ação 2024–2025 em milhares não corrigido; SBSP3 sem o split 1:5 de 2026
em `asset_corporate_actions`; decisão de produto sobre o valor de mercado sumir nas 16 ações.

## Anexo C — fii-rotina (A4, M13): o que muda

- **A4 (critério):** detector `regras/fii/saneamentoVacancia.ts` sobre a série trimestral. Trimestre
  a ≥ 30 p.p. do último valor aceito abre episódio em conferência (`vacancia_ocupacao` quando fica a
  ≤ 15 p.p. do complemento; `vacancia_salto` nos outros casos). Aceito se a receita de aluguel
  confirma a subida, se o patamar dura 3 trimestres (não vale para troca por ocupação) ou se a
  curadoria libera. Trimestre em conferência = ponto incompleto: o ano fica "sem dado", nunca "não
  atende". Em prod: 79 trimestres em 54 episódios de 35 FIIs; o critério muda em 10 combinações de
  FII × janela, todas de "não atende" para "sem dado".
- **A4 (tela e curadoria):** grupo `fii_vacancia` (política ocultar; critério `vacancia` e
  componente C_rent inativos na v1/v2, Índice não muda). Quadro, KPIs e Comparador mostram "—" +
  chip "Vacância em conferência", com o número só no "Por quê?". Caso de curadoria no campo
  "Vacância (CVM)", chave = mês do 1º trimestre do episódio; fecha sozinho quando a vacância volta
  ao normal. Subida real com receita mantida (renda garantida, multa) fica em conferência até a
  curadoria liberar.
- **M13:** 404 de arquivo anual da CVM do ano corrente (ou futuro) vira "ainda não publicado"
  (status ok + alerta `arquivo_ano_nao_publicado`) em cvm-cias dfp/itr/fca, cvm-ipe, fii-mensal,
  fii-trimestral e fii-cadastro.

Pendências: `asset_multiples_yearly.vacanciaFisicaCvmPct` (barra histórica do Valuation e Raio-X)
continua com o número da CVM; os limiares (30 p.p., ±15 p.p., fator 0,5, 3 trimestres) são para o
Pedro calibrar; no M13, um arquivo que nunca apareça gera só aviso diário.

## Anexo D — universo-itau (A9, A10): o que muda

- **A9:** o job `cvm-cias:fca` completa o FCA com os tickers negociados na B3 (`AssetQuoteResumo`:
  lote padrão e negócio nos últimos 30 pregões), casados só com CNPJs que o próprio FCA do ano traz
  (`regras/acoes/tickersB3.ts`, mapa curado `EMISSOR_POR_RAIZ_B3` para códigos ilegíveis). Grava
  `origem = 'b3'`. Simulado com o FCA 2026 e dados de prod de 18/10: 30 tickers novos em 15
  empresas (BPAC11/3/5, CSNA3, CMIN3, MBRF3, CEAB3, RAIZ4, KLBN3/4, ALUP3/4, MLAS3, BRST3, B1003,
  AMAR3, EQPA3/5/7, INEP4, HAGA3/4, EPAR3, LUXM4, FIEI3, NORD3, PLAS3, MAPT3/4, OBTC3); nenhum
  ticker existente fechado. Ficam fora: WDCN3 (sem FCA 2026), EQMA3B (sufixo fora da regra 18),
  AZUL97/98/99 (recibos/direitos). Raiz com dígito na 4ª posição (B1003) passa a valer.
- **A10:** ITUB3/ITUB4 e BRBI11 pelo consolidado (`ESCOPO_POR_RAIZ_PADRAO` em
  `regras/acoes/financeiras.ts`, sobrescrevível por `financeiras.escopoPorRaiz`). ITUB4 5 anos:
  receita "não atende" (4.102 → 30.680) → "atende" (173.757 → 387.118 R$ mi); margem mínima 147,2% →
  10,5%. BRBI11: receita e margem saem de "sem dado". Bradesco, BB e Santander não mudam.

Pendências: o cron só completa com a B3 quando o arquivo FCA muda (ticker novo com FCA errado só
entra na próxima publicação ou com `--reprocessar`); Equatorial Pará mantém CELP3/5/6/7 no cadastro
(sem negócio, fora do Quadro); raiz nova ilegível no FCA vira alerta `ticker_b3_sem_emissor` e
entra à mão no mapa.
