# Plano — Sonhos × Fluxo de Caixa (reunião jun/2026)

> Origem: reunião com 7 observações sobre o Planejamento de Sonhos e a planilha de Fluxo de Caixa.
> Decisões fechadas com o time:
>
> - **Cor:** vermelho (`#FF0000`, "Pago") **substitui** o verde como gatilho do "Realizado" do sonho.
> - **Excluir:** **permitir** excluir o sonho direto da planilha (com confirmação).
> - **Ano:** seletor na sidebar controla **apenas** o fluxo de caixa.
>   Status: `[ ]` pendente · `[~]` andamento · `[x]` feito.

## Mapa do que já existe (levantado no código)

| Área             | Arquivo                                                               | Situação                                                                                                      |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Modelo sonho     | `prisma/schema.prisma` `PlanejamentoObjetivo`                         | `startDate String?` (YYYY-MM) **já existe**; só não é editável no form                                        |
| Form sonho       | `src/components/planejamento/sonhos/SonhosObjetivoInlineForm.tsx:156` | `startDate` auto = mês atual na criação, preservado na edição — **não exposto**                               |
| Modelo caixa     | `prisma/schema.prisma` `CashflowValue`                                | tem `year` + `month` (0-11) + `color`; unique `(itemId,userId,year,month)` — **multi-ano no banco já existe** |
| GET caixa        | `src/app/api/cashflow/route.ts`                                       | aceita `?year` (default ano atual)                                                                            |
| PATCH/PUT caixa  | `values/route.ts:75`, `batch-update/route.ts:47`                      | **hardcoded no ano atual**                                                                                    |
| Planilha         | `src/components/tables/DataTables/TableTwo/DataTableTwo.tsx:54`       | `currentYear = new Date().getFullYear()` **hardcoded**; sem seletor                                           |
| Sidebar          | `src/layout/AppSidebar.tsx`                                           | suporta `subItems`; não tem controle custom por item                                                          |
| Sync sonho→caixa | `src/services/planejamento/sonhoCashflowSync.ts`                      | escreve `pmt` nos **12 meses de um único ano** (preserva células realizadas)                                  |
| Sync caixa→sonho | `src/services/planejamento/cashflowToSonhoSync.ts`                    | lê células `REALIZADO_COLOR` **de todos os anos** (já multi-ano); compõe saldo                                |
| Gráfico          | `src/components/planejamento/sonhos/SonhosObjetivoEvolutionChart.tsx` | `curve: 'smooth'` + entries posicionados por calendário mas saldo composto por ordem das células              |
| Excluir sonho    | `batch-update/route.ts`                                               | **bloqueia** exclusão da linha vinculada ("exclua no Planejamento de Sonhos")                                 |

---

## Fase 1 — Data de início do sonho (observação 1)

**Objetivo:** expor `startDate` como campo editável no form do sonho.

- [x] 1.1 Adicionado `startDate` ao `FormState` e à UI de `SonhosObjetivoInlineForm.tsx` (input `month`, YYYY-MM). Default = mês atual na criação; carrega valor existente na edição; validação client AAAA-MM.
- [x] 1.2 `startDate` já fluía no `ObjetivoUpsertPayload`/POST/PATCH; zod (`planejamentoStartDate`, regex YYYY-MM) já validava em create e patch — nada a fazer.
- [~] 1.3 Mudança de `startDate` persiste e redispara o sync, mas a reescrita da **janela de meses** (atravessando anos) é a Fase 4 — hoje o sync ainda escreve 12 meses do ano corrente.

**Arquivos:** `SonhosObjetivoInlineForm.tsx`, `usePlanejamentoSonhos.ts` (tipo do payload), `api/planejamento-sonhos/route.ts` + `[id]/route.ts` (zod).

---

## Fase 2 — Fluxo de caixa multi-ano (observação 2)

**Objetivo:** planilha passa a operar sobre um `year` selecionável; persistência respeita o ano.

