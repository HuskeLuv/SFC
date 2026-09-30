# Cobertura da Fase 0 no banco DEV (integração A–E)

> Gerado em 30/09/2026 na integração da branch `feat/analise-ativos-fase0` (fatias 0, A, B, C, D e E).
> Banco: Neon de DEV (`.env`). Nada foi feito em produção. Data de referência dos scores:
> **2026-09-29** (último pregão no COTAHIST; o D30092026 ainda não estava publicado).

## 1. Como foi rodado

As fatias já tinham populado o dev em paralelo. Os scripts são idempotentes, então o backfill foi
rodado de novo **na ordem da spec** (`backfill.ordem`, perfil dev), com `--apply`, sobre esse estado.
Não houve TRUNCATE: apagar as tabelas novas em massa foi bloqueado pelo controle de permissões.
Nos passos em que tudo já estava gravado, a medição usa `--reprocessar` ou `--forcar`. Cada passo
foi medido com `/usr/bin/time -v` e `NODE_OPTIONS=--max-old-space-size=512`.

| Passo | Comando (resumo)                                                                    |      Tempo |   RSS máx. | Gravou                                                       |
| ----- | ----------------------------------------------------------------------------------- | ---------: | ---------: | ------------------------------------------------------------ |
| 1     | `seed-scoring-params.ts --apply`                                                    |      1,5 s |     118 MB | v1 já idêntica                                               |
| 2     | `backfill-cotahist.ts --so-cadastro`                                                |      3,8 s |     180 MB | 358 raízes (sha igual)                                       |
| 3     | `backfill-cvm-cias.ts --docs=fca --reprocessar`                                     |      3,9 s |     157 MB | 0 (depois do fix B3SA3: 2)                                   |
| 4     | `backfill-fii.ts --so-cadastro`                                                     | 8 min 42 s |     198 MB | 0 (527 casados, 491 conferidos)                              |
| 5     | `backfill-cotahist.ts --anos=2015-2026 --modo=dev` + `backfill-fii.ts --reconferir` | 47 s + 6 s |     250 MB | 0 (anos anteriores já processados; 2026 relido)              |
| 6     | `backfill-cvm-cias.ts --anos=2014-2026 --docs=dfp,fre,itr --reprocessar`            | 1 min 04 s | **502 MB** | 0 (depois do fix B3SA3: 3.385, pico 404 MB)                  |
| 7     | `backfill-fii.ts --desde=2016 --sem-cadastro`                                       |       20 s | **515 MB** | 0 (tudo igual)                                               |
| 8     | `backfill-ipe.ts --anos=2024-2026`                                                  |      6,8 s |     249 MB | 3.754 resultados + 1.959 assembleias (depois do fix de CNPJ) |
| 9     | `recalcular-analise.ts --etapas=proventos,eventos`                                  |       14 s |     254 MB | 0 (igual ao estado)                                          |
| 10    | `recalcular-analise.ts --etapas=derivados,scores --tudo`                            |       57 s |     391 MB | 17.291                                                       |
| 11    | `relatorio-notas-prototipo.ts`                                                      |      2,5 s |     128 MB | CSV                                                          |

O backfill completo ponta a ponta leva cerca de **13 min** de relógio. O passo 4 responde por 8m42s
disso, porque espera ~0,5 s em cada uma das 527 consultas `GetDetailFund` da B3. Durante essa espera o
Neon fechou a conexão ociosa uma vez (`prisma:error … kind: Closed`), o Prisma reconectou e o passo
terminou `ok`.

**Tamanho do banco dev: 288 MB** (limite: 450 MB). As 22 tabelas da fase 0 somam **169 MB**. As
maiores são asset_quotes_daily (56 MB, 396 mil linhas), asset_statement_lines (32 MB, 36
companhias), asset_fundamentals_period (19 MB), fii_monthly (18 MB) e asset_proventos_auditados
(14 MB).

### Rotas cron (uma execução cada, handler `GET` exportado via tsx, `CRON_SECRET` do .env, heap 384)

