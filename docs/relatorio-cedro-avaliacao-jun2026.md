# Relatório — Avaliação da API Cedro Crystal (market data)

> **Objetivo:** avaliar a Cedro Crystal como fonte de dados mais consolidada para
> tentar resolver o problema crônico de paridade com o Kinvo (proventos no
> pagamento, dedup de splits, série histórica longa). O relatório mostra (1) tudo
> que a API oferece e o que podemos usar, (2) para cada tipo de dado, quais fontes
> já temos hoje, e (3) a comparação dos dados depois de implementado.
>
> **Data:** 2026-06-25 (rev. 2026-06-30) · **Trial expira:** 2026-07-03 · **Status:**
> ✅ **login funcionando e captura ao vivo feita** (§5); root cause da auth resolvido (§6).

---

## 1. Visão geral

A **Cedro Crystal — Módulo SERVER** não é REST. É uma **API SOCKET** (Telnet sobre
TCP, porta **81**), conexão de texto persistente, mensagens em pares `:<índice>:<valor>`
e terminadores variáveis por comando (`!`, `E`, `END`). Dois modos: tempo real e
tempo diferido (delay por mercado).

- **Servidores:** `cd102.cedrotech.com` / `cd302.cedrotech.com` (ambos alcançáveis na 81).
- **Handshake:** após conectar (`Connecting...`), enviar 3 parâmetros — **Software Key**
  (a nossa é `cedro_crystal`, não vazia — ver §6), **Username**, **Password** — e aguardar
  `You are connected`.
- **Pacotes:** BASIC (SQT/GQT/GCH/NEM/GNA/PRT + erros E:1..E:19) e **Premium "Quant
  Inside"** (GCH/PRT/**GP**/**MQC**). Os comandos que resolvem nossas dores estão no Premium.

### Arquitetura de integração decidida

Socket persistente **não cabe em serverless** (Next/Vercel/Lambda). Mas GP/GCH/MQC
não precisam de stream: `connect → auth → comando → ler até terminador → desconectar`
(job curto). Integração ideal = **worker/CLI Node standalone** fora do request do Next,
acionado por cron ou sob demanda, gravando no mesmo banco que já usamos. Só o SQT
*subscribe* (cotação em streaming) exigiria um worker vivo permanente — e para cotação
o **snapshot** (`SQT <ativo> N`) já resolve.

O scaffolding deste relatório segue exatamente esse desenho: `scripts/cedro/cedroClient.ts`
(cliente TCP), `scripts/cedro/parsers.ts` (GP/GCH/SQT/MQC), `scripts/cedro/smoke.ts`
(harness de validação).

---

## 2. Comandos disponíveis e o que podemos usar

Legenda de prioridade para o nosso caso: ⭐⭐⭐ resolve dor crônica · ⭐⭐ útil · ⭐ baixa.

