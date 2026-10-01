# Fase A — Ações via CVM (papel: dados de ações)

Data: 30/09/2026 · Fonte: CVM Dados Abertos (DFP 2014-2026, ITR 2024-2026, FRE 2014-2026, FCA 2026, IPE 2024-2026),
classificação setorial B3 (xlsx público) e banco **DEV** (Neon, só leitura: `asset_corporate_actions`,
`asset_dividend_history`). Nada foi gravado em banco; produção não foi acessada.

Script: `scripts/analise-ativos/acoes-cvm-fase-a.ts` (evolução do `spike-cvm-acoes.ts`, que ficou intacto).
Saídas: `acoes-cvm-resumo.json` (métricas do universo), `acoes-cvm-amostra.json` (12 tickers, 2014-2025 + TTM),
`acoes-cvm-amostra-extra.json` (SLCE3, KLBN11, CYRE3, BBDC4, ITSA4, SANB11: casos de borda).
Sondas SÓ LEITURA: `acoes-cvm-probe-db.ts` (proventos de um ticker/ano), `acoes-cvm-probe-tipos.ts` (tipos de provento).

Rodar: `cd /home/huske/dev/front && NODE_OPTIONS=--max-old-space-size=6144 npx tsx --env-file=.env scripts/analise-ativos/acoes-cvm-fase-a.ts --dir=<pasta dos zips>` (~30 s).

## Veredito

CVM direto é viável como fonte primária de fundamentos de ações: **306 companhias listadas** (FCA ∩ classificação B3),
**211 com 10 exercícios completos 2016-2025** (receita, lucro, PL, nº de ações) e **299 com 5+**. Os 6 problemas
abertos têm solução mensurável, mas **nenhum campo por ação pode ser gravado sem validação cruzada**: a CVM erra
escala (ações em milhares em 598 company-years, LPA publicado ×1000 em 43), o banco de eventos (Yahoo/BRAPI)
tem duplicatas e eventos fantasmas, e 24% das companhias deixam a linha "atribuído à controladora" zerada.
Com as regras abaixo, a consistência nº de ações × LPA publicado sobe de **63,7% → 93,6%** dos company-years verificáveis.

---

## (1) Nº de ações — regra robusta

**Fontes disponíveis por exercício**

| Fonte | Anos | Observação medida |
|---|---|---|
| DFP `composicao_capital` (integralizado − tesouraria, ON/PN) | FY2020+ | escala sem coluna de unidade: **598 company-years em milhares** (VALE3 2024 = "4.539.008"; ITUB4; TAEE11; ABEV3; LREN3) |
| FRE 3.1 `informacao_financeira` item **f "Número de Ações, Ex-Tesouraria"** | FY2011-2021 (FRE 2023 em diante não tem a seção) | valor **do fim do exercício**, não o capital atual. Resolve WEGE3 2019: **2.098,66 mi** (o spike usava `capital_social` = 4.197 mi, já pós-desdobramento de 2021) |
| FRE `capital_social` (usado no spike) | — | é o capital **da data da versão**; versões reentregues após split reexpressam (WEGE3, MGLU3) — **descartar** |
| LPA publicado DRE 3.99.01.xx (por classe) | todos | IAS 33: média ponderada, reexpresso por eventos até a entrega do DFP; ~10% dos casos vem em 3.99 (BB) ou com erro de escala |

Sobreposição FRE × DFP (FY2020-2021): 549/600 (91,5%) batem em ±2%, 570/600 (95%) em ±10%.

**Regra (implementada e medida)**

