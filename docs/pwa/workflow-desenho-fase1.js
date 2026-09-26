export const meta = {
  name: 'pwa-fase1-desenho',
  description: 'Fase 1 do PWA (Carteira): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch feat/pwa-fase0 — é o branch de integração do PWA):
O SISTEMA INTEIRO está virando um PWA bem utilizável no celular, SEM área separada: a MESMA base fica responsiva; mudanças valem só abaixo do breakpoint lg (1024px) e o layout de computador NÃO pode mudar (há teste e2e de desktop).
Fases: 0 Base (PRONTA neste branch) → 1 CARTEIRA (ESTA) → 2 Fluxo de caixa → 3 demais módulos → 5 push/acabamento. Consultor/Admin ficam fora. Teste do dono: visão de celular do navegador (DevTools), sem instalar.

O QUE A FASE 0 JÁ ENTREGOU (reutilize, não reinvente — leia os arquivos):
- Casca mobile abaixo de lg: src/layout/mobile/{MobileHeader,MobileTabBar,MoreSheet,LaunchSheet}.tsx, src/layout/navigation.tsx. Barra de abas: Carteira · Fluxo · ＋ Lançar · Planejar · Mais. "+ Lançar → Novo investimento" abre /carteira?acao=novo (AddAssetWizard) e "Resgatar" /carteira?acao=resgate (RedeemAssetWizard).
- Primitivos: src/components/ui/sheet/BottomSheet.tsx; src/components/ui/modal/index.tsx (Modal vira bottom sheet abaixo de lg, mesma API); src/components/ui/table/ResponsiveTable.tsx + TABLE_STYLES/TABLE_MOBILE_STYLES em src/components/ui/table/tableStyles.ts (tabela → cartões no celular). Overlay novo usa Modal/BottomSheet ou marca data-mf-overlay (senão a barra de abas fica por cima).
- Testes: e2e/mobile-overflow.spec.ts (nenhuma rota pode passar de 390px), e2e/mobile-shell.spec.ts, e2e/desktop-layout.spec.ts (guarda do desktop). docs/pwa/README.md e docs/pwa/fase0-spec-desenho.json têm o plano e a spec da fase 0 — LEIA.
- Hoje a /carteira não transborda a 390px só porque a casca CORTA o transbordo ([data-mf-content]); o conteúdo em si ainda é o layout de desktop espremido (tabelas largas cortadas, abas, cards). A fase 1 é fazer a Carteira ser BOA no celular de verdade.

DECISÕES VISUAIS JÁ TOMADAS (fase 0, valem aqui): #0079F2 só em elementos NÃO textuais (ícone ativo, pílula, FAB, foco); textos/links/botões com texto em patrimônio #396CAA (claro) e tranquilidade #6E9DC4 (escuro). Negativos: vermelho #D92D20 (claro) / #F97066 (escuro). NÃO mexer em brand-500 (#465fff). Título duplicado (cabeçalho mobile + h1) aceito até as fases 1–3 (pode propor resolver na Carteira). Paleta obrigatória em src/constants/brandColors.ts: potencia #2D2D2D, seguranca #314666, patrimonio #396CAA, outside #0079F2, tranquilidade #6E9DC4, transparencia #CCCCCC, escolha #EAEAEA. Fonte Outfit. Dark mode existe (classe dark).

ESCOPO DA FASE 1 (Carteira) — tudo abaixo de lg, desktop intacto:
1. /carteira (src/app/(admin)/(home)/carteira/page.tsx, src/components/carteira/CarteiraTabs.tsx): abas principais Resumo/Análise + abas das classes de ativo (Reserva de Emergência, Reserva de Oportunidade, Renda Fixa, FIM/FIA, FII, Ações, Stocks, REIT, ETF, Moedas/Cripto, Opções, Previdência/Seguros, Imóveis e Bens, Alocação). Navegação entre abas no celular (hoje: fileira de botões).
2. Resumo: CarteiraResumo.tsx, MarketIndicatorsCards.tsx, CaixaParaInvestirCard (src/components/carteira/shared/), MetricCard, cardStyles.ts, gráficos (ApexCharts) — legibilidade a 390px e 320px.
3. As ~14 tabelas de classe: GenericAssetTable (src/components/carteira/shared/GenericAssetTable.tsx) e as específicas (*Table.tsx em src/components/carteira/). No celular: cartões via ResponsiveTable/TABLE_MOBILE_STYLES, com o que mostrar no cartão fechado vs aberto; EDIÇÃO inline hoje existe (EditableCell, EditableObjetivoCell, EditableValorCell, EditableTextCell) — como editar no celular (sheet de edição?); totais/rodapé por seção; ordenação; "Quanto Falta" com cor por faixa (quantoFaltaClass.ts); ativos planejados (PlanejadoNameCell).
4. Página do ativo /ativos/[id] e edição /ativos/[id]/editar.
5. Wizard de cadastro (AddAssetWizard.tsx + src/components/carteira/wizard/Step1…Step5, com muitos Step4*Fields) e de resgate (RedeemAssetWizard.tsx + redeemWizard/): 1 etapa por tela no celular, teclado numérico (inputmode), campos de data, busca de ativo, rodapé fixo com Voltar/Avançar acima do teclado. AddInvestmentModal, AddReservaModal, AddInvestmentSidebar.
6. Análise (CarteiraAnalise.tsx e src/components/analises/*: rentabilidade, risco×retorno, sensibilidade, proventos, cobertura FGC, IR): gráficos e tabelas no celular.
7. Performance: a /carteira demorou >9s em dev no celular — proponha medições e ganhos baratos (carregar abas sob demanda, gráficos lazy) SEM mudar regras de cálculo.
8. Testes: tirar dependência do corte da casca — /carteira deve caber de verdade (scrollWidth do conteúdo ≤ 390), novos e2e mobile da carteira (abrir aba de classe, abrir cartão, editar um campo, wizard até a etapa 4), e desktop inalterado.
Regras do projeto: CLAUDE.md do repo (invalidatePortfolioDerivedQueries após mutação, csrfFetch, etc.).
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
    performance: { type: 'string' },
    plano_qa: { type: 'string', description: 'o que QA mobile, QA desktop, revisor de código e segurança devem checar' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação' },
  },
  required: ['resumo', 'fatias', 'componentes_compartilhados', 'performance', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 1 (Carteira) do PWA. ${CONTEXTO}
Tarefa: leia o código (carteira, wizard, analises, primitivos da fase 0, e2e) e produza a ESPECIFICAÇÃO TÉCNICA da fase 1, pronta para 3-4 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (merge trivial). Arquivo tocado por duas partes vai para UMA fatia; descreva o contrato (props/exports) que a outra consome. Se precisar, uma fatia 0 de contratos/primitivos que roda antes das outras.
- Concreto: arquivos, exports, props, classes Tailwind com prefixos de breakpoint (mudanças abaixo de lg; desktop idêntico), como o GenericAssetTable passa a usar ResponsiveTable, como a edição inline vira sheet no celular preservando as mesmas mutações/invalidações.
- Performance: onde medir e o que fazer (sem mudar cálculo).
- Diga o que o QA desktop compara e quais e2e novos entram; como tirar a /carteira da dependência do corte [data-mf-content].
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 1 (Carteira) do PWA. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela (tokens de cor em :root, dark mode, sem scroll horizontal, bibliotecas só dos CDNs permitidos, tudo inline).
2. Leia os componentes atuais da carteira/wizard/analises e os da casca da fase 0 para manter o visual (e abra docs/pwa/fase0-prototipo.html para seguir o mesmo estilo e a mesma casca). Embuta o SVG real do logo (public/images/logo/logo-icon.svg) onde precisar.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta), simulando um iPhone (390x844) dentro da casca da fase 0 (cabeçalho + barra de abas), com seletor de cenário e toggle claro/escuro, mostrando: (a) Resumo da carteira (patrimônio, rentabilidade, Caixa para Investir, indicadores de mercado, alocação/gráfico); (b) navegação entre as abas de classe (proponha: chips roláveis? seletor em sheet? — justifique); (c) uma aba de classe (Ações) como lista de cartões: fechado e aberto, total da seção, "Quanto Falta" com cor, ativo planejado; (d) edição de um campo (objetivo/valor) no celular; (e) Renda Fixa (campos diferentes: emissor, taxa, vencimento); (f) página do ativo; (g) wizard de cadastro no celular — etapa 1 (tipo), etapa 3 (busca do ativo) e etapa 4 (dados: quantidade, preço, data, instituição) com teclado numérico e rodapé fixo; (h) resgate; (i) Análise: rentabilidade e proventos no celular; (j) estados vazio/carregando (skeleton)/erro; (k) miniatura do DESKTOP inalterado. Texto pt-BR, números R$ realistas, só cores da paleta.
4. Especifique medidas, estados, acessibilidade (aria, foco, contraste AA, alvos ≥44px) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (QA de desenho + acessibilidade + regras de negócio) da fase 1 (Carteira) do PWA. ${CONTEXTO}
DERRUBE as propostas abaixo: encontre o que vai quebrar ou decepcionar. Verifique contra o código real (leia os arquivos citados) e abra o protótipo em ${ux.prototipo_path} (leia; se quiser renderize com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque: fatias sem arquivos em comum; desktop inalterado (classes só com breakpoint); edição no celular preserva mutação + invalidatePortfolioDerivedQueries + csrfFetch; todas as ~14 classes cobertas (campos diferentes: renda fixa, opções, imóveis, previdência, reservas, alocação); ativos planejados; wizard com todos os Step4*Fields (teclado, data, rodapé acima do teclado, iPhone SE 320px); gráficos Apex a 320px; dark mode; contraste AA com a paleta; alvos ≥44px; overlays sob a barra de abas; performance proposta realista; e2e viáveis (o CI usa banco do seed e build de produção).
Só problemas reais com evidência. Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: você já fez uma primeira versão (abaixo) e o revisor crítico apontou problemas. Produza a VERSÃO FINAL incorporando cada crítica válida (as rejeitadas vão em "riscos" com o porquê). A especificação deve implementar exatamente o protótipo (resumo do designer abaixo).
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: você já fez o protótipo em ${ux.prototipo_path}. O revisor crítico apontou os problemas abaixo. ATUALIZE o mesmo arquivo corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a especificação do arquiteto (resumo abaixo).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, componentes: arq.componentes_compartilhados })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }