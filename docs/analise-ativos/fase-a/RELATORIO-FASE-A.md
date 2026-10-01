# Análise de Ativos — Relatório da Fase A (spike de dados)

**Data:** 30/09/2026 · **Para:** Wellington (e insumo do workflow da Fase 0)
**Base:** 5 relatórios de papel (Ações/CVM, FIIs/CVM, BRAPI+preços, EUA/SEC, regras da spec v1.3) e 4 pareceres
do QA de dados. O papel de regras não passou por QA. Os detalhes de cada papel estão em
`docs/analise-ativos/fase-a/{acoes-cvm,fiis-cvm,brapi-precos,eua,regras-spec}.md`. Todos os números saíram de dados
reais (zips da CVM, lista B3, COTAHIST, SEC, banco **DEV**). **Produção não foi medida.**

---

## 1. Veredito em 5 linhas

1. **Dá para fazer Ações + FIIs só com fonte gratuita.** A CVM (DFP/ITR/FRE/FCA/IPE e os Informes de FII), o COTAHIST da B3 e a lista pública da B3 cobrem o Índice MF e o semáforo de **ações** (306 companhias listadas; 299 com 5 anos ou mais; 211 com 10 anos) e a parte "cadastral" dos **FIIs** (464 dos 527 listados).
2. **A BRAPI paga não acrescenta fundamentos.** Ela copia a CVM ao centavo, e os múltiplos históricos dela estão errados. Ela fica com a cotação do dia e os proventos, que já pagamos. **Bolsai/Fintz não são necessários.**
3. **Os FIIs têm um buraco que não é de fonte.** Vacância, nº de imóveis e alavancagem saem da CVM, mas **não batem com o relatório do gestor** (XPLG11: 18,3% contra 8,1%). Para FII de papel, LTV e inadimplência só existem em PDF. O FII de papel e parte do tijolo dependem da Fase 5 (extração de PDF) ou de trocar critérios.
4. **Os proventos são o elo fraco das ações.** O banco (`asset_dividend_history`) perdeu R$ 1,40/ação de PETR4 em 2024 e grava a data EX no campo `dataCom`. É preciso auditar em PROD antes de usá-lo em payout ou DY.
5. **Custo: o MVP B3 fica em R$ 0 de dados novos (só engenharia). Os EUA custam caro:** os fundamentos da SEC são grátis, mas **exibir preço dos EUA custa de ~US$ 400 a 2.500/mês de licença** (a spec estimava US$ 22–60), e o FFO/AFFO dos REITs exige extração do 10-K. A recomendação continua: EUA numa fase própria.

---

## 2. Cobertura por classe, campo a campo

Legenda: **CVM/SEC/B3** = fonte gratuita estruturada · **Pago** = provedor pago (já contratado ou a contratar) ·
**PDF** = só relatório/filing em texto, com extração e revisão (Fase 5) · ✅ medido e conferido pelo QA ·
⚠️ existe, mas com ressalva medida · ❌ sem fonte estruturada.

### 2.1 Ações B3

| Campo (onde a spec usa) | Fonte | Cobertura medida | Situação |
| --- | --- | --- | --- |
| Lucro líquido atribuível, anos consecutivos (C_lucro 35%, semáforo "Lucros consecutivos", Lucro 10 anos) | CVM DFP | 211/306 com 10 exercícios completos; 299/306 com 5+ | ✅ WEGE3 e PETR4 2024 batem com o release. Em 24% das companhias a linha "controladora" vem zerada, e há regra para isso |
| Receita (Fundamentos, P/Receita) | CVM DFP/ITR | igual ao lucro | ✅ WEGE3 2024 = 37.986,9 mi bate. Holdings e seguradoras ficam n/a |
| Nº de ações ex-tesouraria (LPA, VPA, valor de mercado) | CVM FRE 3.1 (até FY2021) + composição do DFP (FY2020+) | consistência com o LPA publicado: 93,6% dos company-years | ✅ VALE3 2024, EGIE3 2025 e ITUB4 2025 batem com a fonte externa. ⚠️ Mede a coerência interna da CVM. WEGE3 2016: ver §3 |
| TTM (múltiplo atual) | CVM ITR | 296 companhias no 2T26 | ✅ WEGE3 TTM bate (±0,3%). ⚠️ Bug no ITR com "controladora = 0" (BBAS3) |
| PL, VPA, ROE (C_rent 20%, semáforo "Rentabilidade") | CVM DFP | igual ao lucro | ⚠️ **Bancos:** o consolidado é IFRS (BBAS3 LPA 4,62). O mercado usa BR GAAP (6,15–6,18), ~33% de diferença |
| Dív. líquida / EBITDA (C_dívida 20%, semáforo "Endividamento") | CVM DFP (BP + DFC para D&A) | não medido isoladamente | ⚠️ Não foi conferido pelo QA. ❌ Não existe para 30 bancos e seguradoras |
| DPA, DY 12m (C_div 15%, semáforo "Dividendos") | `asset_dividend_history` (BRAPI, pago) + cotação | 219/306 com algum provento 2021+ no dev | ⚠️ **Lacunas no banco** (PETR4 2024 −18%), `dataCom` é a data EX e há JCP fundido. Prod não medido |
| Payout (Fundamentos) | CVM DMPL "declarado no ano" (checagem pelo banco) | 1.249 company-years testados | ⚠️ O conceito "relativo ao exercício" só existe estruturado até FY2021 |
| P/L atual × média 10a (C_preço 10%, semáforo "Preço vs. histórico", barra do Valuation) | Preço **cru** do último pregão do ano (COTAHIST, grátis) × ações CVM ÷ lucro | COTAHIST cobre o mercado inteiro | ✅ WEGE3 2024 P/L 36,7 recomposto. **Proibido** usar os múltiplos históricos da BRAPI (WEGE3 2019: 19,9 contra 45,1 correto) |
| Cotação do dia | BRAPI (pago, já temos) | — | ⚠️ Bug: o cron grava D-1 com data D (13,6% das linhas de ações caem em fim de semana no dev) |
| Setor/subsetor/segmento, pares | B3 ClassifSetorial (xlsx público) | 79 segmentos; só 17 com ≥5 empresas | ⚠️ Endpoint não documentado. Pares precisam completar com o subsetor |
| Liquidez média 30d (Detalhado, cards) | COTAHIST VOLTOT (grátis) | todo o mercado | ✅ HGLG11 18,9 mi/dia bate com o Yahoo. Hoje não há coluna de volume no banco |
| Próximos eventos: AGO/AGE | CVM IPE | 478 cias com assembleia futura em 2026 | ✅ estruturado |
| Próximos eventos: data de resultado | estimativa pelo ano anterior | ITR: 86% com erro de até 7 dias; DFP: 72% | ❌ A data oficial só vem em PDF ou texto livre. Mostrar como "estimada" |
| ROIC | derivado (NOPAT/capital investido) | — | ⚠️ aproximação, sem conta direta |
| Índice de mercado (ex. "Ibovespa") | carteira teórica B3 | não medido | ❌ ainda não levantado |
| Receita por segmento (Fase 2) | notas explicativas | — | ❌ PDF |
| Marcação de dividendo extraordinário | — | — | ❌ nenhuma fonte marca |