1. Candidatos: DFP (unid.), DFP×1000, FRE item f.
2. Aceita o 1º candidato em que **Σ (LPA_classe × ações_classe) ≈ lucro atribuível (razão 0,8-1,25)**.
3. Se a razão der ~1000 ou ~0,001 com algum candidato → LPA publicado em escala errada (43 casos; ex. ITUB4 2019 LPA = 2780) → aceita o candidato e corrige o LPA ÷1000.
4. FRE reexpresso por evento posterior (FRE ≈ implícito × fator de eventos até 2 anos depois) → divide (2 casos: UGPA3 2018 ÷2, PNVL3 2019 ÷30).
5. Sem LPA utilizável: **vizinhança** — candidato mais próximo de ações(ano±1..2) × fator de eventos entre as datas (±30%).
6. Com LPA mas nada bateu: candidato a ≤35% de lucro÷LPA; senão usa **ações implícitas = lucro ÷ LPA** (99 casos).
7. Último recurso: FRE sem verificação, ou limiar "< 20 mi ações com PL > R$ 1 bi ⇒ milhares".

**Resultado (3.395 company-years, 319 companhias do FCA)**

| Métrica | Antes (regra do spike) | Depois |
|---|---|---|
| Verificáveis por LPA | 2.737 | 2.694 |
| Consistentes (razão 0,8-1,25) | 1.743 (**63,7%**) | 2.522 (**93,6%**) |
| Não verificáveis (sem LPA/lucro < R$ 1 mi) | — | 606, dos quais **119 com salto > 2,5× sem evento** (suspeitos) |

Checagem por fonte: lpa 2.479 · vizinho 342 · sem verificação 176 · limiar 146 · lpa-implícito 99 · LPA com escala errada 43 · lpa-aproximado 15.
Distribuição da razão nos aceitos: ≤2%: 1.904 · 2-5%: 270 · 5-10%: 199 · 10-20%: 149. **A tolerância ±20% é frouxa demais
para validar eventos pequenos** (bonificação de 10-20% passa): CYRE3 2025 tinha razão 0,83 e o evento de 19% só foi
pego pela validação por ano seguinte (item 2). Na Fase 0, guardar a razão e alertar acima de ±5%.

Inconsistentes restantes concentram-se em companhias em recuperação/reestruturação (AMER3, GFSA3, OPTS3, SEQL3, QVQP3,
FASA3, TELB3): emissões e grupamentos em série, LPA ausente. São candidatas a "dados incompletos" (spec §4.1).

## (2) Ajuste por desdobramento (LPA, VPA, DPA)

Banco dev: 976 eventos para 270 tickers do universo; após dedup (mesmo fator em ≤30 dias, BRAPI×YAHOO e
YAHOO×YAHOO) sobram 857 (63 duplicatas: LREN3 2021-10-22/11-05 e 2024-11-28/12-11 eram o mesmo 10%).
Tipos úteis: DESDOBRAMENTO, GRUPAMENTO, BONIFICACAO; ignorar CIS RED CAP, INCORPORACAO, RESG TOTAL RV etc.

**Validação dos eventos pela própria CVM** (razão ações_fim/ações_início, ambos validados por LPA, × produto dos eventos
do ano; eventos de 2026 contra a composição do ITR 2T26; eventos de 1/jan-14/fev ou dezembro podem pertencer ao ano
vizinho — `anoBase`):

| Resultado (grupos ano×ticker 2015-2026) | n |
|---|---|
| Confirmados integralmente | 118 |
| Confirmados descartando parte (subconjunto que bate) | 5 |
| Todos descartados (ações não mudaram) | 4 |
| Não validáveis (sem ações validadas no ano) | 45 |
| Não batem e houve emissão/recompra (mantidos) | 22 |

Eventos fantasmas/errados achados: **EGIE3 2025-11-28 ×1,1** (real: só ×1,4 → 815,9 → 1.142,3 mi), BBDC3/BBDC4
2024-02-07 ×1,2 (ações ×0,996 e LPA reexpresso igual), CPLE3 2021 ×10, RAIL3 2015 ×0,1, UNIP3 2015 ×0,1, SMTO3 2016 ×3.
Casos de borda resolvidos pelo `anoBase`: SLCE3 2026-01-02 ×1,125 já estava na composição de 31/12/2025;
CYRE3 2025-12-30 ×1,19 só aparece no ano seguinte.

