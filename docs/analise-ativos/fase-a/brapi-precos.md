# Fase A — papel "o que já temos + BRAPI paga" (30/09/2026)

Spike empírico, só leitura: 18 requisições BRAPI (orçamento de 40), banco **dev** (Neon) só leitura,
COTAHIST B3 (ago/2026 mensal + 2016 anual) e Informe Mensal FII CVM 2026 para conferência.
Nenhuma escrita em banco, nenhum acesso a prod.

Scripts (`scripts/analise-ativos/`): `spike-brapi-fetch.ts` (baixa BRAPI → scratchpad),
`spike-brapi-compara.ts` (BRAPI × CVM, splits), `spike-brapi-precos-db.ts` (banco dev),
`spike-brapi-cotahist-liquidez.ts` (liquidez/preço cru B3).
Saídas: `brapi-precos-brapi.json`, `brapi-precos-db.json`, `brapi-precos-cotahist.json` (nesta pasta).

## Veredito curto

1. **BRAPI paga = espelho da CVM DFP/ITR.** Para WEGE3, PETR4, ITUB4, lucro atribuível, receita e PL
   batem **ao centavo** com a extração CVM do papel de ações em **100% dos anos 2014–2025 (36/36 pares)**.
   Profundidade: **16 anos (2010–2025)** anuais e **60–63 trimestres (2010T4–2026T2)**. Não traz
   informação que a CVM não tenha — é conveniência (JSON pronto, 1 req/ticker), não fonte independente.
2. **Os campos "derivados" da BRAPI não servem para `multiples_yearly`.** `defaultKeyStatisticsHistory.price`
   é a cotação **ajustada por proventos**, dividida por LPA **não ajustado** → P/L histórico errado
   (WEGE3 2019: BRAPI 19,9 × correto 45,1; 2010: 3,7 × 33,9; PETR4 2022: 0,94). LPA da DFP vem
   **×1000** (WEGE3 2024 = 1440,26; ITUB4 2019 = 2.780.000). Nº de ações é "como reportado", com o
   mesmo desalinhamento da CVM em anos de split (WEGE3 2019↔2020 trocados).
3. **FIIs na BRAPI: quase nada.** Só `bookValue` (VP/cota), `sharesOutstanding`, `priceToBook` e DY
   arredondado a 2 casas (0,08) — **só o mês mais recente**, idênticos ao Informe Mensal CVM (HGLG11
   165,9514 = CVM ago/26 165,951408). Sem histórico, sem vacância, sem cotistas, sem imóveis. Segmento
   (`subsector`) não confiável (MXRF11 = "Logística"; 120 de 328 FIIs = "Multicategoria").
4. **Histórico de preço no banco dev NÃO sustenta 10 anos.** 0 de 879 ações e 0 de 1.756 FIIs com ≥ 5
   anos; mediana 0,31 ano (ações) e 0,14 ano (FIIs); só fonte BRAPI; nenhum COTAHIST carregado. E há
   um defeito de gravação: o cron diário grava o fechamento de D-1 com data D e grava fins de semana
   (13,6% das linhas de ações caem em sábado/domingo).
5. **Liquidez: não temos.** Nenhuma coluna de volume no schema. **COTAHIST tem** (VOLTOT/QUATOT/TOTNEG,
   1 arquivo = todo o mercado) e é o caminho certo para "top 100 FIIs por liquidez". BRAPI dá volume
   diário em quantidade no histórico (multi-ticker funciona) e só o volume de 1 dia no `/quote/list`.

**Recomendação de fontes:** CVM direto para fundamentos (ações e FIIs) + **COTAHIST B3 para preço de
fim de ano fiscal e liquidez** + BRAPI só para cotação D-1 viva e `summaryProfile` (setor) como
complemento. Não pagar bolsai/Fintz para isso.

---

## 1. BRAPI paga — módulos de balanço

### 1.1 Profundidade (medida)