| Comando | O que faz | Pra nós | Uso |
| --- | --- | --- | --- |
| **GP** — Get Proventos | Proventos por ativo/mercado: tipo, valor, **data de início de pagamento**, data-ex, deliberação, **proporção antes/depois** (splits/grupamentos/bonificações), novo ticker (incorporação). Ordenável por data de pagamento (`DP`). | ⭐⭐⭐ | Resolve **dedup BRAPI+Yahoo**, **"provento no pagamento"** (metodologia Kinvo) e **split duplicado** (HFOF11 10:1). Alimenta `asset_dividend_history` (proventos) e `asset_corporate_actions` (eventos). |
| **GCH** — Get Candles History | Candles diário/semanal/mensal/intradiário, histórico longo, flag **`NP` "no proventos"** (controla ajustado × não-ajustado). | ⭐⭐⭐ | **Série 10y** com fonte única + controle explícito de ajuste de split/provento. Alimenta `asset_price_history`. Hoje juntamos COTAHIST+BRAPI+Yahoo e ajustamos no read; Cedro daria a série coerente de uma fonte só. |
| **MQC** — Market Quote Composition | Lista **todos os ativos** de um mercado (filtros por tipo/sub-tipo, ex.: `S 1124` = ETF renda fixa). | ⭐⭐ | Catálogo B3 + autocomplete do wizard. Complementa/valida `assets` (hoje via BRAPI `/quote/list` + CVM). |
| **SQT** — Subscribe Quote | Cotação: snapshot (`N`) ou streaming. ~160 índices (último, bid/ask, OHLC, máx/mín dia/sem/mês/ano, fundamentos) + **200-215 exclusivos Tesouro Direto** (PU, taxa, indexador, taxa compra/venda). | ⭐⭐ | Snapshot pode complementar/substituir BRAPI para cotação **e** dá campos que **hoje não temos** (bid/ask, OHLC, máx/mín por janela, Tesouro com PU/taxa direto). |
| **GQT** — Get Quote Trade | Negócios tick-a-tick do dia (preço, corretoras, agressor, condição do trade). | ⭐ | Não temos caso de uso (não fazemos book/tape). |
| **PRT/PRTC** — Player Ranking | Ranking de corretoras por ativo (volume compra/venda, agressão). | ⭐ | Sem uso atual. |
| **NEM/GNA/UNE** — Notícias | Agências e notícias (subscribe/histórico/corpo). | ⭐ | Fora de escopo. |
| **USQ/UQT/URT/QUIT** | Cancelamentos e encerramento. | infra | Controle de sessão. |

### Detalhe dos campos que importam

**GP (corpo):** `Ativo : DataHoraPagamento : Tipo : Valor : DataHoraDeliberação :
NegóciosEX(data/hora) : RelativoÀ : Descrição : IdEvento : ValorSubscrição :
ValorNominal : ProporçãoAntes : ProporçãoDepois : NegóciosCOM(data/hora) : NovoTicker`.
Tipos cobrem **Dividendo, Rendimento, JCP, Amortização, Subscrição, Grupamento,
Desdobramento De Ações, Incorporação, Bonificação Em Ativos/Dinheiro, Cisão,
Resgate Renda Fixa/Variável** e mais ~30 — bem mais granular que BRAPI/Yahoo.

**GCH (corpo):** `close : open : high : low : prevClose : nºnegócios : volumeQty :
volumeFin : YYYYMMDDHHMM : afterMarket`. Períodos: `1,2,3,5,15,30` (min), `D`, `1W`,
`1M`, `1Y`. **Flag `NP`** = série sem aplicação de proventos. Importante: a Cedro dá
OHLC completo — hoje só guardamos **fechamento**.

**SQT Tesouro (200-215):** PU (200), taxa/rentabilidade (201), código título (204),
nome do tipo (206), data emissão (208), taxa compra (211)/venda (212), indexador
(213/214), nome do título (215).

---

## 3. Para cada tipo de dado: Cedro × o que já temos

Arquitetura atual relevante: **runtime é DB-only** (`MARKET_DATA_DB_ONLY`), fetches
externos só em cron/backfill; precedência centralizada em
`src/services/pricing/sourcePrecedence.ts` — `MANUAL(0) → B3_COTAHIST/COINGECKO/TESOURO/CVM(1)
→ BRAPI(2) → YAHOO(3)`.

### 3.1 Proventos / dividendos (dividendo, JCP, rendimento FII, amortização)
- **Cedro:** GP — payment date nativa, data-ex, tipo granular, dedup pela fonte única.
- **Hoje:** BRAPI (primária, recente) → Yahoo (antigos). Serviço `dividendService.ts`,
  tabela `AssetDividendHistory` (unique `[symbol, date, tipo]`, `date`=pagamento,
  `dataCom`=ex). Dedup em memória por `(paymentDate, tipo)`. JCP com IRRF data-dependente
  (15%→17,5% LC 224). FII "Rendimento" isento.
- **Gap que a Cedro fecha:** BRAPI tem bug de `paymentDate: 0`; Yahoo de-ajusta por
  split; o casamento das duas exige heurística. GP traz pagamento + ex + tipo de uma fonte.