| Rota             | HTTP |  Tempo | RSS do processo | AnaliseJobRun                                              |
| ---------------- | ---- | -----: | --------------- | ---------------------------------------------------------- |
| b3-cadastro      | 200  |  2,4 s | 145 → 174 MB    | `b3-cadastro` ok                                           |
| cvm-cias?doc=fca | 200  |  2,3 s | 118 → 144 MB    | `cvm-cias:fca` ok                                          |
| cvm-cias?doc=dfp | 200  |  3,5 s | 101 → 173 MB    | `cvm-cias:dfp` ok                                          |
| cvm-cias?doc=itr | 200  |  3,3 s | 102 → 169 MB    | `cvm-cias:itr` ok                                          |
| cvm-ipe          | 200  |  4,4 s | 102 → 189 MB    | `cvm-ipe` ok (download real, 6.762 linhas)                 |
| fii-cadastro     | 200  | 50,3 s | 116 → 159 MB    | `fii-cadastro` ok (60 detalhes, 19 alertas de conferência) |
| fii-mensal       | 200  |  2,7 s | 116 → 152 MB    | `fii-mensal` ok (pulou por ETag)                           |
| fii-trimestral   | 200  |  2,3 s | 115 → 147 MB    | `fii-trimestral` ok (pulou por ETag)                       |
| cotahist         | 200  |  3,9 s | 121 → 208 MB    | `cotahist` ok (D30092026 ainda 404, alerta info)           |
| scores           | 200  | 18,3 s | 115 → 300 MB    | `scores` ok (1.381 linhas regravadas)                      |
| (sem segredo)    | 401  |      — | —               | —                                                          |

Todas as 10 execuções ficaram gravadas em `analise_job_runs` com `origem = 'cron'` e `status = 'ok'`.
Todas cabem no limite do cron: menos de 4 min e menos de 300 MB de delta de RSS. A mais pesada é a
scores, com delta de 185 MB.

## 2. Cobertura por classe

### Ações B3

| Métrica                                                 |                              Dev | Meta / Fase A                                                 |
| ------------------------------------------------------- | -------------------------------: | ------------------------------------------------------------- |
| Companhias no universo (FCA 2026, com ações em bolsa)   |                              330 | ≥ 300 / 306                                                   |
| Tickers vigentes                                        |                              427 | —                                                             |
| Companhias com DFP FY2025                               |                              315 | ≥ 290                                                         |
| Companhias com LPA em 10+ anos (asset_per_share_yearly) |                              213 | 211                                                           |
| Companhias com LPA em 5+ anos                           |                              298 | 299                                                           |
| Companhias com TTM no 2T26                              |                              301 | 296                                                           |
| Raio-X (asset_statement_lines, subconjunto dev)         |                         36 de 40 | 40 (5 tickers da lista saíram do FCA; B3SA3 voltou com o fix) |
| Contagens de ações: ok / alerta / não verificável       |              3.884 / 635 / 1.317 | razão LPA consistente 96% (Fase A 93,6%)                      |
| Tickers com score em 2026-09-29                         | 347 de 347 com FY e preço (100%) | —                                                             |
| … incompletos                                           |                        113 (33%) | —                                                             |

### FIIs

| Métrica                                                          |                                         Dev | Meta / Fase A          |
| ---------------------------------------------------------------- | ------------------------------------------: | ---------------------- |
| FIIs na lista B3 / casados ticker↔CNPJ                           |                                   527 / 527 | ≥ 460 / 467            |
| Conferidos (valor de mercado/PL em [0,3; 3])                     |                                         491 | —                      |
| CNPJs com informe mensal em ago/26                               |                                         509 | ≥ 455 / 464            |
| Fundos com informe trimestral no 2T26                            |                                         500 | —                      |
| Tipo vigente ago/26: tijolo / papel / fof / indefinido / híbrido |                     298 / 85 / 69 / 47 / 10 | 268 / 85 / 59 / 45 / 7 |
| Com score (conferidos com preço)                                 | 334 (277 no Índice + 57 FoF fora do Índice) | —                      |
| … incompletos                                                    |                                          92 | —                      |

### Scores por régua (dataRef 2026-09-29)

| Classe | Régua                | Ativos | Incompletos | Índice médio |
| ------ | -------------------- | -----: | ----------: | -----------: |
| ação   | acao                 |    310 |         111 |         4,60 |
| ação   | acao_financeira      |     37 |           2 |         7,44 |
| FII    | fii_papel            |     72 |           8 |         3,71 |
| FII    | fii_tijolo           |    205 |          84 |         3,37 |
| FII    | fora_do_indice (FoF) |     57 |           — |            — |