### 2.2 FIIs

| Campo (onde a spec usa) | Fonte | Cobertura medida | Situação |
| --- | --- | --- | --- |
| VP/cota, PL, nº de cotas, cotistas (P/VP, C_preço, Quadro, Fundamentos) | CVM Informe Mensal | 462/461/463 dos 464 | ✅ HGLG11, KNCR11, MXRF11 e BTLG11 batem em ±1%. ⚠️ Os agregadores leem a mesma CVM (confirma o parser, não a origem do dado) |
| Tipo tijolo/papel/FoF/híbrido (escolhe a régua) | composição do ativo no Informe Mensal | tijolo 268 · papel 85 · FoF 59 · híbrido 7 · outro 43 (universo 464, ago/26) | ⚠️ Diverge do rótulo de mercado em ~30%. O Mandato vem vazio desde a CVM 175. A regra de híbrido da spec nunca gera tijolo |
| Rendimento/cota, DY 12m, meses seguidos com rendimento (C_lucro 35%, C_div 15%, semáforo "Renda recorrente") | `asset_dividend_history` (BRAPI) | 253 FIIs no dev (de 464), parado em jun/2026 | ✅ KNRI11 dez/25 = 1,25 bate. ⚠️ O "DY do mês" da CVM é sobre o VP e não serve (só 65% batem em ±5%; 40 FIIs informam 0) |
| Histórico de 120 meses (teto do C_lucro) | `asset_dividend_history` | no dev, KNRI11, BTLG11, KNCR11 e outros têm ~120 eventos desde 2016 | ⚠️ **Divergência:** o papel de FIIs disse "inalcançável" (vale só para a série CVM, máximo 116). O QA mostrou que a base de proventos alcança. Há indício de truncamento em ~120 registros no provedor |
| Alavancagem = obrigações/PL (C_dívida do tijolo 20%) | CVM Informe Mensal | 463 | ⚠️ TRXF11: 70,3% contra ~64% (passivo/PL do gestor). Inclui passivo operacional; **não é LTV** |
| Vacância física (C_rent do tijolo 20%, semáforo "Vacância") | CVM Informe Trimestral | 196/268 tijolos | ⚠️ **Não reproduz o gestor:** XPLG11 18,3% contra 8,1%; HGLG11 2,4% contra 3,1%. "Área" é a do condomínio, não a fração do fundo |
| Nº de imóveis (semáforo "Diversificação") | CVM Trimestral | 200/268 | ⚠️ HGLG11: 37 contra 42 do gestor (imóveis via SPE ficam de fora) |
| Inadimplência do tijolo | CVM Trimestral | 153/268 | não conferido pelo QA |
| Prazo e indexador dos contratos | CVM Trimestral | 142/136 de 268 | aproximado, por faixas |
| Nº de CRIs distintos (semáforo "Diversificação" do papel) | CVM Trimestral (código CETIP) | 86/92 papéis | ✅ KNIP11 = 119, exato com a Carta do Gestor |
| LTV dos CRIs (C_dívida do papel 20%, semáforo "LTV") | — | — | ❌ PDF |
| Inadimplência dos CRIs (C_rent do papel 20%, semáforo) | CVM Trimestral | **5/92** | ❌ na prática PDF |
| Vacância financeira, padrão construtivo AAA/AA (semáforo do tijolo), inquilinos, atípicos, ABL formal | — | — | ❌ PDF |
| Indexador, taxa, duration e high yield dos CRIs | — | — | ❌ PDF |
| Liquidez / "top 100 por liquidez" | COTAHIST VOLTOT | 354 FIIs negociados em ago/26; o 100º negocia R$ 495 mil/dia | ✅ ⚠️ O BDI 12 mistura FIAGRO e FI-Infra |
| Ticker ↔ CNPJ | lista B3 + casamento por nome + tabela manual | 467 casados (369 por ISIN, 98 por nome), 56 sem match | ⚠️ O prefixo do ISIN acerta só 70%. Os 98 casados por nome não foram auditados |

**Resultado prático para o Índice MF:** num FII de **papel**, 40% do índice (LTV + inadimplência) e 3 dos 5 critérios do
semáforo não têm fonte estruturada. No **tijolo**, o padrão construtivo é só PDF, e vacância, nº de imóveis e
alavancagem existem, mas são proxies que não batem com o gestor.

### 2.3 Stocks (EUA)

| Campo | Fonte | Cobertura medida | Situação |
| --- | --- | --- | --- |
| Receita, lucro, LPA, PL, FCO, D&A (C_lucro, C_rent, Fundamentos) | SEC companyfacts (grátis) | 8 tickers: 11/11 anos. S&P 500 CY2024: 483–499 de 500 | ✅ AAPL, MSFT e JNJ batem com os releases. ⚠️ A cobertura do S&P é um **teto** (conta a presença de qualquer tag da cadeia) |
| DPA (C_div, semáforo) | SEC (priorizar CashPaid) | 6/8 completos; S&P 354/500 | ✅ KO e PLD batem. PLD "Declared" vem errado no próprio filing |
| Dívida (D/E ou Dív.líq/EBITDA) | SEC | 444/500 (teto) | ⚠️ Subestima papel de curto prazo. EBITDA calculado (não é tag GAAP) |
| Ações em circulação | SEC companyfacts | 7/8 | ⚠️ Empresas com várias classes (SPG, GOOGL, BRK) exigem o XBRL completo |
| Preço (P/L, DY, múltiplos) | **Pago com licença de exibição** | Yahoo: 503/503 tecnicamente | ❌ Yahoo e BRAPI-EUA sem licença para exibir. Ver §8 |
| Setor | lista S&P (GICS) | 503 | ok |