| Módulo | WEGE3 | PETR4 | ITUB4 | HGLG11 / MXRF11 |
| --- | --- | --- | --- | --- |
| balanceSheetHistory (anual) | 16 (2010–2025) | 16 | 16 | 0 |
| incomeStatementHistory | 16 | 16 | 16 | 0 |
| cashflowHistory | 16 | 16 | 16 | 0 |
| balanceSheetHistoryQuarterly | 63 (2010-12 → 2026-06) | 63 | 63 | 0 |
| incomeStatementHistoryQuarterly | 62 (2011T1 → 2026T2) | 62 | **60** | 0 |
| cashflowHistoryQuarterly | 62 | 62 | 60 | 0 |
| financialDataHistory / Quarterly | 16 / 63 | 16 / 63 | 16 / 63 | 0 |
| defaultKeyStatisticsHistory / Quarterly | 16 / 63 | 16 / 63 | 16 / 63 | 0 |
| financialData (TTM) | 31 campos | idem | 15 c/ valor (banco) | ausente |
| defaultKeyStatistics (atual) | 54 campos | idem | idem | 5 c/ valor |
| summaryProfile | setor/indústria B3 | idem | idem | "Fundos Imobiliários"/segmento ruim |
| valueAddedHistory (DVA) | 16 | 16 | 16 | 0 |

Campos: balanço 128 chaves (layout "Yahoo + CVM"; WEGE3 usa ~50, PETR4 39, banco 24 — layout de banco
tem `financialAssets`, `centralBankCompulsoryDeposit` etc.), DRE 53, fluxo 17 (FCO, FCI, FCF,
`freeCashFlow`, caixa inicial/final). Não há **capex** isolado nem **dividendos/JCP pagos** no fluxo —
só `financingCashFlow` agregado (a CVM DFC tem as linhas). DRE traz `netIncome` (consolidado) e
`netIncomeApplicableToCommonShares` (**atribuível aos controladores** = o que a CVM chama de lucro e o
que usamos). `ebit`/`cleanEbitda` na DRE são iguais ao EBIT (não somam D&A); o EBITDA "de verdade" só
aparece em `financialData(History).ebitda` (calculado pela BRAPI, TTM).

Bancos (ITUB4): `netIncome`, `ebit` = null; receita = receita de intermediação bruta; dívida/liquidez
corrente sem sentido (debtToEquity 13,0). Tratar bancos/seguradoras com layout próprio.

### 1.2 Bate com a CVM?

| Ticker | Anos comparados | Lucro atribuível | Receita | PL | Nº ações |
| --- | --- | --- | --- | --- | --- |
| WEGE3 | 2014–2025 | 12/12 idênticos (2024 = **6.042,6 mi**) | 12/12 | 12/12 | 9/12 a ±1% (2016, 2019, 2020 divergem; 2019↔2020 invertidos) |
| PETR4 | 2014–2025 | 12/12 (2024 = **36.606 mi**) | 12/12 | 12/12 | 12/12 a ±1% (2023: 13.044,5 × 12.940,1 = 0,8%) |
| ITUB4 | 2014–2025 | 12/12 (2025 = 44.857 mi) | 12/12 | 12/12 | 8/12 a ±1% (2024 10.784,5 × 9.748,1; 2017, 2015, 2014 divergem) |

Conclusão: a BRAPI lê a mesma DFP (consolidada) da CVM. O valor agregado é a normalização de contas
(nomes em inglês) e o histórico 2010–2013, que a CVM também tem (DFP desde 2010 no Dados Abertos).
**Nº de ações não é confiável em nenhuma das duas fontes** para anos com bonificação/split/tesouraria —
precisa de regra (ver §5).

### 1.3 Múltiplos históricos da BRAPI (defaultKeyStatisticsHistory) — NÃO usar

WEGE3, último pregão de cada ano (close split-ajustado da própria BRAPI × ações de hoje ÷ lucro):

