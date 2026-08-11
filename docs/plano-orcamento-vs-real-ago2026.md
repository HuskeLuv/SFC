# Plano — Seção "Orçamento vs Real" no Fluxo de Caixa

> Baseado na planilha `Orçamento vs REAL MENSAL ATUALIZADO OUT 2022 - Copia.xlsx` (Wellington, ago/2026).
> Status: IMPLEMENTADO (branch `feat/orcamento-vs-real`, 11/08/2026). Decisões fechadas com o usuário:
> (1) Real padrão = todas as células ("Lançado"), com toggle "Consolidado" = só células pintadas
> de Pago/Recebido; (2) metas só para despesas + investimentos, como a planilha; (3) meta por
> grupo/subgrupo de despesa, no grão da partição disjunta (filhos de Despesas Fixas + Despesas
> Variáveis + grupos custom). F4 (backlog) segue válida.

## 1. O que a planilha faz

Aba **"Orçamento vs Real (Mensal)"**: um resumo mensal por categoria com 4 colunas —
`Categoria | Orçamento | Real | Diferença` — onde:

- **Categorias** espelham os grupos do fluxo de caixa (Habitação, Transporte, Saúde, Desp. Pessoais, Lazer, Desp. Financeiras, Agradecimentos, Despesas Empresa, Planej. Financeiro, Educação, Despesas Variáveis).
- **Orçamento** = meta mensal digitada pelo usuário por categoria.
- **Real** = `SUMIF` das transações do mês na categoria.
- **Diferença** = `Orçamento − Real` (positivo = sobrou, negativo = estourou).
- Linha especial **Investimentos** = meta calculada como **% da renda** (`10% × R$ 7.500 = R$ 750` no exemplo), não como valor fixo.
- Linha **Total** soma orçado e real.
- Espaço reservado no topo para gráfico.

Objetivo declarado: visão resumida dos gastos + definição e acompanhamento rápido de metas.

## 2. Mapeamento planilha → app

| Planilha                   | App hoje                                                                                    | Gap                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Categorias                 | Subgrupos de `CashflowGroup` (hierarquia grupo→subgrupo→item)                               | Nenhum — já existem                                                |
| Real (SUMIF)               | `aggregateCashflow()` já entrega `groupTotals` (12 meses) e `groupAnnualTotals`             | Precisa variante filtrada por **status realizado** (cor da célula) |
| Orçamento                  | **Não existe** meta no domínio cashflow                                                     | Novo model                                                         |
| Investimentos % renda      | Linha Aporte/Resgate automática (`computeInvestimentosPorMes`) dá o real; % alvo não existe | Campo de meta percentual                                           |
| Diferença / acompanhamento | —                                                                                           | UI nova                                                            |

Fato central do domínio: `CashflowValue` tem **uma célula por (item, ano, mês)** e o status previsto/realizado é a **cor** (`black`=Pagar/Receber, `green`=Recebido, `red`=Pago, `blue`=Futuro, `yellow`=Cartão — `src/utils/cashflowColorLegend.ts`).

## 3. Decisões de design (com recomendação)

### 3.1 Semântica do "Real" — **PONTO EM ABERTO**

- **(A) Recomendada:** Real = soma de **todas** as células do mês (como a planilha, que soma toda transação lançada). Simples, consistente com o resto da tabela (`aggregateCashflow` não filtra cor) e não pune quem esquece de pintar.
- (B) Real = só células pintadas como realizadas (`red`/`green`/`yellow`). Mais fiel ao "aconteceu de fato", mas meses inteiros ficam zerados se o usuário não pintar.
- Meio-termo possível (fase 2): coluna extra "Realizado (pago)" ao lado do "Lançado".

### 3.2 Nível da meta

Meta por **grupo/subgrupo** (`CashflowGroup`), não por item. É o grão da planilha e evita uma tela de configuração com 80 linhas. Subgrupos de despesa (Habitação, Transporte…) são as "categorias"; itens somam para o subgrupo via `groupTotals` que já existe.