A reexpressão do LPA (DFP ano × PENÚLTIMO do DFP seguinte) foi testada como validador e **não serve** (só 68/345 batem:
reexpressões por outros motivos e reapresentações anos depois).

**Regra recomendada para séries por ação ajustadas a hoje**
- LPA/VPA: `lucro atribuível ÷ ações do fim do exercício ÷ Π(eventos validados com anoBase > FY)`. O LPA publicado,
  ajustado pelos eventos posteriores à **1ª entrega** do DFP, dá o mesmo valor em ±2% nos casos limpos (tabela A); em
  reapresentações (KLBN11 2021) só o cálculo acerta.
- DPA: cada provento ÷ Π(eventos com data > data-com) — ajuste **por evento**, não por ano (MGLU3 2020 tinha
  proventos pré e pós desdobramento 4:1 no mesmo ano).
- Units: LPA_unit = composição × LPA_classe (TAEE11 = 1 ON + 2 PN → 3 × 1,52866 = 4,586 em 2025).
  O texto da composição no FCA é livre ("1 ação ordinária e 4 ações preferenciais", "1 KLBN3 + 4 KLBN4").

### Tabela A — ações resolvidas (mi), fonte/checagem e LPA ajustado a hoje

| Ticker | FY | Ações (mi) | Fonte/checagem | LPA publicado | LPA ajustado hoje | VPA ajustado | Eventos validados que ajustam |
|---|---|---|---|---|---|---|---|
| WEGE3 | 2016 | 1.614,35 | fre/lpa | 0,69 | 0,27 | 1,42 | ×2,60 |
| WEGE3 | 2019 | 2.098,66 | fre/lpa | 0,77 | 0,38 | 2,08 | ×2,00 |
| WEGE3 | 2021 | 4.196,01 | dfp/lpa | 0,85 | 0,85 | 3,24 | ×1,00 |
| WEGE3 | 2024 | 4.195,54 | dfp/lpa | 1,44 | 1,44 | 5,29 | ×1,00 |
| WEGE3 | 2025 | 4.195,70 | dfp/lpa | 1,52 | 1,52 | 4,15 | ×1,00 |
| VALE3 | 2016 | 5.153,38 | fre/lpa | 2,58 | 2,58 | 24,69 | ×1,00 |
| VALE3 | 2019 | 5.128,28 | fre/lpa | -1,29 | -1,29 | 31,49 | ×1,00 |
| VALE3 | 2021 | 4.839,62 | dfp×1000/lpa | 24,18 | 24,18 | 39,76 | ×1,00 |
| VALE3 | 2024 | 4.268,72 | dfp×1000/lpa | 7,39 | 7,39 | 48,44 | ×1,00 |
| VALE3 | 2025 | 4.268,78 | dfp×1000/lpa | 3,24 | 3,24 | 43,17 | ×1,00 |
| ITUB4 | 2016 | 6.512,70 | fre/lpa | 3,57 | 2,10 | 11,07 | ×1,70 |
| ITUB4 | 2019 | 9.745,60 | fre/lpa(publicado em escala errada) | 2,78 | 2,45 | 12,40 | ×1,13 |
| ITUB4 | 2021 | 9.779,89 | dfp×1000/lpa | 2,74 | 2,42 | 13,80 | ×1,13 |
| ITUB4 | 2024 | 9.748,07 | dfp×1000/lpa | 4,20 | 3,71 | 19,11 | ×1,13 |
| ITUB4 | 2025 | 11.026,52 | dfp×1000/lpa | 4,05 | 4,05 | 18,01 | ×1,03 |
| BBAS3 | 2016 | 2.785,00 | fre/lpa | 2,52 | 1,26 | 15,51 | ×2,00 |
| BBAS3 | 2019 | 2.851,00 | fre/lpa | 5,86 | 2,93 | 18,89 | ×2,00 |
| BBAS3 | 2021 | 2.853,44 | dfp/lpa | 6,43 | 3,21 | 25,01 | ×2,00 |
| BBAS3 | 2024 | 5.708,05 | dfp/lpa | 4,62 | 4,62 | 31,47 | ×1,00 |
| BBAS3 | 2025 | 5.708,46 | dfp/lpa | 2,40 | 2,40 | 33,15 | ×1,00 |
| EGIE3 | 2016 | 652,74 | fre/lpa | 2,37 | 1,36 | 5,79 | ×1,75 |
| EGIE3 | 2019 | 815,93 | fre/lpa | 2,83 | 2,02 | 6,12 | ×1,40 |
| EGIE3 | 2021 | 815,93 | dfp/lpa | 1,92 | 1,37 | 6,94 | ×1,40 |
| EGIE3 | 2024 | 815,93 | dfp/lpa | 5,24 | 3,75 | 9,86 | ×1,40 |
| EGIE3 | 2025 | 1.142,30 | dfp/lpa | 2,26 | 2,26 | 11,17 | ×1,00 |
| MGLU3 | 2016 | 21,27 | fre/lpa | 3,98 | 0,15 | 1,09 | ×26,88 |
| MGLU3 | 2019 | 1.620,60 | fre/lpa | 0,57 | 1,35 | 11,11 | ×0,42 |
| MGLU3 | 2021 | 6.665,52 | dfp/lpa | 0,09 | 0,85 | 16,09 | ×0,10 |
| MGLU3 | 2024 | 736,06 | dfp/lpa | 0,61 | 0,58 | 14,65 | ×1,05 |
| MGLU3 | 2025 | 774,60 | dfp/lpa | 0,26 | 0,26 | 14,56 | ×1,00 |
| LREN3 | 2016 | 642,55 | fre/lpa | 0,97 | 0,67 | 2,80 | ×1,46 |
| LREN3 | 2019 | 793,73 | fre/lpa | 1,43 | 1,18 | 4,90 | ×1,21 |
| LREN3 | 2021 | 985,62 | dfp×1000/lpa | 0,66 | 0,60 | 9,05 | ×1,10 |
| LREN3 | 2024 | 1.051,73 | dfp×1000/lpa | 1,14 | 1,14 | 10,24 | ×1,00 |
| LREN3 | 2025 | 982,20 | dfp×1000/lpa | 1,44 | 1,44 | 10,65 | ×1,00 |
| RADL3 | 2016 | 329,53 | fre/lpa | 1,37 | 0,26 | 1,66 | ×5,30 |
| RADL3 | 2019 | 329,66 | fre/vizinho | — | 0,44 | 2,30 | ×5,30 |
| RADL3 | 2021 | 1.647,16 | dfp/lpa | 0,46 | 0,43 | 2,68 | ×1,06 |
| RADL3 | 2024 | 1.711,99 | dfp/lpa | 0,73 | 0,71 | 3,68 | ×1,02 |
| RADL3 | 2025 | 1.747,26 | dfp/lpa | 0,79 | 0,79 | 4,19 | ×1,00 |