### 2.4 REITs

| Campo | Fonte | Situação |
| --- | --- | --- |
| Lucro, receita, D&A | SEC | ✅ (193/199 REITs SIC 6798 com lucro/FCO) |
| **FFO, FFO/ação, AFFO** (C_lucro, C_preço, semáforo "FFO por ação" e "FFO payout") | **10-K/10-Q em HTML (extração)** | ❌ Zero no XBRL padrão. A aproximação erra até ±25–30% (SPG), e parte do erro é de base (OP units), segundo o QA. O valor reportado bate nos 4 REITs conferidos (O, PLD, SPG, AMT) |
| Ocupação (C_rent, semáforo) | 10-K (extração) | ❌ |
| Dív/EBITDA(re) (C_dívida, semáforo) | 10-K (extração) | ❌ não é confiável pelo XBRL |
| DY | SEC DPA + preço pago | ⚠️ depende da licença de preço |

---

## 3. Números conferidos pelo QA

**Placar geral: 35 de 40 valores batem com fonte independente.**

| Papel | Batem | Não batem | O que não bateu e por quê |
| --- | --- | --- | --- |
| Ações (CVM) | 8/10 | 2 | **PETR4 2024 DPA:** o spike deu 6,5027 (incluindo RENDIMENTO/Selic, contra a regra do próprio script, que dá 6,3762). O real é ≈7,78, porque o banco dev colapsou duas tranches de valor igual (−R$ 1,40/ação, −18%). Payout real ≈274% (= DMPL), não 225%. **BBAS3 LPA 2024:** 4,62 (IFRS consolidado) contra 6,15–6,18 (BR GAAP, que é o que o mercado usa) |
| FIIs (CVM) | 7/10 | 3 | **XPLG11 vacância** 18,3% contra 8,1% do gestor · **HGLG11** 37 imóveis/2,4% contra 42/3,1% · **TRXF11 alavancagem** 70,3% contra ~64%. Os 3 são justamente critérios do Índice MF |
| BRAPI + preços | 10/10 | 0 | Todos batem. P/L WEGE3 2024 só recomposto (não há fonte publicada). VP MXRF11: a competência precisa ser confirmada (o Fundamentus está em jul/26) |
| EUA (SEC) | 10/10 | 0 | Todos batem. Ressalvas de rótulo: PLD e SPG informam FFO de base diferente (OP units), e a JNJ tem o LPA GAAP (5,79) e o ajustado (9,98) |
| Regras da spec | — | — | sem QA |

**O que isso diz da confiabilidade:**

- **Alta:** tudo que a empresa ou o fundo **declara num campo estruturado com o mesmo conceito do mercado**, como lucro, receita, PL, nº de ações, VP/cota, cotistas, CRIs distintos e os campos GAAP da SEC. O parser está certo.
- **Média, dependendo da regra:** nº de ações em anos de split/bonificação. O QA achou uma divergência a investigar: para **WEGE3 2016**, a comparação BRAPI×CVM usou 2.098 mi (pós-bonificação de 2018), e o correto à época é **1.614,4 mi**, que é o número da BRAPI. O caso deve virar teste da Fase 0. A checagem "93,6% de consistência" é interna à CVM, não é acurácia externa.
- **Baixa:** tudo que **nós derivamos** de campos que não têm o conceito do mercado, como vacância e nº de imóveis pela CVM, alavancagem de FII, FFO aproximado e DPA pelo banco de proventos. Isso não entra em critério sem validação ou rótulo.
- **Bancos:** qualquer número de banco vai divergir do release (IFRS × BR GAAP × recorrente: Itaú 44,9 / 45,7 / 46,8 bi). A tela precisa **dizer o padrão contábil** e a Fase 0 precisa escolher a regra (ver §6).
- **Atenção à independência:** Fundamentus, Funds Explorer, Status Invest e Dados de Mercado leem a mesma CVM. Onde só eles confirmam, fica validado o parser, não o dado.

**Correções de conclusão feitas pelo QA (valem sobre os relatórios dos papéis):**

1. "Payout: banco por data-com como fonte primária" → **inverter**: a DMPL "declarado no ano" foi mais fiel.
2. "PETR4 2024 = 225% é real" → o real é ≈274%.
3. "120 meses de FII inalcançável" → é alcançável pela base de proventos (falso só para a série CVM).
4. "TTM YTD × 4 trimestres = 92,7% em ±0,5%" é quase uma identidade contábil. Serve como detector de reapresentação, **não** como prova de acurácia.
5. "SPG não publica ações" → é limitação do companyfacts, que descarta fatos com dimensão de classe.
6. A faixa de erro do FFO aproximado está inflada por bases diferentes. A conclusão "não exibir" continua valendo.

---

## 4. Regras de sanidade obrigatórias para a Fase 0

Cada regra vira **teste unitário** com o caso real entre parênteses. "Selo" = aviso visível na tela ("dados incompletos",
"calculado", "fonte CVM, não comparável").

### 4.1 Gerais (todas as classes)