| Ano | close (split-aj.) | `price` BRAPI (div.-aj.) | P/L BRAPI | P/L consistente |
| --- | --- | --- | --- | --- |
| 2025 | 48,51 | 48,33 | 31,8 | 31,9 |
| 2024 | 52,77 | 49,91 | 34,7 | **36,7** |
| 2021 | 32,98 | 29,66 | 34,7 | 38,6 |
| 2019 | 17,33 | 15,29 | 19,9 | **45,1** |
| 2014 | 5,88 | 4,74 | 8,0 | 25,9 |
| 2010 | 4,19 | 3,06 | 3,7 | 33,9 |

O erro cresce para trás (proventos acumulados + splits não aplicados ao LPA). `dividendYield` histórico
vem com 2 casas (0,21 em 2011). `trailingPE` de PETR4 2022 = 0,94. **Calcular os múltiplos nós mesmos.**

## 2. Histórico de preços (banco dev, `asset_price_history`)

| Classe | Ativos no catálogo | Com histórico | Mediana (anos) | ≥ 5 anos | ≥ 10 anos | Fontes |
| --- | --- | --- | --- | --- | --- | --- |
| stock BRL | 879 | 594 | 0,31 | 0 | 0 | só BRAPI |
| fii BRL | 1.756 | 32 | 0,14 | 0 | 0 | só BRAPI |
| etf BRL | 251 | 15 | 0,02 | 0 | 0 | só BRAPI |
| bdr BRL | 10 | 2 | 1,05 | 0 | 0 | só BRAPI |
| stock/reit USD | 3 | 0 | — | 0 | 0 | — |

Linhas por ano (ações): 2024 = 257, 2025 = 500, 2026 = 38.202. PETR4 é o mais longo (desde 10/06/2024).
O dev nunca rodou `scripts/backfill-cotahist-b3.ts` (0 linhas `B3_COTAHIST`). **Prod não foi medido**
(regra do spike); pela memória, prod pode ter COTAHIST 2016–2020 + BRAPI — **se tiver, mistura escalas**
(ver abaixo) e precisa ser medido antes da Fase 0.

**Ajuste de preço por fonte (medido):**

| Fonte | O que grava | Evidência |
| --- | --- | --- |
| COTAHIST B3 | **cru** (como negociado) | WEGE3 29/12/2016 = R$ 15,50; HGLG11 = R$ 1.100,00 (antes do 10:1 de 2018); MXRF11 = 89,11; MGLU3 = 106,17 |
| BRAPI `historicalDataPrice.close` (o que `assetPriceService` grava) | **ajustado por split**, re-ajustado a cada evento | WEGE3 29/12/2016 = 5,9615 = 15,50 ÷ (1,3 × 2); MGLU3 jan/2020 = 132,86 (grupamento 1:10 de 2024 aplicado) |
| BRAPI `adjustedClose` e `defaultKeyStatisticsHistory.price` | ajustado por split **e proventos** | WEGE3 30/12/2024: close 52,77, adjustedClose 49,83 |
| Yahoo (`yahooFinanceSync`) | `adjclose` = split **e proventos** | código usa adjclose |

Consequência: uma linha BRAPI gravada antes de um split fica na escala velha (nunca é regravada) e o
COTAHIST fica cru — a série do banco **não tem escala única**. `sourcePrecedence.isRawPriceSource` já
trata COTAHIST como cru; é preciso fazer o mesmo no cálculo de múltiplos.

**Defeito medido na gravação diária (dev):** `brapiSync.syncAssetPrices` usa `regularMarketTime` (que a
BRAPI devolve como o instante da requisição) como data, e o cron roda 07:45 UTC → grava o fechamento
de D-1 com data D e grava sábados/domingos. WEGE3 set/2026: só 6 de 17 datas batem com o close da
BRAPI (dif. até 2,34%); linhas em fim de semana = **5.280 de 38.959 (13,6%) em ações, 150/2.285 em
FIIs**. PETR4 (gravado via histórico) bate 21/21. Para "último pregão do ano fiscal" isso dá um dia
errado. Vale um ticket à parte (fora do escopo do spike).