### 3.2 Eventos corporativos / splits (desdobramento, grupamento, bonificação, incorporação)
- **Cedro:** GP devolve o evento com **proporção antes/depois** explícita e novo ticker.
- **Hoje:** **Yahoo** (canônico p/ splits — BRAPI free não traz split), BRAPI (só
  bonificação/subscrição). `yahooCorporateActions.ts` + dedup em `corporateActionsDedup.ts`
  (clusteriza eventos a ≤15 dias e fator a ≤1%), tabela `AssetCorporateAction`
  (unique `[symbol, date, type]`, `factor`=multiplicador). **Só aplica** DESDOBRAMENTO/
  BONIFICAÇÃO/GRUPAMENTO; **INCORPORAÇÃO não é aplicada**.
- **Gap que a Cedro fecha:** depender de scraping do Yahoo é frágil (UA/anti-bot); a
  duplicação BRAPI+Yahoo gerou o bug do **HFOF11 10:1**. GP com proporção explícita
  remove a heurística de dedup e a fragilidade do scraping.

### 3.3 Candles / histórico de preço (OHLC diário, série longa, ajustado × não)
- **Cedro:** GCH com OHLC completo + flag `NP` para controlar ajuste.
- **Hoje:** guardamos **só fechamento** em `AssetPriceHistory` (unique `[symbol, date]`,
  com `source`). Composição: **COTAHIST** (2016-2020, oficial, **bruto**) + **BRAPI**
  (2021+, ajustado) + **Yahoo** (índices/câmbio, 20y) + **CoinGecko** (cripto, free=365d).
  No read, `splitAdjustRawRows()` normaliza o bruto dividindo pelos fatores de split
  posteriores (evita degrau-fantasma).
- **Gap que a Cedro fecha:** série coerente de **uma fonte** com ajuste controlado —
  ataca direto a anomalia de **ancoragem/ajuste** que mantém o resíduo ~1pp vs Kinvo.
  Bônus: ganharíamos OHLC (hoje inexistente).

### 3.4 Cotação atual
- **Cedro:** SQT snapshot — último, **bid/ask**, **OHLC**, máx/mín por janela, fundamentos.
- **Hoje:** **só último preço** (BRAPI). `brapiQuote.ts`; `Asset.currentPrice`;
  `MarketIndicatorCache` (IBOV/USD/BTC/ETH, TTL 15min). Sem bid/ask, sem OHLC snapshot.
- **Cedro adiciona:** bid/ask e OHLC que hoje não temos. (Cotação em si BRAPI já cobre.)

### 3.5 Catálogo / cobertura de mercado
- **Cedro:** MQC — lista completa por mercado/tipo/sub-tipo.
- **Hoje:** BRAPI `/quote/list` (ações/FII/ETF/BDR/unit) + CVM (fundos RCVM 175).
  Tabela `Asset`; autocomplete em `/api/assets`. Cron `brapi-sync/catalog`, `cvm-*`.
- **Cedro:** redundante com BRAPI+CVM, mas serve de validação cruzada.

### 3.6 Tesouro Direto
- **Cedro:** SQT campos 200-215 (PU, taxa, indexador) em tempo real/snapshot.
- **Hoje:** Tesouro Transparente (CSV oficial). `tesouroDiretoSync.ts`, tabela
  `TesouroDiretoPrice` (buyRate/sellRate, buyPU/sellPU/basePU; indexador embutido no
  `bondType`). Fonte oficial, rank 1.
- **Cedro:** redundante; o CSV oficial já é autoritativo. SQT só vale se quisermos
  intraday do Tesouro (não é o caso hoje).

### Resumo executivo do §3