## (3) Payout — qual fonte

Gabarito: FRE 3.5 `Dividendo_Distribuido_Total` (declarado **relativo ao exercício**; existe só até FY2021, com escala
em R$ mil em alguns casos — corrigido pela coerência com payout% × lucro ajustado).

| Método (FY2014-2021) | n | erro mediano | dentro de 5% | dentro de 15% |
|---|---|---|---|---|
| DFC — dividendos/JCP **pagos** (caixa) | 1.163 | 37,5% | 12,2% | 27,2% |
| DMPL 5.04.06 + 5.04.07 (códigos padrão) | 1.249 | 22,0% | 36,1% | 44,2% |
| **DMPL declarado no ano** (padrão + demais linhas de dividendo/JCP de 5.04-5.06, sem prescritos/reversões, só 3º nível) | 1.249 | **8,6%** | 43,9% | 56,8% |
| DMPL padrão + adicional aprovado no ano seguinte | 1.249 | 13,6% | 39,8% | 51,2% |
| Banco (data-com no ano × ações) | 286 | 41,1% | 14,0% | 24,1% |

Leitura: nenhum método estruturado reproduz "relativo ao exercício" (os dividendos adicionais do exercício são
declarados na AGO do ano seguinte, e a proposta só está nas notas/PDF). Os dois métodos bons medem **"declarado no
ano-calendário"**: DMPL (R$) e banco por data-com (R$/ação). Entre si, 2020-2025: erro mediano 18,7%; na amostra
batem ao centavo quando o banco está completo (WEGE3 2022-2025, ABEV3 2023-2024, EGIE3 2020-2022, LREN3 2022-2024).

