# Fase A — Stocks e REITs dos EUA (spike de dados, 30/09/2026)

Papel: medir, com dados reais, o que dá para montar para Stocks/REITs (Fase 4), a que custo e com que regras.
Nada foi gravado em banco; nada tocou produção. Scripts em `scripts/analise-ativos/eua-*.ts`; saídas brutas em
`docs/analise-ativos/fase-a/eua-*.json`.

| Script | O que mede | Saída |
| --- | --- | --- |
| `eua-sec-companyfacts.ts` | 8 tickers (AAPL, MSFT, KO, JNJ, O, PLD, SPG, AMT) × 17 campos × FY2015–2025, conceito us-gaap usado por ano, checagens e FFO aproximado × reportado | `eua-sec-companyfacts.json` |
| `eua-sec-frames-cobertura.ts` | Cobertura de cada campo no S&P 500 (500 CIKs) e nos 199 REITs listados (SIC 6798), CY2016–CY2025, via API *frames* | `eua-sec-frames-cobertura.json` |
| `eua-precos-yahoo-teste.ts` | Fechamento diário dos 503 tickers do S&P 500 pelo Yahoo v8/chart (o mesmo endpoint do app) | `eua-precos-yahoo-teste.json` |

## Veredito

1. **Fundamentos de stocks pela SEC: viável e grátis.** Receita, lucro, PL, LPA, FCO, D&A e média de ações têm
   11/11 anos nos 8 tickers e 88–99% de cobertura no S&P 500 por ano. O custo é de **engenharia**, não de dinheiro: cada campo
   precisa de uma **cadeia de conceitos** (a receita trocou de tag em 6 das 8 empresas entre 2016 e 2019), e
   **dívida e DPA pedem regras e validação por empresa**.
2. **FFO/AFFO: não existe no XBRL** (0 empresas em qualquer ano, nem como `FundsFromOperations`). A aproximação
   `lucro comum + D&A − ganho na venda + impairment` **só funciona para REIT simples**: O erra 0,2–2,4%; PLD −3,6% a +8,8%;
   AMT −17,8% a +9,4%; SPG **−25% a +30%**. Não serve para exibir. **Porém o FFO está no 10-K** (tabela de
   reconciliação do MD&A nos 4 REITs), em HTML, sem tag. Extrair do 10-K (LLM ou parser + revisão) é o caminho,
   mais barato que suplementos em PDF.
3. **Preço diário EUA**: tecnicamente resolvido hoje (Yahoo trouxe **503/503 em 29 s**; e a **BRAPI paga que já
   temos também devolve AAPL/O/SPG em USD com 10 anos de histórico**, sem isso estar documentado). O problema é a **licença**.
   Todo plano barato (EODHD US$ 20–100, FMP US$ 19–139, Tiingo US$ 30–50, Massive US$ 29–199, Alpha Vantage)
   é **uso pessoal/interno, sem exibição a terceiros**. Exibir no app custa, nos preços públicos, **a partir de ~US$ 500/mês**
   (Twelve Data Venture) e chega a US$ 2.499/mês (EODHD Enterprise, Massive Business). FMP e EODHD "Custom" são sob cotação.
   A estimativa da spec (US$ 22–60/mês) só vale para planos pessoais.
4. **Escopo MVP sugerido: ~530 tickers** = S&P 500 (503 tickers / 500 CIKs, dos quais 28 REITs) + REITs de
   patrimônio fora do S&P até completar ~o MSCI US REIT (106 constituintes). Fora: REITs hipotecários e micro caps.

## 1. SEC EDGAR companyfacts

Acesso: `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` com `User-Agent: MyFinance suporte@appmyfinance.com.br`.
Sem chave, limite de 10 req/s. Cada arquivo tem de 3,2 a 5,0 MB (8 baixados). O mapa ticker→CIK
(`company_tickers.json`) tem 10.431 tickers. Existe o **bulk noturno** `companyfacts.zip` (1,41 GB, atualizado
30/09/2026 12:27 GMT), melhor para o backfill que 600 GETs.

### 1.1 Cobertura nos 8 tickers (FY2015–2025 = 11 anos)