| Tipo de dado | Cedro | Fonte atual | Veredito preliminar |
| --- | --- | --- | --- |
| Proventos | **GP** ⭐⭐⭐ | BRAPI→Yahoo | **Forte candidato a substituir** (uma fonte, payment date + ex + tipo) |
| Splits/eventos | **GP** ⭐⭐⭐ | Yahoo(+BRAPI) | **Forte candidato** (proporção explícita; mata dedup frágil e bug HFOF11) |
| Candles/série | **GCH** ⭐⭐⭐ | COTAHIST+BRAPI+Yahoo | **Avaliar substituir** (uma fonte + ajuste controlado; ataca resíduo Kinvo) |
| Cotação | SQT ⭐⭐ | BRAPI | Complementar (bid/ask, OHLC novos); BRAPI já basta no essencial |
| Catálogo | MQC ⭐⭐ | BRAPI+CVM | Validação cruzada; não substitui |
| Tesouro | SQT 200-215 ⭐ | Tesouro Transparente | Manter oficial; Cedro só p/ intraday |

---

## 4. Status da implementação (scaffolding)

Construído e versionado em `scripts/cedro/`:

- **`cedroClient.ts`** — cliente TCP: `connect()` com handshake (software-key vazia →
  username → password, detecção de prompt + fallback por tempo), `sendCommand(cmd, isDone)`
  com coleta até terminador, terminadores prontos (`bang`/`colonE`/`end`), tratamento de
  erros `E:1..E:19` (`CedroError`), `quit()`. Encoding `latin1` (textos ISO-8859-1).
- **`parsers.ts`** — `parseProventos` (GP, trata pares Data:Hora de 2 tokens),
  `parseCandles` (GCH → OHLC), `parseQuote` (SQT, mapa de índices 0-160 + atalhos +
  bloco Tesouro 200-215), `parseMqc`.
- **`smoke.ts`** — roda MQC + (SQT, GP, GCH ajustado, GCH NP) nos casos: **HFOF11**
  (split 10:1), **MXRF11** (FII mensal), **ITSA4** (JCP), **PETR4** (sanidade). Salva
  raw + parseado em `docs/cedro-captures/cedro-smoke-<data>.json`.
- **`.env.example`** — placeholders `CEDRO_HOST/PORT/USER/PASS/SOFTWARE_KEY` (creds reais
  só em `.env.local`, gitignored).

**Validação do protocolo:** handshake confirmado ao vivo e **autenticado com sucesso**
(`Connecting → Welcome → Username → Password → You are connected`). Ver §6 para o root
cause da auth.

### Como rodar
Credenciais no `.env` (gitignored): `CEDRO_HOST/PORT/USER/PASS/SOFTWARE_KEY`.
```bash
node --env-file=.env --import tsx scripts/cedro/smoke.ts
# um ativo só:  ... scripts/cedro/smoke.ts HFOF11
# debug do tráfego cru:  CEDRO_DEBUG=1 node --env-file=.env --import tsx ...
```
> ⚠️ `SOFTWARE_KEY=cedro_crystal` (não vazia) e **aspas na senha**: `CEDRO_PASS="socket#656"`
> — o `#` sem aspas é tratado como comentário pelo `--env-file` (ver §6).

---

## 5. Comparação dos dados (parte 3) — captura ao vivo 2026-06-30

Smoke rodado ao vivo em **2026-06-30** (`docs/cedro-captures/cedro-smoke-20260630.json`).
O que a Cedro entregou, por tipo de dado:

### 5.1 Proventos (GP) — ✅ entrega o que precisamos

| Ativo | Total | Composição (tipos) | Campos por linha |
| --- | --- | --- | --- |
| **HFOF11** | 110 | RENDIMENTO 97 · SUBSCRIÇÃO 12 · DESDOBRAMENTO 1 | pag, **com**, ex, deliberação, valor, tipo, hash |
| **MXRF11** | 137 | RENDIMENTO 132 · SUBSCRIÇÃO 5 | idem |
| **ITSA4** | 151 | JCP 98 · DIVIDENDO 40 · SUBSCRIÇÃO 5 · BONIFICAÇÃO 4 · LEILÃO FRAÇÕES 4 | idem |
| **PETR4** | 122 | DIVIDENDO 46 · RENDIMENTO 38 · JCP 31 · ATUALIZAÇÃO 7 | idem |