- [x] 2.1 `DataTableTwo.tsx`: `currentYear` agora vem do `useCashflowYear()` (context), não mais `new Date().getFullYear()`.
- [x] 2.2 `useCashflowData(year)` já aceitava ano e usa `queryKeys.cashflow.year()` (cache por ano) + `?year` nos GETs — só passei o ano do context.
- [x] 2.3 `values/route.ts` e `batch-update/route.ts`: `year` opcional no body (zod), default ano atual p/ retrocompat. `targetYear` substitui `new Date().getFullYear()`.
- [x] 2.4 `investimentos` recebe `?year` via `useCashflowData`; `comments` usa o `currentYear` do context na planilha.
- [x] 2.5 Proventos: `startDateISO/endDateISO` derivam do ano do context → `useProventos` filtra pelo ano selecionado.

**Arquivos:** `DataTableTwo.tsx`, `EditableItemRow.tsx`, `src/hooks/useCashflow*.ts`, `api/cashflow/{values,batch-update,comments,investimentos}/route.ts`.

---

## Fase 3 — Dropdown de ano na sidebar (observação 3)

**Objetivo:** seletor de ano na sidebar, escopo só do fluxo de caixa.

- [x] 3.1 Estado do ano via **`CashflowYearContext`** (provider no `AdminLayoutClient`), inicializado da URL `?ano=` e espelhado via `replaceState` (deep-link/refresh ok). Evita `useSearchParams`+Suspense, padrão do projeto.
- [x] 3.2 `AppSidebar.tsx`: `<CashflowYearSelect>` renderizado sob o item "Fluxo de Caixa" (só quando expandido). Muda o ano e navega pra `/fluxodecaixa` se estiver em outra página.
- [~] 3.3 Range de anos: janela fixa `ano atual−2 … ano atual+8` (cobre "até 2027" sem acoplar a sidebar ao fetch de sonhos / side-effect de provisionamento). Derivar dos sonhos fica como melhoria futura.

**Arquivos:** `AppSidebar.tsx`, `DataTableTwo.tsx`, possivelmente um pequeno hook `useAnosDisponiveis` (deriva range dos sonhos).

---

## Fase 4 — Integração sonho × caixa multi-ano (observação 4)

**Objetivo:** o aporte planejado do sonho aparece nos anos certos da planilha (sonho até 2027 escreve meses de 2026 **e** 2027).

- [x] 4.1 `syncObjetivoToCashflow` reescrito: escreve `pmt` na **janela do sonho** (`startDate` por `months` meses, atravessando anos) via `addMonths`. `ObjetivoForSync` ganhou `startDate`; param `year` removido. Preserva realizados (vermelho).
- [x] 4.2 `deleteMany` agora apaga o planejado (não-realizado) de **qualquer ano** (`OR: [{color:null},{color:{not:vermelho}}]`) — limpa planejado órfão ao deslocar a janela. Novo teste cross-ano (Nov/26+4 → 2026 e 2027).
- [x] 4.3 Sync reverso já varre todos os anos e ordena por `YYYY-MM` (localeCompare) — cross-ano correto, sem mudança.
- [x] 4.4 POST/PATCH/provisionDefaultSonhos passam `startDate` ao sync → recálculo da janela ao alterar o objetivo.

**Arquivos:** `sonhoCashflowSync.ts`, `cashflowToSonhoSync.ts`, callers em `api/planejamento-sonhos/*`.

---

## Fase 5 — Cor do aporte realizado: verde → vermelho (observação 5)

**Objetivo:** o gatilho do "Realizado" do sonho passa a ser a célula **vermelha** (`#FF0000`, "Pago"). Semanticamente correto: aporte é saída ("Pago"), não "Recebido".

- [x] 5.1 `cashflowToSonhoSync.ts`: `REALIZADO_COLOR = '#FF0000'` (era `#76933C`). Constante é fonte única — propaga p/ o sync direto que preserva realizados.
- [x] 5.2 Auditados usos de `#76933C`: os demais (`useGroupEditMode` colorMap, `GroupHeader` "Investimentos", `ColorPickerButton` "Recebido") são independentes do gatilho de sonho — nada a migrar. Comentários/testes de sonho atualizados p/ "vermelho".
- [ ] 5.3 (Opcional, fase de testes) Migração one-shot pulada: sem usuários reais (memória `project-test-phase`), basta re-marcar manualmente as células de teste.
- [x] 5.4 `ColorPickerButton` mantido: vermelho já é "Pago", semanticamente correto p/ aporte — sem mudança de UI necessária.