**PETR4 2024 = 275% não é defeito de dado**: lucro caiu para R$ 36,6 bi (efeito não recorrente) e o declarado no ano
somou R$ 100,9 bi (ordinários + extraordinários de reservas). Por data-com dá 224-229%. Idem 2025 para WEGE3 (161%),
VALE3 (235%), ITUB4 (~120%), ABEV3 (120%): **antecipação de dividendos de reservas em dez/2025** (AGE WEG
19/12/2025 "dividendos sobre o saldo das Reservas", antes da tributação de dividendos de 2026).

**Recomendação**: payout (Essencial/Valuation) = **Σ DPA com data-com no ano (asset_dividend_history, só DIVIDENDO+JCP,
na base de ações do fim do ano) ÷ LPA do ano**, o mesmo conceito do DY 12m, que é um número por ação e dispensa
nº de ações por classe. DMPL "declarado no ano" é a checagem cruzada, com alerta se divergir mais de 15 p.p.
DFC pago fica só como linha do Raio-X ("dividendos e JCP pagos"). Filtrar tipos: o banco dev tem `REST CAP DIN`
(restituição de capital; BBSE3 2020 R$ 1,35/ação), `AMORTIZAÇÃO` e `RENDIMENTO` (FII) na mesma tabela.

### Tabela B — payout por método (%)