Cada provento traz **data-pagamento, data-com e data-ex separadas** (verificado:
RENDIMENTO HFOF11 com 29/05, ex 01/06, pag 15/06) + **tipo granular** (JCP distinto de
dividendo distinto de rendimento) **de uma única fonte**. É exatamente o insumo da
metodologia "provento no pagamento" e o que hoje exige casar BRAPI (recente) + Yahoo
(antigo) com heurística de dedup por `(paymentDate, tipo)`.

**Veredito:** confirma o §3.1 — GP é forte candidato a **substituir** BRAPI→Yahoo em
`asset_dividend_history`. Diferença prática: `dataCom` < `dataEx` nativos eliminam a
inferência "ex = com + 1 pregão".

### 5.2 Eventos corporativos / splits (GP) — ✅ resolve o bug do HFOF11

- **HFOF11 desdobramento:** **um único evento** — pag 2025-05-13, ex 2025-05-12, com
  2025-05-09, `valor=900` (= **+900% ⇒ split 1:10**). Hoje BRAPI+Yahoo **duplicavam** esse
  evento (fator dobrado) — a fonte única da Cedro mata a duplicação na raiz.
- **ITSA4 bonificações:** série anual coerente (2022-2025), `valor` = **% de cotas**
  bonificadas (2%, 5%, 5%…) com data-com/ex/pag.
- **Encoding do fator:** o fator efetivo está em **`valor` (percentual)**, não no par
  bruto `proporçãoAntes:Depois` (que vem `1:0` no desdobramento e vazio na bonificação).
  A integração normaliza `valor%` → multiplicador.

**Veredito (revisado pelo §5.7):** a Cedro **tipa melhor** (bonificação ≠ split) e o
fator cross-valida, MAS o diff contra prod mostrou que **a Cedro perdeu o split 10:1 do
MXRF11/2017** (real, confirmado por COTAHIST). Logo **não substitui** o Yahoo para
eventos — o desenho é **união Cedro ∪ Yahoo** (Cedro p/ tipo/data-com correto, Yahoo p/
cobertura de eventos FII antigos).

### 5.3 Candles / série histórica (GCH) — ✅ ajustado; ⚠️ não-ajustado indisponível no trial

| Ativo | Candles (ajustado, diário) | Cobertura | OHLC |
| --- | --- | --- | --- |
| **HFOF11** | 2.071 | 2018-03-01 (4,23) → 2026-06-30 (6,56) | completo |
| **MXRF11** | 3.098 | 2014-01-02 (2,53) → 2026-06-30 (9,73) | completo |
| **ITSA4** | 3.099 | 2014-01-02 (2,04) → 2026-06-30 (13,44) | completo |
| **PETR4** | 3.099 | 2014-01-02 (4,02) → 2026-06-30 (37,81) | completo |

Série longa, **coerente e de uma só fonte** (hoje costuramos COTAHIST 2016-2020 +
BRAPI 2021+ + Yahoo) e com **OHLC completo** — hoje só guardamos fechamento.

**⚠️ Limitação do trial:** a flag **`NP` ("no proventos") retorna só o candle mais
recente**, não a série histórica não-ajustada (testadas 5 variantes ao vivo; `NP` no
fim dá `E:10`). Ou seja, **não dá pra inspecionar o salto bruto do split via Cedro**
neste plano — só a série ajustada. Isso enfraquece o uso da Cedro para auditar
ancoragem/ajuste (o resíduo ~1pp vs Kinvo); a série ajustada, porém, é utilizável.

**Veredito (revisado pelo §5.7):** o diff confirmou que o **GCH default é ajustado por
SPLIT + PROVENTOS** (total-return-like — HFOF11 4,23 em 2018 vs nominal R$ 100), o que
**não bate** com o `asset_price_history` nominal. O **nominal** viria do `NP`, indisponível
historicamente no trial. Logo **não é drop-in** para nossa série; prod (COTAHIST 2016+)
já cobre a profundidade. Cedro agrega só 2014-2015 + OHLC — útil, mas não prioritário.

