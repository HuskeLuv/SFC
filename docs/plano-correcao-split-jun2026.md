# Plano de correção — Split não aplicado à timeline histórica (Jun/2026)

> Disparado pelo HFOF11 (desdobramento 10:1, mai/2025). Após o backfill, a
> **posição** ficou correta (1000 cotas, −11%), mas **gráfico de patrimônio**,
> **proventos da página do ativo** e **extrato** estão errados. Vale pra
> qualquer ativo que teve split/grupamento.

## Causa-raiz (única, em vários lugares)

Os **preços** armazenados são **split-adjusted** (BRAPI `.close` back-adjusted —
ex.: HFOF11 ~R$5,6 em abr/2025 pré-split vs R$73,15 na compra de 2024). Logo, a
**quantidade histórica** usada nos cálculos precisa ser **normalizada pra escala
pós-split** (100 cotas pré-split → 1000) pra casar com o preço.

A ferramenta correta já existe e aplica o fator: `buildQuantityTimeline` +
`quantityAtDate` em `src/services/portfolio/corporateActions.ts` (retornam a
quantidade **normalizada pós-split**). Ela é usada em UM lugar
(`ensurePortfolioProventosFromMarket.ts`) mas **falta** nos demais, que somam
deltas crus de transação.

## Sites a corrigir (código)

### Fix A — `src/services/portfolio/patrimonioHistoricoBuilder.ts`
- **Problema:** linhas ~574-631 (montagem `transactionsBySymbol`) e ~880-904
  acumulam **delta cru** por símbolo/dia e fazem `saldoBruto += quantidade_crua × preço_ajustado` → 10× baixo.
- **Fix:** carregar `AssetCorporateAction` por símbolo (como em
  `ensurePortfolioProventosFromMarket.ts:54`), montar
  `buildQuantityTimeline(transactions, corporateActions)` por símbolo e usar
  `quantityAtDate(timeline, day)` no lugar do acumulado cru.
- **Afeta:** `/carteira/resumo`, análises (rentabilidade/patrimônio).

### Fix B — `src/app/api/ativos/[id]/route.ts`
- **Problema:** tem um `buildTimeline` **local** (linhas ~462-471) que ignora
  eventos corporativos; usado tanto pro **patrimônio** (~582-641) quanto pros
  **proventos** (~514-523) → ambos 10× baixos. Lógica **duplicada** e divergente
  do builder central.
- **Fix (preferido):** **eliminar a duplicação** — reusar `buildPatrimonioHistorico`
  (já corrigido no Fix A) e `buildQuantityTimeline`/`quantityAtDate` pros
  proventos, removendo o `buildTimeline` local.
- **Afeta:** a própria página do ativo (gráfico + proventos + resultado).

### Fix C — Extrato (linha de auditoria do split)
- **Problema:** o backfill `--reapply` chamou só `recalculatePortfolioFromTransactions`
  (conserta a posição), **não** `applyCorporateActionsToUserPositions` (cria a
  linha "ajuste-corporativo" no `StockTransaction`). Por isso o extrato mostra
  só a compra de 100, sem o evento. (A leitura/label já existe na rota:
  `labelForTransaction` → `CORPORATE_ACTION_LABEL`.)
- **Fix:** (1) o `scripts/backfill-yahoo-splits.ts --reapply` deve também chamar
  `applyCorporateActionsToUserPositions(userId, {assetId})`; (2) rodar o cron
  `/api/cron/apply-corporate-actions` (ou o backfill atualizado) pra criar as
  linhas retroativas.

## Recompute de dados após o código (prod)

- **Snapshots** (`PortfolioDailySnapshot`, se materializados): recalcular pras
  posições afetadas via `recalculatePortfolioFromTransactions({recomputeSnapshotsFrom: dataDoSplit})`.
  *Verificar se a página usa snapshot persistido ou série ao vivo — o detail
  route monta ao vivo; o resumo pode usar snapshot.*
- **PortfolioProvento**: vazio pro HFOF11 (computado ao vivo), mas pra ativos com
  proventos já materializados ANTES do split, as linhas podem estar cruas. O
  cron diário de dividendos (que já usa `buildQuantityTimeline`) auto-corrige no
  próximo ciclo (delete+refetch); pra corrigir já, re-sincronizar os símbolos
  afetados.
- **Extrato**: criar as linhas de auditoria (Fix C) pras posições existentes.

## Convenção a fixar (e documentar)

**Preço ajustado ⇒ quantidade normalizada pós-split, em todo lugar.** Nunca
misturar quantidade-crua com preço-ajustado. Adicionar comentário/util único pra
evitar regressão.

## Riscos / pontos de atenção

1. **Assets onde o preço NÃO está ajustado** (fetch feito antes do split e não
   refrescado): aí quantidade-normalizada × preço-cru ficaria 10× ALTO. Mitigar:
   o cron de preços refaz o histórico (BRAPI sempre devolve ajustado atual);
   garantir refresh dos símbolos com split. Validar caso a caso.
2. **Idempotência** do `applyCorporateActionsToUserPositions` (não duplicar linha
   de auditoria) — já tem guard por `corporateActionId` no notes; confirmar.
3. **Grupamento (factor<1):** a mesma lógica vale (fator multiplicativo); testar
   um caso de grupamento além do desdobramento.
4. **Performance:** carregar `AssetCorporateAction` por símbolo no builder — fazer
   um único `findMany` por todos os símbolos da carteira, não N queries.

## Testes

- Unit: builder com 1 compra pré-split + evento 10:1 → saldo contínuo e na escala
  certa (ex.: 100@73 → série ~7300, não ~730); proventos pós-split × 1000.
- Unit: grupamento 1:10 (factor 0.1).
- Integração (rota detail): `historicoPatrimonio` último ponto == posição viva
  (1000×preço), sem salto no split; `proventos` pós-split com qty ajustada.
- Regressão: ativo SEM split não muda nada.
- E2E/QA: reproduzir HFOF11 (qa.teste em prod) e conferir página coerente.

## Rollout

Branch → PR → CI verde (Higiene) → deploy atômico (Camada 2) → recompute em prod
(snapshots/proventos/extrato dos afetados) → verificar HFOF11 na página.

## Estado atual (verificado em prod, 2026-06-09)

- ✅ Posição: 1000 cotas, PM 7,315, atual 6,5, resultado −11,14%.
- ✅ TWR/rentabilidade %: −10,71% (≈ correto; escala-invariante).
- ❌ Gráfico patrimônio: último saldo 650 (real 6500); série em 1/10.
- ❌ Proventos (página do ativo): qty=100 (devia 1000), total 68,80 (devia ~688).
- ❌ Extrato: sem linha do desdobramento 10:1.