Os motivos de "incompleto" mais comuns: `div:sem_dado_fonte` 97, `lucro:sem_dado_fonte` 84,
`preco:historico_curto` 81, `rent:sem_dado_fonte` 62, `lucro:controladora_zero` 41,
`preco:sem_dado_fonte` 19 e `tipo:indefinido` 15.

### Eventos (asset_eventos)

| Tipo                         | Linhas | Emissores |
| ---------------------------- | -----: | --------: |
| assembleia (IPE 2024–2026)   |  1.965 |       320 |
| resultado (entregas DFP/ITR) |  2.518 |       320 |
| resultado_estimado           |  1.248 |       318 |

Critérios de aceite: 318 emissores com assembleia em 2026 (mínimo 250) e 318 com estimativa vigente
(mínimo 280). Exemplo: WEGE3 tem o 3T26 estimado para 22/10/2026 e AGO em 23/04/2026.

### Cotações (asset_quotes_daily)

Em 2015–2024 há só os pregões de fim de período, 19 a 20 por ano. 2025 tem 250 pregões e 2026
tem 186 (até 29/09). No asset_quote_resumo, 727 símbolos negociaram nos últimos 30 pregões.

## 3. Vinte ativos: Índice MF, os 5 componentes e incompleto

Componentes: lucro, dívida, rentabilidade, dividendos e preço (nota 0–10). **n/a** = "não se aplica":
dívida em financeira; rentabilidade em FII de tijolo, porque vacância e diversificação estão desligadas
pela decisão 6. "Critérios" = semáforo atendido / aplicável.

| Ticker | Régua           | Índice MF | Lucro | Dívida | Rent. |  Div. | Preço | Critérios | Incompleto                                                               |
| ------ | --------------- | --------: | ----: | -----: | ----: | ----: | ----: | --------- | ------------------------------------------------------------------------ |
| ABEV3  | acao            |      8.96 | 10.00 |  10.00 |  7.36 |  6.59 | 10.00 | 5 de 5    | não                                                                      |
| B3SA3  | acao            |      8.63 | 10.00 |  10.00 | 10.00 |  1.62 |  8.91 | 4 de 5    | não                                                                      |
| BBAS3  | acao_financeira |      6.32 | 10.00 |    n/a |  3.19 |  3.67 |  3.67 | 1 de 4    | não                                                                      |
| EGIE3  | acao            |      7.86 | 10.00 |   4.94 | 10.00 |  2.47 | 10.00 | 3 de 5    | não                                                                      |
| ITUB4  | acao_financeira |      9.34 | 10.00 |    n/a |  8.98 |  9.16 |  8.01 | 4 de 4    | não                                                                      |
| KLBN11 | acao            |      1.47 |  0.00 |   4.84 |  0.00 |  3.31 |  0.00 | 0 de 5    | sim (lucro:controladora_zero, rent:sem_dado_fonte, preco:sem_dado_fonte) |
| MGLU3  | acao            |      3.65 |  2.00 |   8.30 |  0.32 |  1.53 | 10.00 | 2 de 5    | não                                                                      |
| PETR4  | acao            |       7.9 |  8.00 |   8.09 | 10.00 |  3.20 | 10.00 | 4 de 5    | não                                                                      |
| SBSP3  | acao            |      1.73 |  0.00 |   6.32 |  0.00 |  3.12 |  0.00 | 1 de 5    | sim (lucro:controladora_zero, rent:sem_dado_fonte, preco:sem_dado_fonte) |
| TAEE11 | acao            |      7.68 | 10.00 |   4.20 |  8.06 |  7.42 |  6.19 | 3 de 5    | não                                                                      |
| VALE3  | acao            |      5.58 |  6.00 |   7.81 |  2.11 | 10.00 |  0.00 | 3 de 5    | não                                                                      |
| WEGE3  | acao            |      9.01 | 10.00 |  10.00 | 10.00 |  4.98 |  7.63 | 4 de 5    | não                                                                      |
| HFOF11 | fora_do_indice  |         — |   n/a |    n/a |   n/a |   n/a |   n/a | 0 de 0    | não                                                                      |
| HGLG11 | fii_tijolo      |      2.89 |  0.00 |   4.58 |   n/a |  3.25 |  9.08 | 1 de 3    | não                                                                      |
| KNCR11 | fii_papel       |      5.46 |  0.00 |  10.00 | 10.00 |  3.95 |  8.68 | 3 de 4    | não                                                                      |
| KNIP11 | fii_papel       |       5.1 |  0.00 |   9.62 | 10.00 |  2.26 |  8.37 | 3 de 4    | não                                                                      |
| KNRI11 | fii_tijolo      |       3.2 |  0.00 |   7.21 |   n/a |  2.40 |  7.58 | 2 de 3    | não                                                                      |
| MXRF11 | fii_papel       |      5.37 |  0.00 |   9.24 | 10.00 |  3.91 |  9.31 | 3 de 4    | não                                                                      |
| TRXF11 | fii_tijolo      |      3.13 |  0.00 |   0.00 |   n/a | 10.00 | 10.00 | 2 de 3    | não                                                                      |
| XPLG11 | fii_tijolo      |      3.41 |  0.00 |   5.13 |   n/a |  5.17 |  9.27 | 1 de 3    | não                                                                      |

