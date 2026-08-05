# Plano — Importação da planilha FLC (Fluxo de Caixa) para o sistema

> Criado em 2026-07-24. Escopo inicial: aba **"Fluxo de Caixa"** da planilha do Pedro
> ("FLC + Carteira Investimentos Software.xlsx"), **apenas campos de entrada manual**
> (não computados). Objetivo: clientes do Pedro que já usam a planilha migram para o
> app sem digitar tudo de novo.

## 1. Contexto

- A planilha-modelo está em `/mnt/c/Users/Wellington/Downloads/FLC + Carteira Investimentos Software.xlsx`
  (verificada em 24/07). O fluxo de caixa do app foi construído a partir dela
  (regras do Pedro, jul/2026), então a correspondência estrutural é quase 1:1.
- Cada cliente do Pedro tem uma CÓPIA personalizada: linhas renomeadas, linhas extras,
  valores próprios. O importador precisa tolerar variação de rótulos.

## 2. Estrutura da aba "Fluxo de Caixa" (verificada na planilha real)

- Bloco único de UM ano: linhas 1–304 (o resto da aba é vazio). **Não há célula de ano**
  → o ano-alvo precisa ser escolhido no momento do import.
- Colunas: `B` = rótulo do item, `C` = "O SEU PORQUÊ" (→ `CashflowItem.significado`),
  `D` = "Nível prioridade" (→ `CashflowItem.rank`), `E` = % receita (computada),
  `F..Q` = Jan..Dez, `S` = Total Anual (computada).
- Linhas de seção/total são FÓRMULAS; linhas de item são VALORES — essa distinção
  (célula com fórmula vs literal) é o critério primário de "campo manual".

### Seções manuais (importar)

| Planilha (linhas)                          | Grupo no app (template)                     | Observação                                        |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------- |
| Entradas Fixas (15–21)                     | `Entradas > Entradas Fixas`                 |                                                   |
| Sem Tributação (27–36)                     | `Entradas Variáveis > Sem Tributação`       |                                                   |
| **Receita Investimentos (40–46)**          | **não existe no template**                  | realoca só itens c/ correspondência direta — §4.1 |
| Com Tributação (50–53)                     | `Entradas Variáveis > Com Tributação`       | "Empresa 1..4"                                    |
| Habitação (66–83)                          | `Despesas Fixas > Habitação`                |                                                   |
| Transporte (88–108)                        | `Despesas Fixas > Transporte`               |                                                   |
| Saúde (113–122)                            | `Despesas Fixas > Saúde`                    |                                                   |
| Despesas Pessoais (127–143)                | `Despesas Fixas > Despesas Pessoais`        |                                                   |
| Lazer (148–157)                            | `Despesas Fixas > Lazer`                    |                                                   |
| Educação (162–168)                         | `Despesas Fixas > Educação`                 |                                                   |
| Animais de Estimação (173–177)             | `Despesas Fixas > Animais de Estimação`     |                                                   |
| **Despesas Financeiras (182–194)**         | **não existe no template**                  | DESCARTADA inteira — §4.1                         |
| Impostos (199–204)                         | `Despesas Fixas > Impostos`                 |                                                   |
| Despesas com dependentes (209–214)         | `Despesas Fixas > Despesas com Dependentes` | grupo template desde 05/08/2026 — §4.1            |
| Despesas Empresa (219–228)                 | `Despesas Fixas > Despesas Empresa`         |                                                   |
| Despesas Temporárias / Variáveis (244–257) | `Despesas > Despesas Variáveis`             | nome difere, mapeamento fixo                      |
| Conta Corrente (267–271, linhas "Banco")   | `Conta Corrente` (type `saldo`)             | alimenta carry-over                               |

### Seções que NÃO importam (computadas no app ou fora do escopo v1)

- Totais/índices: Total de Entradas, Saldo conta corrente mês anterior, Saldo do mês,
  Índice de poupança, Fluxo de caixa livre, Evolução do Patrimônio, Índice Paz.
- **Aporte/Resgate Investimentos (275–287)** — no app vem automático da carteira.
- **Rendimentos Recebidos (295)** — manual na planilha, automático no app (proventos).
  Ignorar e listar no relatório de import ("valor da planilha: X; no app é automático").
