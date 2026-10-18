# Runbook — dados SEC de Stocks e REITs (fatia A)

Jobs: `sec-cadastro`, `sec-fundamentos`, `cotacoes-eua` (código em `src/services/analiseAtivos/eua/`).
Todas as telas EUA seguem desligadas (`ANALISE_ATIVOS_EUA_HABILITADO`, `ANALISE_ATIVOS_EUA_PRECO_HABILITADO`);
os jobs de dados não dependem delas (só o `cotacoes-eua` exige a de preço).

## Regras que o código garante

- SEC: User-Agent fixo `MyFinance suporte@appmyfinance.com.br`, ≤ 4 req/s (token bucket, inclusive nas
  novas tentativas), gzip, backoff em 429/503 com `Retry-After`. Só `www.sec.gov` e `data.sec.gov`.
- Universo por CIK (decisão de 17/10): stocks com free float de capa ≥ US$ 2 bi para entrar, saem abaixo
  de US$ 1,6 bi; REITs de patrimônio com o mesmo corte (`UNIVERSO_EUA_PADRAO` / criteria_params v3).
- Ticker sempre do arquivo da SEC (`company_tickers_exchange.json`); overrides por CIK
  (`overridesEua.ts`) só classificam, incluem ou excluem. Outros tickers do CIK só entram se forem
  classe de ação do principal (GOOGL/GOOG, BRK-B/BRK-A); preferenciais, ETNs e dívida listada ficam fora.
- Sanidade do float: float > 40× o ativo total, ou > US$ 1 tri sem ativo/ações para confirmar →
  `escala_suspeita`; float ÷ ações fora de [US$ 0,5; 100 mil] → `preco_implicito_absurdo`. Ambos = fora
  do universo, com alerta.
- Fundamentos: FY de 350–380 dias de 10-K/10-K/A/10-KT, último arquivado vence, ano pelo término
  (jan/fev = ano anterior), versão +1 só quando o FY muda. EBITDA gravado como `ebit` (3 degraus,
  flags `ebitda_pre_ir`/`ebitda_lucro`) + `depreciacaoAmortizacao`; dívida bruta total em
  `dividaBrutaLp` (`dividaBrutaCp` = null; sem conceito = null). Desdobramento e ações informadas em
  mil/milhão por engano são corrigidos (`sourceConcept.ajusteDesdobramento`).
- Balanço (instante) do 10-K do próprio exercício; sem nenhum passo dele, o comparativo do 10-K
  seguinte; nunca um 10-K mais tardio. Erro de escala ≥ 100× contra o comparativo do 10-K seguinte
  → vale o comparativo (`sourceConcept.escalaCorrigida`, TSLA 2016); passo de dívida < 1% de outro
  passo na mesma data (zero incluído) = ausente (`sourceConcept.passoDescartado`, ORCL 2022, AMD
  2021); caixa por `CashCashEquivalentsAndShortTermInvestments` deixa as aplicações null
  (`'incluidas_no_caixa'`, CAT 2016). Essas regras **mudam estados de critérios**: comparar antes e
  depois (ATIVACAO.md §3.2).

## Carga inicial em produção (cada escrita com o OK do Wellington, pelo runner)

Pré: migration `20261017120000_analise_ativos_eua` aplicada (fatia 0) e deploy desta branch.

```bash
cd /opt/myfinance/current
J='sudo -u myfinance env MALLOC_ARENA_MAX=2 NODE_OPTIONS=--max-old-space-size=256 node --env-file=/etc/myfinance/app.env --import tsx'

# 1. cadastro e universo (1ª carga ≈ 1.500 submissions ≈ 6,5 min; dry-run primeiro)
$J scripts/analise-ativos/rodar-job.ts sec-cadastro --sem-aplicar --prazo-s=590
$J scripts/analise-ativos/rodar-job.ts sec-cadastro --prazo-s=590

# 2. fundamentos (companyfacts por CIK; ≈ 7 min; dry-run conta sem gravar)
$J scripts/analise-ativos/backfill-sec-fundamentos.ts
$J scripts/analise-ativos/backfill-sec-fundamentos.ts --apply

# 3. cobertura por critério na janela 5 (só leitura) — conferir as metas antes de seguir
$J scripts/analise-ativos/relatorio-cobertura-eua.ts --saida=/tmp/cobertura-eua.txt
```

Metas (desenho.json → fatias[A].criterios_aceite): stocks não financeiras ≥ 90% em ebitda e fcl e
≥ 85% em dl; REITs ≥ 85% em dl; ≥ 95% dos CIKs com receita e lucro em 10 de 11 anos. Abaixo disso o
relatório lista os campos/anos faltantes — perguntar antes de ligar as telas.

Depois: criterios-eua `--versao-params=3` em dry-run, seed da v3, criterios-eua + quadro-eua e o
`relatorio-criterios --comparar` do BR (fatia B), e só então descomentar os crons.

### Caminho alternativo: companyfacts.zip

Para recarga completa ou máquina sem saída para a SEC: baixar à parte (fora do repositório)
`https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip` (~1,4 GB) para `/tmp` e rodar
`backfill-sec-fundamentos.ts --zip=/tmp/companyfacts.zip [--apply]` — lê entrada por entrada em
streaming, sem rede no processamento. zip64 não é suportado (erro `zip64_nao_suportado`; aí usar o
caminho padrão).

## Crons (template do Lightsail, COMENTADOS até a carga)

```
#30 3 * * 0 root /usr/local/bin/myfinance-job.sh sec-cadastro      # domingo, incremental
#25 11 * * * root /usr/local/bin/myfinance-job.sh eua-diario       # 08:25 BRT (fatia B encadeia)
#30 22 * * 1-5 root /usr/local/bin/myfinance-job.sh cotacoes-eua   # só com a chave de preço
```

O `eua-diario` (fatia B) encadeia `sec-fundamentos` (incremental pelo `form.AAAAMMDD.idx` desde o
cursor gravado em `AnaliseJobRun.detalhes.cursor`; 403/404 do índice = fim de semana/feriado) →
`criterios-eua` → `quadro-eua`.

## Medições (DEV, amostra de 65 CIKs, runner real)

| job                                 | duração    | rssPicoMb |
| ----------------------------------- | ---------- | --------- |
| sec-cadastro (1ª carga da amostra)  | 24,7 s     | 215       |
| sec-cadastro (incremental)          | 8,5–10,7 s | 195–207   |
| backfill:sec-fundamentos (62 CIKs)  | 23,2 s     | 198       |
| sec-fundamentos (30 CIKs pendentes) | 11,4 s     | 235       |

## Conhecidos

- AVB (CIK 915912): a SEC não publica ticker (fora do `company_tickers_exchange.json` e `tickers: []` no
  submissions) → fora (`sem_bolsa`) com o alerta `override_sem_ticker`; entra sozinho quando a SEC listar.
- XOM: a holding nova (CIK 2115436) não tem 10-K; fundamentos e float vêm do CIK 0000034088.
- HHH: CIK novo desde 2023 (histórico curto); a fusão de dois CIKs não é suportada.
- `ANALISE_EUA_AMOSTRA_CIKS` (só DEV) restringe o sec-cadastro aos CIKs listados — nunca no app.env de prod.
