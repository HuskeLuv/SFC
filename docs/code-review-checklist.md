# Checklist de Code Review

Itens não-óbvios que pegamos repetidamente em reviews. Mantenha como leitura
obrigatória antes de aprovar PRs.

## Formatação numérica

**Regra**: qualquer valor numérico renderizado pro usuário **DEVE** passar por
um formatador antes de virar string. Float JS sem formatação produz lixo do
tipo `31210.000000000004` (caso real do bug #06).

### Padrões aceitos

- Moedas: `formatCurrency(value)` (helper local) ou
  `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Percentuais: `formatPercentage(value)` ou
  `value.toFixed(2) + '%'`
- Quantidades inteiras: `value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })`
- Quantidades decimais: `value.toFixed(N)` com N entre 2-6 dependendo do contexto

### Padrões a recusar em review

- Template strings cruas com número: `` `R$ ${valor}` ``, `` `${pct}%` ``
- `value.toString()` ou string-coercion implícita: `String(value)`, `'' + value`
- Concatenação direta em JSX: `<span>R$ {valor}</span>` quando `valor` é float
- Resposta de API que devolve número sem arredondar (use `Math.round(n * 100) / 100`)

### Onde principalmente vigiar

- Centro de gráficos (donut/pizza) — onde o `formatter` do ApexCharts não pega
- Cards de resumo (`SummaryCard`, `MetricCard`)
- Tabelas de detalhamento
- Headers de instituição/posição

## Mutações de portfólio

Qualquer endpoint que toca `StockTransaction` ou `Portfolio` precisa:

1. Chamar `recalculatePortfolioFromTransactions` (PATCH/DELETE) ou pelo
   menos `invalidatePortfolioSnapshots` (POST de aporte/resgate) pra evitar
   série TWR/MWR contaminada (bug #02).
2. Sincronizar `FixedIncomeAsset.investedAmount` quando alterar
   `Portfolio.totalInvested` em RF (bug #15 residual).
3. Aplicar `AssetCorporateAction` quando relevante (bug #01 amarelo).

## Asset.type, source e classificação

- Mudanças em `classifyByName` em `brapiSync.ts` devem ter teste
  cobrindo word-boundaries (evitar matches falsos tipo "unity" → "Units").
- Filtros que listam ativos por `Asset.type` devem usar as constantes em
  `src/lib/fundoTypes.ts` (`FUNDO_TYPES_ALL`, `FUNDO_TYPES_AGRUPADOS`,
  etc.) em vez de string array inline — senão regressões aparecem quando
  um novo subtipo é adicionado.

## Datas e timezones

- `new Date(year, month, day)` é **local midnight** — gera duplicatas
  quando o servidor roda em fusos diferentes (caso do bug #01 amarelo,
  asset_corporate_actions). Use `Date.UTC(year, month, day)` para
  timestamps determinísticos.
- Para serializar com `toLocaleDateString('pt-BR')`, passe
  `{ timeZone: 'UTC' }` quando a data vem do DB como UTC midnight —
  sem isso, BRT (-3) shifta para o dia anterior.

## Tipos de retorno de API

Type-asserts em componentes que consomem JSON do backend são fonte
recorrente de bug (caso bug #08: `instituicao: string` quando o backend
retorna `{ id, nome }`). Sempre cruzar a interface declarada no
componente com o que o handler de fato devolve antes de aprovar.

## CSV/import de dados externos (BRAPI/CVM/Tesouro)

- Sempre validar `longName`/`shortName` antes de aceitar (BRAPI manda
  vazio intermitentemente — caso bug #07).
- Tipos não documentados (ex.: `CIS RED CAP` da BRAPI) devem ser
  explicitamente filtrados em allowlists, não em denylists.

## Testes

- Cobertura mínima esperada para serviços novos: 50% statements.
- Mutations Prisma em testes: sempre passar pelo mock factory de
  `src/test/mocks/prisma.ts` em vez de inline `vi.fn()` espalhados.
- `vitest run` no PR; CI roda automático mas é bom conferir local
  porque o suite é grande e demora.