Leituras rápidas:

- **WEGE3, ITUB4, ABEV3, B3SA3:** notas altas e completas.
- **KLBN11 e SBSP3:** incompletas por `controladora_zero`, porque a linha 3.11.01 vem 0 no consolidado
  (regra 12). Na SBSP3 as linhas 3.11.01 e 3.11.02 vêm zeradas e o individual traz o mesmo lucro
  (R$ 8,46 bi em 2025). Ver problemas abertos.
- **FIIs:** o componente lucro sai 0 em todos, porque a base de proventos do dev
  (asset_dividend_history) para em jun/2026. Com isso, "meses com rendimento" até 29/09 = 0. O zero
  aparece como `calculado` e não como `ausente`. Isso derruba o Índice dos FIIs no dev: veja HGLG11
  2,89 contra 8,8 no protótipo.

## 4. Notas reais × protótipo (decisão 1)

Arquivo: `docs/analise-ativos/fase0/notas-reais-prototipo.csv` (91 ativos do protótipo; 77 com linha em asset_scores, sendo 74 com Índice e 3 FoF fora do Índice).

- **Ações:** 42 com score, diferença média +0,49 e erro absoluto médio 2,02; 15 ficam a até 1 ponto
  do protótipo.
- **FIIs:** 32 com score, diferença média −2,45 e erro absoluto médio 2,76. O viés negativo vem quase
  todo do C_lucro = 0, pela base de proventos parada no dev.
- **Sem score (9 ações):** AZUL4, CPLE6, ELET3, EMBR3, ODPV3, TRPL4, CSNA3 e GOLL4 não estão no FCA
  2026 vigente ou não negociam mais. Em alguns casos o ticker mudou: EMBR3 → EMBJ3, ELET3 → AXIA3,
  TRPL4 → ISAE4. A CSN tem `Codigo_Negociacao = "4030"` no FCA 2026, um erro da fonte.
- **Sem score (6 FIIs):** HCTR11 e DEVA11 não passaram na conferência; BCFF11, MALL11 e RBRF11 não
  estão na lista B3 atual; IRDM11 foi sucedido por IRIM11.
- **Fora do Índice (3 FoF):** CPTS11, HFOF11 e KFOF11.