**Arquivos:** `cashflowToSonhoSync.ts`, `sonhoCashflowSync.ts`, varredura por `#76933C`.

---

## Fase 6 — Gráfico de evolução: corrigir "quedas aleatórias" (observação 6)

**Objetivo:** série monotônica e alinhada ao calendário, sem dips artificiais.

Hipótese principal (alta confiança): `curve: 'smooth'` (spline) gera **vales/overshoots artificiais** em dados com espaçamento irregular e `null` gaps → parece "queda aleatória", apesar de planejado e realizado serem matematicamente crescentes.
Hipótese secundária: saldo dos entries é composto na **ordem das células** (contagem), mas plotado na **posição de calendário** (`idx`), gerando degraus inconsistentes quando há meses pulados.

- [x] 6.1 Análise de código confirmou: séries são matematicamente crescentes; as "quedas" vinham do rendering (spline `smooth` + série Realizado esparsa com `null` entre pontos), não dos dados.
- [x] 6.2 `stroke.curve` → `['smooth', 'straight']` (Planejado suave, Realizado reta sem overshoot).
- [x] 6.3 Realizado virou linha **contínua e monotônica** alinhada ao calendário: posiciona cada entry pelo offset de mês desde `startDate` e carrega o saldo pra frente nos meses sem registro; `null` só após o último realizado. Marcadores discretos só nos meses realizados.
- [~] 6.4 Default de `available` (patrimônio agregado) que pode dominar o eixo Y fica como ajuste de UX futuro — não alterado p/ não mexer na semântica de `pmt`/`planned`.

**Arquivos:** `SonhosObjetivoEvolutionChart.tsx`, `cashflowToSonhoSync.ts`, eventualmente `planejamentoSonhos.ts`.

---

## Fase 7 — Excluir sonho pela planilha (observação 7)

**Objetivo:** permitir excluir o sonho direto da linha no fluxo de caixa, com confirmação.

- [x] 7.1 `batch-update/route.ts`: bloqueio removido. Linha de sonho agora propaga a exclusão pro `PlanejamentoObjetivo` (`removeObjetivoCashflow` + delete do objetivo, cascade nas entries). Linhas livres seguem bulk delete.
- [x] 7.2 `EditableItemRow.tsx`: botão de excluir liberado em linha de sonho (`canDelete`), com `window.confirm` avisando que remove o objetivo e o histórico. Estrutura (nome) segue bloqueada.
- [x] 7.3 `handleSaveGroup` (DataTableTwo) já invalida `planejamento` + `planejamento-sonhos` + refetch do caixa após salvar.
- [x] 7.4 Exclusão atinge só o objetivo daquela linha (busca por `objetivoId` do item, valida `userId`); demais linhas do grupo intactas. Teste de propagação adicionado.

**Arquivos:** `DataTableTwo.tsx`/`EditableItemRow.tsx`, `api/cashflow/{batch-update,update,[id]}/route.ts`, reutilizar `removeObjetivoCashflow` + delete do objetivo.

---

## Ordem sugerida (commits atômicos, um por observação)

1. **Fase 5** (cor) — pequena, isolada, destrava a semântica das demais.
2. **Fase 1** (startDate no form) — base p/ multi-ano da integração.
3. **Fase 2** (caixa multi-ano backend+planilha) → **Fase 3** (dropdown sidebar) — dependentes.
4. **Fase 4** (integração multi-ano) — depende de 1, 2, 5.
5. **Fase 6** (gráfico) — independente, pode entrar em paralelo.
6. **Fase 7** (excluir pela planilha) — independente.

Gate por commit: `npm run type-check` + `npm run lint` (vitest é lento, rodar só nos arquivos tocados). Cada observação = 1 commit/PR atômico.
</content>
</invoke>