1. **Ausente ≠ zero ≠ "não se aplica".** Os três estados são explícitos em todo cálculo. Nunca comparar `null` direto em JS (`null <= 1` é `true`: um FII de papel sem dados "atendia" 5 de 5 no protótipo).
2. **Point-in-time com proveniência:** toda linha guarda `source`, `sourceUrl`/doc id, `versao`, `dataEntregaOriginal` e `fetchedAt`. Fica sempre a maior versão por (CNPJ, período). O selo de frescor sai daí.
3. **Validar o cabeçalho** de todo CSV/zip (a CVM já mudou o layout em 2021 e em ago/2025). Se mudar, o job falha alto em vez de gravar vazio.
4. **Base ≤ 0 → "—"** em todo método de Valuation e múltiplo (LPA, VPA, DPA, rendimento, FFO). Nunca exceção, nunca preço negativo.
5. **Múltiplos só com preço cru** (nunca adjustedClose da BRAPI/Yahoo nem os múltiplos históricos da BRAPI). O preço de fim de ano precisa ser de um pregão real até 5 dias antes de 31/12.
6. **Eventos corporativos:** deduplicar (mesmo fator em ≤30 dias = 1 evento; só DESDOBRAMENTO, GRUPAMENTO e BONIFICAÇÃO). **Só ajustam série se confirmados pela razão de ações da CVM (±6%)**. Os demais ficam como "descartado" ou "não validável" (EGIE3 ×1,1, BBDC 2024 ×1,2 e CPLE3 ×10 são fantasmas).
7. **Barra de posição com média negativa:** (v − média)/|média|, nunca v/média − 1 (inverte o sinal). Com menos de 5 pontos, a barra fica oculta. Anos com P/L ≤ 0 saem de mín/média/máx.
8. **Meta de renda:** ⌈⌉ sobre o valor arredondado a 1e-9 ou em centavos (106 de 8.754 combinações davam 1 cota a mais).
9. **Textos:** varredura de palavras proibidas em CI sobre o arquivo central de textos, com lista de exceções só para o aviso fixo e o rodapé legal.

### 4.2 Ações

10. **Nº de ações:** testar DFP em unidades e ×1000 (598 company-years vêm em milhares sem aviso). Aceitar o candidato em que Σ(LPA_classe × ações)/lucro ∈ [0,8; 1,25], e alertar acima de ±5%. Usar o FRE 3.1 item f (até FY2021), **nunca `capital_social`** (é reexpresso depois de splits). Caso-teste obrigatório: WEGE3 2016 = 1.614,4 mi.
11. **LPA com escala errada:** razão ~1000 ou ~0,001 indica LPA publicado em escala errada (43 casos, ex. ITUB4 2019 = 2780). Nunca usar o `basicEarningsPerCommonShare` da BRAPI, e rejeitar |LPA| > 1000. Não usar o LPA "GERAL" (BB 2024 = 9,24).
12. **"Atribuído à controladora" = 0 com lucro ≠ 0 conta como ausente, no DFP e no ITR** (o ITR hoje não aplica isso: BBAS3 3T25 gera um TTM errado de 18.493 contra 12.272). A linha precisa ser filha da linha de lucro usada, e o lucro e o código precisam vir da mesma linha.
13. **Salto de ações > 2,5× ou < 0,4× sem evento validado:** selo "dados incompletos".
14. **TTM** por YTD e pela soma de 4 trimestres. Se divergirem mais de 2%, usar o YTD e sinalizar reapresentação.
15. **Financeiras:** EBITDA, margem bruta, Dív.líq/EBITDA e liquidez corrente ficam "não se aplica" (não zero). Receita ≤ 0 ou ≤ lucro faz margens e P/Receita virarem n/a (BBSE3, ITSA4).
16. **Proventos:** somar só DIVIDENDO e JCP por **evento**, ajustado pelos eventos com data > data-com. Excluir RENDIMENTO, REST CAP e AMORTIZAÇÃO. **Não** usar a data de pagamento como fallback sem sinalizar. Payout por ação × DMPL declarado com diferença > 15 p.p. entra na fila de auditoria de proventos.
17. **Payout > 150% ou < 0:** mostrar com o selo "inclui extraordinários/lucro negativo", sem cortar.
18. **Classe do título pelo sufixo do ticker** (3 = ON, 4–8 = PN, 11 = unit). O FCA erra (MGLU3 vem como PN). Units usam o fator de equivalência.
19. **Ano fiscal fora de dezembro** (10 cias no DFP 2026): TTM e "ano" com tratamento próprio.

### 4.3 FIIs

20. **Chave = CNPJ.** O ticker vem da lista B3 (com vigência). O prefixo do ISIN sozinho nunca decide (25 colisões; BTCI11 tem ISIN FEXC). Os casamentos por nome passam por conferência (PL/cotistas × cotação) antes de publicar.
21. **Nunca exibir o `Percentual_Dividend_Yield_Mes` da CVM como DY** (é sobre o VP e vem em fração). O rendimento vem da base de proventos. DY do mês < 0 ou > 5% é descartado.
22. **VP/cota ≠ PL/cotas em mais de 1%:** recomputar. PL ≤ 0: fora do Índice. Cotas ×5 no mês = desdobramento, e as séries por cota são ajustadas (HGLG11 fechou a R$ 1.100 em 2016).
23. **Tipo pela composição com histerese de 3 meses e override manual.** Separar **CRI** de **LCI/LCA** (LCI é caixa: KNCR11 tem 12,5%). Corrigir a regra de híbrido (comparar imóveis+SPE contra recebíveis, e não "imóveis ≥ 50%", que nunca é verdade num híbrido).
24. **Vacância, nº de imóveis e alavancagem da CVM** saem com o rótulo "fonte CVM · pode diferir do relatório do gestor" e **só entram em critério depois de uma validação amostral** contra gerenciais (ver pergunta ao Pedro na §7). Alavancagem > 100% do PL vai para revisão. Área > 500 mil m² não é ABL.
25. **CRIs contados por código CETIP distinto**, nunca por linhas.
26. **Janela de 12 meses de calendário**, nunca "os últimos 12 registros".
27. **Universo = lista B3**, não `Mercado_Negociacao_Bolsa = S` (298 fundos "S" não estão na lista B3).

### 4.4 Preços e liquidez (B3)

28. **COTAHIST: dividir PREULT por FATCOT.** Distinguir FII, FIAGRO e FI-Infra dentro do BDI 12. Tratar o fracionário (TPMERC 020) à parte.
29. **Liquidez 30d = média de VOLTOT nos últimos 21 pregões rolantes**, com dia sem negócio contando 0. Menos de 15 pregões com negócio gera o selo "baixa liquidez".
30. **Salto diário > 40% sem evento** indica escala misturada (cru × ajustado).