| Ticker | Classe | Régua           | Índice (fórmula) | Protótipo | Diferença | Critérios | Incompleto                                                               |
| ------ | ------ | --------------- | ---------------: | --------: | --------: | --------- | ------------------------------------------------------------------------ |
| WEGE3  | acao   | acao            |             9,01 |       9,1 |     -0,09 | 4 de 5    | não                                                                      |
| ITSA4  | acao   | acao_financeira |              8,8 |       8,6 |       0,2 | 4 de 4    | não                                                                      |
| BBAS3  | acao   | acao_financeira |             6,32 |       8,2 |     -1,88 | 1 de 4    | não                                                                      |
| TAEE11 | acao   | acao            |             7,68 |       7,9 |     -0,22 | 3 de 5    | não                                                                      |
| EGIE3  | acao   | acao            |             7,86 |         8 |     -0,14 | 3 de 5    | não                                                                      |
| PSSA3  | acao   | acao_financeira |             7,64 |       7,6 |      0,04 | 3 de 4    | não                                                                      |
| VALE3  | acao   | acao            |             5,58 |       7,1 |     -1,52 | 3 de 5    | não                                                                      |
| PETR4  | acao   | acao            |              7,9 |       6,4 |       1,5 | 4 de 5    | não                                                                      |
| MGLU3  | acao   | acao            |             3,65 |       3,2 |      0,45 | 2 de 5    | não                                                                      |
| AZUL4  | acao   | sem_score       |                — |       1,8 |         — | —         | —                                                                        |
| ABEV3  | acao   | acao            |             8,96 |       6,6 |      2,36 | 5 de 5    | não                                                                      |
| B3SA3  | acao   | acao            |             8,63 |       3,9 |      4,73 | 4 de 5    | não                                                                      |
| BBDC4  | acao   | acao_financeira |             8,69 |       6,7 |      1,99 | 3 de 4    | não                                                                      |
| BBSE3  | acao   | acao_financeira |             9,66 |       5,7 |      3,96 | 4 de 4    | não                                                                      |
| CMIG4  | acao   | acao            |              7,8 |       6,9 |       0,9 | 5 de 5    | não                                                                      |
| CPLE6  | acao   | sem_score       |                — |       7,1 |         — | —         | —                                                                        |
| CSAN3  | acao   | acao            |                0 |       7,6 |      -7,6 | 0 de 5    | não                                                                      |
| CYRE3  | acao   | acao            |             7,77 |       3,7 |      4,07 | 5 de 5    | não                                                                      |
| ELET3  | acao   | sem_score       |                — |         3 |         — | —         | —                                                                        |
| EMBR3  | acao   | sem_score       |                — |         8 |         — | —         | —                                                                        |
| ENGI11 | acao   | acao            |             5,75 |       4,6 |      1,15 | 1 de 5    | não                                                                      |
| EQTL3  | acao   | acao            |             4,88 |       3,1 |      1,78 | 1 de 5    | não                                                                      |
| FLRY3  | acao   | acao            |             7,59 |       5,5 |      2,09 | 3 de 5    | não                                                                      |
| GGBR4  | acao   | acao            |             5,44 |       3,1 |      2,34 | 2 de 5    | não                                                                      |
| HYPE3  | acao   | acao            |             7,22 |       7,3 |     -0,08 | 3 de 5    | não                                                                      |
| ITUB4  | acao   | acao_financeira |             9,34 |       7,1 |      2,24 | 4 de 4    | não                                                                      |
| KLBN11 | acao   | acao            |             1,47 |       3,8 |     -2,33 | 0 de 5    | sim (lucro:controladora_zero, rent:sem_dado_fonte, preco:sem_dado_fonte) |
| LREN3  | acao   | acao            |              8,8 |       3,9 |       4,9 | 4 de 5    | não                                                                      |
| MDIA3  | acao   | acao            |             8,22 |       7,5 |      0,72 | 4 de 5    | não                                                                      |
| MULT3  | acao   | acao            |             7,86 |       5,1 |      2,76 | 4 de 5    | não                                                                      |
| ODPV3  | acao   | sem_score       |                — |         7 |         — | —         | —                                                                        |
| PRIO3  | acao   | acao            |             6,56 |       7,2 |     -0,64 | 2 de 5    | não                                                                      |
| RADL3  | acao   | acao            |             8,24 |       5,4 |      2,84 | 4 de 5    | não                                                                      |
| RAIL3  | acao   | acao            |             3,35 |       8,1 |     -4,75 | 2 de 5    | não                                                                      |
| RENT3  | acao   | acao            |             7,24 |       7,6 |     -0,36 | 3 de 5    | não                                                                      |
| SANB11 | acao   | acao_financeira |              8,6 |       7,7 |       0,9 | 4 de 4    | não                                                                      |
| SAPR11 | acao   | acao            |              5,8 |       6,9 |      -1,1 | 2 de 5    | não                                                                      |
| SBSP3  | acao   | acao            |             1,73 |       3,4 |     -1,67 | 1 de 5    | sim (lucro:controladora_zero, rent:sem_dado_fonte, preco:sem_dado_fonte) |
| SLCE3  | acao   | acao            |             6,12 |       4,7 |      1,42 | 3 de 5    | não                                                                      |
| SUZB3  | acao   | acao            |             4,13 |       2,4 |      1,73 | 2 de 5    | não                                                                      |
| TOTS3  | acao   | acao            |             8,09 |       8,1 |     -0,01 | 4 de 5    | não                                                                      |
| TRPL4  | acao   | sem_score       |                — |       3,2 |         — | —         | —                                                                        |
| UGPA3  | acao   | acao            |             8,15 |       8,2 |     -0,05 | 4 de 5    | não                                                                      |
| UNIP6  | acao   | acao            |             7,23 |       6,2 |      1,03 | 3 de 5    | não                                                                      |
| VIVT3  | acao   | acao            |             7,82 |         8 |     -0,18 | 4 de 5    | não                                                                      |
| WIZC3  | acao   | acao            |                9 |       2,4 |       6,6 | 4 de 5    | sim (preco:historico_curto)                                              |
| CSNA3  | acao   | sem_score       |                — |       6,8 |         — | —         | —                                                                        |
| COGN3  | acao   | acao            |             3,48 |       8,2 |     -4,72 | 2 de 5    | sim (preco:historico_curto)                                              |
| CVCB3  | acao   | acao            |             1,85 |       6,7 |     -4,85 | 1 de 5    | sim (rent:sem_dado_fonte)                                                |
| GOLL4  | acao   | sem_score       |                — |       8,3 |         — | —         | —                                                                        |
| HGLG11 | fii    | fii_tijolo      |             2,89 |       8,8 |     -5,91 | 1 de 3    | não                                                                      |
| KNRI11 | fii    | fii_tijolo      |              3,2 |       8,5 |      -5,3 | 2 de 3    | não                                                                      |
| XPLG11 | fii    | fii_tijolo      |             3,41 |       8,3 |     -4,89 | 1 de 3    | não                                                                      |
| BTLG11 | fii    | fii_tijolo      |             3,92 |       8,4 |     -4,48 | 2 de 3    | não                                                                      |
| VISC11 | fii    | fii_tijolo      |             1,89 |       7,9 |     -6,01 | 1 de 3    | não                                                                      |
| HGRU11 | fii    | fii_tijolo      |             3,71 |       8,1 |     -4,39 | 1 de 3    | não                                                                      |
| KNCR11 | fii    | fii_papel       |             5,46 |         8 |     -2,54 | 3 de 4    | não                                                                      |
| MXRF11 | fii    | fii_papel       |             5,37 |       7,4 |     -2,03 | 3 de 4    | não                                                                      |
| HCTR11 | fii    | sem_score       |                — |       4,1 |         — | —         | —                                                                        |
| KNIP11 | fii    | fii_papel       |              5,1 |       8,2 |      -3,1 | 3 de 4    | não                                                                      |
| BRCO11 | fii    | fii_tijolo      |             2,28 |       8,2 |     -5,92 | 1 de 3    | não                                                                      |
| ALZR11 | fii    | fii_tijolo      |             2,56 |       7,9 |     -5,34 | 1 de 3    | não                                                                      |
| BCFF11 | fii    | sem_score       |                — |       8,2 |         — | —         | —                                                                        |
| BRCR11 | fii    | fii_tijolo      |             4,35 |       5,4 |     -1,05 | 2 de 3    | não                                                                      |
| CPTS11 | fii    | fora_do_indice  |                — |       1,2 |         — | 0 de 0    | não                                                                      |
| DEVA11 | fii    | sem_score       |                — |       2,6 |         — | —         | —                                                                        |
| GGRC11 | fii    | fii_tijolo      |             4,83 |       7,1 |     -2,27 | 3 de 3    | não                                                                      |
| HFOF11 | fii    | fora_do_indice  |                — |         4 |         — | 0 de 0    | não                                                                      |
| HGBS11 | fii    | fii_tijolo      |             2,55 |       7,2 |     -4,65 | 1 de 3    | não                                                                      |
| HGRE11 | fii    | fii_tijolo      |             4,26 |       3,4 |      0,86 | 2 de 3    | não                                                                      |
| HSML11 | fii    | fii_tijolo      |             2,41 |       6,3 |     -3,89 | 1 de 3    | não                                                                      |
| IRDM11 | fii    | sem_score       |                — |       4,9 |         — | —         | —                                                                        |
| JSRE11 | fii    | fii_tijolo      |             4,44 |       6,1 |     -1,66 | 2 de 3    | não                                                                      |
| KFOF11 | fii    | fora_do_indice  |                — |       7,1 |         — | 0 de 0    | não                                                                      |
| KNHY11 | fii    | fii_papel       |             5,43 |       5,1 |      0,33 | 3 de 4    | não                                                                      |
| KNSC11 | fii    | fii_papel       |             5,16 |         5 |      0,16 | 3 de 4    | não                                                                      |
| LVBI11 | fii    | fii_tijolo      |             4,41 |       4,1 |      0,31 | 2 de 3    | não                                                                      |
| MALL11 | fii    | sem_score       |                — |       7,8 |         — | —         | —                                                                        |
| PVBI11 | fii    | fii_tijolo      |             4,15 |       4,1 |      0,05 | 2 de 3    | não                                                                      |
| RBRF11 | fii    | sem_score       |                — |       5,4 |         — | —         | —                                                                        |
| RBRR11 | fii    | fii_papel       |             4,29 |         7 |     -2,71 | 2 de 4    | não                                                                      |
| RECR11 | fii    | fii_papel       |             4,97 |       2,3 |      2,67 | 2 de 4    | não                                                                      |
| RZTR11 | fii    | fii_tijolo      |                3 |       3,6 |      -0,6 | 2 de 3    | não                                                                      |
| TGAR11 | fii    | fii_tijolo      |              5,5 |         5 |       0,5 | 3 de 3    | não                                                                      |
| TRXF11 | fii    | fii_tijolo      |             3,13 |       6,9 |     -3,77 | 2 de 3    | não                                                                      |
| VGIP11 | fii    | fii_papel       |             4,29 |       7,2 |     -2,91 | 2 de 4    | não                                                                      |
| VILG11 | fii    | fii_tijolo      |             3,48 |       4,6 |     -1,12 | 1 de 3    | não                                                                      |
| VINO11 | fii    | fii_tijolo      |             2,61 |       6,3 |     -3,69 | 2 de 3    | não                                                                      |
| VRTA11 | fii    | fii_papel       |              5,1 |       6,6 |      -1,5 | 2 de 4    | não                                                                      |
| XPCI11 | fii    | fii_papel       |             4,81 |       8,4 |     -3,59 | 2 de 4    | não                                                                      |
| XPML11 | fii    | fii_tijolo      |             3,49 |       3,5 |     -0,01 | 1 de 3    | não                                                                      |

