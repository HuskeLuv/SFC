# My Finance — Justificativa dos Valores Apresentados

**Documento técnico para a equipe de consultoria financeira**
Última revisão: 2026-04-30

---

## Sumário

1. [Como ler este documento](#1-como-ler-este-documento)
2. [Fontes de dados externas](#2-fontes-de-dados-externas)
3. [Carteira — visão geral](#3-carteira--visão-geral)
4. [Cálculos por classe de ativo](#4-cálculos-por-classe-de-ativo)
5. [Análises](#5-análises)
6. [Imposto de Renda](#6-imposto-de-renda)
7. [Fluxo de caixa](#7-fluxo-de-caixa)
8. [Glossário](#8-glossário)
9. [Referências](#9-referências)
10. [Limitações conhecidas](#10-limitações-conhecidas)

---

## 1. Como ler este documento

O My Finance apresenta dezenas de números: patrimônio atual, rentabilidade do mês, Sharpe, dividendos projetados, IR a pagar, etc. Quando um cliente pergunta **"de onde veio esse número?"**, você precisa de uma resposta firme. Este documento mapeia, seção por seção, **a fórmula usada, os dados de entrada, a fonte externa, e onde a metodologia segue (ou se afasta) do padrão de mercado**.

Convenções:

- **Itálico** = nome técnico em inglês ou no idioma original.
- `código` = nome de campo no banco ou tabela.
- Os exemplos numéricos usam a carteira de teste **kinvo@test.com**, com 13 operações (PETR4, ITUB4 em 3 aportes DCA, HGLG11, BOVA11, VOO, Tesouro IPCA+ 2029, CDB BMG 110% CDI, LCI Inter 95% CDI, BTC, fundo Trend DI, Brasilprev RT FIX). Esses inputs estão em `scripts/kinvo-test-portfolio.csv`.

---

## 2. Fontes de dados externas

Todo cálculo do My Finance se apoia em dados de mercado. Não inventamos preço, taxa ou dividendo — sempre puxamos de fontes públicas, oficiais e auditáveis. Quatro provedores cobrem 100% das necessidades.

### 2.1 BRAPI (`brapi.dev`) — Renda variável e câmbio

- **O que fornece:** cotações de ações, FIIs, ETFs e BDRs da B3, criptomoedas (BTC, ETH, etc.), pares de câmbio (USD-BRL, EUR-BRL).
- **Atualização:** cron diário às 07:00, 07:05 e 07:10 UTC (catálogo, preços de FX/cripto, preços de B3, respectivamente). Em produção, equivale a 04:00–04:10 horário de Brasília.
- **Onde armazenamos:** tabela `Asset` (preço atual + timestamp) e `AssetPriceHistory` (série diária até 5 anos).
- **Comportamento em falha:** se a BRAPI não responde em 10 segundos, o sistema usa o último preço conhecido em vez de quebrar a tela. Para o cliente, a única consequência é o preço estar desatualizado por algumas horas — a posição quantitativa nunca se perde.

### 2.2 BACEN SGS (`api.bcb.gov.br`) — Indicadores macroeconômicos

O Sistema Gerador de Séries Temporais do Banco Central é o fornecedor oficial de **15 séries** que sustentam todos os cálculos de renda fixa, inflação e benchmarking:

| Série          | Código SGS | Uso no My Finance                                      |
| -------------- | ---------- | ------------------------------------------------------ |
| CDI diário     | 12         | Marcação de pós-fixados, taxa livre de risco no Sharpe |
| SELIC diária   | 11         | Comparação com CDI                                     |
| SELIC meta     | 432        | Sinalização de política monetária                      |
| CDI anualizado | 4389       | Apresentação amigável                                  |
| IPCA mensal    | 433        | Marcação de Tesouro IPCA+, benchmark de inflação       |
| IPCA-15        | 7478       | IPCA prévio (acompanhamento)                           |
| IGP-M          | 189        | Reajuste de aluguéis e contratos                       |
| IGP-DI         | 190        | Indicador de preços corporativos                       |
| INPC           | 188        | Indicador de preços ao consumidor                      |
| TR             | 226        | Atualização da poupança                                |
| Poupança       | 25         | Benchmark de comparação                                |
| TJLP           | 256        | Empréstimos longos                                     |
| IMA-B          | 12466      | Benchmark de Tesouro IPCA+ médio                       |
| IMA-B 5        | 12467      | Benchmark de IPCA+ curto prazo                         |
| IMA-B 5+       | 12468      | Benchmark de IPCA+ longo prazo                         |

- **Atualização:** cron diário 06:00 UTC, _lookback_ de 60 dias (preenche atrasos de publicação).
- **Onde armazenamos:** tabela `EconomicIndex` (chave: tipo de índice + data).

### 2.3 Tesouro Transparente (`tesourotransparente.gov.br`) — Títulos públicos

- **O que fornece:** preço unitário (PU) de compra, PU de venda e taxa de cada título do Tesouro Direto, atualizado diariamente. Histórico desde 2002.
- **Formato:** CSV de ~13 MB com 500 mil linhas (todos os títulos × todas as datas).
- **Atualização:** cron diário 06:15 UTC, ingesta dos últimos 3 dias para se manter em sincronia.
- **Onde armazenamos:** tabela `TesouroDiretoPrice` (chave: tipo do título + vencimento + data base).
- **Importância:** é o que permite **marcar a mercado** (_mark-to-market_) Tesouro IPCA+ 2029, Tesouro Prefixado 2031, etc., com o mesmo preço que o investidor veria comprando hoje no Tesouro Direto.

### 2.4 CVM Dados Abertos (`dados.cvm.gov.br`) — Fundos

- **O que fornece:** cadastro de todos os ~30 mil fundos de investimento ativos no Brasil (CNPJ, classe, gestora) e a cota diária de cada um.
- **Atualização:** catálogo completo aos domingos 05:00 UTC; cotas diárias 06:30 UTC.
- **Onde armazenamos:** `Asset` (entrada do fundo no catálogo) e `CvmFundQuota` (cota diária com 8 casas decimais de precisão).
- **Otimização:** o sync diário só baixa cotas dos fundos que algum cliente da base efetivamente possui. Para uma base de 1.000 clientes com fundos em ~50 CNPJs distintos, isso reduz o volume de download de 30.000 para 50 fundos.

---

## 3. Carteira — visão geral

### 3.1 Patrimônio atual

O número grande exibido em `Carteira → Resumo` (chamamos de _saldo bruto_) é simplesmente:

```
Saldo Bruto = Σ (valor atual de cada ativo)
```

O **valor atual** de cada posição segue uma cascata de prioridades, decidida no momento de renderização:

```
Se ativo é Renda Fixa marcada na curva (CDB/LCI/Tesouro):
    valor = montante_aplicado × fator_acumulado_até_hoje

Senão se há cotação de mercado disponível (ações, FII, ETF, cripto):
    valor = quantidade × preço_atual_em_BRL

Senão se posição manual sem cotação (reserva, imóvel):
    valor = total_investido

Senão (fallback):
    valor = quantidade × preço_médio_de_compra
```

A **conversão para BRL** dos ativos em moeda estrangeira (Stock US, BDR em USD) usa a cotação do dia da BRAPI:

```
valor_BRL = quantidade × preço_USD × cotação_USD-BRL
```

Para o **VOO** da carteira de teste (ETF S&P 500): se o cliente tem 5 cotas a USD 530 e o dólar do dia está em R$ 5,02, o saldo aparece como `5 × 530 × 5,02 = R$ 13.303`.

### 3.2 Aportes, resgates e dividendos

O sistema diferencia três conceitos que **não devem ser confundidos**:

- **Valor aplicado** (`totalInvested`): soma de todos os aportes em valor de aquisição, líquido de resgates. Não muda com o preço de mercado.
- **Saldo bruto** (`totalValue`): valor a preço de hoje. Sobe e desce com o mercado.
- **Rendimento** (`totalEarnings`): saldo bruto − valor aplicado. Pode ser negativo.

A rentabilidade exibida no card principal da carteira é a **rentabilidade simples**:

```
Rentabilidade % = (Saldo Bruto − Valor Aplicado) / Valor Aplicado × 100
```

> ⚠️ Esta é uma medida de bolso, não substitui a rentabilidade _time-weighted_ (TWR) usada nas análises (ver §5.1). Para um cliente que aportou R$ 1.000 dez vezes e tem hoje R$ 12.000, a rentabilidade simples é 20% — mas isso ignora _quando_ cada aporte foi feito.

### 3.3 Patrimônio histórico

O gráfico de evolução patrimonial (12, 24 ou 36 meses) é construído de duas formas, com uma escolha automática de qual usar:

**Caminho rápido (snapshot-driven):** lê uma tabela `PortfolioDailySnapshot` que armazena, para cada cliente em cada dia, `totalValue` e `totalInvested` já calculados. O cron diário (`portfolio-snapshots`, 08:00 UTC) atualiza essa tabela. Quando o cliente abre o resumo, lemos diretamente — milissegundos.

**Caminho lento (live builder):** quando o cliente tem menos de 24 meses de snapshots ou pediu uma janela específica, o sistema reconstrói dia a dia:

1. Constrói uma timeline de dias úteis no período (excluindo finais de semana).
2. Para cada dia:
   - Aplica os deltas de transação (compras/vendas) acumulados.
   - Para ações/FIIs/ETFs/cripto: busca o preço daquele dia em `AssetPriceHistory`.
   - Para renda fixa pós-fixada: aplica o fator do CDI daquele dia.
   - Para Tesouro: busca o PU daquele dia em `TesouroDiretoPrice`.
3. Soma tudo: saldo bruto do dia.

**Por que dois caminhos?** Recalcular 36 meses para cada _page load_ é caro (segundos por cliente). O snapshot pré-calculado serve >95% dos pedidos em milissegundos; o builder ao vivo é o _fallback_ preciso para casos que ainda não têm cobertura.

---

## 4. Cálculos por classe de ativo

### 4.1 Ações brasileiras, FIIs, ETFs, BDR

**Preço:** `Asset.currentPrice` atualizado pelo cron BRAPI (07:10 UTC). Se mais antigo que 7 dias, o sistema busca live na BRAPI no momento da abertura da página.

**Posição:** `quantidade × preço_atual − taxas`. As taxas (corretagem, ISS, emolumentos) são deduzidas em cada operação no momento do registro.

**Preço médio:** o sistema mantém _preço médio ponderado_ por símbolo, recalculado a cada compra ou venda:

```
Após nova compra:
    preço_médio_novo = (preço_médio_antigo × qty_antiga + preço_compra × qty_nova) / qty_total

Após venda:
    preço_médio fica inalterado (apenas a quantidade reduz)
    Lucro/prejuízo realizado = (preço_venda − preço_médio) × qty_vendida − taxas
```

**Exemplo do cliente kinvo:** três compras de ITUB4 no fevereiro/março/abril de 2026. Suponha:

| Data       | Quantidade | Preço unitário | Acumulado         |
| ---------- | ---------- | -------------- | ----------------- |
| 2026-02-28 | 50         | R$ 33,00       | qty=50, PM=33,00  |
| 2026-03-28 | 50         | R$ 35,00       | qty=100, PM=34,00 |
| 2026-04-28 | 50         | R$ 32,00       | qty=150, PM=33,33 |

O preço médio final de R$ 33,33 é o que serve de base para calcular ganho de capital, IR e _yield on cost_.

### 4.2 Renda fixa prefixada (CDB pré, LCI pré, LCA pré, debênture pré)

**Fórmula de capitalização composta (juros compostos diários, em base 252):**

```
Valor atual = Valor aplicado × (1 + taxa_anual)^(dias_úteis_decorridos / 252)
```

A base 252 (dias úteis no ano) é a convenção do mercado brasileiro de renda fixa, fixada pela ANBIMA para títulos privados (Resolução ANBIMA — Manual de Apreçamento, item 3.4.1).

**Exemplo CDB BMG 110% CDI a 110% a.a. prefixado, R$ 5.000 aplicados em 28/04/2026, vencimento 15/10/2028 (915 dias corridos ≈ 627 dias úteis):**

```
VF = 5.000 × (1 + 1,10)^(627/252)
```

(Note: este exemplo é ilustrativo; o produto real do cliente é pós-fixado em 110% do CDI — vide §4.3.)

### 4.3 Renda fixa pós-fixada em % do CDI (CDB pós, LCI pós, LCA pós)

**Fórmula:** acumulação diária do CDI, ponderada pelo percentual contratado.

Em cada dia útil em que o BACEN publica o CDI:

```
fator_dia = 1 + CDI_decimal_dia × (percentual_contratado / 100)
fator_acumulado = fator_acumulado_anterior × fator_dia

Valor atual = Valor aplicado × fator_acumulado
```

**Exemplo LCI Inter 95% CDI:** se em determinado dia o CDI publicado for 0,054% (≈ equivalente a 14,15% a.a.), o fator do dia será:

```
fator = 1 + 0,000540 × 0,95 = 1,000513
```

Para R$ 5.000 aplicados há 100 dias úteis, com CDI médio de 0,054% e percentual de 95%:

```
fator_acumulado = 1,000513^100 ≈ 1,0526
Valor atual ≈ R$ 5.263
```

A LCI tem ainda **isenção de IR** para pessoa física (Lei 11.033/2004, art. 3º, II) — o sistema marca o ativo com `rendaFixaTaxExempt: true` e não desconta IR no cálculo de rendimento líquido.

### 4.4 Tesouro Direto — marcação a mercado

Aqui o cálculo é diferente: não acumulamos um fator, **lemos o preço unitário (PU) do dia** diretamente da tabela `TesouroDiretoPrice`, que reflete o que o Tesouro Nacional publica em `tesourotransparente.gov.br`.

```
fator = PU_hoje / PU_data_da_compra

Valor atual = Valor aplicado × fator
```

**Por que marcação a mercado e não pela curva?** Porque é o que o investidor receberia se vendesse hoje. É a metodologia exigida pela **Resolução CMN 2.829/2001** e pela ANBIMA para fundos abertos com cotas diárias, e foi adotada como padrão de transparência no Tesouro Direto a partir de 2017.

> ⚠️ **Sobe e desce.** O valor exibido **pode ficar abaixo do que o cliente pagou** — não é bug, é a curva de juros futuros se mexendo. Tesouro IPCA+ 2050 e EDUCA+ 2085 (duration longa) podem ter rentabilidade negativa por meses ou anos em ciclos de aperto monetário, com volatilidade comparável à de uma ação. O sistema mostra o PU oficial publicado pelo Tesouro, sem floor — porque esconder a perda é pior do que mostrá-la (o cliente que não sabe que pode perder no Tesouro acaba vendendo no susto na primeira queda).

**Comportamento do Tesouro IPCA+:** o preço varia por dois motivos simultâneos: (1) o cupom de juros real (taxa contratada na compra) corre todo dia útil; (2) a inflação acumulada (IPCA do mês anterior) é incorporada no fechamento de cada mês. Se o IPCA dispara, o preço sobe; se a curva de juros dispara, o preço cai (efeito conhecido como _marcação a mercado dolorosa_ em ambientes de alta de juros).

**Tesouro IPCA+ 2029 do cliente kinvo:** R$ 5.000 aplicados em 28/04/2026 com taxa de juros real contratada de 6% a.a. + IPCA. Se o PU subiu de R$ 3.500 (data da compra) para R$ 3.580 hoje, o fator é 1,0229 e o valor atual é R$ 5.114. Ganho marcado a mercado de R$ 114, mesmo com apenas 2 dias úteis transcorridos — porque a curva de juros real fechou.

### 4.5 Cripto

Mesmo modelo das ações: `quantidade × preço_BRL_atual`. A BRAPI (`/v2/crypto`) cobre BTC, ETH, ADA, SOL, BNB, XRP, DOT, DOGE, AVAX, MATIC e retorna preço em BRL diretamente (já considerando a cotação do dólar). Para o BTC do cliente kinvo, o número exibido vem desse endpoint, atualizado a cada 24h pelo cron `brapi-sync/prices-other`.

### 4.6 Fundos (renda fixa, multimercado, ações)

**Cota:** `CvmFundQuota.quotaValue` (8 casas decimais), atualizada diariamente pelo cron CVM 06:30 UTC.

**Posição:** `quantidade_de_cotas × cota_atual`.

**Exemplo Trend DI Simples FIRF do cliente kinvo:** se o cliente comprou 100 cotas a R$ 1,42 e hoje a cota está em R$ 1,46:

```
Valor = 100 × 1,46 = R$ 146,00
Rentabilidade = (1,46 − 1,42) / 1,42 = 2,82%
```

A cota da CVM **já é líquida de taxa de administração** (a taxa é debitada diariamente da própria cota), então o número apresentado é o que o cliente efetivamente tem. Imposto de renda (come-cotas semestral) é tratado separadamente na seção de IR.

### 4.7 Previdência

Tratada como ativo manual: `quantidade × cota_informada`. O sistema não puxa cotas da SUSEP automaticamente porque o catálogo público é inconsistente; o cliente atualiza manualmente.

---

## 5. Análises

### 5.1 Rentabilidade da carteira — MWR (padrão) e TWR (alternativa)

A tela `Análises → Rentabilidade` exibe **gráficos de rentabilidade cumulativa** e oferece um **toggle MWR ↔ TWR** no canto superior. **MWR é o padrão**, porque responde a pergunta que mais interessa ao cliente: _"o que meu dinheiro rendeu de fato?"_

- **MWR (Money-Weighted Return)** — TIR (XIRR) dos fluxos de caixa da carteira. Pondera por _quanto tempo cada real ficou exposto_. Captura o timing dos aportes do investidor — aportar tarde em mercado em alta puxa o número pra baixo, mesmo se o ativo subiu.
- **TWR (Time-Weighted Return)** — padrão CFA/GIPS para comparação com gestor. Neutraliza o timing dos aportes. É o número certo para **comparação com benchmark** (CDI, IBOV, IPCA), porque benchmarks não têm fluxo de caixa.

Quando os dois divergem, há informação útil pro consultor: TWR alto + MWR baixo significa "o mercado subiu, mas o cliente aportou tarde demais". MWR > TWR significa "o cliente acertou os pontos de entrada". Apertar o toggle permite enxergar ambos sem sair da tela.

#### TWR — fórmula

Calculado a cada dia útil:

```
Se i = 0 (primeiro dia da série):
    retorno_dia = (valor_final − aporte) / aporte

Se i > 0:
    retorno_dia = (valor_final − valor_inicial − fluxo_dia) / valor_inicial

Acumulado:
    cumulativo = ∏ (1 + retorno_dia_k)  para k de 0 até hoje

TWR = (cumulativo − 1) × 100
```

A construção dia-a-dia neutraliza os fluxos de caixa: cada subperíodo é avaliado pelo retorno do _valor presente_ sem o aporte do dia, e os subperíodos são compostos geometricamente. Um cliente que aporta R$ 100 em janeiro e vê o ativo subir 50% até dezembro tem o mesmo TWR de outro que aporta R$ 100 em julho e vê o ativo subir 50% até dezembro — embora a rentabilidade simples do segundo seja muito maior.

#### MWR — fórmula

Resolve a TIR (no estilo XIRR do Excel) sobre os fluxos da carteira:

```
Σ  cf_k / (1 + r)^((t_k − t_0) / 365)  =  0
```

Onde:

- `cf_k` é cada fluxo (aportes negativos, resgates e valor terminal positivos — convenção do investidor).
- `t_k − t_0` é o número de dias entre o fluxo e o início da janela.
- `r` é a taxa anualizada (effective annual rate) que zera a equação.

Resolvido em `src/services/portfolio/mwrCalculator.ts` por Newton-Raphson, com bisseção como fallback. Saldo bruto inicial entra como aporte virtual em `t_0` e saldo bruto final entra como resgate virtual em `t_N`.

#### Quando usar qual

- **Comparar com benchmark (CDI/IBOV/IPCA)** → use TWR. Apples-to-apples.
- **"Quanto meu dinheiro rendeu de fato?"** → use MWR. Reflete a experiência do investidor.
- **Avaliar timing de aportes** → divergência TWR/MWR é o sinal.
- **Janelas curtas (<12 meses)** → MWR oscila bastante; um aporte grande perto do fim distorce. Para "no mês", apresentamos o MWR do período (não anualizado), nunca a forma anualizada.

#### Janelas (7 cortes simultâneos)

| Card           | Janela                          |
| -------------- | ------------------------------- |
| Hoje           | D-1 vs. D-2                     |
| No mês         | 1º dia do mês corrente até hoje |
| No ano         | 1º de janeiro até hoje (YTD)    |
| 12 meses       | Últimos 12 meses                |
| 24 meses       | Últimos 24 meses                |
| 36 meses       | Últimos 36 meses                |
| Desde o início | Primeira transação até hoje     |

**Comparação com benchmarks:** ao lado de cada janela, exibimos a mesma rentabilidade do CDI, IPCA e IBOV no período. Os números do CDI e IPCA vêm de `EconomicIndex` (capitalização composta de fatores diários/mensais). O IBOV vem do histórico do `^BVSP` na BRAPI.

> ⚠️ Quando o gráfico estiver no modo MWR, a linha da carteira é o número-cliente (com timing dos aportes), enquanto CDI/IBOV/IPCA continuam sendo TWR — porque benchmarks não têm aporte. Em janelas onde o cliente aportou desigualmente, MWR e TWR podem divergir e a comparação com benchmark fica menos direta. Para a comparação justa com benchmark, alterne o gráfico para TWR.

> ✅ **Para o cliente:** "no ano, sua carteira rendeu 4,2% (TWR) — acima do CDI (3,8%) e do IBOV (1,1%). Sua TIR efetiva (MWR) foi 3,1%, abaixo do TWR — sinal de que aportes mais recentes ainda não foram totalmente capturados pela alta. Não é sinal de problema; só significa que parte do retorno ainda está pela frente."

**Anualização:** para janelas ≥ 12 meses, o TWR é apresentado também em forma anualizada via composição geométrica:

```
Anualizado = (1 + retorno_total)^(12 / meses) − 1
```

O MWR já é nativamente anualizado (effective annual rate) — para janelas < 12 meses, exibimos a forma de período (`(1 + r)^anos − 1`) para evitar a mesma armadilha estatística do TWR.

### 5.2 Risco-retorno

#### Volatilidade anualizada

```
σ_diário = desvio_padrão_amostral(retornos_diários_24m)
σ_anualizada = σ_diário × √252
```

A multiplicação por √252 é a convenção universal para anualizar volatilidade diária (252 = dias úteis no ano), originalmente formalizada em Hull, _Options, Futures, and Other Derivatives_, 9ª ed., Cap. 14, e adotada pela CFA Institute. Para retornos mensais, o multiplicador seria √12.

#### Índice Sharpe

```
Sharpe = (Retorno_carteira − CDI) / σ
```

- Retorno e CDI ambos no mesmo período da volatilidade.
- Para janelas ≥ 12 meses, ambos são **anualizados** antes da divisão.
- Usamos o CDI como _risk-free rate_ (e não a SELIC), porque é o que o investidor brasileiro efetivamente capta ao alocar em pós-fixados sem risco de crédito (CDB de banco grande, fundo DI). É a mesma escolha defendida pelo Banco Central no Relatório de Estabilidade Financeira (jun/2023).

**Interpretação para o consultor:**

- Sharpe < 0: a carteira ganhou menos que o CDI. Sinal vermelho.
- Sharpe entre 0 e 0,5: carteira venceu o CDI por margem pequena, possivelmente não justificada pelo risco.
- Sharpe entre 0,5 e 1,0: bom.
- Sharpe > 1,0: excelente. Comum em janelas de bull market.

Fonte original: William F. Sharpe, "Mutual Fund Performance", _Journal of Business_, 1966, refinada em "The Sharpe Ratio", _Journal of Portfolio Management_, 1994.

#### Beta vs. IBOV

```
β = Cov(retornos_ativo, retornos_IBOV) / Var(retornos_IBOV)
```

Calculado com retornos diários dos últimos 24 meses. Mínimo de 30 observações comuns. É a definição clássica de Sharpe-Lintner do _Capital Asset Pricing Model_ (Sharpe 1964, Lintner 1965).

**Interpretação:**

- β = 1: ativo se move em linha com o IBOV.
- β > 1: ativo é mais volátil que o IBOV (PETR4 historicamente roda β ≈ 1,3).
- β < 1: ativo é menos volátil (utilities, bancos).
- β próximo de 0: ativo descorrelacionado (renda fixa, ouro).

### 5.3 Sensibilidade

Aqui o nome pode confundir consultores acostumados com _stress tests_. **Sensibilidade no My Finance é análise de contribuição de cada ativo ao risco da carteira**, não simulação de cenários.

**Componentes:**

```
Correlação de Pearson (mensal, ativo vs. carteira):
    ρ = Cov(R_ativo, R_carteira) / (σ_ativo × σ_carteira)

Contribuição Marginal ao Risco (MRC):
    MRC_i = peso_i × Cov(R_ativo, R_carteira) / Var(R_carteira)
```

A soma das MRCs sobre todos os ativos é igual a 1 (decomposição de Euler da variância). Isso permite afirmar coisas como **"PETR4 representa 8% do meu patrimônio mas contribui com 18% do risco da carteira"** — uma afirmação valiosa que a alocação simples não revela.

**Classificação de correlação:**

| Faixa          | Classificação |
| -------------- | ------------- |
| ρ > 0,7        | Alta          |
| 0,3 < ρ ≤ 0,7  | Média         |
| −0,3 < ρ ≤ 0,3 | Baixa         |
| ρ ≤ −0,3       | Negativa      |

Mínimo de 12 meses de histórico em comum para o ativo ser incluído (referência teórica para significância estatística de coeficiente Pearson amostral, conforme Cohen 1988).

### 5.4 Dividendos e proventos

#### Yield on Cost (YoC) — últimos 12 meses

```
YoC_12m = Σ (proventos pagos nos últimos 12 meses) / Custo médio investido × 100
```

#### Yield on Cost lifetime

```
YoC_lifetime = Σ (todos proventos desde a primeira compra) / Custo médio investido × 100
```

A diferença entre YoC e _Dividend Yield_ (DY) é central para o consultor explicar:

- **DY** (= proventos / preço atual): mede o que o ativo paga _agora_, no preço _atual_. Um cliente que comprou ITUB4 a R$ 20 e hoje está R$ 35 vê DY de ~5%.
- **YoC** (= proventos / preço médio de compra): mede o que o ativo paga _para esse cliente específico_, no custo de aquisição dele. O mesmo cliente vê YoC de ~8,75% — porque o ITUB4 valorizou e ele pagou caro mais barato.

YoC só faz sentido para o investidor de longo prazo; DY é o número universal para comparação entre ativos. A metodologia é a apresentada em B3, _Manual de Procedimentos do Mercado de Capitais_, item 4.7.

#### Quantidade na data ex-dividendo

Para calcular YoC corretamente, o sistema busca a **quantidade que o cliente possuía na data do ex-dividendo**, não a quantidade atual. Ex-dividendos pagos sobre posições já vendidas não contam. A timeline é construída por busca binária na sequência de transações.

#### Proventos futuros (1m / 3m / 12m)

Não há previsão estatística aqui. O sistema mostra **apenas dividendos já anunciados pelas empresas**, com data ex declarada. A janela:

```
Próximos 1 mês: ex-date entre hoje e hoje + 30 dias
Próximos 3 meses: hoje a hoje + 90 dias
Próximos 12 meses: hoje a hoje + 365 dias
```

Para cada anúncio, o valor projetado é `quantidade_atual × valor_anunciado_por_ação`.

> ⚠️ **Esse número é piso, não previsão.** Empresas anunciam dividendos com 30–60 dias de antecedência tipicamente; o número de "próximos 12 meses" tende a estar subestimado em mercados normais (mais dividendos serão anunciados no caminho).

#### Magic Number (FIIs)

Métrica popularizada pela comunidade de FII brasileira:

```
Magic Number = teto(cotação_atual / dividendo_mensal_médio_por_cota)
```

Indica quantas cotas adicionais um cliente precisaria comprar para que **o dividendo mensal de uma cota nova pague a cota seguinte**, ou seja, para o FII se autofinanciar. Quanto menor, mais "rápido" o FII se paga via dividendos.

### 5.5 Alocação

A alocação é calculada por **classe de ativo** (Ações BR, FIIs, ETFs, Stocks US, Cripto, Renda Fixa, Tesouro, Fundos, Previdência, Imóveis), comparada com a **alocação-alvo** definida pelo cliente em `AlocacaoConfig`. O desvio é a base da recomendação de rebalanceamento:

```
Desvio_classe = Peso_atual − Peso_alvo

Se |Desvio_classe| > tolerância (5% padrão):
    Sinaliza necessidade de rebalanceamento
```

A ferramenta segue a lógica de _threshold rebalancing_ descrita em Bernstein, _The Intelligent Asset Allocator_ (2000), capítulo 9, e validada por estudo do Vanguard Research, "Best Practices for Portfolio Rebalancing" (2010).

### 5.6 Metas

```
Progresso% = Patrimônio atual / Patrimônio-alvo × 100

Meses restantes = (ano-alvo − ano-atual) × 12 + (12 − mês-atual)

Aporte mensal necessário = max(0, meta − patrimônio_atual) / meses_restantes
```

> ⚠️ Cálculo **linear, não composto** — não considera valorização do capital nem juros. É deliberado, para apresentar ao cliente um piso conservador. Um cliente que precisa juntar R$ 100k em 5 anos vê "R$ 1.667/mês necessários", não os ~R$ 1.180 que seriam suficientes assumindo 8% a.a. de retorno. A interpretação correta é: "esse é o aporte necessário **se o mercado não ajudar nada**".

---

## 6. Imposto de Renda

O My Finance tem um motor completo de IR para renda variável e renda fixa. O backend está em `src/services/ir/*` e os endpoints em `/api/analises/ir-mensal/*`. Atualmente é uma ferramenta de **acompanhamento** (não substitui a DAA — Declaração de Ajuste Anual — formal).

### 6.1 Renda variável — ações brasileiras e ETFs BR

**Alíquota:** 15% sobre o ganho de capital (Lei 11.033/2004, art. 3º).

**Isenção de R$ 20.000:** vendas de **ações ordinárias** (não vale para FIIs ou ETFs) abaixo de R$ 20.000 no mês são isentas. Importante: o saldo de prejuízo **não é consumido** quando há isenção (IN RFB 1585/2015, art. 56).

**Cálculo mensal:**

```
Para cada venda no mês:
    Lucro_operação = (preço_venda − preço_médio) × quantidade − taxas

Lucro_bruto_mês = Σ Lucro_operação positivos
Vendas_total_mês = Σ (preço_venda × quantidade − taxas)

Se categoria = ações ordinárias E Vendas_total_mês ≤ R$ 20.000 E Lucro_bruto > 0:
    Status = isento
    IR_devido = 0
    Saldo_prejuízo permanece intacto

Senão:
    Prejuízo_compensado = min(saldo_prejuízo_acumulado, Lucro_bruto)
    Lucro_tributável = max(0, Lucro_bruto − Prejuízo_compensado)
    IR_devido = Lucro_tributável × 0,15
    Saldo_prejuízo = saldo_prejuízo − Prejuízo_compensado
```

### 6.2 FIIs

**Alíquota:** 20% sobre ganho de capital. **Não há isenção de R$ 20.000.** Dividendos de FIIs são isentos (Lei 11.196/2005, art. 3º) — o sistema ignora dividendos no cálculo de IR.

**Pool de prejuízo separado:** prejuízos com FII só compensam ganhos com FII (não cruzam com ações).

### 6.3 Renda fixa (CDB, debêntures, fundos DI)

**Tabela regressiva (Lei 11.033/2004):**

| Prazo de aplicação | Alíquota |
| ------------------ | -------- |
| Até 180 dias       | 22,5%    |
| 181 a 360 dias     | 20,0%    |
| 361 a 720 dias     | 17,5%    |
| Acima de 720 dias  | 15,0%    |

O sistema aplica essa tabela com base na data da aplicação vs. data da venda/vencimento.

### 6.4 LCI / LCA / Debêntures incentivadas

Isentas para pessoa física (Lei 11.033/2004, art. 3º). Marcadas com `rendaFixaTaxExempt: true` no banco.

### 6.5 Stocks e ETFs estrangeiros

Alíquota de 15% sobre ganho de capital, com isenção de R$ 35.000 mensais para vendas (apenas para ações em geral, não específico de US). Conversão para BRL pela cotação Ptax do dia da venda. Suporte está implementado mas **a interface de apresentação ao usuário ainda não foi liberada**.

### 6.6 Cripto

Alíquota progressiva (15%/17,5%/20%/22,5% conforme ganho), isenção de R$ 35.000 em vendas (IN RFB 1888/2019).

### 6.7 Aproximações declaradas

O motor de IR apresenta **acompanhamento**, não cálculo definitivo. Limitações conhecidas:

- **IRRF retido na fonte** (0,005% sobre venda) **não é deduzido** do DARF projetado. Para o cliente, isso significa que o valor real a pagar é ligeiramente menor do que o sistema mostra.
- **Day trade** está fora do escopo. O sistema assume swing trade / longo prazo.
- **Ordem de compensação de prejuízos** segue cronologia simples; otimização por símbolo (decidir qual prejuízo usar primeiro) não é feita.

Para a DAA formal, o cliente ainda precisa de software dedicado ou contador.

---

## 7. Fluxo de caixa

O módulo `Cashflow` é estruturalmente diferente da carteira: não trata de mercado, e sim do **planejamento mensal de receitas e despesas** do cliente, com lançamentos manuais.

### 7.1 Estrutura hierárquica

```
CashflowGroup ("Receitas")
├── CashflowItem ("Salário") → CashflowValue (jan/2026 = R$ 8.000)
│                              CashflowValue (fev/2026 = R$ 8.000)
├── CashflowItem ("Dividendos") → CashflowValue (jan/2026 = R$ 350)
└── CashflowGroup ("Renda extra")
    └── CashflowItem ("Aluguel") → CashflowValue (jan/2026 = R$ 1.200)
```

Três tipos de grupo:

- **Entrada:** receitas (salário, dividendos, aluguel recebido).
- **Despesa:** custos (moradia, transporte, lazer).
- **Investimento:** aportes planejados para a carteira.

### 7.2 Templates + personalização

O sistema tem **templates padrão** (cadastro centralizado, sem `userId`) que cobrem categorias comuns. Cada cliente recebe uma cópia desses templates ao se cadastrar. Daí em diante:

- O cliente pode **editar** valores, comentários, cores → vira override pessoal.
- O cliente pode **ocultar** um template (`hidden = true`) → o item desaparece da view dele, mas o template original permanece para outros clientes.
- O cliente pode **adicionar** itens próprios (sem `templateId`) → fica anexado.

A combinação template + override evita o problema clássico de "cada cliente recebe uma planilha em branco" e dá à equipe de produto um ponto único para atualizar nomenclatura ou adicionar categorias novas.

### 7.3 Cálculos derivados

```
Saldo_mês = Σ Entrada_mês − Σ Despesa_mês

Taxa_de_poupança_mês = (Σ Investimento_mês) / (Σ Entrada_mês) × 100

Acumulado_anual = Σ (Saldo_mês para mês de 1 a 12)
```

Estes números são exibidos em cards no topo da tela `Cashflow` e cruzados com a evolução patrimonial em `Análises`.

---

## 8. Glossário

| Termo                             | Definição                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saldo bruto**                   | Valor de mercado da carteira hoje. Soma de todos os ativos a preço atual.                                                                                |
| **Valor aplicado**                | Soma dos aportes em valor de aquisição, líquido de resgates. Não muda com o mercado.                                                                     |
| **TWR** _(Time-Weighted Return)_  | Rentabilidade desconsiderando aportes — padrão GIPS para comparar gestores.                                                                              |
| **MWR** _(Money-Weighted Return)_ | TIR (XIRR) dos fluxos da carteira — mede a experiência _do investidor_, sensível ao timing dos aportes. Exibida em `Análises → Resumo de Rentabilidade`. |
| **Marcação a mercado**            | Avaliar um ativo pelo preço que ele teria se vendido hoje. Padrão de transparência.                                                                      |
| **Marcação na curva**             | Avaliar um ativo pela taxa contratada, ignorando flutuação de preço. Comum em renda fixa "para levar até o vencimento".                                  |
| **YoC** _(Yield on Cost)_         | Dividendo dividido pelo preço médio de compra. Métrica do investidor de longo prazo.                                                                     |
| **DY** _(Dividend Yield)_         | Dividendo dividido pelo preço atual. Métrica universal de comparação.                                                                                    |
| **Sharpe**                        | Retorno excedente sobre o ativo sem risco, dividido pela volatilidade. Quanto maior, melhor.                                                             |
| **Beta (β)**                      | Sensibilidade do ativo ao mercado (IBOV). β = 1 anda junto, β > 1 amplifica, β < 1 amortece.                                                             |
| **PU** _(Preço Unitário)_         | Preço de uma única unidade de título do Tesouro. Publicado diariamente em `tesourotransparente.gov.br`.                                                  |
| **Magic Number**                  | Quantas cotas de um FII bastam para que os dividendos paguem a próxima cota.                                                                             |
| **Come-cotas**                    | IR semestral antecipado em fundos de investimento — 15% (longo prazo) ou 20% (curto). Não exibido individualmente no My Finance.                         |
| **CDI**                           | Taxa média dos depósitos interfinanceiros. Proxy do _risk-free rate_ brasileiro.                                                                         |

---

## 9. Referências

### Padrões e regulamentação

- **GIPS** _(Global Investment Performance Standards)_ — CFA Institute, 2020. Define TWR como padrão para apresentação de performance.
- **Lei 11.033/2004** — Tributação de aplicações financeiras (alíquotas, isenções, tabela regressiva de RF).
- **IN RFB 1585/2015** — Disciplina de IR sobre rendimentos de capital.
- **IN RFB 1888/2019** — Tributação de criptomoedas.
- **Lei 11.196/2005** — Isenção de IR sobre dividendos de FIIs.
- **Resolução CMN 2.829/2001** — Marcação a mercado obrigatória para fundos.
- **ANBIMA — Manual de Apreçamento** — Convenção de base 252 dias úteis para títulos privados.

### Bibliografia

- Bernstein, William J. _The Intelligent Asset Allocator_. McGraw-Hill, 2000.
- Brealey, Myers & Allen. _Principles of Corporate Finance_. 13ª ed., McGraw-Hill, 2020. Cap. 8 (CAPM), Cap. 9 (Risco e Retorno).
- CFA Institute Curriculum — Level II, _Portfolio Management_. 2024.
- Cohen, Jacob. _Statistical Power Analysis for the Behavioral Sciences_. 2ª ed., Lawrence Erlbaum, 1988.
- Damodaran, Aswath. _Investment Valuation_. 3ª ed., Wiley, 2012.
- Fama, Eugene F. e French, Kenneth R. "Common risk factors in the returns on stocks and bonds". _Journal of Financial Economics_, 1993.
- Hull, John C. _Options, Futures, and Other Derivatives_. 9ª ed., Pearson, 2014.
- Lintner, John. "The Valuation of Risk Assets and the Selection of Risky Investments in Stock Portfolios". _Review of Economics and Statistics_, 1965.
- Sharpe, William F. "Mutual Fund Performance". _Journal of Business_, 1966.
- Sharpe, William F. "The Sharpe Ratio". _Journal of Portfolio Management_, 1994.
- Vanguard Research. _Best Practices for Portfolio Rebalancing_. 2010.

### Fontes de dados

- BRAPI — `brapi.dev`
- BACEN SGS — `api.bcb.gov.br`
- Tesouro Transparente — `tesourotransparente.gov.br`
- CVM Dados Abertos — `dados.cvm.gov.br`
- B3 — `b3.com.br`

---

## 10. Limitações conhecidas

A transparência aqui é estratégica: o consultor que fala da limitação antes do cliente perguntar transmite competência.

### Cálculos

- **Marcação a mercado em Tesouro Direto:** o valor exibido reflete o PU oficial do dia, **mesmo quando o PU caiu abaixo do que foi pago** — alta de juros futuros derruba o preço de Tesouro IPCA+ e Prefixado de duration longa, e o cliente precisa enxergar isso para tomar decisão informada. Vide §4.4. Se a posição for marcada na curva (não MTM), é só porque a série de PU não chegou ainda.
- **Marcação na curva em emissão bancária (CDB/LCI/LCA):** seguimos a convenção do mercado para não-mercáveis: o valor compõe pela taxa contratada, sem flutuação por curva de juros futura. Esses títulos só viram MTM se o investidor for tentar revender antes do vencimento via mercado secundário (raro no varejo).
- **Crédito privado (CRI/CRA/debêntures):** **ainda não temos integração** com fonte de PU secundário (ANBIMA Data ou B3). Esses ativos são exibidos com marcação na curva pela taxa contratada — aproximação que pode divergir do preço real de venda em janelas de stress de mercado. Roadmap aberto.
- **Final de semana:** o cálculo de patrimônio histórico considera apenas dias úteis. Sábados e domingos congelam o último valor. Isso afeta a apresentação visual (gráfico tem "platôs" no fim de semana) mas não a precisão.
- **Anualização de janelas curtas:** janelas < 12 meses não são anualizadas. Não exibimos "rentabilidade equivalente anual" para 1 mês — seria estatisticamente irresponsável.

### Cobertura

- **Histórico de 24+ meses** é necessário para exibir Sharpe, Beta e correlação confiavelmente. Clientes recentes verão estes campos vazios ou marcados como "histórico insuficiente" até atingir o limite mínimo.
- **Fundos novos** podem aparecer no catálogo CVM sem cota imediata (sync semanal pode atrasar 1–7 dias). O sistema mostra a cota mais recente disponível.
- **Empresas em recuperação judicial** ou _delisted_: o BRAPI continua publicando o último preço conhecido. O cliente vê a posição "congelada" e o sistema sinaliza com `priceUpdatedAt` antigo.

### Imposto de Renda

- Ferramenta de **acompanhamento**, não geradora de DAA.
- **IRRF retido na fonte** não é deduzido — DARF projetado é ligeiramente sobre-estimado.
- **Day trade** fora do escopo.

### Atualização de dados

- BRAPI: 1 vez ao dia (07:10 UTC). Cliente que abre o app no fim do dia útil pode ver preços de ~12 horas atrás. Em casos críticos (cliente quer saber preço _agora_), o sistema busca live na BRAPI com timeout de 10s.
- BACEN: 1 vez ao dia (06:00 UTC). IPCA é divulgado pelo IBGE com ~10 dias de defasagem em relação ao mês de referência.

---

_Documento mantido em `docs/justificativa-valores-consultores.md`. Sugestões e correções são bem-vindas._