### 4.5 EUA (para quando chegar a Fase 4)

31. Cadeia de conceitos por campo, gravando o conceito usado por ano, com alerta quando ele troca (a receita trocou em 7 de 8 empresas).
32. Gravar o `accession` por ano e distinguir reapresentação por split (razão exata) de reclassificação por operação descontinuada (JNJ/Kenvue, AMT/Índia).
33. Ações × média ponderada entre 0,8 e 1,2 (pega empresas com várias classes). DPA: priorizar CashPaid.
34. Ano fiscal pelo campo `fy` da SEC (WMT e NVDA terminam em jan).
35. FFO sempre **o reportado**, gravando a base (common × OP units) e a variante (Nareit × Core).

---

## 5. Proposta de modelo de dados e jobs para a Fase 0

### 5.1 Princípios

- Padrão do repo: `model PascalCase` com `@@map("snake_case")`, `id String @id @default(uuid())`, `Decimal` para dinheiro.
- **Sem colisão de nomes:** `assets` e `watchlists` já existem com outro sentido, `Asset.type='stock'` já significa ação B3 e `/api/analises` já é analytics da carteira. Por isso: tabelas com prefixo `Asset*`/`Fii*`/`Analise*`, rotas `/api/analise-ativos/*` e página `/analise-ativos`.
- **Reaproveitar:** `Asset`, `AssetDividendHistory`, `AssetCorporateAction` (como insumo), `MarketDataCoverage`, `Portfolio`, `AlocacaoConfig`, `services/calendario/fontes/*`, o parser `services/pricing/cotahistB3Parser.ts` (estender com VOLTOT/FATCOT) e o padrão de cron `requireCronSecret` + `withErrorHandler`.
- **Não reaproveitar para múltiplos:** `AssetPriceHistory` (escala mista BRAPI ajustado × COTAHIST cru desde o `backfill-cotahist-b3.ts`, e o bug de data D-1) e `AssetFundamentals` (só o "agora").
- Regras de cálculo em funções puras, sem I/O, em `src/services/analiseAtivos/` (`regras/` e `fundamentos/`), testadas com os casos reais da §4.

### 5.2 Alterações em tabelas existentes

| Tabela | Mudança |
| --- | --- |
| `Asset` | + `analiseClasse` (`acao`/`fii`/`stock`/`reit`/null, **preenchido por job**, nunca derivado de `type`), `fiiTipo` (`tijolo`/`papel`/`fof`/`hibrido`/`indefinido`), `fiiTipoOverride`, `setorB3`, `subsetorB3`, `segmentoB3`, `listadoB3` (bool, negociado nos últimos 30 pregões), `classeTitulo` (ON/PN/UNIT), `fatorUnit`, `emissorCnpj`. Preencher `cnpj` dos FIIs. **Corrigir os 16 ativos `type='fii'` que são ações** (PLPL3, LAVV3…). |

### 5.3 Tabelas novas

**Emissor e ações (B3):**

| Model (`@@map`) | Chave | Campos principais |
| --- | --- | --- |
| `CvmCompany` (`cvm_companies`) | `cnpj` | cdCvm, nome, tickers[], classes, composição da unit, setor/subsetor/segmento B3, listado, mesFimExercicio, ehFinanceira |
| `AssetFundamentalsPeriod` (`asset_fundamentals_period`) | `cnpj + dtFim + tipo(FY/YTD/3M) + escopo(con/ind) + versao` | docId, dtEntregaOriginal, padraoContabil (IFRS/BRGAAP), receita, lucro, lucroCtrl, pl, plCtrl, ebit, da, divBruta, caixa, fco, fci, fcf, capex, dmplDeclarado, dfcPago, lpaOn, lpaPn, source, fetchedAt |
| `AssetStatementLine` (`asset_statement_lines`) | `cnpj + dtFim + tipo + escopo + cdConta + versao` | dsConta, valor, escala (para o Raio-X e o CSV; é a `financial_statements` da spec) |
| `AssetShareCount` (`asset_share_counts`) | `cnpj + data` | on, pn, tesouraria, fonte (dfp/fre/itr/implícito), razaoLpa, status |
| `AssetCorporateActionCheck` (`asset_corporate_action_checks`) | `symbol + data + fator` | anoBase, status (confirmado/descartado/não validável), razaoCvm, idsOrigem[] (aponta para `AssetCorporateAction`, sem alterar o fluxo da carteira) |
| `AssetPerShareYearly` (`asset_per_share_yearly`) | `symbol + anoFiscal` | lpa, vpa, dpaDataCom, ajustados a hoje, payout, payoutDmpl, flags[] |

**FIIs:**

| Model | Chave | Campos principais |
| --- | --- | --- |
| `FiiTickerMap` (`fii_ticker_map`) | `ticker + validFrom` | cnpj, validTo, origem (b3_isin/b3_nome/manual), conferido |
| `FiiMonthly` (`fii_monthly`) | `cnpj + refMonth` (maior versão) | versao, vpCota, pl, cotas, cotistas, dyMesCvm (só checagem), taxaAdm, ativo, passivo, rendDistribuir, imoveis, spe, cri, lciLca, cotasFii, rendaFixa, sourceUrl, fetchedAt |
| `FiiQuarterly` (`fii_quarterly`) | `cnpj + refQuarter` | nImoveis, areaM2, vacanciaFisicaCvm, inadimplenciaCvm, prazoAprox, vencAte12m, idxIpca, idxIgpm, nCri, maiorCriPct, receitaAluguel, resultado |
| `FiiPropertyQuality` | — | **só na Fase 5** (PDF), com reviewStatus |

**Preço, múltiplos e score:**