### 5.4 Cotação (SQT) — ✅ funciona

SQT snapshot retornou último, fechamento anterior e descrição corretamente (MXRF11
9,73/9,72 "FII MAXI REN"; ITSA4 13,44/13,52 "ITAUSA"; PETR4 37,81/38,14 "PETROBRAS";
HFOF11 6,57 na 1ª captura). Complementa BRAPI com bid/ask e OHLC; cotação essencial
BRAPI já cobre. **Veredito §3.4 mantido (complementar).**

### 5.5 Catálogo (MQC) — ⚠️ volumoso e instável no terminador

MQC Bovespa retornou **~228 mil entradas** (1ª captura) — mas inclui **toda a cadeia de
opções/strikes** (`A1AP34SL91`, `AAPLF66`, `ABCBF200E`…), não só o universo à vista.
Para catálogo útil precisa dos **filtros por tipo/sub-tipo** do MQC (ex.: `S 1124`).

**Bug encontrado (terminador):** em re-execução o MQC veio com **~85 mil** (contagem
inconsistente) e **vazou sobras pro SQT seguinte** (o snapshot do HFOF11 saiu poluído
com linhas `C:BOVESPA:…`). Causa: `doneOn.colonE` (`/:E$/`) não é robusto para a
resposta gigante do MQC — fecha cedo/tarde e deixa resíduo no buffer do próximo comando.
**Ação:** terminador de MQC por linha exata `C:<mercado>:E` + filtros de mercado; e
drenar/limpar buffer entre comandos. (Não afeta GP/GCH, que são estáveis.)

**Veredito §3.5 mantido (validação cruzada, não substitui)** — e com ressalva de
robustez do harness para MQC.

### 5.6 Resumo da captura

| Tipo | Evidência ao vivo | Veredito |
| --- | --- | --- |
| Proventos (GP) | 110-151 proventos/ativo, pag+com+ex+tipo, fonte única | ✅ **substituir** BRAPI→Yahoo |
| Splits (GP) | tipa correto + fator cross-valida, mas **perdeu o split MXRF11/2017** (§5.7) | ⚠️ **união Cedro ∪ Yahoo** (não substitui) |
| Candles (GCH) | default = ajustado split+provento (≠ nosso nominal); **NP sem histórico no trial** | ⚠️ **não drop-in**; prod COTAHIST já cobre |
| Cotação (SQT) | snapshot OK (último/fech.ant/descrição) | complementar |
| Catálogo (MQC) | 228k/85k entradas c/ opções; terminador instável | validação cruzada; hardening pendente |

### 5.7 Diff quantitativo — dev + **prod (RDS)** — 2026-06-30

Rodado via `scripts/cedro/diff-db.ts` (dev/Neon) e **confirmado contra prod (RDS, via
SSM, read-only)** para o que o dev não tinha (série COTAHIST profunda + nominal). O diff
**reverteu 2 dos 3 vereditos preliminares** — ver abaixo.

**(a) Eventos corporativos — fator bate, Cedro tipa melhor, mas ❗ Cedro PERDEU um split**

| Ativo / data | Cedro | Nosso (fonte) | Veredito |
| --- | --- | --- | --- |
| HFOF11 · 2025-05-12 | DESDOBRAMENTO, valor 900% | DESDOBRAMENTO factor 10 (Yahoo) | ✅ bate (1:10); evento único dos dois lados |
| ITSA4 · 2022-11 | BONIFICAÇÃO 10% | DESDOBRAMENTO 1.10 (Yahoo) | ⚠️ fator bate, **tipo diverge** — Cedro correto |
| ITSA4 · 2023/2024 | BONIFICAÇÃO 5% | DESDOBRAMENTO 1.05 (Yahoo) | idem |
| ITSA4 · 2025-12 | BONIFICAÇÃO 2% | DESDOBRAMENTO 1.02 (Yahoo) | idem |
| MXRF11 · 2017-05-17 | — (**nenhum**) | DESDOBRAMENTO factor 10 (Yahoo) | ❗ **split é REAL** (prod COTAHIST: nominal **R$ 89,11** dez/2016 → **R$ 9,98** jun/2017) — **Cedro não reporta o evento** |
| PETR4 · 2014+ | — | — | ✅ consistente (sem evento no período) |