| Ticker | FY | por ação (DPA data-com ÷ LPA) | DB × ações | DMPL declarado no ano | DFC pago | FRE oficial (≤2021) |
|---|---|---|---|---|---|---|
| WEGE3 | 2020 | 38,90 | 38,90 | 39,10 | 37,60 | 57,40 |
| WEGE3 | 2021 | 51,50 | 51,50 | 49,40 | 46,20 | 55,50 |
| WEGE3 | 2023 | 45,00 | 45,00 | 45,00 | 40,30 | — |
| WEGE3 | 2024 | 52,50 | 52,50 | 52,50 | 48,60 | — |
| WEGE3 | 2025 | 161,30 | 161,30 | 161,30 | 84,50 | — |
| PETR4 | 2020 | 0,10 | 24,50 | 62,10 | 93,70 | 152,40 |
| PETR4 | 2021 | 69,00 | 76,40 | 65,60 | 68,20 | 100,70 |
| PETR4 | 2023 | 80,40 | 79,90 | 75,50 | 78,80 | — |
| PETR4 | 2024 | 224,50 | 224,50 | 275,60 | 275,10 | — |
| PETR4 | 2025 | 33,70 | 33,70 | 38,40 | 41,30 | — |
| VALE3 | 2020 | 46,20 | 46,20 | 70,00 | 70,00 | 86,20 |
| VALE3 | 2021 | 60,50 | 58,40 | 55,10 | 60,50 | 60,80 |
| VALE3 | 2023 | 66,40 | 65,40 | 51,50 | 70,00 | — |
| VALE3 | 2024 | 72,40 | 72,30 | 72,40 | 65,40 | — |
| VALE3 | 2025 | 235,20 | 235,40 | 235,40 | 144,60 | — |
| ITUB4 | 2020 | 66,20 | 69,70 | 78,30 | 63,80 | 25,00 |
| ITUB4 | 2021 | 26,90 | 25,20 | 26,40 | 23,90 | 25,00 |
| ITUB4 | 2023 | 37,20 | 37,20 | 37,20 | 32,40 | — |
| ITUB4 | 2024 | 50,10 | 46,60 | 57,50 | 53,30 | — |
| ITUB4 | 2025 | 120,10 | 122,70 | 109,70 | 109,10 | — |
| TAEE11 | 2020 | 51,30 | 48,90 | 53,60 | 48,90 | 71,80 |
| TAEE11 | 2021 | 70,10 | 70,10 | 71,90 | 70,10 | 81,40 |
| TAEE11 | 2023 | 73,40 | 73,40 | 88,20 | 73,40 | — |
| TAEE11 | 2024 | 71,80 | 71,80 | 76,20 | 59,40 | — |
| TAEE11 | 2025 | 70,40 | 70,40 | 54,70 | 64,60 | — |
| ABEV3 | 2020 | 57,20 | 57,20 | 67,90 | 60,20 | 60,50 |
| ABEV3 | 2021 | 84,50 | 84,50 | 75,00 | 87,70 | 64,30 |
| ABEV3 | 2023 | 79,30 | 79,30 | 79,40 | 82,20 | — |
| ABEV3 | 2024 | 72,80 | 72,70 | 72,90 | 28,10 | — |
| ABEV3 | 2025 | 119,80 | 119,80 | 112,60 | 132,00 | — |
| BBSE3 | 2020 | 143,80 | 143,80 | 70,00 | 144,50 | 70,00 |
| BBSE3 | 2021 | 50,50 | 50,50 | 73,00 | 50,60 | 73,00 |
| BBSE3 | 2023 | 86,40 | 85,80 | 71,30 | 87,60 | — |
| BBSE3 | 2024 | 59,00 | 58,70 | 81,70 | 59,70 | — |
| BBSE3 | 2025 | 90,60 | 90,70 | 96,70 | 91,80 | — |
| EGIE3 | 2020 | 50,30 | 50,30 | 50,30 | 44,40 | 100,00 |
| EGIE3 | 2021 | 93,30 | 93,30 | 93,30 | 178,60 | 100,00 |
| EGIE3 | 2023 | 69,00 | 69,00 | 77,00 | 69,40 | — |
| EGIE3 | 2024 | 50,90 | 50,90 | 53,10 | 26,50 | — |
| EGIE3 | 2025 | 59,40 | 59,40 | 46,40 | 106,10 | — |


Lacunas do banco DEV na amostra: PETR4 2020 (DPA 0,0005), BBAS3 antes de set/2020, MGLU3 2022-2024. A cobertura
de prod não foi medida (proibido acessar). No universo listado, 219/306 companhias têm algum provento 2021+ no dev.

## (4) TTM com ITR

TTM(2T26) = FY2025 (DFP) + 6M26 − 6M25 (ITR 2026, coluna PENÚLTIMO). Conferência independente: Σ dos 4 trimestres
(3T25 e 2T26 das colunas de 3 meses; 4T25 = FY − 9M25 do ITR 3T25; 1T26).
Cobertura: **302 companhias com ITR 2026, 296 já no 2T26** (6 só no 1T26). Os dois caminhos batem em ±0,5% em
**467/504 (92,7%)** dos pares (receita, lucro atribuível). As divergências são reapresentações e reclassificações
(AXIA3, AMER3, HAPV3, AZUL3, BBAS3) → sanidade: |YTD − Σtri| > 2% ⇒ usar YTD e sinalizar.

### Tabela C — TTM até 2T26 (R$ mi): caminho YTD × soma de 4 trimestres