**Buracos:** 16 ações e 1 FII com intervalo > 10 dias (maior: 82 dias; HGLG11 16/07→16/09/2026 = 62 dias).

**Viabilidade de `multiples_yearly`:** viável, mas **não com o que está no banco**. Só precisa de 1 preço
por ano × ativo (último pregão do ano fiscal): 11 arquivos COTAHIST anuais (2015–2025) cobrem todo o
mercado cru, com data certa. Fórmula consistente: `valor de mercado = close cru × nº de ações na mesma
data` (ou close ajustado × nº de ações ajustado ao mesmo evento), e `P/L = valor de mercado ÷ lucro
atribuível`. Nunca misturar preço ajustado por provento com LPA.

## 3. Volume / liquidez média

| Fonte | Tem? | Detalhe medido |
| --- | --- | --- |
| Banco (schema) | **Não** | nenhuma coluna de volume/negócios (só `fixed_income_assets.liquidityType`) |
| BRAPI `/quote/list?sortBy=volume` | parcial | só volume **do dia**, em quantidade; 1 req = 500 papéis; 671 fundos (328 FIIs) em 2 reqs |
| BRAPI `/quote/X?range=3mo` | sim | `volume` diário por pregão; multi-ticker funciona (WEGE3,PETR4,HGLG11 = 1 req, 22 pregões cada). HGLG11 21 pregões até 30/09: 139 mil cotas/dia, **R$ 20,6 mi/dia** |
| COTAHIST B3 | **sim, oficial** | VOLTOT (R$), QUATOT, TOTNEG por papel/dia; 1 arquivo = todo mercado. Ago/2026 (21 pregões): 354 FIIs negociados; HGLG11 **R$ 18,9 mi/dia**, MXRF11 R$ 17,3 mi, 1º TRXF11 R$ 46,9 mi; **100º = RBHG11 R$ 495 mil/dia**; 76 FIIs ≥ R$ 1 mi/dia, 177 ≥ R$ 100 mil |

Recomendação: job diário COTAHIST (arquivo D) gravando fechamento **cru + volume financeiro + nº
negócios**; liquidez 30d = média de VOLTOT nos últimos 21 pregões (dias sem negócio contam 0). O
parser `cotahistB3Parser.ts` já documenta as posições; hoje descarta volume.

## 4. Catálogo (dev)

| type / moeda | Asset | com `currentPrice` | preço < 7 dias | fonte |
| --- | --- | --- | --- | --- |
| stock BRL | 879 | 594 | 471 | brapi |
| fii BRL | 1.756 | 32 | 17 | 1.377 cvm + 379 brapi |
| etf BRL | 251 | 14 | 5 | brapi |
| bdr BRL | 10 | 2 | 0 | brapi |
| stock USD | 2 | 0 | 0 | manual |
| reit USD | 1 | 0 | 0 | manual |
| fip / fip-infra / fiagro | 1.117 / 90 / 36 | — | — | cvm |

`asset_fundamentals`: 1.543 linhas; P/L em 582, beta em 282, DY em 573 (atualizado hoje).
Os 1.756 "FIIs" incluem fundos CVM não listados; a B3 teve **354 FIIs negociados em ago/2026** e a BRAPI
lista **328** — o universo do Quadro de FIIs é ~330–360, não 1.756. Falta no `Asset`: setor, segmento,
bolsa, flag "listado". BDR com só 10 no dev (prod: 686 pela memória) — fora do escopo inicial.

## 5. Regras de sanidade propostas (para Fase 0)

1. `lucro_atribuível` BRAPI × CVM divergindo > 0,5% → alerta (hoje 0%).
2. LPA: nunca ler `basicEarningsPerCommonShare` da BRAPI; calcular `lucro ÷ nº ações`. Se |LPA| > 1.000
   ou LPA × preço implicar P/L < 0,3 → rejeitar.