- **Planejamento Financeiro (233–239, "Objetivo (...)")** — no app essas linhas são
  espelho de sonhos (objetivoId, somente leitura). Ignorar no v1 e reportar; criar
  sonhos a partir delas é candidato a fase futura (§7).
- **Inflação Pessoal (60)** — ✅ resolvido na F1: no app NÃO é persistida — é 100%
  derivada client-side (`InflationPedroRow.tsx` calcula a variação mensal das despesas
  agregadas). Ignorar e reportar ("calculada automaticamente no app a partir das
  despesas").

## 3. Regras de importação

1. **Só células de valor ≠ 0.** A planilha vem preenchida com 0 por padrão; importar
   zeros criaria milhares de `CashflowValue` inúteis.
2. **Detecção de seção por âncora + fuzzy.** Âncora = linha de fórmula cujo rótulo casa
   (normalizado: casefold, sem acento/pontuação) com a lista de seções conhecidas.
   Itens = linhas de VALOR entre uma âncora e a próxima. Rótulos de item não precisam
   casar com nada: viram itens do grupo com o nome que o cliente usou.
3. **Match de item por nome normalizado** dentro do grupo: bate com item do template ou
   item custom já existente → reusa (grava valores nele); não bate → cria item custom
   no grupo personalizado. Também grava `significado` (col. C) e `rank` (col. D) quando
   preenchidos e o item foi criado pelo import (não sobrescreve significado/rank de item
   pré-existente sem opção explícita).
4. **Idempotência.** Reimportar o mesmo arquivo não duplica: itens casam por nome
   normalizado, valores são upsert por (item, ano, mês).
5. **Conflito de valor** (célula já tem valor no app, diferente do da planilha): política
   escolhida no preview — `sobrescrever` (default; caso de uso é onboarding, planilha é
   fonte da verdade) ou `manter existente`. O preview mostra a lista de conflitos.
6. **Sem cores.** Import grava valores "planejados" sem cor. Marcação de realizado
   (verde/vermelho) tem semântica própria (sync com sonhos) — cliente marca depois.
   Opção "marcar meses passados como realizados" fica como decisão de produto (§7).
7. **Personalização respeitada.** Escrever num grupo template dispara `personalizeGroup`
   (mesma infra do batch-update). O import NUNCA cria grupos (decisão §4.1) — só itens
   custom dentro de grupos existentes.
8. **Impersonation.** Tudo via `requireAuthWithActing` — consultor importa em nome do
   cliente (caso de uso primário: onboarding dos clientes do Pedro), com log.
9. **Histórico.** `recordChange` com action nova `fluxo.importar-planilha` (section
   `fluxo-caixa`), resumo agregado (n grupos, n itens criados, n células gravadas,
   arquivo/hash). Undo do import completo é fase 3 (snapshot pode ficar grande).

## 4. Decisões de mapeamento

### 4.1 Grupos da planilha sem correspondente no template — ✅ DECIDIDO 31/07/2026

### (revisado 05/08/2026: Dependentes virou grupo template)

**O import NUNCA cria grupos.** Política por seção (Wellington, 31/07; revisão 05/08):

- **`Despesas com dependentes`: grupo template próprio desde 05/08/2026** (Wellington).
  "Despesas com Dependentes" entrou no template sob Despesas Fixas, entre Impostos e
  Despesas Empresa (posição da planilha), com os itens da planilha-modelo: Escola /
  Faculdade, Cursos, Pensão, Material escolar, Vestuário, Outros. A seção importa como
  qualquer outra (match por nome, item novo → custom). Bancos existentes ganham o grupo
  via `ensureDependentesTemplate()` (upgrade lazy, rebaixa orderIndex dos irmãos e dos
  overrides personalizados).
- **`Despesas Financeiras`: DESCARTADA inteira.** Todos os itens viram ignorados com
  motivo ("descartada no import").
- **`Receita Investimentos`: realocação item a item, só correspondência DIRETA.**
  Itens sem correspondente direto → ignorados com motivo.
  Tabela de realocação (mapper, `REMAP_ITENS`):
  - Proventos Fii's → `Entradas Fixas > Receita Proventos FII's`
  - Dividendos/JCP → ignorado (automático no app, proventos da carteira);
    Juros Renda Fixa → ignorado (ambíguo: o app separa em Pré/Pós/Híbridos).
- **Colisão de realocação:** se a planilha preenche o mesmo item na seção-destino E na
  seção realocada, os meses são SOMADOS (alocação sem perda) e o preview mostra aviso.

### 4.2 Ano-alvo

A planilha não tem ano. O wizard pede o ano (default: ano corrente). Import é sempre
de UM ano por arquivo; cliente com histórico de vários anos importa um arquivo por ano
(a UI deixa repetir o fluxo trocando o ano).

## 5. Arquitetura

```
parseFlcXlsx(buffer)               → IR { secoes: [{ chave, nome, itens: [{ label,
  (puro, sem prisma)                  significado, rank, valores[12] }] }],
                                     ignorados[], avisos[] }
mapFlcToCashflow(IR, árvore user)  → pré-passe §4.1 (descarte/realocação), depois plano
  (puro, recebe tree do usuário      ANINHADO por seção: { grupos: [{ chave, destino
   já filtrada pelo ano-alvo)        {groupId,nome}, itens: [{ destino existente|criar,
                                     escritas[], conflitos[], jaIguais[] }] }],
                                     ignorados[], avisos[], resumo }
POST /api/cashflow/import/preview  → multipart (.xlsx) + ano → roda parse+map, NÃO grava,
                                     devolve plano serializado + resumo
POST /api/cashflow/import/commit   → mesmo upload + ano + opções (política de conflito,
                                     overrides de mapeamento) → transação: personaliza
                                     grupos, cria itens custom, upsert de valores,
                                     recordChange; devolve relatório final
UI: modal wizard em /fluxodecaixa  → 3 passos: upload → preview (ano, conflitos,
                                     itens/grupos novos, ignorados com motivo) → resultado
```

- **Parsing:** `exceljs` (MIT, já compatível com a política de licenças). Validar na F0
  que ele lê o arquivo real do Pedro (a planilha tem gráficos malformados que quebram
  openpyxl; risco equivalente no Node — se `exceljs` engasgar, fallback SheetJS CE
  Apache-2.0 ou pré-processamento removendo drawings do zip).
- Upload processado em memória (sem persistir arquivo — LGPD); limite ~10 MB; zod nas
  opções; rate limit no endpoint.
- Client: após commit, invalidar caches de cashflow (mesma invalidação do batch-update).
- O commit reusa a lógica interna do batch-update (personalização, guards de objetivoId)
  extraída em serviço compartilhado — não duplicar.

## 6. Fases

### F0 — Fundação (parser) — ✅ concluída em 2026-07-31

- Fixture: **gerada programaticamente** (`src/test/fixtures/flcWorkbook.ts`, builder
  spec-driven) em vez de cópia anonimizada — evita commitar conteúdo proprietário do
  Pedro e dá controle total nas variantes (rename, item extra, seção renomeada).
- `src/services/cashflow/import/parseFlcXlsx.ts` puro + 19 testes (seções, meses F–Q,
  significado/rank, fórmula-vs-valor, zeros, avisos de layout inesperado).
- Prova com o arquivo real ✅: **SheetJS (`xlsx`, já era dependência) lê o arquivo sem
  engasgar nos gráficos malformados** — exceljs não foi necessário. 17 seções, 24
  ignorados com motivo, 0 avisos. Descobertas incorporadas ao parser: (a) itens podem
  não ter célula alguma nos meses; (b) fórmula-vs-valor é critério de DESEMPATE de
  âncora, não critério primário ("Despesas Financeiras" é seção E item de Despesas
  Empresa; dentro do Aporte/Resgate há linha com fórmula); (c) linhas avulsas
  conhecidas (Saldo mês anterior, Inflação Pessoal, Evolução, Rendimentos Recebidos)
  precisam de lista própria de ignore por rótulo.

### F1 — Mapeamento + preview — ✅ código concluído em 2026-07-31

- ✅ `mapFlcToCashflow` puro + 16 testes (match normalizado via nome canônico
  `templateName`, criação de itens custom c/ significado/rank→string, pré-passe
  §4.1 descarte/realocação c/ soma em colisão, conflito×jaIgual×escrita
  célula a célula arredondado a 2 casas, objetivoId somente-leitura, tombstones
  não casam, seção duplicada/ausente vira aviso).
- ✅ `POST /api/cashflow/import/preview` (auth acting + log de impersonation,
  multipart em memória, zod no ano, 413 acima de 10 MB, FlcParseError→400) +
  6 testes de rota + tier de rate limit `/api/cashflow/import` (10/min).
- ✅ Inflação Pessoal confirmada como derivada client-side (`InflationPedroRow.tsx`)
  — não importa; motivo atualizado no parser.
- ✅ Prova com o arquivo real (pós-decisão §4.1): 14 seções → grupos existentes,
  161 células, 0 avisos, 178 ignorados todos com motivo (13 da seção descartada).
- ✅ §4.1 decidido em 31/07 (Wellington) — ver seção 4.1. §7 segue aberto, mas
  as questões têm default v1 definido (não bloqueiam F2 mínima).

### F2 — Commit + UI — ✅ concluída em 2026-07-31

- ✅ `POST /api/cashflow/import/commit`: recalcula o plano no servidor (client não
  manda plano serializado), executa via `executeFlcImportPlan` (personalizeGroup/
  ensurePersonalizedItem + upsert na chave `itemId_userId_year_month`; por item com
  try/catch, como o batch-update — não é transação única), `politicaConflito`
  sobrescrever|manter, `recordChange` action `fluxo.importar-planilha` (rótulo em
  renderChange.ts; undo fora do registry até F3), devolve árvore pós-import.
  Multipart compartilhado com o preview em `importRequest.ts`.
- ✅ Wizard `ImportPlanilhaModal` (upload → prévia → resultado) com botão
  "Importar planilha" na DataTableTwo; pós-commit grava `groups` no cache do ano
  e invalida cashflow.all + planejamento (padrão batch-update).
- ✅ Fix no mapper: itens homônimos na mesma seção (3× "Banco", vários "Outros")
  são SOMADOS mês a mês com aviso — upsert por nome sobrescreveria silencioso.
- ✅ Testes: 6 executor + 5 rota commit + 4 componente (total do importador: 61).
- ✅ Verificação runtime (dev + usuário demo + arquivo real): preview 137 células/
  10 novos/24 conflitos, commit 161 gravadas, reimport 100% idempotente (0 gravadas,
  161 já iguais), wizard dirigido via Playwright de ponta a ponta.

### F3 — Polimento

- Undo do import (registry de undo, avaliar snapshot agregado).
- E2E Playwright com fixture.
- Decisões pendentes do §7 que tiverem virado requisito (sonhos, realizado, multi-ano
  em lote, abas de carteira).

## 7. Questões em aberto (decidir com Pedro/Wellington antes da F2)

1. ~~Grupos ausentes no template (§4.1)~~ — ✅ DECIDIDO 31/07 (Wellington): nunca criar
   grupos; Despesas Financeiras descartada, realocação só com correspondência direta
   (detalhes na §4.1).
2. Linhas "Objetivo (...)" do Planejamento Financeiro: ignorar (v1) ou criar sonhos
   automaticamente com meta/aporte derivados?
3. Meses já decorridos do ano importado: deixar como planejado (v1) ou marcar realizado?
4. Rendimentos Recebidos da planilha: só reportar (v1) ou usar para conferência contra
   os proventos automáticos?
5. Import de múltiplos anos em lote (vários arquivos de uma vez)?

## 8. Fora do escopo (agora)

- Abas de carteira (Ações, FIIs, Renda Fixa, etc.) — importação de posições/transações
  é um projeto próprio (envolve matching de ativos, preço médio, datas).
- Import automático recorrente/sincronização contínua com a planilha.
- Editar a planilha a partir do app (mão única: planilha → app).