## 5. Divergências em relação à Fase A

| Item                                               | Fase A                       | Dev (fase 0 integrada)                     | Leitura                                        |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------ | ---------------------------------------------- |
| WEGE3 2016 nº de ações                             | 1.614,4 mi                   | 1.614,35 mi (fre_f)                        | ✓                                              |
| WEGE3 2016 LPA / P/L 2019 / P/L 2024               | 0,6923 / 45,1 / 36,7         | 0,6923 / 45,05 / 36,64                     | ✓                                              |
| PETR4 2024 payout DMPL                             | ≈ 274%                       | 275,6%                                     | ✓ (arredondamento)                             |
| VALE3 2024 nº de ações                             | —                            | 4.268,72 mi (dfp_x1000)                    | escala ×1000 detectada                         |
| BBAS3 3T25 "controladora = 0"                      | 18.493 (TTM errado)          | não existe nos arquivos atuais; TTM 12.272 | o 18.493 era artefato do script da Fase A      |
| BBAS3 2024 payout                                  | —                            | ausente (`dmpl_zero_com_proventos`)        | DMPL do escopo ind do banco vem 0              |
| Companhias com LPA 10+ anos                        | 211                          | 213                                        | ✓                                              |
| Universo de FIIs (informe ago/26)                  | 464                          | 509                                        | o CNPJ da B3 (GetDetailFund) casou mais fundos |
| Tipos de FII (tijolo/papel/fof/híbrido/indefinido) | 268/85/59/7/45               | 298/85/69/10/47                            | universo maior                                 |
| HGLG11 VP/cota ago/26, cotistas, Obrigações/PL     | 165,9514 · 608.345 · 16,2%   | idêntico                                   | ✓                                              |
| HGLG11 2T26 imóveis / vacância; XPLG11 vacância    | 37 / 2,41%; 18,32%           | idêntico                                   | ✓ (fora do Índice pela decisão 6)              |
| CRIs KNIP11 / KNCR11 / RECR11                      | 119 / 96 / 100               | idêntico                                   | ✓                                              |
| Emissores com assembleia em 2026                   | 478 (sem filtro de listagem) | 318 (universo listado)                     | filtro por universo                            |
| Símbolos negociados por pregão (BDI 02+12)         | ~950                         | ~620                                       | o ~950 incluía outros BDIs                     |
| Raízes na ClassifSetorial                          | 358                          | 358                                        | ✓                                              |
| Nota BBAS3 (protótipo)                             | 8,2                          | 6,32                                       | rentabilidade 3,19; dívida n/a                 |
| Nota dos FIIs de tijolo (protótipo)                | ~8                           | 2–4                                        | C_lucro 0 pela base de proventos parada no dev |