> **Achado-chave (reverte o §5.2):** a divergência do MXRF11 **não era erro do Yahoo** —
> o split 10:1 de 2017 é **real**, confirmado pelo nominal COTAHIST de prod. A Cedro
> **ajusta o candle** internamente (série suave) mas **não expõe o evento via GP** para
> este FII. Ou seja, **GP não é completo para eventos** (perdeu um split de FII pré-2018).
> → para splits, **união Cedro ∪ Yahoo**, não substituição.

Mesmo assim, dois pontos positivos confirmados: **(1)** o encoding **`fator = 1 + valor/100`**
fica cross-validado contra os fatores do Yahoo (Cedro 900%→×10; 10%→×1.10; 5%→×1.05;
2%→×1.02); **(2)** a Cedro **tipa corretamente** as bonificações anuais da ITSA4 que o
Yahoo rotula como "desdobramento" — relevante para IR/custo de aquisição.

**(b) Proventos — Cedro mais completo no período + data-com nativa** (prod ≈ dev)

| Ativo | Cedro (2014+) | Nosso (prod) | data-com preenchida |
| --- | --- | --- | --- |
| HFOF11 | 110 | 51 (Yahoo+BRAPI) | parcial (Yahoo não traz com) |
| MXRF11 | 137 | 109 (BRAPI) | 109/109 |
| ITSA4 | 151 | 207 (BRAPI, desde 1996) | 207/207 |
| PETR4 | 122 | 152 (BRAPI, desde 1996) | 152/152 |

Para **FIIs** (HFOF11), a Cedro tem ~2× mais proventos no período e data-com em todos —
onde hoje dependemos do Yahoo (sem data-com). Para ações de histórico longo a contagem
nossa é maior só pela janela (BRAPI vai a 1996; a captura Cedro usou `DESDE=2014`).

**(c) Série de preço — agora contra PROD (que tem a profundidade)**

| Ativo | Cedro (GCH default) | Prod `asset_price_history` (nominal) |
| --- | --- | --- |
| HFOF11 | 2.071 candles (2018→); **4,23** em 2018 | 2.071 (2018→); **nominal R$ 100** em 2018 (COTAHIST) |
| MXRF11 | 3.098 (2014→); 2,53 em 2014 | 2.604 (2016→); nominal **R$ 83-89** em 2016 |
| ITSA4 | 3.099 (2014→) | 2.604 (2016→); COTAHIST→BRAPI |
| PETR4 | 3.099 (2014→) | 2.605 (2016→); COTAHIST→BRAPI |

> **Mismatch de semântica (reverte o §5.3):** o **GCH default da Cedro é ajustado por
> SPLIT + PROVENTOS** (total-return-like) — HFOF11 marca **4,23** em 2018 vs **nominal
> R$ 100** (≈24×: 10× do split + ~2,4× de proventos descontados). Nosso
> `asset_price_history` guarda **nominal** (COTAHIST bruto, split-adjustado só no read).
> O nominal da Cedro viria do `NP` — que **no trial só dá o candle atual**. Logo, **o GCH
> do trial não é drop-in** para nossa série; prod já tem a profundidade (COTAHIST 2016+,
> fonte oficial) e a Cedro só agregaria 2014-2015 + OHLC (com a ressalva do ajuste).