| Ticker | Receita TTM (YTD) | Receita TTM (Σ tri) | Lucro atrib. TTM (YTD) | Lucro atrib. TTM (Σ tri) | Lucro FY2025 | 2T26 entregue em |
|---|---|---|---|---|---|---|
| WEGE3 | 40.130,20 | 40.130,20 | 6.254,10 | 6.254,10 | 6.376,20 | 2026-07-22 |
| PETR4 | 548.493,00 | 548.493,00 | 133.376,00 | 133.376,00 | 110.129,00 | 2026-08-06 |
| VALE3 | 218.069,00 | 218.069,00 | 10.369,00 | 10.369,00 | 13.814,00 | 2026-07-31 |
| ITUB4 | 385.985,00 | 385.985,00 | 46.828,00 | 46.828,00 | 44.857,00 | 2026-08-04 |
| BBAS3 | 330.956,60 | 330.433,60 | 12.272,00 | 18.492,90 | 13.698,10 | 2026-08-12 |
| TAEE11 | 4.484,40 | 4.484,40 | 1.625,50 | 1.625,50 | 1.579,90 | 2026-08-11 |
| EGIE3 | 13.681,00 | 13.681,00 | 3.959,30 | 3.959,30 | 2.582,80 | 2026-08-05 |
| MGLU3 | 38.284,20 | 38.284,20 | 88,50 | 88,50 | 204,60 | 2026-08-06 |
| ABEV3 | 88.268,30 | 88.268,30 | 16.246,90 | 16.246,90 | 15.503,40 | 2026-07-30 |
| BBSE3 | 0,00 | 0,00 | 9.189,30 | 9.189,30 | 9.017,30 | 2026-08-03 |
| RADL3 | 44.999,40 | 44.999,40 | 1.342,40 | 1.342,40 | 1.296,90 | 2026-08-04 |
| LREN3 | 15.971,50 | 15.971,50 | 1.493,90 | 1.493,90 | 1.457,60 | 2026-08-06 |
| SLCE3 | 10.100,40 | 10.100,40 | 388,40 | 388,40 | 555,60 | 2026-08-12 |
| KLBN11 | 20.688,40 | 20.688,40 | — | — | — | 2026-08-05 |
| CYRE3 | 9.869,50 | 9.869,50 | 2.039,70 | 2.039,70 | 2.006,80 | 2026-08-13 |
| ITSA4 | 8.475,00 | 8.475,00 | 18.161,00 | 18.161,00 | 16.487,00 | 2026-08-11 |


Pontos de atenção: BBSE3 e ITSA4 (holdings) têm "receita" 3.01 zero ou irrelevante (margem/P-Receita = n/a);
BBAS3 tem a linha atribuível ausente/zerada em trimestres (YTD × Σtri divergem 50%); KLBN11 publica 3.11.01 = 0
(lucro atribuível cai no fallback de lucro total, 17% acima do implícito pelo LPA).

## (5) Setor / segmento e pares

FCA `Setor_Atividade` tem 47 valores, com "Emp. Adm. Part. - …" misturado ao setor real (WEGE3, TAEE11, BBSE3).
A **classificação setorial da B3** é pública e gratuita, baixável sem autenticação:
`GET https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDownloadIndustryClassification/<base64('{"language":"pt-br"}')>`
→ `ClassifSetorial.xlsx` (setor › subsetor › segmento + segmento de listagem, por raiz de 4 letras; 358 emissores).

- Cobre **306/319** companhias do FCA (as 13 fora são deslistadas/fechadas: NEOE3, BRML3, IGTA3, OIBR3, CRDE3…) →
  serve também como **filtro de "listada hoje"**.
- 79 segmentos no universo, mas só **17 têm ≥ 5 companhias** (180 empresas). Por **subsetor**, 280 empresas têm ≥ 5 pares.
- Recomendação para "pares do setor" (5 linhas): mesmo segmento B3; completar com o subsetor até 5; ordenar por valor
  de mercado. Referência mediana (Valuation) com o mesmo conjunto.

### Tabela D — setor B3 da amostra