| Campo | AAPL | MSFT | KO | JNJ | O | PLD | SPG | AMT | Conceitos necessários (cadeia) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Receita | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | Revenues · RevenueFromContract…ExcludingAssessedTax · SalesRevenueNet · SalesRevenueGoodsNet · RealEstateRevenueNet |
| Lucro líquido | 11 | 11 | 11 | 11 | 11 | 11 | 11¹ | 11 | NetIncomeLoss · NetIncomeLossAvailableToCommonStockholdersBasic |
| PL | 11 | 11 | 11 | 11² | 11 | 11 | 11 | 11 | StockholdersEquity · …IncludingPortionAttributableToNoncontrollingInterest |
| LPA diluído | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | EarningsPerShareDiluted · EarningsPerShareBasicAndDiluted |
| DPA | 11 | 11 | 11 | 11 | 9 | 11 | 11 | **4** | CommonStockDividendsPerShareCashPaid · …Declared |
| Ações em circulação (fim do ano) | 11 | 11 | 11³ | 11³ | 11 | 11 | **0** | 11 | CommonStockSharesOutstanding · Issued − Treasury · dei (capa) |
| Média ponderada diluída | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | WeightedAverageNumberOfDilutedSharesOutstanding |
| Dívida bruta | 11 | 11 | 11 | 9 | 10 | 11 | 11 | 11 | LongTermDebt · LTDNoncurrent+Current · LTDAndCapitalLeaseObligations · NotesPayable+SecuredDebt |
| FCO | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | NetCashProvidedByUsedInOperatingActivities(+ContinuingOperations) |
| Capex | 11 | 11 | 11 | 11 | **0** | **0** | 11 | 11 | PaymentsToAcquirePropertyPlantAndEquipment · PaymentsToAcquireProductiveAssets |
| Dividendos pagos | 11 | 11 | 11 | 11 | 11 | 11 | **4** | 11 | PaymentsOfDividendsCommonStock · PaymentsOfDividends · PaymentsOfOrdinaryDividends |
| Recompras | 11 | 11 | 11 | 11 | 0 | 0 | 8 | 11 | PaymentsForRepurchaseOfCommonStock |
| D&A | 11 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | DepreciationDepletionAndAmortization · DepreciationAndAmortization · DepreciationAmortizationAndAccretionNet · Depreciation |
| Ganho na venda de imóveis | — | — | — | — | 11 | **4** | **0** | 11⁴ | GainLossOnSaleOfProperties · GainLossOnSaleOfOtherAssets |
| FFO / AFFO | — | — | — | — | **0** | **0** | **0** | **0** | não existe em us-gaap |

¹ SPG não usa `NetIncomeLoss`; só `NetIncomeLossAvailableToCommonStockholdersBasic`. ² JNJ só com a participação de não controladores.
³ KO/JNJ não publicam `CommonStockSharesOutstanding`: sai de emitidas − tesouraria ou do `dei` da capa, com data de fev/mar.
⁴ AMT: "GainLossOnSaleOfOtherAssets" não é ganho imobiliário puro.

Capex dos REITs (O, PLD) aparece como aquisição/desenvolvimento de imóveis, que não é capex de manutenção. FCL de REIT
não deve ser exibido como "FCO − capex".

### 1.2 Cobertura no S&P 500 (API frames, nº de empresas com o campo; universo 500 CIKs / 199 REITs listados)

| Campo | CY2016 | CY2020 | CY2024 | Observação |
| --- | --- | --- | --- | --- |
| Receita | 454 / 146 | 474 / 161 | 493 / 170 | 2025: `Revenues` 232 + `RevenueFromContract…` 307 (fragmentado) |
| Lucro líquido | 459 / 163 | 478 / 182 | 498 / 193 | |
| PL | 461 / 170 | 487 / 188 | 499 / 195 | |
| LPA diluído | 442 / 159 | 464 / 174 | 483 / 183 | |
| DPA | 316 / 117 | 325 / 135 | 354 / 147 | inclui não pagadoras; "Declared" 280 × "CashPaid" 112 |
| Dividendos pagos | 358 / 147 | 379 / 166 | 399 / 169 | |
| Média de ações diluída | 442 / 160 | 467 / 179 | 486 / 186 | |
| Dívida bruta | 398 / 135 | 434 / 157 | 444 / 163 | 8 conceitos diferentes em uso |
| FCO | 456 / 161 | 478 / 183 | 498 / 193 | |
| Capex | 427 / 117 | 437 / 116 | 447 / 121 | |
| D&A | 445 / 141 | 464 / 156 | 485 / 173 | |
| FFO tagueado | 0 / 0 | 0 / 0 | 0 / 0 | |

