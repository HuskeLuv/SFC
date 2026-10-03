# Diagnóstico — DY 12m absurdo no Quadro (02/10/2026)

Origem: conferência em produção de 02/10/2026 (HBTS5 780%, RDLI11 537%, HDEL11 468%, WEST3 166%,
HBRE3 107%, … BMKS3 39,7% com Índice 10,0 no topo do Quadro de ações). Diagnóstico feito no banco
**dev** (Neon), só leitura, com `asset_dividend_history` (BRAPI/Yahoo), `asset_proventos_auditados`,
`asset_corporate_actions(_checks)`, `asset_per_share_yearly`, `asset_quotes_daily` (queda do preço na
data ex) e `fii_monthly` (cotas e VP/cota). Produção não foi acessada: os valores de prod são os da
conferência; o dev tem preço/proventos de outra data e cobertura de FIIs antiga, então os números
diferem.

## Causas

| Código | Causa                                                                                   |
| ------ | --------------------------------------------------------------------------------------- |
| (a)    | Parcela repetida da fonte (mesma data-com; uma linha sem pagamento + outra paga)        |
| (a')   | ON e PN misturadas no mesmo ticker (razão exata de 1,10 = prêmio legal das PN)          |
| (b)    | Restituição de capital/amortização contada como provento                                |
| (c)    | Desdobramento/grupamento sem evento (provento e preço em bases diferentes)              |
| (d)    | Provento extraordinário real (dez/2025: antecipação à tributação de dividendos de 2026) |
| (e)    | Preço ou valor em escala/unidade errada, ou preço de negócio esporádico (sem liquidez)  |
| (f)    | Não reproduz no dev (sem proventos ou cobertura antiga no dev)                          |

## Tabela por símbolo

DY dev = `analise_quadro_linhas.dy12mPct` antes da correção (dataRef 29/09/2026). "Depois" = após o
recálculo com a correção e a trava (ver fim).

| Símbolo                                        | DY prod                        | DY dev antes → depois                                 | Causa    | Evidência                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HBTS5                                          | 780%                           | 795% → 795% em conferência (Índice 5,56 → 4,06)       | (e)      | Linhas sem pagamento de 929,15 (abr/24), 88,63 (abr/25) e 259,97 (abr/26) por ação com a ação a ~R$ 30–36 e o preço SEM queda no ex; payout DMPL 2024 = 366%; grupamento 100:1 de 2005 `nao_validavel`. Valor na unidade errada na fonte (provável lote/total).                                                                                                        |
| HBRE3                                          | 107%                           | 62,5% → em conferência (4,82 → 3,32)                  | (d)      | 1,165 em 30/12/2025 + 0,486 (mesma data-com); o preço caiu de 4,61 para 3,49 no ex (≈ o provento). Extraordinário real de dez/2025, não recorrente; LPA 2025 = 0,27.                                                                                                                                                                                                   |
| LRDI11                                         | 43%                            | 42,2% → em conferência (3,13 → 1,26)                  | (d)+(e)  | Rendimentos de 32,60 (nov/25) e 29,71 (mai/26) com VP/cota ~77 e cota negociada a R$ 200 com 5–16 negócios/mês; VP subiu para 109 em out/25 e voltou a 77 (distribuição de ganho de venda).                                                                                                                                                                            |
| BMKS3                                          | 39,7% (topo, Índice 10)        | 34,2% → em conferência (10,0 → 8,50)                  | (d)      | 100,00 (data-com 24/11/2025) + 20,00 (dez/25); o preço caiu de 510 para 387 no ex. Extraordinário real.                                                                                                                                                                                                                                                                |
| BALM4                                          | 27%                            | 33,3% → em conferência (9,08 → 7,58)                  | (d)      | 3,07 em 16/12/2025; preço 24,00 → 17,08 no ex; DPA 2025 = 5,07 × 0,36 em 2024, payout 245% (já tinha `provento_suspeito`).                                                                                                                                                                                                                                             |
| BALM3                                          | —                              | 21,9% → em conferência (salto)                        | (d)      | Mesma empresa (salto 2025, payout 245%).                                                                                                                                                                                                                                                                                                                               |
| GRND3                                          | 55%                            | 31,5% → em conferência (9,44 → 7,94)                  | (d)      | Declaração de dez/2025 (data-com 23/12) paga em 3 parcelas (0,443 jan, 0,222 mar, 0,200 set/26); DPA 2025 = 1,48, payout 238%.                                                                                                                                                                                                                                         |
| LOGG3                                          | 28%                            | 27,1% → em conferência (7,92 → 6,42)                  | (d)      | 3,19 (data-com 17/12/2025, preço 26,07 → 23,01 no ex) + 2,86 (jun/26, preço 29,7 → 27,2).                                                                                                                                                                                                                                                                              |
| JSLG3                                          | 44%                            | 27,0% → em conferência (5,12 → 3,62)                  | (d)      | 1,48 com data-com 26/12/2025 e pagamento em 31/12/2026 (declaração antecipada); preço 7,52 → 6,07 no ex; LPA 2025 = 0,29.                                                                                                                                                                                                                                              |
| SOND6 / SOND5                                  | 55% / 42%                      | 22,9% / 21,1% (abaixo do teto; sem salto: payout 93%) | (d)      | 9,41 em 23/12/2025 (pagamento = data-com); DPA 2025 = 15,69 com lucro de 14,70/ação. No dev o preço é de 22/09; em prod a cotação mais baixa explica o DY maior.                                                                                                                                                                                                       |
| CEBR5 / CEBR6                                  | —                              | 20,4% → 10,7% / 9,0%                                  | (a')     | Todo provento aparece 2×: o valor da PN (1,832319) e o da ON (1,665745 = ÷1,10), um sem pagamento; o CEBR3 tem só 1,665745. Corrigido na auditoria.                                                                                                                                                                                                                    |
| CEEB5                                          | 30%                            | sem DY no dev (base parada)                           | (a')+(a) | 60 pares na razão 1,10 (Coelba ON × PN) + 4,25543 sem pagamento × 4,20178 pago (28/10/2025). Corrigido na auditoria.                                                                                                                                                                                                                                                   |
| BRSR6                                          | —                              | 10,2% (em conferência por salto)                      | (a')     | 18 pares na razão 1,10 (Banrisul ON × PNB). Corrigido; o salto restante de 2025 vai para conferência.                                                                                                                                                                                                                                                                  |
| ITUB4                                          | —                              | 7,3% → em conferência (salto)                         | (d)      | 2024 → 2025: 1,86 → 4,73 (2,5×), sem payout (financeira): extraordinários de 2025 reais, mas não recorrentes.                                                                                                                                                                                                                                                          |
| WEGE3                                          | —                              | 4,0% → em conferência (salto)                         | (a?)/(d) | 3 linhas de 0,412832 com a mesma data-com (22/12/2025) e pagamento em ago/2026, ago/2027 e ago/2028. Pode ser parcela repetida da BRAPI ou parcelas reais da declaração de dez/2025 (lei de 2025 permitiu pagar até 2028): as três linhas TÊM pagamento, então a auditoria NÃO descarta. Fica em conferência pelo salto (DPA 2025 = 2,45 × 0,76 em 2024, payout 161%). |
| KEPL3                                          | —                              | sem DY no dev                                         | (a)      | 0,144232 sem pagamento + 0,144232 pago 26/12/2025, mesma data-com. Corrigido.                                                                                                                                                                                                                                                                                          |
| MELK3                                          | —                              | 13,6%                                                 | (b)      | REST CAP DIN 0,7343145 (18/03/2025) repetida como DIVIDENDO 0,734315. Corrigido (fora da janela de 12m hoje; afeta o DPA de 2025).                                                                                                                                                                                                                                     |
| CGRA4 / CGRA3                                  | 35% / 34%                      | sem DY no dev (base parada)                           | (d)      | 3,95 em 16/12/2025, preço 31,99 → 27,30 no ex; DPA 2025 = 5,9 × 2,3 em 2024, payout 167%.                                                                                                                                                                                                                                                                              |
| RIAA3                                          | 42%                            | sem DY no dev (base parada)                           | (d)      | 1,75 + 0,83 (JCP) com data-com 19/12/2025; DPA 2025 = 2,69 × 0,12 em 2024.                                                                                                                                                                                                                                                                                             |
| PATI3                                          | 26%                            | 8,6%                                                  | (d)      | 1,93 em out/2025; DPA 2024 = 6,44 com payout 184%.                                                                                                                                                                                                                                                                                                                     |
| CACR11                                         | 64%                            | sem DY no dev (cobertura antiga)                      | (c)      | Cota caiu de 81 para 24 em mai/2026 e o rendimento de 1,20 para 0,23 (÷ ~5) sem evento na base; o `fii_monthly` do CNPJ mapeado não mostra mudança de cotas (4.836.324) nem de VP (~98) — `cnpj_em_conferencia`. Rendimentos pré-desdobramento ÷ preço pós-desdobramento.                                                                                              |
| ICNE11                                         | 25%                            | sem DY no dev (cobertura antiga)                      | (d)+(e)  | Rendimentos de 9–16/cota/mês (amortizações já excluídas) com VP 510–736; cota com 1–4 negócios/mês entre R$ 500 e R$ 1.000.                                                                                                                                                                                                                                            |
| MFII11                                         | 27%                            | sem DY no dev (cobertura antiga)                      | (d)      | Rendimento estável ~1,05/mês desde 2019; cota caiu de 81 para 36–38 em 2026: DY alto por preço deprimido.                                                                                                                                                                                                                                                              |
| PEMA11                                         | 30%                            | sem DY no dev (cobertura antiga)                      | (e)      | 8,8/cota/ano com VP ~57 e cota a 23,84 com 1–13 negócios/mês (volume de centenas de reais).                                                                                                                                                                                                                                                                            |
| RMBS11                                         | 36%                            | sem DY no dev (3 linhas)                              | (f)      | Só 3 rendimentos no dev (~0,11/mês com cota a ~8).                                                                                                                                                                                                                                                                                                                     |
| WEST3, ENJU3                                   | 166%, 29%                      | 0 proventos no dev                                    | (f)      | Não reproduz.                                                                                                                                                                                                                                                                                                                                                          |
| RDLI11, HDEL11, PLRI11, RBOP11, REIT11, RSPD11 | 537%, 468%, 33%, 30%, 39%, 35% | 0 proventos no dev                                    | (f)      | Não reproduz (FIIs sem histórico no dev).                                                                                                                                                                                                                                                                                                                              |

### Resumo por causa (símbolos da conferência + achados do dev)

| Causa                         | Símbolos                                                                                                  | Tratamento                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| (a) parcela repetida          | KEPL3, NATU3, LUXM4, CEEB5 (+ linhas de 2010–2019: BBSE3, RIAA3, CMIG3/4, BRAP3/4…; 25 no universo)       | Auditoria: duplicata (`duplicata_sem_pagamento`)          |
| (a') ON+PN misturadas         | CEBR5, CEBR6, CEEB5, BRSR6, PCAR3, SUZB3, UNIP5, RPAD5 (113 linhas)                                       | Auditoria: duplicata (`duplicata_classe_irma`)            |
| (b) restituição como provento | MELK3, RBIR11, UCAS3, AFLT3, BRSR3, MEAL3 (7 linhas)                                                      | Auditoria: `tipo_excluido` (`copia_de_restituicao`)       |
| (c) desdobramento sem evento  | CACR11                                                                                                    | Trava (teto FII) — sem correção automática segura         |
| (d) extraordinário real       | HBRE3, BMKS3, BALM3/4, GRND3, LOGG3, JSLG3, SOND5/6, CGRA3/4, RIAA3, PATI3, ITUB4, LRDI11, ICNE11, MFII11 | Trava (teto ou salto) — o dado é real, mas não recorrente |
| (e) escala/preço sem liquidez | HBTS5, PEMA11, LRDI11, ICNE11                                                                             | Trava (teto)                                              |
| (f) não reproduz no dev       | WEST3, ENJU3, RDLI11, HDEL11, PLRI11, RBOP11, REIT11, RSPD11, RMBS11                                      | Trava cobre (todos acima do teto)                         |

A causa dominante é (d): dezenas de empresas pagaram extraordinários em dez/2025 para antecipar a
tributação de dividendos de 2026. O DY 12m está "certo" como conta, mas não é renda recorrente — não
pode sustentar o topo do Índice.

## Correção da origem (auditoria de proventos, `regras/calculo/proventos.ts`)

Sem apagar dado bruto: só `asset_proventos_auditados` (status/flags), recalculável por
`recalcular-analise.ts`. Critérios conservadores, todos exigindo a MESMA data-com:

1. **Repetição sem pagamento** (`duplicata_sem_pagamento`): mesmo símbolo + tipo + data-com, uma
   linha "sem pagamento" (BRAPI sem `paymentDate`: data de pagamento a ≤ 1 dia da data gravada — pagar
   em D+0/D+1 da data-com não existe na B3) e outra paga com valor igual (±2%) ⇒ sai a sem pagamento.
2. **ON e PN misturadas** (`duplicata_classe_irma`, só ações): mesmo critério, razão 1,10 ±0,5%
   (prêmio mínimo de 10% das PN, art. 17 §1º da Lei 6.404) ⇒ PN fica com o maior valor, ON com o
   menor, unit/outra com a linha paga.
3. **Cópia de restituição** (`copia_de_restituicao`): DIVIDENDO/JCP/RENDIMENTO com o mesmo valor
   (±0,5%) de uma REST CAP DIN/AMORTIZAÇÃO do mesmo símbolo a ≤ 3 dias de data-com ⇒ `tipo_excluido`.
   (REST CAP DIN e AMORTIZAÇÃO já eram excluídas; o problema era a cópia com outro rótulo.)

Fora de propósito: valores diferentes na mesma data-com (tranches, complementos — HBRE3, GRND3) e
linhas repetidas que TÊM pagamento (WEGE3 2026/2027/2028) não são tocados. Parâmetros em
`params.sanidade.proventos.{duplicataSemPagamento,copiaRestituicao}` (default no schema: a v1 gravada
continua válida).

Efeito no dev: 25 + 113 duplicatas novas, 7 cópias excluídas, 50 símbolos reescritos.

## Trava de plausibilidade (`regras/calculo/plausibilidadeProventos.ts`)

O DY 12m vira **"em conferência"** quando:

- **teto**: DY 12m > 25% (ações) ou > 20% (FIIs). Base: no Quadro de ações do dev, p50 = 3,3%,
  p90 = 12,9%, p95 = 20,5%, p98 = 30,9%; FII de tijolo/papel paga 8–16% com Selic de 15%. Todos os
  casos conferidos acima desses tetos eram erro de base (a, a', b, c, e) ou extraordinário não
  recorrente (d).
- **salto recente**: salto de provento (`detectarSaltoProvento`: DPA > 2× o do ano anterior, só
  marca se o payout DMPL do ano > 150% quando há payout) no último ano FECHADO, ou DPA 12m > 2× o DPA
  do último ano fechado (mesmo filtro com o payout do TTM). FII: só anos com 12 meses de informe.

Efeito (fórmula pública, documentada no docblock do módulo e de `indiceMf.ts`):

- C_div do Índice MF e o critério de dividendos do semáforo recebem `ausente('em_conferencia')`:
  nota 0, selo "dados incompletos" com o motivo `div:em_conferencia` = "proventos em conferência"
  (`textosTela`).
- O DY continua gravado em `AssetMultiplesCurrent.dy12mPct`, com a flag
  `proventos_em_conferencia_dy_acima_teto` ou `proventos_em_conferencia_salto_recente`; o Quadro e a
  página do ativo mostram o DY "em conferência" pelo padrão visual que já existia
  (`proventosEmConferencia`).
- Parâmetros em `params.sanidade.proventos.plausibilidade` (`dyMaxPct`, `saltoFator`,
  `saltoPayoutMaxPct`, `anosSaltoRecente`).

## Antes × depois no dev (recálculo + job quadro em 02/10/2026, dataRef 29/09/2026)

Top 10 do Quadro de ações por Índice:

| #   | Antes                        | Depois                                   |
| --- | ---------------------------- | ---------------------------------------- |
| 1   | BMKS3 10,00 (DY 34,2%)       | LEVE3 9,66 (8,4%)                        |
| 2   | LEVE3 9,66                   | POMO3 9,59 (20,5%)                       |
| 3   | POMO3 9,59                   | POMO4 9,59 (19,2%)                       |
| 4   | POMO4 9,59                   | CPFE3 9,34 (11,2%)                       |
| 5   | GRND3 9,44 (31,5%, suspeito) | SHUL4 9,30                               |
| 6   | CPFE3 9,34                   | CAMB3 9,19                               |
| 7   | ITUB3 9,34 (suspeito)        | LREN3 9,15                               |
| 8   | ITUB4 9,34 (suspeito)        | CXSE3 9,00                               |
| 9   | SHUL4 9,30                   | WIZC3 9,00 (incompleto: histórico curto) |
| 10  | CAMB3 9,19                   | ITSA3 8,80                               |

Ações do top 10 sustentadas por DY suspeito (acima do teto ou com `provento_suspeito`) contando no
Índice: antes 4 (BMKS3, GRND3, ITUB3, ITUB4); depois 0 (e 0 no top 20).

FIIs: o top 10 não muda no dev (KNCR11 4,87, KNHY11, MXRF11, …) porque a base de FIIs do dev está
parada (`proventos_defasados_cobertura_antiga` em 245 FIIs: DY já ausente); o único FII com DY no
dev (LRDI11, 42%) passa a "em conferência" (Índice 3,13 → 1,26).

DY 12m > 25% no Quadro: continua 7 ações + 1 FII **gravados** (o valor é mostrado em conferência), mas
**0 entram no Índice** (antes: 7 + 1). Flags no Quadro depois: 7 ações + 1 FII com
`dy_acima_teto`, 15 ações com `salto_recente`. CEBR5 caiu de 20,4% para 10,7% pela correção da
origem.

## Achados laterais (não corrigidos aqui)

- **Data-com real um pregão cedo**: desde a correção do `dividendService` (30/09/2026) o campo
  `dataCom` guarda a data-com real (`lastDatePrior`), mas a auditoria ainda aplica a convenção
  `convencaoDataCom.BRAPI = 'ex'` e subtrai um pregão. A queda de preço acontece 2 pregões depois da
  `dataComReal` auditada (LOGG3, BMKS3, BALM4, CEBR5). Efeito pequeno no DY 12m (borda da janela),
  mas a convenção precisa ser revista por linha (antes/depois do backfill de data-com).
- **HBTS5**: o valor do provento na BRAPI está em outra unidade; a trava cobre, mas o dado bruto
  continua errado.
- **CACR11**: desdobramento de cotas sem evento na base e sem reflexo no informe do CNPJ mapeado.

## Rodada 2 (prod 02/10)

Conferência em produção depois do #277 (`asset_proventos_auditados` e `analise_quadro_linhas`):

- **CPFE3** (DY 20,5%): DIVIDENDO 3,7315 com data-com 28/04/2026 paga em 31/12 **e** 3,7315 com
  data-com 29/04 "paga" em 29/04 (sem pagamento). **CEEB5**: DIVIDENDO 4,2018 (28/10/2025, pago
  05/12) × 4,2554 (29/10, sem pagamento, +1,3%); JCP 0,5737 (01/10, sem pagamento) × 0,5215 (pago
  31/12, razão 1,10). A BRAPI repete a parcela com a data-com **deslocada 1 pregão**; as regras do
  #277 exigiam a mesma data-com.
- **CEEB5** com `proventos_em_conferencia_dy_acima_teto` e `estadoIndice = 'calculado'`: o Índice é
  da empresa (ticker de referência CEEB3, decisão 13) e a trava era só por ticker.
- **POMO3/POMO4**: DPA 2025 = 1,1455 × 0,5015 em 2024 (2,28×), DY 12m 22–23% (0,69 em nov/2025,
  antecipação à tributação de 2026); o gate de payout (> 150%) barrou o salto e o DY ficou abaixo
  do teto de 25%.

Correções:

1. **Dedupe com data-com deslocada** (`regras/calculo/proventos.ts`): as regras de repetição sem
   pagamento e de classe irmã aceitam data-com a até `duplicataSemPagamento.pregoesDataCom` pregões
   (default 1, calendário B3 de `regras/comum/pregoes.ts`), preferindo o par mais próximo. Demais
   critérios iguais (±2% ou razão 1,10; linha sem pagamento = pagamento a ≤ 1 dia da data gravada);
   linhas com pagamento (cronograma real: CPFE3 1,1282/0,1302/0,2170/0,6075 em 29/04/2026) não são
   tocadas. Na classe irmã continua valendo a espécie do ticker (PN fica com o maior: no CEEB5 sai o
   JCP 0,5215 pago e fica o 0,5737, como já acontecia com a mesma data-com).
2. **Teto de DY de ações 25% → 18%** (`plausibilidade.dyMaxPct.acao`, default no schema; FIIs seguem
   20%): p95 do Quadro de ações = 20,5% e o que fica entre 18% e 25% é antecipação de dez/2025
   (POMO3/4, SOND5/6) ou parcela repetida (CPFE3).
3. **Trava por empresa** (`recalcularScores.comConferenciaDaEmpresa`): se qualquer ticker da empresa
   tem o DY em conferência, o C_div da empresa entra como `ausente('em_conferencia')` — o Quadro e o
   Índice concordam.

Efeito no dev (recálculo `--tudo --apply` + job quadro, dataRef 29/09/2026; o dev não tem as linhas
de prod de CPFE3/CEEB5 — CEEB5 está com base parada —, os casos estão nos testes):

- `duplicata_sem_pagamento`: 25 → 48 (23 pares com data-com a 1 pregão; todos com o mesmo valor e
  uma linha paga: MOTV3 2009–2013, ITSA3, TAEE3/4, RCRI11 jan–fev/2026, ITUB4 dez/2021, AUAU3…).
- DY 12m > 18% no Quadro de ações: 12 gravados; contando no Índice **4 → 0** (POMO3 20,5%, POMO4
  19,2%, SOND5, SOND6). Empresas incompletas por outro ticker em conferência: BRSR3/BRSR5, DOHL3,
  SOND3. Linhas com flag de conferência e Índice 'calculado': 0.
- Top 10 de ações por Índice — antes: LEVE3 9,66, POMO3 9,59, POMO4 9,59, CPFE3 9,34, SHUL4 9,30,
  CAMB3 9,19, LREN3 9,15, CXSE3 9,00, WIZC3 9,00, ITSA3 8,80; depois: LEVE3 9,66, CPFE3 9,34,
  SHUL4 9,30, CAMB3 9,19, LREN3 9,15, CXSE3 9,00, WIZC3 9,00 (incompleto: histórico curto), ITSA3
  8,80, ITSA4 8,80, BEES3 8,79 (POMO3/4 → 8,09, em conferência).

Produção: mesmos comandos do #277 (recalcular `--tudo` dry-run → `--apply` → job quadro); a v1
gravada não tem `plausibilidade`/`pregoesDataCom`, então valem os defaults novos sem seed.

## Rodada 3 (02/10)

Proventos "parados" (`pagador_recorrente_parado`: 93 ações + 33 FIIs em prod), a data-com da
auditoria um pregão cedo (achado lateral acima) e SHOW3 sem setor: ver
[diagnostico-proventos-parados.md](diagnostico-proventos-parados.md).