### 3.3 Granularidade temporal

**Uma meta mensal por (categoria, ano)** — um único valor que vale para os 12 meses, como na planilha. Sem override por mês na v1 (o model já deixa espaço, ver §4). Botão "copiar metas do ano anterior".

### 3.4 Onde vive a seção

A página `/fluxodecaixa` é uma planilha full-viewport sem abas. Proposta: **seletor de pílulas** no topo — `Planilha | Orçamento` — com `?modo=` na URL, seguindo o padrão de `src/components/planejamento/PlanejamentoFinanceiro.tsx`. O modo Orçamento renderiza a seção nova no lugar da tabela; o ano continua vindo do `CashflowYearContext` (`?ano=`).

### 3.5 Investimentos

Linha especial com `tipoMeta='percentual'`: meta do mês = `% × entradas do mês` (entradas de `aggregateCashflow.entradasByMonth`); real do mês = total da linha Aporte/Resgate (`GET /api/cashflow/investimentos`, campo `totaisPorMes`). Diferença invertida na leitura: investir **mais** que a meta é verde.

## 4. Modelo de dados

```prisma
model CashflowOrcamento {
  id        String        @id @default(cuid())
  userId    String
  groupId   String?       // null = linha especial (ex.: investimentos)
  tipo      String        @default("grupo") // 'grupo' | 'investimentos'
  year      Int
  tipoMeta  String        @default("valor") // 'valor' | 'percentual'
  valor     Decimal       @db.Decimal(15, 2) // R$ mensal OU percentual (0-100)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  user  User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  group CashflowGroup? @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([userId, year, tipo, groupId])
  @@index([userId, year])
}
```

Notas:

- `groupId` referencia o grupo **efetivo** do usuário (template ou override — mesma regra do resto do cashflow; se o usuário personalizar um grupo template depois de criar a meta, a rota de update de grupo deve migrar a meta junto, como já faz com `CashflowValue`).
- `onDelete: Cascade` no grupo: apagar categoria apaga a meta (metas são baratas de recriar).
- Sem coluna `month` na v1; se um dia precisar de override por mês, adiciona-se `month Int?` à unique.

## 5. Backend

### Serviço puro — `src/services/cashflow/orcamentoVsReal.ts`

```ts
buildOrcamentoVsReal({ groups, orcamentos, investimentosTotaisPorMes, entradasByMonth })
  → {
      categorias: [{ groupId, nome, meta, realPorMes[12], realAnual,
                     diferencaPorMes[12], percentConsumidoAno }],
      investimentos: { percentMeta, metaPorMes[12], realPorMes[12], ... },
      totais: { orcadoMensal, orcadoAnual, realPorMes[12], realAnual, diferencaAnual },
    }
```

Função pura (padrão `cashflowAggregation.ts`), reutiliza `aggregateCashflow` por baixo, testável sem Prisma.

### Rotas — `src/app/api/cashflow/orcamento/route.ts`

- **GET `?year=`** — monta a árvore com `getMergedCashflowGroups`, busca `CashflowOrcamento` do ano, chama `computeInvestimentosPorMes`, devolve o payload do serviço + a lista de categorias elegíveis (subgrupos de despesa sem meta ainda, para a UI de configuração).
- **PUT** — upsert em lote: `{ year, metas: [{ groupId | tipo:'investimentos', tipoMeta, valor }], deletes: [] }`. Zod em `src/utils/validation-schemas.ts`, `requireAuthWithActing`, `withErrorHandler`, `recordChange` (histórico de alterações — o repo registra tudo), mensagens em português.
- **POST `/copiar`** (fase 2, opcional) — copia metas de `year-1` para `year`.

## 6. Frontend

### Hook — `src/hooks/useOrcamento.ts`

React Query: `useQuery(queryKeys.cashflow.orcamento(year))` + mutation com `csrfFetch`. Nova chave em `src/lib/queryKeys.ts`. **Invalidação cruzada:** o `batch-update` da planilha altera o "Real" → `useGroupEditMode` deve invalidar também `cashflow.orcamento`; a mutation de metas invalida só a própria chave.