| Model | Chave | Campos principais |
| --- | --- | --- |
| `AssetQuoteDaily` (`asset_quotes_daily`) | `symbol + date` | closeRaw, fatCot, volumeFin (VOLTOT), quantidade, negocios, codBdi, source=`cotahist` |
| `AssetMultiplesYearly` (`asset_multiples_yearly`) | `symbol + anoFiscal` | closeYearEnd (cru), marketCap, pl, pvp, ps, evEbitda, pFco, pFcl, dy, payout, roe, roa, roic, divLiqEbitda, divPl; FII: pvp, vpCota, rendCota, dy, alavancagem |
| `AssetMultiplesCurrent` (`asset_multiples_current`) | `symbol` | múltiplos TTM do dia, liquidez30d, pregoesNegociados30d, asOf |
| `ScoringParams` (`scoring_params`) | `version` | JSON validado por Zod (limiares da §4, pesos redistribuídos para "não se aplica", m/C do ranking), validFrom, createdBy |
| `AssetScore` (`asset_scores`) | `symbol + computedAt` | indiceMf, cLucro, cDivida, cRent, cDiv, cPreco, checks (JSON), incompleto, paramsVersion |
| `AnaliseJobRun` (`analise_job_runs`) | `id` | job, inicio, fim, linhasGravadas, rejeitadas, alertas (JSON), status (para o painel de frescor e o alerta de 2 falhas seguidas) |
| `AssetEvento` (`asset_eventos`) | `id` | symbol/cnpj, data, tipo (resultado_estimado/resultado/assembleia/data_com/pagamento), estimado (bool), sourceUrl. Nova fonte em `services/calendario/fontes/` |

Stocks/REITs (Fase 4) usam as mesmas `AssetFundamentalsPeriod`/`AssetStatementLine` com `source='SEC'`, `sourceConcept`
e `accession`. Por isso esses campos já nascem na Fase 0, mesmo sem o job EUA.

### 5.4 Jobs (padrão `/api/cron/*` + `/etc/cron.d/myfinance` no Lightsail)

O `myfinance-cron.sh` chama via HTTP com `curl -m 300`, então **cada rota tem que terminar em menos de 5 min**. O
**backfill não é cron:** é script `scripts/analise-ativos/backfill-*.ts` rodado uma vez no servidor, com `--apply`
explícito e dry-run por padrão (padrão do `backfill-cotahist-b3.ts`).

| Rota | Quando (UTC) | O que faz |
| --- | --- | --- |
| `/api/cron/analise-ativos/b3-cadastro` | dom 05:30 | ClassifSetorial B3, lista de FIIs B3 e FCA. Atualiza `CvmCompany`, `FiiTickerMap` e colunas do `Asset`. Alerta de sigla nova ou sumida |
| `/api/cron/analise-ativos/cotahist` | seg–sex 22:30 (19h30 BRT) | Arquivo diário do COTAHIST → `AssetQuoteDaily` e `AssetMultiplesCurrent` (liquidez e múltiplos TTM) |
| `/api/cron/analise-ativos/cvm-cias` | diário 09:00 | Zips do ano corrente de DFP/ITR/FRE/IPE. Reprocessa só (cnpj, período, versão) novos → fundamentos, ações, eventos validados, per-share e `AssetEvento` |
| `/api/cron/analise-ativos/fii-mensal` | diário 09:15, dias 10–31 | `inf_mensal_fii` do ano corrente, reprocessando os últimos 3 meses |
| `/api/cron/analise-ativos/fii-trimestral` | semanal (qua 09:30) | Nos 60 dias após o fim do trimestre |
| `/api/cron/analise-ativos/scores` | diário 23:30 | Recalcula `AssetScore` (a parcela de preço muda todo dia) |

**Ordem de backfill (dev, depois prod com OK):**
1. Universo: FCA + ClassifSetorial + lista B3 de FIIs + mapa ticker↔CNPJ (com a revisão manual de ~60 FIIs).
2. COTAHIST anual 2015–2025 (preço cru + volume).
3. DFP 2014+ e FRE 2014–2022 → `AssetFundamentalsPeriod`/`AssetStatementLine`.
4. Resolver o nº de ações (`AssetShareCount`).
5. Validar eventos corporativos (precisa do passo 4 e do ITR corrente).
6. **Auditoria de proventos** (datas ex × com, tranches iguais, cobertura) antes do passo 7.
7. Per-share (LPA/VPA/DPA/payout) e múltiplos anuais.
8. ITR → TTM → múltiplos atuais.
9. FII: mensal 2017+ → tipo → trimestral → derivados.
10. IPE → `AssetEvento`.
11. `ScoringParams` v1 (depois das respostas do Pedro) → `AssetScore`.

O processamento FII completo leva ~6 s. Ações não foram cronometradas no spike.

### 5.5 Medições pendentes em PROD (só leitura, precisam do OK do Wellington)

1. Cobertura e qualidade de `asset_dividend_history` para ações 2016+ e FIIs: tranches iguais, `dataCom` × data ex, registros truncados em ~120.
2. Série de `AssetPriceHistory` em prod: fontes por ano, escala e linhas em fim de semana.

### 5.6 Tickets separados (fora da Análise de Ativos)

- `brapiSync.syncAssetPrices` grava D-1 com data D (13,6% das linhas de ações em fim de semana no dev). Investigar o que a BRAPI devolve às 07:45 UTC.
- Proventos: tranches de valor igual colapsadas e `dataCom` = data EX (afeta também a Carteira/Proventos atuais).

---

## 6. Ajustes necessários na spec