Frames alinham pelo ano-calendário. Empresas com exercício em set/jun e recém-listadas explicam a maior parte da
lacuna de 1–10%. O CY2025 ainda está incompleto (exercícios que terminam em 2026). Foram ~130 MB de frames.

### 1.3 Problemas de tags encontrados (medidos)

- **Troca de conceito no tempo**: AAPL (SalesRevenueNet→Revenues em 2016→RevenueFromContract… em 2019), MSFT, KO,
  JNJ, O (3 conceitos em 3 anos), PLD e AMT. Isso vem do ASC 606. A série só fecha com uma cadeia por ano.
- **Tag errada no próprio filing**: PLD `CommonStockDividendsPerShareDeclared` = 0,00–0,15 em todos os anos, contra
  1,52–4,04 do `CashPaid`. AMT 2022 `Declared` = 4,30 contra `CashPaid` = 5,86. Por isso a cadeia prioriza `CashPaid`
  e confere contra dividendos pagos ÷ ações.
- **Buracos**: AMT sem DPA 2015–2021 e O sem DPA 2015–2016. Dá para derivar com dividendos pagos ÷ média de ações, com um selo.
- **SPG** não publica ações em circulação desde 2012, nem dividendos pagos desde 2019 (usa conceito próprio). Nesse
  caso, média ponderada.
- **Desdobramento**: AAPL FY2018/19 tem o LPA reapresentado entre 10-Ks (11,91 → 2,98; razão 4,00). Pegar sempre o
  **10-K mais recente** para o período deixa a série consistente. Misturar valores "como originalmente reportados"
  quebra DPA × ações (a 1ª rodada do script deu erro de 324% em AAPL 2018 por isso).
- **Exercício fora de dezembro**: AAPL termina em set (7 datas diferentes, semana 52/53) e MSFT em jun. JNJ termina entre
  28/12 e 03/01. Rotular o ano pelo término, e término em jan/fev conta como ano anterior.
- **Dívida**: 8 conceitos em uso no S&P. KO muda de `LongTermDebt` para `LongTermDebtAndCapitalLeaseObligations` em 2024,
  e AMT inclui arrendamentos. O vem de `NotesPayable + SecuredDebt` e ainda faltam linha de crédito e commercial paper. Para o
  semáforo (D/E ≤ 1) é suficiente com tolerância, mas para "dívida líquida/EBITDA" de REIT não é.
- **EBITDA não é tag GAAP**: calcular (lucro operacional + D&A) e marcar como calculado. O "EBITDAre" e o
  "Dív/EBITDA" de REIT vêm do 10-K, no mesmo trabalho de extração do FFO.

### 1.4 FFO: aproximação só com XBRL × FFO reportado no 10-K (US$ mi)