**Conclusão revisada do diff (após prod):**
- **Proventos (GP):** ganho real e sólido — mais completo p/ FII + data-com nativa. ✅
- **Splits/eventos (GP):** Cedro **tipa melhor** e **cross-valida o fator**, MAS **perdeu
  o split 10:1 do MXRF11/2017** → **não é completo**; manter **Cedro ∪ Yahoo**. ⚠️
- **Série (GCH):** **não substitui** a nossa no trial (ajuste por provento + `NP` sem
  histórico); prod COTAHIST já cobre a profundidade. ⚠️

---

## 6. ✅ Autenticação: root cause resolvido (2026-06-30)

O `Invalid Login.` de 24/jun **não era restrição de IP** (hipótese anterior, descartada).
Eram **duas causas somadas**:

1. **Software Key vazia.** O cliente enviava chave vazia (o PDF diz "se não tiver,
   `[ENTER]`"), mas a conta **tem** software key: **`cedro_crystal`** (campo "Chave" no
   Cedro Crystal). Com a chave vazia → `Invalid Login.`
2. **`#` na senha truncado pelo `--env-file`.** O parser de `--env-file` do Node trata
   `#` como início de comentário, então `CEDRO_PASS=socket#656` virava `socket` → login
   inválido. **Correção: aspas** — `CEDRO_PASS="socket#656"`.

Credenciais finais (em `.env`, gitignored): host `cd102.cedrotech.com`, porta 81, user
`myfinance`, pass `socket#656`, **key `cedro_crystal`**. Autenticação confirmada ao vivo
(`You are connected`) e captura realizada (§5).

---

## 7. Pendência comercial/jurídica (não esquecer)

- **Licenciamento B3:** redistribuir cotação B3 ao usuário final exige licença de market
  data. Confirmar se o contrato Cedro inclui **redistribuição** (display non-pro) ou se
  licenciaríamos à parte.
- **Modelo de cobrança:** flat × por req/ativo/usuário (BRAPI hoje é flat), **rate limits**,
  limite de assinaturas simultâneas (erro E:18), **SLA**, e número de conexões por usuário
  (erro E:6/E:8 derrubam a conexão anterior — relevante p/ worker único).

---

## 8. Recomendação preliminar

A captura ao vivo + o **diff contra prod** (§5.7) refinaram a leitura. O ganho real e
inequívoco é em **proventos (GP)**: pagamento + data-com + data-ex + tipo granular, de
fonte única, mais completo para FII e com data-com onde hoje o Yahoo não tem. Já em
**splits** e **série**, o diff **derrubou a tese de substituição**: a Cedro **perdeu o
split 10:1 do MXRF11/2017** (real, confirmado por COTAHIST de prod) — então para eventos
é **união com o Yahoo**, não troca; e o **GCH default é ajustado por split+provento**
(não bate com nosso preço nominal; o `NP` nominal não dá histórico no trial), com prod
COTAHIST já cobrindo a profundidade.

**Veredito:** **adotar a Cedro como fonte primária de PROVENTOS** (GP) é o passo de maior
retorno; **eventos** via Cedro só somando ao Yahoo; **série de preço** não justifica troca
no trial atual. Reavaliar GCH se o plano pago liberar `NP` com histórico.

**Próximos passos, em ordem:**
1. ✅ ~~Destravar auth~~ · ✅ ~~smoke + §5~~ · ✅ ~~diff quantitativo (dev + prod) → §5.7~~.
2. **Investigar a divergência MXRF11/2017 fechada** (split real; Cedro não expõe via GP)
   — decidir regra de **união Cedro ∪ Yahoo** para `asset_corporate_actions`.
3. Hardening do harness: terminador do MQC por linha exata + filtros de mercado; drenar
   buffer entre comandos (o SQT pós-MQC saiu poluído).
4. Piloto de adoção: promover `scripts/cedro/` a worker/cron e mapear **GP →
   `asset_dividend_history`** (proventos, com data-com nativa) respeitando `sourcePrecedence`.
5. Resolver pendência comercial/jurídica (§7) antes de produção.