| # | Ponto da spec | Problema medido | Proposta |
| --- | --- | --- | --- |
| 1 | §6 Fontes: "fundamentos via bolsai/Fintz no MVP" | A CVM direta resolve, e a BRAPI (que já pagamos) copia a CVM | CVM direto desde a Fase 0; BRAPI só para cotação do dia e proventos; COTAHIST para preço cru e liquidez |
| 2 | §4.1 Índice MF × telas do protótipo | O score do protótipo está digitado à mão. Pela fórmula, 69/166 (42%) ficam fora da faixa possível (WEGE3 8,02 contra 9,1 na tela) | Vale a fórmula. Pedro recalibra limiares/pesos em `ScoringParams`, se quiser, vendo a nota real calculada |
| 3 | §4.1 "dado ausente → componente = 0" | Penaliza financeiras (sem EBITDA) e FoF (sem régua) | Três estados. "Não se aplica" redistribui o peso; "ausente" = 0 + selo |
| 4 | §4.1/§4.2 Financeiras | Sem Dív.líq/EBITDA; o consolidado é IFRS, e o mercado usa BR GAAP | Endividamento "não se aplica" + regra de padrão contábil (ver pergunta) |
| 5 | §4.1 FII papel (LTV, inadimplência) e §4.2 (LTV, inadimplência) | Sem fonte estruturada (inadimplência em 5/92) | Critérios substitutos no MVP (concentração do maior CRI, nº de CRIs) ou selo "dados incompletos" |
| 6 | §4.2 FII tijolo "Padrão construtivo" | Só PDF | 5º critério = Alavancagem até a Fase 5 (como o próprio Pedro fez no detalhe do HGLG11) |
| 7 | §4.1/§4.2 Vacância, nº de imóveis e alavancagem de FII | Os dados da CVM não reproduzem o gestor (XPLG11 18,3% × 8,1%) | Rótulo de proxy + validação amostral antes de entrar em critério |
| 8 | §4.2 "FII híbrido: tijolo se imóveis ≥ 50%" | Nunca gera tijolo (por definição, o híbrido tem imóveis < 50%) | Comparar imóveis+SPE com recebíveis (só CRI, sem LCI) |
| 9 | Tipos de FII | Não prevê FoF (59 fundos, ~11–13%) | Régua própria ou fora do Índice no MVP |
| 10 | §4.1 C_lucro FII "120 meses" | A série CVM tem no máximo 116; a base de proventos alcança ~120 em vários FIIs | Manter os 120 meses pela base de proventos, depois da auditoria em prod |
| 11 | §4.2 "Preço vs. histórico" = P/L ≤ 15 (absoluto) × §4.1 = P/L contra a média de 10a | Dois conceitos com o mesmo nome | Renomear o critério do semáforo para "Preço (P/L)" ou alinhá-lo à média |
| 12 | §4.4 Variação mensal = atual − anterior | Sinal invertido em relação às setas | anterior − atual (subiu = ▲ positivo) |
| 13 | §4.4 Ranking m = 200, C = 4,1 fixo | Ranking vazio por meses; o C real é 2,9–3,4, e trocá-lo muda 40–60% das posições | C calculado por classe no job; m inicial = 20 |
| 14 | §4.5 Barra de posição | O sinal inverte com média negativa; o protótipo desenha a barra com 4 anos | Regra 7 da §4 |
| 15 | §4.5 Meta de renda | Erro de ponto flutuante no ⌈⌉; rendimento 0 gera Infinity | Regra 8 da §4; "—" quando o rendimento é ≤ 0 |
| 16 | §4.6 caso 23 × rodapé obrigatório × badges | O rodapé obrigatório contém "preço justo/preço-alvo" e os badges chamam o Índice de "nota" | Lista de exceções explícita; badge "Índice acima da comunidade". Revisar as 15 strings do protótipo |
| 17 | §4.5 Múltiplos históricos | Não diz que o preço é cru | "Cotação crua do último pregão do ano × ações da mesma data" |
| 18 | §5 Tabelas `assets`, `watchlists`, `quotes_daily`, `financial_statements` (esta citada, mas não definida) | Colidem com tabelas e rotas existentes | Nomes da §5.3; rotas `/api/analise-ativos/*`; o objetivo usa `/api/planejamento-sonhos` |
| 19 | Units e duas classes | Múltiplo por ticker com LPA "por ação total" erra por 2–3× | Múltiplos no nível da empresa × fator de equivalência; Índice por empresa, voto por ticker |
| 20 | Payout "relativo ao exercício" | Estruturado só até FY2021 | Payout = proventos declarados no ano (DMPL) ÷ lucro do ano |
| 21 | §6 Custos EUA (US$ 22–60) | Esses planos proíbem exibir a terceiros | Faixa real na §8 |
| 22 | REITs: C_lucro "anos de FFO/ação positivo" × semáforo "FFO/ação crescendo" | Duas métricas; o FFO só vem por extração | Confirmar a intenção e usar o FFO reportado (Nareit), gravando a base |
| 23 | Dividendos extraordinários | Não há marcação; dez/2025 distorce o DY 12m até dez/2026 | Mostrar sem ajuste, com nota automática quando payout > 150% |

---

## 7. Perguntas para o Pedro (com recomendação)

**Índice MF e semáforo (bloqueiam o seed de `ScoringParams`):**

1. **Fórmula × notas do protótipo.** Pela §4.1 a WEGE3 dá 8,02, não 9,1, e 42% dos ativos ficam fora da nota desenhada. → *Recomendação:* vale a fórmula. Mostramos a ele a nota real calculada dos ~50 ativos do protótipo e ele recalibra os limiares, se quiser.
2. **Bancos e seguradoras** sem Dív.líq/EBITDA. → *Recomendação:* "não se aplica" com peso redistribuído e leitura "n de 4 critérios". Indicadores próprios de banco (Basileia, eficiência) ficam para depois.
3. **Padrão contábil dos bancos.** O consolidado é IFRS (BBAS3 LPA 4,62); o mercado e a política de dividendos usam BR GAAP (6,18). → *Recomendação:* para bancos, usar o **individual BR GAAP** (é o que o investidor vê no release e no Status Invest) e escrever o padrão na tela.
4. **FII de papel no lançamento** (LTV e inadimplência só em PDF). → *Recomendação:* trocar provisoriamente por critérios que a CVM dá (concentração do maior CRI e nº de CRIs), com nota "critérios provisórios", em vez de lançar todo papel com "dados incompletos".
5. **FII tijolo, 5º critério** até termos o padrão construtivo. → *Recomendação:* Alavancagem (obrigações/PL).
6. **Vacância e nº de imóveis da CVM** não batem com o gestor (XPLG11 18,3% × 8,1%). → *Recomendação:* exibir como "fonte CVM" e manter no critério só depois de validar ~20 fundos contra os gerenciais. Se a divergência for comum, usar a vacância só de fundos com imóvel 100% próprio até a Fase 5.
7. **Alavancagem de FII** = obrigações/PL inclui passivos operacionais (TRXF11 70% × ~64%). → *Recomendação:* aceitar, com o nome "Obrigações/PL" (não "alavancagem" nem "LTV").
8. **FoF** (59 fundos). → *Recomendação:* fora do Índice no MVP, com página e dados; régua própria depois.
9. **Tipo por composição** (MXRF11 vira papel; CPTS11 vira FoF). → *Recomendação:* seguir a composição (regra objetiva), com override manual documentado para poucos casos.
10. **"Preço vs. histórico"** do semáforo: P/L absoluto ≤ 15 ou P/L contra a média de 10a? → *Recomendação:* contra a média (coerente com o Índice e o Valuation), renomeando o critério se ele preferir o absoluto.
11. **Payout** = proventos declarados no ano ÷ lucro do ano (PETR4 2024 ≈ 275%). → *Recomendação:* aceitar, com selo acima de 150%.
12. **Dividendos extraordinários de dez/2025** (WEG 161%, Vale 235%). → *Recomendação:* sem ajuste, com nota automática. Não há dado que marque o extraordinário.
13. **Units e duas classes.** → *Recomendação:* Índice MF por empresa, múltiplos e voto por ticker.