## 6. Correções feitas na integração

1. `fix(analise-ativos): CNPJ do IPE na mesma máscara do universo da fatia A`. A fatia E normalizava
   o CNPJ para 14 dígitos, mas A e B gravam com a máscara da CVM. Resultado: 0 assembleias casavam
   com o universo. O contrato da spec diz "14 dígitos sem máscara", mas A, B, C e D já gravam com
   máscara. A correção alinhou a E ao formato real; a decisão formal está nos problemas abertos.
2. `fix(analise-ativos): ticker com dígito na raiz (B3SA3) entra no universo de ações`. O filtro
   `^[A-Z]{4}\d` deixava a B3 S.A. fora de cvm_companies.

## 7. Problemas abertos (para decidir)

1. **Formato do CNPJ.** O contrato da spec diz "14 dígitos sem máscara", mas cvm_companies,
   cvm_company_tickers, asset_fundamentals_period.emissorId, fii_ticker_map, fii_monthly/quarterly e
   asset_scores gravam com máscara. A tabela existente `cvm_fund_quotas` usa 14 dígitos. É preciso
   decidir **antes do backfill de produção**: ou se formaliza a máscara, ou A e B passam a normalizar e
   o dev é regravado.
2. **Regra 12 (controladora = 0).** Das ações, 41 ficam incompletas por `lucro:controladora_zero`
   (SBSP3, KLBN11…). Quando 3.11.01 e 3.11.02 vêm os dois zerados, a companhia não preencheu a
   divisão. Proposta para o Pedro: usar o lucro do escopo individual (que é, por definição, o da
   controladora) em vez de ausente.