3. Nº de ações: variação ano a ano > 15% sem evento corporativo (`asset_corporate_actions`) no intervalo →
   marcar suspeito; variação ≈ fator de split com o evento DEPOIS do fim do exercício → usar o nº anterior.
4. Preço fim de ano: exigir data útil B3 (sem sábado/domingo/feriado); último pregão ≤ 5 dias antes de
   31/12; senão "sem ponto".
5. Nunca calcular múltiplo com preço ajustado por provento (`adjustedClose`, Yahoo `adjclose`,
   `defaultKeyStatisticsHistory.price`).
6. Série de preço: salto diário > 40% sem evento corporativo → suspeito de escala misturada.
7. `valor de mercado` do ano calculado por (close cru × ações) e por (close split-aj. × ações de hoje)
   devem ficar a ±15% (diferença = recompra/emissão); fora disso → erro de escala.
8. FII: VP/cota BRAPI × CVM último mês > 0,5% → alerta; DY da BRAPI (2 casas) nunca exibido.
9. Liquidez: dia sem negócio = 0 (não pular); FII com < 15 pregões negociados em 21 → "baixa liquidez".
10. Bancos/seguradoras (receita = intermediação, `ebit` nulo): não calcular margem EBITDA, dív.líq/EBITDA,
    liquidez corrente — mostrar "n/a".

## 6. Riscos

- Dependência da BRAPI para algo que ela só re-empacota; se mudar layout/plano, perde-se sem ganho.
- Prod pode ter série de preço com escalas misturadas (COTAHIST cru + BRAPI ajustado) — não medido.
- Defeito D-1/fim de semana no cron de preço contamina qualquer "fechamento do dia X" lido do banco.
- `splitHistory` é 403 no nosso plano (memória) → eventos corporativos vêm de BRAPI/Yahoo com duplicatas
  (WEGE3 2021 aparece 2×: BRAPI 27/04 e Yahoo 28/04) — deduplicar antes de ajustar preço/ações.
- COTAHIST anual pesa ~50–150 MB de texto por ano; job de backfill deve rodar fora do request e
  gravar só o necessário (1 preço/ano/ativo + série diária dos listados).

## 7. Amostra para QA conferir (fontes independentes)

| Ativo | Campo | Período | Valor | Fonte de conferência |
| --- | --- | --- | --- | --- |
| WEGE3 | Lucro líquido atribuível aos controladores | 2024 | R$ 6.042,6 mi | release 4T24 WEG / Status Invest |
| PETR4 | Lucro líquido atribuível aos acionistas | 2024 | R$ 36.606 mi | release 4T24 Petrobras |
| ITUB4 | Lucro líquido atribuível (contábil) | 2025 | R$ 44.857 mi | DFP 2025 Itaú / RI |
| WEGE3 | Receita líquida | 2024 | R$ 37.986,9 mi | release 4T24 WEG |
| WEGE3 | Fechamento (cru) | 30/12/2024 | R$ 52,77 | B3 / Status Invest histórico |
| WEGE3 | P/L no fim do ano (52,77 × 4.197,3 mi ações ÷ 6.042,6 mi) | 2024 | 36,7 | Fundamentus / Status Invest (P/L histórico) |
| WEGE3 | Fechamento cru (antes do 1,3:1 de 2018 e 2:1 de 2021) | 29/12/2016 | R$ 15,50 | B3 COTAHIST / ADVFN |
| HGLG11 | VP por cota | ago/2026 | R$ 165,95 | relatório gerencial Pátria Log / FundsExplorer |
| MXRF11 | VP por cota | ago/2026 | R$ 9,26 | relatório gerencial XP / FundsExplorer |
| HGLG11 | Volume financeiro médio diário | ago/2026 (21 pregões) | R$ 18,9 mi | B3 / Status Invest "liquidez média diária" |