### Componentes — `src/components/cashflow/orcamento/` (barrel no `index.ts` do cashflow)

```
FluxoCaixaModoSelector    — pílulas Planilha | Orçamento (?modo=), no page.tsx da rota
OrcamentoVsRealSection    — container do modo Orçamento
  OrcamentoKpiCards       — 4 cards: Orçado (mês) | Real (mês) | Diferença | % renda investida
  OrcamentoChart          — ApexCharts barras agrupadas: orçado × real por categoria
                            (padrão SonhosObjetivoEvolutionChart: dynamic import ssr:false, useTheme)
  OrcamentoTable          — a tabela da planilha:
                            Categoria | Orçamento (editável inline) | Real | Diferença | barra de progresso
                            + linha Investimentos (meta em %, input próprio)
                            + linha Total
  OrcamentoMesSelector    — seletor de mês (padrão: mês corrente) + toggle "Ano acumulado"
```

Sketch da tabela (modo mês):

```
Categoria           Orçamento     Real       Diferença   Consumo
Habitação           R$ 3.500   R$ 3.406,90   +R$ 93,10   ▓▓▓▓▓▓▓▓▓░ 97%
Transporte          R$ 1.000     R$ 853,98  +R$ 146,02   ▓▓▓▓▓▓▓▓░░ 85%
Lazer                 R$ 400     R$ 500,00   −R$ 100,00  ▓▓▓▓▓▓▓▓▓▓ 125% ⚠ (vermelho)
…
Investimentos (10%)   R$ 750     R$ 900,00   +R$ 150,00  ✓ acima da meta (verde)
Total               R$ 6.700   R$ 6.480,88  +R$ 219,12
```

- Diferença verde quando sobra, vermelha quando estoura (invertido na linha Investimentos).
- Categorias sem meta aparecem com Orçamento vazio (clique para definir) — nada de tela de setup separada.
- Modo "Ano acumulado": meta × meses decorridos vs real acumulado.

## 7. Testes

- `src/services/cashflow/__tests__/orcamentoVsReal.test.ts` — serviço puro: categorias, investimento %, diferença, acumulado, categoria sem meta, meta sem valores.
- `src/app/api/cashflow/orcamento/__tests__/route.test.ts` — GET/PUT com mock Prisma (`vi.hoisted`) + `mockAuthAsUser`: upsert, delete, validação zod, meta de grupo inexistente/de outro usuário (404/403).
- Gate normal: `type-check` + `lint` (vitest é lento — rodar só os arquivos novos).

## 8. Pontos em aberto (validar com Wellington antes/durante F1)

1. **Semântica do Real** (§3.1) — todas as células ou só as pintadas como pagas/recebidas? Recomendação: todas (como a planilha).
2. **Entradas também têm meta?** A planilha só orça despesas + investimentos. Recomendação: v1 só despesas + investimentos; receita entra apenas como base do % de investimento.
3. A linha **"Despesas Variáveis"** da planilha é um grupo canônico no app (`CANONICAL_GROUPS`) que agrega subgrupos — confirmar se a meta fica no grupo pai ou nos subgrupos (recomendação: qualquer grupo de despesa é elegível, o usuário escolhe o grão).

## 9. Fases de entrega

- **F1 — Backend**: migration + model, serviço puro + testes, rotas GET/PUT + testes. (1 PR)
- **F2 — UI núcleo**: modo `?modo=orcamento` na página, tabela com edição inline de metas, KPI cards, invalidação cruzada. (1 PR)
- **F3 — Gráfico + acumulado**: OrcamentoChart, toggle ano acumulado, copiar metas do ano anterior. (1 PR)
- **F4 — Polimento (backlog)**: override de meta por mês, alerta de estouro (notificação), coluna "Realizado (pago)" separada de "Lançado".