| REIT | Ano | FFO reportado (10-K) | Aproximado (XBRL) | Erro | Por que erra |
| --- | --- | --- | --- | --- | --- |
| O | 2025 | 3.860,3 | 3.876,5 | +0,4% | net lease simples; tudo tagueado |
| O | 2024 | 3.467,7 | 3.552,1 | +2,4% | |
| O | 2023 | 2.822,1 | 2.828,9 | +0,2% | |
| PLD | 2025 | 5.680 | 5.948,4 | +4,7% | ganho de venda em tag própria (fora do companyfacts) e JV (+551) |
| PLD | 2024 | 5.795 | 6.306,3 | +8,8% | idem (ganhos −899) |
| PLD | 2023 | 5.746 | 5.538,3 | −3,6% | |
| SPG | 2025 | 4.663,3 | 6.050,7 | +29,8% | ganho de US$ 2,9 bi não tagueado + D&A de JV/Klépierre (812) fora |
| SPG | 2024 | 4.876,8 | 3.632,9 | −25,5% | D&A de não consolidadas (848) fora do XBRL |
| SPG | 2023 | 4.685,9 | 3.541,9 | −24,4% | idem |
| AMT | 2025 | 4.160,9 | 4.553,8 | +9,4% | D&A inclui não imobiliário; ajustes de minoritários (−451) |
| AMT | 2024 | 5.233,2 | 4.301,7 | −17,8% | operação descontinuada (Índia, +1.334) |
| AMT | 2023 | 4.610,0 | 4.543,1 | −1,5% | |
| AMT | 2022 | 5.279,5 | 4.967,5 | −5,9% | |

Fontes do reportado: tabelas de reconciliação do MD&A dos 10-K (O 0000726728-26-000011 e -25-000055;
PLD 0001193125-26-051453 e 0000950170-25-021272; SPG 0001104659-26-019419; AMT 0001053507-26-000035 e -25-000025).
Nos 4 casos, o 10-K **traz FFO, e O traz também AFFO e FFO/AFFO por ação** (O 2025: FFO/ação 4,25, AFFO/ação 4,28).
**Conclusão: FFO/AFFO = extração do 10-K/10-Q (HTML, não PDF)**, com fila de revisão, no mesmo pipeline da Fase 5.
A aproximação serve no máximo como **alerta de sanidade**, com tolerância de 10% para REIT simples.

## 2. Preço diário EUA

**No app hoje:** `yahooFinanceSync.ts` só busca índices e câmbio (^BVSP, BRL=X). `brapiQuote.ts` busca B3, cripto e moedas.

**Teste empírico (30/09/2026, 15h08 ET):**
- Yahoo v8/chart: **503/503 tickers OK, 0 × 429, 28,8 s** com concorrência 4. A amostra de 10 anos trouxe 2.513 pregões.
  Às 15h08 ET o candle de 30/09 já existia, mas era **intradiário**.
- **BRAPI (plano pago atual)**: `/api/quote/AAPL,MSFT,KO,JNJ,O,PLD,SPG,AMT,BRK-B` devolveu os 9 em USD, e `range=10y`
  trouxe 2.512 pregões de AAPL com `adjustedClose`. Os números batem com o Yahoo (AAPL 336,4; O 54,5), então provavelmente é repasse.
  A cobertura EUA **não aparece na documentação** da BRAPI. `marketCap`/`P/L` vieram nulos.

| Opção | Preço (2026, público) | Limite | Exibir a usuários do app? |
| --- | --- | --- | --- |
| Yahoo (não oficial) | grátis | sem SLA; anti-bot por UA | **Não**: termos só permitem uso pessoal e não comercial |
| BRAPI (já contratada) | já pago | — | **Desconhecido** p/ EUA: perguntar à BRAPI por escrito |
| EODHD pessoal | Historian US$ 19,99; Equity Analyst (EOD+fundamentos) US$ 59,99; All-in-one US$ 99,99/mês | 100 mil chamadas/dia | **Não**: termos proíbem "displaying… to third parties" |
| EODHD comercial | Internal US$ 399 (sem exibição); Enterprise US$ 2.499/mês; Custom a partir de US$ 399 | — | Só no Custom/Enterprise, com contrato |
| FMP | Starter US$ 19 anual / 29 mensal; Premium 49/69; Ultimate 99/139 | 300–3.000 req/min | **Não**: exige o "Data Display and Licensing Agreement" (Enterprise, sob cotação) |
| Tiingo | Power US$ 30; Business interno US$ 50/mês | 100 mil req/dia | **Não** ("Internal Use Only"). Redistribuição sob cotação |
| Massive (ex-Polygon) | Starter 29 · Developer 79 · Advanced 199 (individual) | ilimitado | **Não** (individual). Business US$ 2.499/mês |
| Alpha Vantage | US$ 49,99–249,99/mês | 75–1.200 req/min | exibição exige *entitlement* separado |
| Twelve Data Business | Venture ~US$ 499 mensal (414 anual) | 610 créditos/min | **Sim** ("External display") |

