export const meta = {
  name: 'pwa-fase2-desenho',
  description: 'Fase 2 do PWA (Fluxo de caixa): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch feat/pwa-fase0 — branch de integração do PWA, já com as fases 0 e 1):
O SISTEMA INTEIRO está virando um PWA bem utilizável no celular, SEM área separada: a MESMA base fica responsiva; mudanças valem só abaixo do breakpoint lg (1024px) e o computador NÃO pode mudar (há guardas e2e de desktop).
Fases: 0 Base ✓ → 1 Carteira ✓ → 2 FLUXO DE CAIXA (ESTA) → 3 demais módulos → 5 push/acabamento. Consultor/Admin fora. Teste do dono: visão de celular do navegador (DevTools).

REUTILIZE O QUE JÁ EXISTE (leia antes): docs/pwa/README.md; docs/pwa/fase1-decisoes.md e docs/pwa/fase1-spec-desenho.json (padrões da fase 1); protótipos docs/pwa/fase0-prototipo.html e docs/pwa/fase1-prototipo.html (mesma casca e estilo). Primitivos: src/layout/mobile/{MobileHeader,MobileTabBar,MoreSheet,LaunchSheet}.tsx; src/components/ui/sheet/{BottomSheet,MobileEditSheet,MobileNumberField,MobileSaveToast}.tsx (MobileEditSheet: onSubmit false/exceção = falha, {error} = falha com motivo); src/components/ui/table/{ResponsiveTable,CardSectionBand}.tsx + TABLE_MOBILE_STYLES; src/components/ui/tabs/ResponsiveTabNav.tsx; src/hooks/useKeyboardInset.ts; src/lib/ui/numberInput.ts; e2e/helpers/{mobileFit,desktopStructure}.ts; e2e/mobile-*.spec.ts.

ESTADO ATUAL DO FLUXO NO CELULAR: /fluxodecaixa (src/app/(admin)/(others-pages)/(tables)/fluxodecaixa/page.tsx) mostra a planilha de DESKTOP encolhida (src/components/tables/DataTables/TableTwo/DataTableTwo.tsx + DataTableTwoGroupRenderer.tsx + src/components/cashflow/*: GroupHeader, ItemRow, EditableItemRow, GridCells, CurrencyInput, CommentModal/CommentIndicator, ColorPickerButton, CashflowDnd (@dnd-kit, arrastar linhas inclusive entre seções), ImportPlanilhaModal, linhas derivadas: SaldoContaCorrenteAnteriorRow, InvestmentIncomeRow, SavingsIndexRow, FinancialPeaceIndexRow, InflationPedroRow, SummaryRow, TotalRow). No celular aparecem só Itens + Total anual (colunas fixas) e os 12 meses exigem rolar de lado. O modo "Orçamento" (src/components/cashflow/orcamento/*: OrcamentoVsRealSection, OrcamentoTable, OrcamentoChart, OrcamentoMensalChart) idem. Hooks: src/hooks/useCashflow.ts, useCashflowDerivedRows.ts, useOrcamento.ts. APIs em src/app/api/cashflow/* (update, batch-update, item, items, comments, structure, import, orcamento, conta-corrente-anterior, investimentos). O "+ Lançar" (LaunchSheet) mostra "Despesa ou receita" DESABILITADO com selo "Em breve".

DECISÕES VISUAIS JÁ TOMADAS (valem aqui): #0079F2 só em elemento NÃO textual; texto/links/botões em patrimônio #396CAA (claro) / tranquilidade #6E9DC4 (escuro). Negativos #D92D20 / #F97066. Não mexer em brand-500. Paleta obrigatória src/constants/brandColors.ts. Fonte Outfit. Dark mode. Alvos ≥44px. h1 visível compacto (decisão da fase 1). Cores das linhas/grupos do fluxo (ColorPickerButton) são escolha do usuário — respeitar.

ESCOPO DA FASE 2 — tudo abaixo de lg, desktop intacto:
1. "VISÃO DO MÊS" (decisão do dono): no celular o padrão é UM mês por vez (seletor de mês com setas/arrastar + ano no cabeçalho, como hoje), mostrando as seções (Entradas, Despesas etc.) como lista agrupada: linha = nome + valor do mês + (opcional) total anual/orçado; grupos recolhíveis com subtotal; linhas derivadas (saldo CC anterior, índices, total) legíveis.
2. EDIÇÃO COMPLETA no celular (decisão do dono): tocar numa linha abre sheet para editar o valor do mês (teclado numérico; fórmula estilo Excel "=100+50" já existe na célula do desktop — manter), e também: comentário da célula, renomear/adicionar/excluir linha, cor, mover linha (substituto do arrastar: "Mover para cima/baixo/para outra seção"), editar grupo (EditButton/GroupHeader). As mesmas mutações e o mesmo histórico/Desfazer (recordChange) do desktop. Linhas automáticas/derivadas não editáveis continuam não editáveis.
3. "VER ANO INTEIRO": alternativa com a grade de 12 meses (a planilha atual) para quem quiser, com colunas fixas e rolagem horizontal decente — proponha como (ex.: tela cheia paisagem-friendly).
4. ORÇAMENTO (Orçamento vs Real) no celular: mês a mês por categoria, barras/alertas de 80/100/estouro legíveis, gráficos a 320px.
5. LANÇAMENTO RÁPIDO REAL no "+ Lançar" → "Despesa ou receita" deixa de ser "Em breve": formulário curto (tipo despesa/receita, valor, linha do fluxo com busca, mês — padrão hoje, opção "todo mês"/recorrente, descrição) reaproveitando src/services/assistente/lancamento.ts (montarProposta/aplicarProposta: resolve a linha, soma na célula, UMA entrada desfazível no histórico via recordChange) — extrair a aplicação SEM o token assinado do assistente para uma função/rota compartilhada (ex.: POST /api/cashflow/lancamento-rapido com zod + csrf + requireAuthWithActing), sem quebrar o assistente. Depois de lançar: aviso com Desfazer (o histórico já tem desfazer — pode usar), invalidar as queries do fluxo.
6. Importar planilha (ImportPlanilhaModal) e outras ações da toolbar (CashflowToolbar: expandir/recolher, importar) no celular.
7. Testes: /fluxodecaixa cabendo sem depender de corte; e2e mobile do fluxo (trocar mês, editar valor e restaurar, lançamento rápido até a confirmação SEM gravar OU gravando e desfazendo — decidir o seguro para o CI com banco do seed), guarda estrutural de desktop do fluxo e do orçamento rodando no CI.
Regras do projeto: CLAUDE.md do repo (csrfFetch, invalidação, zod nas rotas, requireAuthWithActing).
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 3-4 devs em paralelo, SEM arquivos em comum entre fatias; inclua uma fatia 0 de contratos compartilhados se precisar',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          titulo: { type: 'string' },
          objetivo: { type: 'string' },
          arquivos_novos: { type: 'array', items: { type: 'string' } },
          arquivos_alterados: { type: 'array', items: { type: 'string' } },
          detalhes: { type: 'string', description: 'passo a passo técnico concreto' },
          testes: { type: 'string' },
          criterios_aceite: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'titulo', 'objetivo', 'arquivos_novos', 'arquivos_alterados', 'detalhes', 'testes', 'criterios_aceite'],
      },
    },
    componentes_compartilhados: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nome: { type: 'string' }, caminho: { type: 'string' }, api: { type: 'string' }, uso: { type: 'string' } },
        required: ['nome', 'caminho', 'api', 'uso'],
      },
    },
    lancamento_rapido: { type: 'string', description: 'rota/serviço, validação, histórico, desfazer, como não quebrar o assistente' },
    plano_qa: { type: 'string', description: 'o que QA mobile, QA desktop, revisor de código e segurança devem checar' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação' },
  },
  required: ['resumo', 'fatias', 'componentes_compartilhados', 'lancamento_rapido', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    prototipo_path: { type: 'string' },
    telas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nome: { type: 'string' }, descricao: { type: 'string' }, decisoes: { type: 'array', items: { type: 'string' } } },
        required: ['nome', 'descricao', 'decisoes'],
      },
    },
    especificacao_visual: { type: 'string', description: 'medidas, cores (só da paleta), tipografia, espaçamentos, estados, dark mode, animações' },
    acessibilidade: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação' },
  },
  required: ['resumo', 'prototipo_path', 'telas', 'especificacao_visual', 'acessibilidade', 'perguntas_para_wellington'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alvo: { type: 'string', enum: ['arquitetura', 'design', 'ambos'] },
          gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          descricao: { type: 'string' },
          evidencia: { type: 'string', description: 'arquivo:linha ou trecho do protótipo que comprova' },
          sugestao: { type: 'string' },
        },
        required: ['alvo', 'gravidade', 'descricao', 'evidencia', 'sugestao'],
      },
    },
    pontos_fortes: { type: 'array', items: { type: 'string' } },
  },
  required: ['problemas', 'pontos_fortes'],
}

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 2 (Fluxo de caixa) do PWA. ${CONTEXTO}
Tarefa: leia o código (fluxo, orçamento, hooks, APIs de cashflow, serviço de lançamento do assistente, primitivos das fases 0/1, e2e) e produza a ESPECIFICAÇÃO TÉCNICA da fase 2, pronta para 3-4 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (merge trivial). Arquivo tocado por duas partes vai para UMA fatia; descreva o contrato (props/exports) que a outra consome. Fatia 0 de contratos/primitivos se precisar.
- Concreto: arquivos, exports, props, classes com prefixo de breakpoint (desktop idêntico), como a visão do mês reaproveita o estado/mutações do useCashflow (sem duplicar lógica de fórmula, linhas derivadas, personalização clone-on-write), como cada ação de edição mapeia para a mutação existente, e a rota do lançamento rápido (zod, csrf, auth, histórico) sem quebrar o assistente.
- Diga o que o QA desktop compara e quais e2e entram (seguros para o CI com banco do seed + build de produção).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 2 (Fluxo de caixa) do PWA. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela (tokens de cor em :root, dark mode, sem scroll horizontal da página, bibliotecas só dos CDNs permitidos, tudo inline).
2. Leia os componentes atuais do fluxo/orçamento e os da casca. Abra docs/pwa/fase1-prototipo.html e siga o MESMO estilo, a mesma casca (cabeçalho + barra de abas) e a mesma bancada (seletor de cenários, notas, toggle claro/escuro, "Ver a 320px"). Embuta o SVG real do logo (public/images/logo/logo-icon.svg) onde precisar.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta), iPhone 390x844, com cenários: (a) visão do mês (Entradas/Despesas agrupadas, subtotais, saldo, linhas derivadas, seletor de mês); (b) trocar de mês; (c) editar valor da célula com teclado (e fórmula "=100+50"); (d) ações da linha (comentário, renomear, cor, mover, excluir) e do grupo (adicionar linha, editar); (e) falha ao salvar; (f) "ver ano inteiro" (grade 12 meses); (g) Orçamento vs Real do mês (categorias, 80/100/estouro, gráfico); (h) + Lançar → Despesa ou receita: formulário, busca de linha, recorrente, confirmação e aviso com Desfazer; (i) importar planilha; (j) vazio/carregando/erro; (k) miniatura do DESKTOP inalterado. Texto pt-BR, valores R$ realistas de uma família (salário, aluguel, mercado, escola…), só cores da paleta.
4. Especifique medidas, estados, acessibilidade (aria, foco, contraste AA, alvos ≥44px) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (QA de desenho + acessibilidade + regras de negócio + segurança) da fase 2 (Fluxo de caixa) do PWA. ${CONTEXTO}
DERRUBE as propostas abaixo: encontre o que vai quebrar ou decepcionar. Verifique contra o código real (leia os arquivos citados) e abra o protótipo em ${ux.prototipo_path} (leia; se quiser renderize com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque: fatias sem arquivos em comum; desktop inalterado; cada edição mapeada para a mutação/histórico existente (personalização clone-on-write de templates, fórmulas, linhas derivadas não editáveis, comentários, cores, mover entre seções); lançamento rápido (rota com zod/csrf/auth/impersonação de consultor, recordChange/desfazer, não quebrar o assistente, linha ambígua "Outros"); orçamento a 320px; teclado no iOS; contraste AA; alvos ≥44px; overlays sob a barra de abas; e2e viáveis no CI (banco do seed, build de produção, nada gravado sem restaurar).
Só problemas reais com evidência. Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: você já fez uma primeira versão (abaixo) e o revisor crítico apontou problemas. Produza a VERSÃO FINAL incorporando cada crítica válida (as rejeitadas vão em "riscos" com o porquê). A especificação deve implementar exatamente o protótipo (resumo do designer abaixo). Onde você e o designer divergirem, deixe EXPLÍCITO em perguntas_para_wellington (com recomendação) em vez de decidir sozinho.
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: você já fez o protótipo em ${ux.prototipo_path}. O revisor crítico apontou os problemas abaixo. ATUALIZE o mesmo arquivo corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a especificação do arquiteto (resumo abaixo). Onde divergir do arquiteto, deixe EXPLÍCITO em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, componentes: arq.componentes_compartilhados, lancamento_rapido: arq.lancamento_rapido })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }