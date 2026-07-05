# Plano de execução — observações do checklist (2026-05-28)

Análise das 19 observações registradas em `checklist-validacao-mai27-28.md`
(linhas 292+). Cada item: **avaliação** (faz sentido? por quê?), **escopo**
estimado, **categoria** (bug / UX quick win / UX moderado / decisão de
design).

Resumo: **5 bugs críticos** (provavelmente raiz comum), **5 quick wins**
(<2h cada), **5 UX moderado** (~1d cada), **4 decisões de design** (discutir
antes de implementar).

---

## Sprint A — Bugs críticos de dados (provável raiz comum)

Cinco observações descrevem variações do mesmo sintoma: **edição de data
histórica não invalida séries derivadas (snapshots, análise, gráfico do
ativo)**. Padrão A do postmortem v2 (forward-only sem backfill).

### A.1 — Edição de data não recalcula histórico (#16, #17, #18, parte do #15)
**Avaliação:** legítimo e provavelmente único bug afetando 4 observações.
A pista forte: TIMS3 (#18) com "histórico mensal travado em maio" + CDB
editado de 2025→2016 (#16) sem dados antes de mai/24 + Análise idem (#17).
Isso casa com `recomputeSnapshotsFrom` recebendo a data **nova** mas
snapshots **antigos** persistidos antes da edição não são apagados.

**Investigação:** ler `src/services/portfolio/portfolioRecalculation.ts` →
fluxo de `recomputeSnapshotsFrom` em PATCH de transação. Confirmar:
- Quando a data muda de A→B (B < A), o cutoff é `min(A, B)=B`? Confirmar.
- `portfolioSnapshotPersistence` apaga snapshots ≥ cutoff ou só sobrescreve?
- Builder de patrimônio rebuilda do zero ou usa snapshots como cache?

**Provável fix:** ampliar invalidação pra `min(oldDate, newDate)` E apagar
snapshots > cutoff antes de reconstruir. Já fizemos isso pra DELETE de tx
no commit do postmortem; PATCH pode ter o mesmo gap. Pra ativos editados
em prod, rodar `scripts/backfill-rf-startdate-sync.ts` (#04) e/ou novo
script de re-snapshot.

**Escopo:** 4-6h investigação + fix + script de backfill + 2-3 testes.
**Prioridade:** **CRÍTICA** — afeta confiança nos dados.

### A.2 — LCI BTG dados desde 11/05/2024 mesmo com aplicação em 2022 (#15)
**Avaliação:** mesmo problema do A.1, mas possivelmente também ligado ao
#04 que rodou apenas no `testekinvo`. Wellington está testando em
`pedrotestemaio` — RFs antigos desse user podem ter `startDate` desalinhado.

**Provável fix:** rodar `scripts/backfill-rf-startdate-sync.ts` apontado
pra `pedrotestemaio@hotmail.com`. Se for o mesmo bug do A.1, fica
resolvido com A.1.

**Escopo:** 30min (rodar script) + verificação.

### A.3 — Instituição não carrega em aporte RF (#14)
**Avaliação:** investigar; pode ser bug de Step5 (escolha de instituição
no wizard de aporte adicional) ou metadata do `notes` não persistindo
`instituicaoId` corretamente. Observação adicional: "tab de RF tem 1 CRI
+ 1 LCI — checar se correto" — talvez o user tem mais ativos não-listados
por filtro errado.

**Investigação:** abrir aporte de RF do `pedrotestemaio` no Network tab,
ver payload enviado e response. Cross-checar `/api/carteira/renda-fixa`.

**Escopo:** 2-3h investigação + fix.

**Prioridade Sprint A total: CRÍTICA. Faz primeiro — antes de qualquer UI
polish, dados têm que estar corretos.**

---

## Sprint B — Quick wins (cada um < 2h, atomic commits)

### B.1 — Ortografia "obeservacoes" → "observações" (#11)
- **Avaliação:** óbvio, faz sentido.
- **Como:** `grep -rln "obeservacoes\|obeservações" src/` → search & replace.
- **Escopo:** 10min.

### B.2 — Histórico mostra "Aporte" pra bonificação (#10)
- **Avaliação:** legítimo. A transação de ajuste tem
  `notes.operation.action='ajuste-corporativo'` + `corporateActionType` no
  notes. O componente de histórico deveria ler isso.
- **Como:** no renderer de transação histórica, checar
  `notes.operation.action`; se for `ajuste-corporativo`, exibir
  "Bonificação" / "Split" / "Grupamento" usando `corporateActionType`.
- **Escopo:** 30min.

### B.3 — Botão de confirmação duplicado no wizard (#5)
- **Avaliação:** legítimo, sintoma de Footer condicional + botão dentro do
  Step5 não removido após refactor anterior do wizard.
- **Como:** localizar componentes de Step5 e shell do wizard
  (`AddAssetWizard.tsx`); remover o botão duplicado.
- **Escopo:** 30min.

### B.4 — Cor de texto sobre fatia de RF no chart de Tipos de Investimento (#12)
- **Avaliação:** legítimo. Acessibilidade.
- **Como:** verificar config do chart (provavelmente ApexCharts donut em
  `/carteira`); aplicar regra: se contraste < threshold, label fica branco.
  Solução mínima: branco fixo no label (com text-shadow se necessário pra
  fatias claras).
- **Escopo:** 20min.

### B.5 — Date picker cortado em RF pós (#4)
- **Avaliação:** legítimo (CSS overflow).
- **Como:** identificar Step4RendaFixaFields pós-fixada com data lado-a-
  lado; aplicar `overflow: visible` no container ou mudar layout em telas
  pequenas pra empilhar.
- **Escopo:** 30min.

**Sprint B total estimado: 2h de trabalho efetivo, 5 commits atômicos.**

---

## Sprint C — UX moderado

### C.1 — Auto-detecção de indexador no Tesouro Direto (#6)
- **Avaliação:** muito legítimo. Parseable do nome:
  - "Tesouro Selic …" → indexador SELIC/CDI
  - "Tesouro IPCA+ …" → IPCA
  - "Tesouro Prefixado …" → PRE
  - "Tesouro Renda+ IPCA+ …" → IPCA
- **Como:** no Step4TesouroDireto, ao escolher o título, derivar
  `indexer` automaticamente + esconder o select (ou deixar read-only).
- **Escopo:** 1-2h + 2-3 testes.

### C.2 — Tooltip de rentabilidade por dia mostra só uma linha no "No ano" (#7)
- **Avaliação:** legítimo. ApexCharts tem `tooltip.shared: true` que mostra
  todas as séries no mesmo X. Provavelmente está sendo desligado por algum
  filtro condicional, ou o eixo X com poucos pontos faz o hover pegar uma
  única série por proximidade.
- **Como:** ler config do chart de rentabilidade
  (`src/components/analises/RentabilidadeChart.tsx` ou similar); garantir
  `tooltip.shared: true` em todos os filtros.
- **Escopo:** 1h investigação + fix.

### C.3 — Loading state na agenda de proventos (#9)
- **Avaliação:** legítimo. UX básico — sem feedback, user dispara N
  requests.
- **Como:** identificar componente da agenda; adicionar `useQuery`
  `isLoading` flag + skeleton ou spinner. Desabilitar botão de "buscar"
  durante request.
- **Escopo:** 1h.

### C.4 — Gráfico de proventos vai pra 1970 quando todas as opções
desmarcadas (#8)
- **Avaliação:** legítimo. Edge case do filtro permitir array vazio →
  série sem pontos → ApexCharts defaulta pro epoch. Já tratamos parte em
  F1.2 (filter < 1990) mas com 0 séries, nada filtra.
- **Como:** guard no render: se nenhuma série tem pontos válidos, mostrar
  EmptyState ("Selecione pelo menos uma categoria") em vez de chart.
- **Escopo:** 30min.

### C.5 — Componente único de Tooltip (#13)
- **Avaliação:** legítimo. Padronização vale a pena. Provável já existe
  `Tooltip` em `src/components/ui/` (verificar) ou usar `radix-ui/tooltip`
  se disponível.
- **Como:** auditar usos atuais (`grep -rn "tooltip\|Tooltip"`); criar/usar
  componente único; migrar incrementalmente.
- **Escopo:** 1h investigação + N de migração (separar em commits por
  área). Começa investigação; decisão depois.

**Sprint C total estimado: 5h trabalho + migração de tooltips (separado).**

---

## Sprint D — Decisões de design (discutir antes)

### D.1 — Remover topbar, mover modo escuro/notificações/perfil pra sidebar (#1)
- **Avaliação:** mudança grande de layout. Faz sentido se a topbar não
  serve a outras funções, mas hoje ela carrega:
  - Botão de menu mobile (toggle sidebar)
  - Notificações (sininho)
  - Avatar/menu de perfil + modo escuro
  - Possivelmente search bar
- **Pontos a discutir:**
  - Em **mobile**, como toggle a sidebar sem topbar? Botão flutuante?
  - Notificações na sidebar embaixo: badge de contagem ainda visível?
  - Modo escuro: ícone de sol/lua sempre visível ou dentro de menu de
    perfil?
- **Recomendação:** prototipar mockup antes; refactor não é trivial.
  **NÃO faria sem alinhamento.**
- **Escopo se aprovado:** 4-6h + ajustes responsivos.

### D.2 — Remover overlay do modal e permitir uso do app (#2)
- **Avaliação:** mudança de paradigma. Modal com overlay = foco exclusivo;
  sem overlay = drawer/panel lateral que permite interação paralela.
  Possíveis problemas:
  - User no wizard pode mudar de aba e perder contexto? Persistir
    rascunho?
  - Cliques fora afetam outro state (ex.: clicar em outro ativo enquanto
    está adicionando um — qual o comportamento esperado?)
- **Alternativas:**
  - **Drawer lateral** (slide-in da direita) sem overlay — restante da
    tela navegável mas com border-shadow indicando foco.
  - **Modal flutuante arrastável** — menos comum.
  - **Página dedicada** `/carteira/adicionar` em vez de modal.
- **Recomendação:** prototipar drawer lateral antes; **discutir UX
  conjunto**.
- **Escopo se aprovado:** 6-8h + testes E2E.

### D.3 — Comparar preço digitado com preço do **dia da compra** (#3)
- **Avaliação:** legítimo e financeiramente correto. Quando user lança
  compra antiga (e.g., aporte feito em 2022), comparar com fechamento
  atual não faz sentido — fechamento pode ter divergido 200%.
- **Implementação:**
  - No `priceDeviationWarning.ts` (helper de F1.7), receber `dataCompra`
    além do preço digitado.
  - Buscar `AssetPriceHistory` no `dataCompra` (já temos COTAHIST 2016+
    pra B3, Yahoo pra IBOV/USD, BRAPI pra recente).
  - Fallback: se não tem preço pra aquela data, usar preço atual + nota.
- **Pontos abertos:**
  - Carregar histórico no client em tempo real (lentidão) ou expor
    endpoint dedicado `/api/ativos/[symbol]/price-at?date=YYYY-MM-DD`?
  - Threshold continua 20%/50% ou ajusta pra histórico (>volatilidade)?
- **Recomendação:** **faz sentido fazer**. Esclarecer só o endpoint vs
  fetch ad-hoc. **Não bloqueia, prefiro confirmar abordagem antes.**
- **Escopo:** 3-4h + testes.

### D.4 — Sidebar dentro de Carteira: Resumo + Análise (#19)
- **Avaliação:** legítimo e simples. Apenas reorganização de navegação.
- **Implementação:** adicionar subseção em `AppSidebar.tsx` (ou equivalente)
  sob "Carteira" com links pras rotas existentes.
- **Recomendação:** fazer junto da Sprint B se for trivial. Mas
  considerar UX do menu expansível.
- **Escopo:** 30min.

---

## Item #07 do spot-check — 561 assets com name=symbol

**Achado:** `SELECT COUNT(*) FROM assets WHERE source='brapi' AND
name=symbol AND type NOT IN ('crypto','currency')` retornou 561.
Esperado <50.

**Avaliação:** o backfill manual do Sprint 7 rodou (595 nomes), mas o
estoque atual mostra que continuam aparecendo. Possibilidades:
1. BRAPI continua devolvendo `longName=""` consistentemente pra esses 561
   (tickers menos populares, opções, BDRs raros).
2. Cron diário não tem o defensor "se vier vazio, não sobrescreve"
   propagado em todos os endpoints — só foi confirmado em alguns.

**Investigação:** distribuição por type (`stock`, `opcao`, `bdr`, etc.) e
amostrar 10 symbols pra ver no BRAPI manualmente.

**Escopo:** 1h investigação + fix se necessário.

---

## Ordem sugerida de execução

```
1. Sprint A  — bugs críticos de dados        (1-2 dias)
2. #07       — investigar 561 assets          (1h, junto com Sprint A)
3. Sprint B  — quick wins                     (1 dia)
4. D.4       — sidebar carteira (trivial)     (junto com Sprint B)
5. Sprint C  — UX moderado                    (1 dia)
6. D.3       — preço do dia da compra         (após confirmar abordagem)
7. D.1, D.2  — discussão de UX antes          (sessão dedicada)
```

**Total estimado: 4-5 dias de trabalho focado**, exceto D.1/D.2 que
dependem de decisão.

## Próximo passo recomendado

Começar por **Sprint A** — investigar a raiz comum dos bugs de
recalculação de histórico (#15-#18). Sem isso resolvido, qualquer teste
adicional de UI fica contaminado por dúvida "isso é bug de UI ou os dados
estão errados de novo?".
