# Checklist de validação — alterações 2026-05-27 + 2026-05-28

Marque `[x]` quando passar. Cada item tem **o que** + **como** + **esperado** +
**bug** (referência ao relatório/postmortem).

## 0. Setup

- [ ] Login com `pedrotestemaio@hotmail.com` — usuário que tinha ITUB4 (F1.1, #01 amarelo). Senha você já tem
- [x] Login com `testekinvo@hotmail.com` — usuário que tinha RFs com startDate dessincronizado (#04)
- [ ] Login `usuario.demo@finapp.local / 123456` (seed E2E criado por `npm run seed`) — pra fluxos genéricos sem dados sensíveis
- [ ] `npm run dev` rodando

---

## 1. Wizard — Adicionar ativo

### 1.1 Modal não fecha clicando fora (F1.4)
- [x] Abrir wizard de "Adicionar investimento"
- [x] Clicar fora do overlay (área cinza)
- **Esperado:** modal NÃO fecha
- [x] Apertar `ESC`
- **Esperado:** modal fecha (default `closeOnEscape=true`)

### 1.2 Validação de feriado/fim-de-semana B3 (F1.5)
- [x] Em qualquer Step4 de RV (ações, ETF, FII, REIT, Stocks, etc.)
- [x] Tentar registrar compra em `2026-01-01` (feriado Confraternização)
- **Esperado:** warning amarelo aparece + sugere próximo dia útil. NÃO bloqueia
- [x] Tentar `2026-05-23` (sábado)
- **Esperado:** mesmo comportamento

### 1.3 Campo "% do indexador" removido (F1.6)
- [x] Adicionar CDB pós-fixado novo
- [x] Procurar campo "% do indexador" na UI
- **Esperado:** campo NÃO existe mais (sumiu)
- [x] Salvar e verificar no DB/UI que `indexerPercent` ficou em 100

### 1.4 Alerta de preço divergente >20% (F1.7)
- [x] Em Step4 Ações: digitar preço de compra 30% acima ou abaixo do fechamento atual
- **Esperado:** hint amarelo "Preço diverge X% do fechamento"
- [x] Em Step4 Moedas/Cripto: testar com 50% (threshold maior)
- **Esperado:** hint aparece só acima de 50%
- [ ] Comparar com Stocks/REIT/Opcoes/Previdência
- **Esperado:** sem hint nesses (entrada manual, sem cotação automática)

### 1.5 % do CDI explícito na reserva (F1.8)
- [x] Step4Reserva (emergência ou oportunidade): bloco "Rentabilidade contratada"
- **Esperado:** input "% do CDI" + select CDI/IPCA/PRE
- [x] Digitar "112" + CDI, salvar
- **Esperado:** ativo persiste com `indexerPercent=112`, `indexer=CDI`
- [x] Repetir em Step4TesouroReserva
- [x] Verificar valor atualizado bate (pricer respeita 112%)

### 1.6 Toggle de reinvestimento (F1.10)
- [x] Step4 de Ações/ETF/FII/REIT/Stocks: existe toggle "Reinvestimento de provento"
- [x] Marcar toggle e salvar
- **Esperado:** transação criada com `notes.operation.action='reinvestimento'`
- [x] Verificar em **Fluxo de Caixa** → categoria separada "Reinvestimentos", NÃO soma em totais de aporte
- [x] **TWR (gráfico de patrimônio):** a rentabilidade NÃO afunda no dia do reinvestimento (Fix #1 de hoje)
- ⚠️ **Gap conhecido:** toggle NÃO existe em Step4Opcoes/MoedasCriptos/Fundos — se você marcar isso a partir dessas abas, vai virar aporte normal

---

## 2. Proventos

### 2.1 Gráfico não renderiza "Jan 1970" (F1.2)
- [x] Página de Proventos → gráfico de evolução
- **Esperado:** eixo X começa numa data sensata (ex: 2020+), nunca "Jan 1970"
- [x] Mudar filtro de período (No ano / 12m / 24m / Do início)
- **Esperado:** cards de resumo refazem fetch (loading spinner ou badge "Atualizando…")
- **Esperado:** gráfico re-renderiza com novo range

### 2.2 Filtro não fecha ao clicar interno (F1.3)
- [x] Página de Proventos: abrir dropdown de filtro
- [x] Clicar no campo de data dentro do DatePicker
- **Esperado:** dropdown permanece aberto
- [x] Mudar o mês via setas do calendário
- **Esperado:** dropdown ainda aberto, valor atualiza
- [x] Clicar fora completamente
- **Esperado:** fecha

---

## 3. Carteira & Análises

### 3.1 percentualCarteira por ativo no backend (#14 + Fix #4)
- [x] Aba **FIIs**: cada linha tem coluna `% da carteira` preenchida; soma das linhas = 100,00%
- [x] Aba **Ações**: idem (Fix #4 de hoje)
- [x] Aba **ETFs**: idem
- [x] Aba **REITs**: idem
- [x] Aba **Stocks**: idem
- [x] Aba **Opções**: idem
- [x] Aba **Moedas/Criptos**: idem
- [x] Aba **Fundos**: idem
- **Esperado:** em todas, nenhum ativo aparece com `0%` (a menos que o ativo tenha valor zero) e a soma fecha 100

### 3.2 Header `/ativos/[id]` mostra instituição correta (#08)
- [x] Abrir um ativo de RF (CDB, LCI, etc.)
- **Esperado:** header mostra "Banco XYZ" — NUNCA "[object Object]"
- [x] Abrir um ativo com symbol sintético (ex.: CDB com symbol auto-gerado)
- **Esperado:** título mostra nome legível, oculta symbol técnico (`formatAssetDisplayTitle`)

### 3.3 Bonificações aplicadas ao Portfolio (#01 amarelo)
- [x] Login com `pedrotestemaio@hotmail.com`
- [x] Aba Ações → ITUB4
- **Esperado:** quantidade = **515 ações**, PM = **R$ 27,05** (bate Kinvo)
- [x] Verificar histórico de transações ITUB4
- **Esperado:** vê transação `ajuste-corporativo` da bonificação 1.03 (válida); NÃO vê 1.10 (falsa) — F1.1 reverteu

### 3.4 TWR não afunda no reinvestimento (Fix #1 de hoje)
- [x] Usuário com pelo menos 1 reinvestimento de provento (toggle marcado em Step4)
- [x] Página de **Análises → Rentabilidade**
- **Esperado:** TWR no dia do reinvestimento NÃO mostra queda artificial
- [x] Inspecionar fluxo de caixa do gráfico: reinvestimento NÃO entra como aporte

---

## 4. Renda Fixa

### 4.1 Tooltip FGC para CRI/CRA/debêntures (#12)
- [x] Aba Renda Fixa → ativo do tipo CRI/CRA/debênture
- **Esperado:** badge "Sem cobertura FGC" com tooltip ⓘ explicando a exclusão
- [x] No card de resumo da seção: mesma tooltip presente

### 4.2 Aporte/resgate sincroniza investedAmount (#15)
- [ ] Ativo de RF qualquer (CDB, LCI)
- [ ] Fazer um aporte de R$ 1.000 via wizard
- [ ] Verificar no DB ou na própria UI:
  - `Portfolio.totalInvested` += 1000
  - `FixedIncomeAsset.investedAmount` = idem ao `totalInvested`
- [ ] Fazer um resgate de R$ 500
- **Esperado:** ambos campos atualizam coerentemente
- [ ] **Deletar** uma transação de RF via `/historico`
- **Esperado:** `investedAmount` recalcula corretamente (cobertura do recalc)

### 4.3 % do CDI lido pelo pricer (F1.8)
- [ ] Criar reserva com "112% CDI"
- [ ] Aguardar 1 dia (ou rodar cron manual)
- **Esperado:** valor atualizado da reserva cresce ~12% acima da reserva 100% CDI

### 4.4 Datas de RFs legadas (#04)
- [x] Login `testekinvo@hotmail.com`
- [ ] Verificar 3 RFs que estavam dessincronizados (CDB Reserva EM e outros)
- **Esperado:** `startDate` no card = data da primeira transação no histórico

---

## 5. Histórico 10 anos (F2.x)

### 5.1 BACEN 10y (F2.1)
- [ ] Página de Análises → Rentabilidade x Benchmark
- [ ] Selecionar "Do início" e benchmark CDI
- **Esperado:** curva CDI vai até ~2016
- [ ] Mesmo teste com SELIC, IPCA, CDI_ANUALIZADO, IMAB
- **Esperado:** todas com 10 anos (IMAB pode cortar em 2023-05 — descontinuação BACEN)

### 5.2 IBOV + USD-BRL (F2.3)
- [ ] Análises → comparação com IBOV ou Dólar
- **Esperado:** série com pontos 2016-presente (5.085 pontos em prod)

### 5.3 COTAHIST 2016-2020 (F2.2)
- [x] Pegar uma ação que existia em 2016 (ex.: PETR4, ITUB4, VALE3)
- [ ] Página do ativo → gráfico de cotação histórica
- **Esperado:** série não tem buracos entre 2016-2020 (eram 417k pontos importados)

### 5.4 Cripto 365d (F2.4)
- [ ] Página de um cripto (BTC, ETH, BNB, SOL, etc.)
- **Esperado:** histórico de ~365 dias (free tier CoinGecko)
- ⚠️ **Gap conhecido:** se quiser 10y, F2.4b (Binance) ainda pendente
- ⚠️ **Gap conhecido:** se o cripto não está nos 10 hardcoded, sem histórico — UI não avisa

---

## 6. Planejamento Sonhos (F3.x + refactor de hoje)

### 6.1 Criação inline (refactor de hoje)
- [x] Acessar `/planejamento-financeiro`
- [x] Clicar **"+ Adicionar objetivo"**
- **Esperado:** card editável aparece direto na grid (NÃO leva pra outra página)
- **Esperado:** campo "Saldo atual" já pré-preenchido com soma dos investimentos
- **Esperado:** campo "Rentab. ao mês" já pré-preenchido com CDI mensal (~0.9-1.0%)
- [x] Preencher Nome + Meta + Prazo
- **Esperado:** "Aporte mensal sugerido" aparece em tempo real
- **Esperado:** "Categoria: Curto/Médio/Longo Prazo" aparece (auto pelo prazo)
- [x] Clicar **"Criar objetivo"**
- **Esperado:** card aparece na grid + abre o detalhe

### 6.2 Edição inline
- [x] Abrir um objetivo → clicar "Editar"
- **Esperado:** header vira o mesmo form inline
- [x] Alterar prazo, salvar
- **Esperado:** categoria atualiza coerente, sem reload total

### 6.3 Registrar mês
- [x] No detalhe do objetivo: clicar "+ Registrar Mês"
- **Esperado:** modal com mês pré-preenchido (próximo do último registro)
- **Esperado:** aporte sugerido pelo PMT
- **Esperado:** balance default = último balance (ou available se primeiro)
- [x] Salvar com balance ≥ target
- **Esperado:** status do objetivo vira "Concluído" automaticamente

### 6.4 DELETE entry recomputa status (Fix #3 de hoje)
- [x] Objetivo com status "Concluído" via entry registrada
- [x] Na tabela de histórico, clicar "✕" no último registro pra deletar
- **Esperado:** status volta a "Iniciado" (se ainda houver outras entries) ou "Em espera" (se nenhuma)
- [x] Repetir: objetivo com 2 entries (uma com balance ≥ target, outra menor); deletar a maior
- **Esperado:** status vira "Iniciado" porque a entry restante não cobre target

### 6.5 Gráfico planejado vs realizado
- [x] Objetivo com 3+ entries
- **Esperado:** chart mostra linha "Planejado" (PMT projetado) vs "Realizado" (entries)
- [x] Verificar tabela de histórico: colunas Δ Aporte e Δ Saldo aparecem em verde/vermelho

---

## 7. Fundamentos (F1.9)

### 7.1 Dados de P/L, Beta, DY
- [x] Aba Ações: visualizar coluna P/L de ações que estavam zeradas antes
- **Esperado:** PETR4, ITUB4 e principais ativos têm valor populado (não "—")
- [x] Página de análise de risco/retorno
- **Esperado:** Beta dos ativos aparece
- ⚠️ **Verificar em prod:** após a próxima rodada do cron (07:30 UTC = 04:30 BRT), checar `AssetFundamentals` count > 1500

---

## 8. Crons (verificação de configuração)

### 8.1 Vercel cron schedule
- [x] Abrir `vercel.json` e confirmar entradas:
  - `0 4 * * 0` — `/api/cron/brapi-sync/backfill-names` (semanal #07)
  - `20 7 * * *` — `/api/cron/brapi-sync/dividends`
  - `25 7 * * *` — `/api/cron/apply-corporate-actions` (Fix #2 de hoje)
  - `30 7 * * *` — `/api/cron/brapi-sync/fundamentals` (F1.9)
- [x] Dashboard Vercel → Crons: verificar execução do dia anterior em todos
- **Esperado:** status verde, sem erros

### 8.2 Apply corporate actions runtime (Fix #2 de hoje)
- [x] Manualmente disparar `/api/cron/apply-corporate-actions` com `Authorization: Bearer $CRON_SECRET`
- **Esperado:** response `{ users: N, scanned: ≥1, applied: 0, skipped: ≥1, ... }` (skipped = idempotência confirmada)
- [x] Re-disparar imediatamente
- **Esperado:** `applied: 0` novamente (re-rodável)

---

## 9. Spot-checks de dados em produção

> Rodados via `npx tsx scripts/spot-checks-mai28.ts` em 2026-05-28.

- [x] **F1.1**: ITUB4 bonificação falsa 2025-03-17 → **0 linhas ✅**
- [ ] **#07**: assets com name=symbol → **561** (esperado <50) ⚠️ — cron semanal vai limpar parte; investigar resto
- [x] **F2.2**: COTAHIST 2016-2020 → **417.583 pontos** (2016: 62k, 2017: 68k, 2018: 78k, 2019: 85k, 2020: 123k) ✅
- [x] **F2.3**: Yahoo Finance → **5.085 pontos** ✅
- [x] **F2.4**: CoinGecko → **10 ativos** ✅

---

## 10. Regressão geral

- [x] Login + dashboard carrega normalmente (sem 500/404 em /api/carteira/resumo)
- [x] Aba de cada tipo de ativo (Ações, FIIs, ETFs, REITs, Stocks, Opções, Cripto, Renda Fixa, Tesouro, Fundos, Previdência, Reservas) carrega sem erro
- [x] Página de análises (Rentabilidade, Risco-Retorno, Cobertura FGC, Indicadores, IR Mensal/Anual) carrega
- [x] `/historico` → conseguir editar e deletar uma transação sem quebrar
- [x] Console do browser: sem erros vermelhos durante navegação geral

---

## Gaps conhecidos (NÃO são bugs, só registros)

1. **Reinvestimento toggle ausente em Opcoes/MoedasCriptos/Fundos** — se você precisa marcar reinvest nesses, o toggle não está exposto ainda.
2. **F2.4b Binance pendente** — cripto cobre 365d via CoinGecko; 10y completo só com migração pra Binance klines.
3. **Scripts F1.1 e #04 não estão no cron** — manuais idempotentes.
4. **CoinGecko/Yahoo sem cron** — backfill manual via `scripts/`. Drift acumula a cada dia.
5. **previdencia-seguros mantém `percentualCarteira=0` no backend** — por design (calculado no cliente).

---

## Quando bater algum problema

- Anota o passo + comportamento observado + esperado
- Print do console se tiver erro JS
- Print do Network tab se for 500/404
- Se for diferença numérica, salva o valor que apareceu vs o esperado

---

## Observações do Wellington
- [ ] Remover topbar, opções de modo escuro, notificações e perfil movidas pra sidebar embaixo.
- [ ] Remover overlay do modal de adição de ativo e permitir uso do app com o modal aberto
- [ ] A comparação do preço unitário no wizard precisa ser do valor digitado com o valor do dia da compra e não com o valor atual
- [ ] Na adição de renda fix pós com os campos de data um ao lado do outro gera um corte na exibição do campo de data de inicio quando o date picker aparece
- [ ] Botão de confirmação duplicado no wizard de adição de ativos
- [ ] Checar se na adição de tesouro direto é possível automatizar a opção do indexador
- [ ] Quando coloquei o filtro de "No ano" na analise a tooltip do gráfico de rentabilidade por dia passou a apresentar apenas os dados da linha onde o hover acontecia ao invés de todas como no filtro "do inicio". Checar se isso acontece nos outros filtros.
- [ ] O comportamento do 1970 em proventos acontece quando todas as opções do gráfico de histórico de proventos são desmarcadas. Pensar em como lidar com esse comportamento.
- [ ] A parte de agenda de proventos não existe indicação visual de quando os dados estão sendo carregados e pela demora dos dados aparecerem pode fazer com que o usuário faça várias requisições sem perceber que ainda está carregando.
- [ ] 3.3 no histórico está como "Aporte", deveria conter o nome correto do tipo de bonificação a fim de clareza de entendimento para o usuário
- [ ] Corrigir ortografia da coluna obeservacoes em todas as tabs da carteira
- [ ] No chart de Tipos de Investimento da /carteira o tipo renda fixa tem a mesma cor do texto, trocar a cor do texto para branco quando a visibilidade estiver comprometida.
- [ ] Checar se no sistema já existe um componente para tooltip e caso exista passar a usa-lo nos locais onde tooltip aparece
- [ ] 4.2 Instituição financeira não está carregando não esta carregando em aporte da renda fixa no usuário pedrotestemaio@hotmail.com. Na tab de renda fixa aparece um cri e um lci, checar se esse comportamento está correto.
- [ ] 4.4 LCI BTG - R$ 20.000 - 11/05/2022 com dados a partir de 11/05/2024, nos novos funcionam, mas os antigos devem ser corrigidos apenas por questão de validação
- [ ] CDB alterado data de 2025 para 2016, mas os dados ainda vem de maio de 2024 mesmo com filtro MAX na tela de ativo
- [ ] Na Analise continua trazendo apenas de 2024 mesmo tendo um ativo de 2016 que era 2025 e passou por edição
- [ ] 5.3 gráfico de valor aplicado vs saldo vazio, com mai 2024 no eixo x, histórico mensal travado em maio, rentabilidade histórica quebra quando muda o filtro de tempo pra mais do que 2 anos. Ação do teste: TIMS3
- [ ] Adicionar na sidebar dentro de Carteira a opção de Resumo e Análise, que vai direto para as telas ja existentes.
- [ ] 9. deixar execução para o claude