3. **C_lucro de FII com base de proventos defasada.** O dev parou em jun/2026 e o resultado sai
   `calculado` com 0, não `ausente`. Em produção a base é atualizada pelos crons atuais, mas uma falha
   do cron de proventos derrubaria todos os FIIs para 0. Sugestão: ausente quando o último provento
   do universo FII for mais velho que N dias.
4. **RSS dos scripts de backfill** (não do cron). `backfill-cvm-cias --reprocessar` com 13 anos chegou
   a 502 MB (alerta `rss_acima_limite`) e `backfill-fii --desde=2016` chegou a 515 MB. O RUNBOOK já manda
   rodar um ano por vez em produção; conferir o pico por ano antes da janela.
5. **B3SA3 na régua `acao`.** A B3 é do setor "Serviços Financeiros Diversos". Falta confirmar se deve
   usar `acao_financeira`.
6. **Pendências das fatias** (em `qa/pendencias-{B,D,E}.md` e no relatório de integração): ScoringParams
   v2 (limiares hoje fixos no código), `b3_cnpj` na união `TickerFii['origem']`, motivo
   `ebitda_nao_positivo` em `EstadoComponente`, `naoSeAplica` em FiiQuarterly, calendário de pregões
   no fim de ano (31/12 em fim de semana) e a curadoria dos 36 FIIs não conferidos.