O fechamento diário (EOD) em geral não paga taxa de bolsa. O que restringe é a **licença do fornecedor**. Com
~1.000 DAU e plano de lançar só para Premium, o custo realista de exibir preço EUA licenciado fica entre
**US$ 400 e 2.500/mês**, ou abaixo disso numa negociação "Custom" com EODHD/FMP para ~600 tickers EOD.

## 3. Escopo do MVP EUA

- **S&P 500**: 503 tickers / 500 CIKs (Wikipedia, 30/09/2026). Setor Real Estate = 30, dos quais 28 são REITs
  (CBRE e CSGP são serviços).
- **REITs listados com CIK na SEC (SIC 6798 ∩ company_tickers)**: 199, incluindo hipotecários (AGNC, NLY…) e micro caps.
  O SIC não é confiável: INVH não está em 6798.
- **MSCI US REIT Index**: 106 constituintes (factsheet 30/04/2026, ~99% do universo REIT de patrimônio).
- **Proposta**: S&P 500 + MSCI US REIT = **~580 tickers** (503 + ~78 REITs fora do S&P). Custo marginal de fundamentos:
  zero (SEC). O de preço: igual para 600 ou 1.000 tickers em todos os planos.

## Regras de sanidade propostas (Fase 0)

1. Cadeia de conceitos por campo, **com registro do conceito usado por ano** (`source_concept`), e alerta quando o conceito muda.
2. Para cada período, **usar o valor do 10-K arquivado por último**. Isso resolve reapresentações e desdobramentos.
3. `|lucro comum ÷ média diluída − LPA| ≤ 3%`. Passou em 87/88 anos-empresa (PLD 2016 deu 3,0%).
4. `|dividendos pagos ÷ média de ações − DPA| ≤ 10%`. Se falhar, preferir `CashPaid` e marcar `Declared` como suspeito.
5. DPA ausente → derivar de dividendos pagos ÷ média de ações, com selo "calculado".
6. PL ≤ 0 → ROE "—" (não negativo).
7. Receita com variação a/a > 50% → alerta (O 2022 +61% foi a fusão VEREIT, então é legítimo: alerta, não bloqueio).
8. FFO reportado × aproximado XBRL: divergência > 10% → fila de revisão. SPG/AMT vão cair sempre, então é preciso ter lista de exceções.
9. Candle de preço só é "fechamento" se o timestamp for ≥ 16h00 ET + 30 min. O job deve rodar ≥ 19h30 BRT
   (no horário de inverno dos EUA, 16h ET = 18h BRT).
10. Exercício: rotular pelo ano de término (jan/fev conta como ano anterior) e mostrar "FY termina em set" nos Fundamentos.

## Recomendações para a Fase 0 / Fase 4

- Modelo: `financial_statements` com `source` (`SEC`/`CVM`), `source_concept`, `accession`, `filed_at`, `fiscal_year_end`,
  `currency`. Campos de REIT (`ffo`, `affo`, `ffo_per_share`) com `source='10K_EXTRACTION'` e `reviewed_by`.
- Job SEC: backfill pelo `companyfacts.zip` (1,4 GB, uma vez). Depois, incremental pela lista de 10-K/10-Q do dia
  (índices diários da EDGAR), baixando só o companyfacts de quem arquivou. O horário da spec (07h00) serve.
- FFO/AFFO: extrair a tabela "FFO reconciliation" do 10-K/10-Q (HTML) com Claude + revisão no /admin. São ~110 REITs ×
  4 filings/ano ≈ 440 extrações/ano.
- Preço: decidir a licença antes de escrever o job. O código é o mesmo para BRAPI, Yahoo ou EODHD bulk
  (`/eod-bulk-last-day/US` = 1 chamada/dia).
- Dólar: `USD-BRL` já existe via Yahoo, e a conversão para "Na carteira" reaproveita esse dado.