| Ticker | FCA Setor_Atividade | B3 setor › subsetor › segmento | Listagem |
|---|---|---|---|
| WEGE3 | Emp. Adm. Part. - Máqs., Equip., Veíc. e Peças | Bens Industriais › Máquinas e Equipamentos › Motores , Compressores e Outros | Novo Mercado |
| PETR4 | Petróleo e Gás | Petróleo, Gás e Biocombustíveis › Petróleo, Gás e Biocombustíveis › Exploração, Refino e Distribuição | Nível 2 |
| VALE3 | Extração Mineral | Materiais Básicos › Mineração › Minerais Metálicos | Novo Mercado |
| ITUB4 | Bancos | Financeiro › Intermediários Financeiros › Bancos | Nível 1 |
| BBAS3 | Bancos | Financeiro › Intermediários Financeiros › Bancos | Novo Mercado |
| TAEE11 | Emp. Adm. Part. - Energia Elétrica | Utilidade Pública › Energia Elétrica › Energia Elétrica | Nível 2 |
| EGIE3 | Energia Elétrica | Utilidade Pública › Energia Elétrica › Energia Elétrica | Novo Mercado |
| MGLU3 | Comércio (Atacado e Varejo) | Consumo Cíclico › Comércio Varejista › Eletrodomésticos | Novo Mercado |
| ABEV3 | Bebidas e Fumo | Consumo não Cíclico › Bebidas › Cervejas e Refrigerantes | Básico Bolsa |
| BBSE3 | Emp. Adm. Part. - Seguradoras e Corretoras | Financeiro › Previdência e Seguros › Seguradoras | Novo Mercado |
| RADL3 | Comércio (Atacado e Varejo) | Saúde › Comércio e Distribuição › Medicamentos e Outros Produtos | Novo Mercado |
| LREN3 | Comércio (Atacado e Varejo) | Consumo Cíclico › Comércio Varejista › Tecidos, Vestuário e Calçados | Novo Mercado |

## (6) Calendário de resultados / próximos eventos

- **IPE não traz a data de divulgação de resultados de forma estruturada**. "Calendário de Eventos Corporativos" é PDF
  (255/319 companhias entregaram o de 2026); comunicados "Agenda de divulgação de resultados" existem para só 50 e são texto livre.
- **Previsão pela entrega do ano anterior funciona**: diferença entre o atraso do mesmo trimestre em anos consecutivos
  (ITR, n = 914): mediana **1 dia**, 69,8% ≤ 3 dias, **86,3% ≤ 7 dias**, 91% ≤ 14 dias. DFP (n = 314): mediana 4 dias, 72,3% ≤ 7, 87,6% ≤ 14.
  Ex.: WEGE3 2T25 em 23/07/2025, 2T26 em 22/07/2026.
- **Assembleias são estruturadas**: no IPE, `Categoria = Assembleia` (AGO/AGE/AGO-E) tem `Data_Referencia` = data da
  assembleia e é entregue com antecedência mediana de **25 dias** (3.888 documentos de 478 companhias em 2026;
  122 assembleias depois de 30/09/2026 já constam). "Aviso aos Acionistas / Data prevista para a assembleia" (210 companhias)
  anuncia a AGO meses antes.
- Proventos (data-com / pagamento) já vêm de `asset_dividend_history`.

**Dá para montar "Próximos eventos"** com 3 fontes: (a) resultado trimestral **estimado** = mesma entrega do ano
anterior + 1 ano (rotular "data estimada"; trocar pela real quando o ITR/DFP chegar); (b) AGO/AGE do IPE (data oficial);
(c) data-com/pagamento de proventos. Job diário do IPE do ano corrente (~2 MB).

---

## Regras de sanidade (para a Fase 0)

Ver `regrasSanidade` no retorno estruturado; resumo: razão LPA × ações/lucro em ±5% (alerta) e ±20% (bloqueio);
escala de ações por candidatos; eventos só entram validados; payout > 150% ou < 0 com selo; TTM por dois caminhos;
linha "atribuído à controladora" = 0 tratada como ausente; FCA com classe errada (MGLU3 "PN") corrigida pelo sufixo do ticker.

## Arquivos baixados nesta fase (scratchpad `cvm/`)

FRE 2021-2026, IPE 2024-2026, ITR 2024 e `ClassifSetorial.xlsx` (B3), além dos já existentes.