**Quadro e página:**

14. **Universo de FIIs:** os 527 da lista B3, incluindo os fundos com 1 a 10 cotistas? → *Recomendação:* só os negociados nos últimos 30 pregões (~350); os demais entram na busca, fora do Quadro. Fiagro fora do MVP.
15. **Top 100 FIIs por liquidez** = média de volume financeiro nos últimos 21 pregões? → *Recomendação:* sim.
16. **Pares do setor:** segmento B3, completando com o subsetor até 5? → *Recomendação:* sim (só 17 segmentos têm 5 ou mais).
17. **Data de resultado "estimada"** (acerta em até 7 dias em 86% dos ITRs) até a oficial sair? → *Recomendação:* sim, com o rótulo "estimada".
18. **Campos só em PDF** (vacância financeira, padrão construtivo, inquilinos, LTV…): esconder ou "em breve"? → *Recomendação:* esconder a linha no MVP. "Em breve" em dado financeiro gera expectativa.
19. **Múltiplo histórico** = cotação crua do último pregão do ano × ações ÷ métrica (o critério do Fundamentus/Status Invest)? → *Recomendação:* sim.

**Comunidade (Fase 3):**

20. **Ranking m = 200 / mínimo de 200 votos.** → *Recomendação:* m = 20 no início, com o C calculado por classe.
21. **Variação mensal:** subir de 5º para 3º = ▲2? → *Recomendação:* sim (corrige o sinal da spec).
22. **Conta com < 30 dias que tem o ativo:** peso 1,5 ou 0,5? → *Recomendação:* 0,5 (o risco de conta nova pesa mais).
23. **Selo "convergem"** compara com a nota bruta ou com a bayesiana? → *Recomendação:* com a bayesiana.
24. **Badge "nota acima da comunidade"** → trocar para "Índice acima da comunidade". *Recomendação:* sim (a §9 proíbe "nota").

**EUA (Fase 4):**

25. **Stocks/REITs só no Premium?** Isso define se vale pagar US$ 400–2.500/mês de licença. → *Recomendação:* decidir junto com o preço do Premium. Sem receita que cubra, adiar os EUA.
26. **Perguntar à BRAPI** se a cotação de tickers dos EUA que a API já devolve está licenciada para exibição. → *Recomendação:* sim, antes de qualquer contrato novo (pode zerar o custo).
27. **Escopo:** S&P 500 + MSCI US REIT (~580 tickers), sem REITs hipotecários? → *Recomendação:* sim.
28. **REIT com ocupação, Dív/EBITDA e FFO payout "em revisão"** até a extração do 10-K? E FFO = Nareit reportado, AFFO só quando publicado? → *Recomendação:* sim para as duas.

---

## 8. Custos mensais estimados

### 8.1 MVP B3 (Ações + FIIs)

| Item | Custo | Base |
| --- | --- | --- |
| CVM Dados Abertos (DFP/ITR/FRE/FCA/IPE, Informes FII) | R$ 0 | público |
| B3: COTAHIST, ClassifSetorial, lista de FIIs | R$ 0 | público (endpoints da lista sem documentação) |
| BRAPI (cotação do dia e proventos) | **sem acréscimo**: plano pago já contratado | usamos 18 de 40 requisições no spike. Não precisa de plano maior para fundamentos |
| Bolsai / Fintz (sugeridos na spec) | R$ 0: **não contratar** | a CVM direta cobre |
| Infra (Lightsail app + Postgres) | sem acréscimo previsto | ⚠️ **crescimento do banco não medido**. `AssetStatementLine` (Raio-X) é a tabela maior; estimar na Fase 0 antes do backfill em prod |
| Extração de PDF de FII (Fase 5, Claude + revisão) | não medido | fica para o desenho da Fase 5 |
| **Total de dados novos** | **R$ 0/mês** | o custo real é de engenharia e de curadoria (tabela manual de ~60 FIIs, auditoria de proventos) |

### 8.2 EUA (Stocks + REITs, Fase 4), separado

| Item | Custo | Base |
| --- | --- | --- |
| SEC EDGAR (companyfacts, frames, 10-K/10-Q) | US$ 0 | público; limite de 10 req/s, User-Agent com e-mail |
| **Preço com licença para exibir** | **~US$ 400–2.500/mês** ou sob cotação | Twelve Data Venture ~US$ 499 (exibição explícita); EODHD Enterprise e Massive Business US$ 2.499; EODHD Custom e FMP Enterprise sob cotação. Planos de US$ 19–199 **proíbem** exibir a terceiros |
| Preço via BRAPI-EUA | US$ 0 **se** a BRAPI confirmar a licença | não documentado; a origem provável é o Yahoo |
| Preço via Yahoo | **não usar** | termos proíbem o uso comercial; sem SLA |
| FFO/AFFO, ocupação, dívida de REIT | custo de curadoria | ~110 REITs × 4 filings/ano ≈ 440 extrações/ano com revisão humana; custo de LLM não medido |
| **Total EUA** | **US$ 0 (se a BRAPI licenciar) a ~US$ 2.500/mês**, mais a curadoria | |

---

*Arquivos-fonte:* `docs/analise-ativos/fase-a/*.md|json` · scripts em `scripts/analise-ativos/`. Nada foi gravado em
banco, nada foi acessado em produção e nada foi commitado.
