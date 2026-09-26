export const meta = {
  name: 'pwa-fase3-desenho',
  description: 'Fase 3 do PWA (demais módulos): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch feat/pwa-fase2-fluxo = fases 0, 1 e 2 prontas; o branch de integração do PWA é feat/pwa-fase0):
O SISTEMA INTEIRO está virando um PWA bem utilizável no celular, SEM área separada: a MESMA base fica responsiva; mudanças só abaixo de lg (1024px); o computador NÃO pode mudar (guardas e2e de desktop).
Fases: 0 Base ✓ → 1 Carteira ✓ → 2 Fluxo ✓ → 3 DEMAIS MÓDULOS (ESTA, a última antes do merge na main) → 5 push/acabamento. Consultor e Admin (src/components/consultor, consultant, admin; /admin) ficam FORA. Teste do dono: visão de celular do navegador.

REUTILIZE O QUE JÁ EXISTE (leia antes): docs/pwa/README.md; decisões docs/pwa/fase1-decisoes.md e docs/pwa/fase2-decisoes.md; specs docs/pwa/fase1-spec-desenho.json e fase2-spec-desenho.json; protótipos docs/pwa/fase1-prototipo.html e fase2-prototipo.html (MESMA casca, estilo e bancada). Primitivos prontos: casca src/layout/mobile/*; src/components/ui/sheet/{BottomSheet (pilha de camadas), MobileEditSheet, MobileNumberField, MobileSaveToast (com ação opcional)}.tsx; src/components/ui/table/{ResponsiveTable, CardSectionBand}.tsx + TABLE_MOBILE_STYLES; src/components/ui/tabs/ResponsiveTabNav.tsx; src/hooks/useKeyboardInset.ts; src/lib/ui/numberInput.ts; date-picker com nativeOnMobile; ApexChartWrapper com mobileOptions / PIE_MOBILE_RESPONSIVE; wizard mobile da carteira (WizardFooter/WizardProgress); helpers e2e mobileFit/desktopStructure. Regras fixas: overlay novo usa Modal/BottomSheet ou data-mf-overlay; h1 visível compacto; alvos ≥44px; desktop idêntico.

DECISÕES VISUAIS JÁ TOMADAS: #0079F2 só em elemento não textual; texto/links/botões em #396CAA (claro) / #6E9DC4 (escuro); negativos #D92D20 / #F97066; âmbar #D97706/#FBBF24 (ponto) e #B45309 (texto) ACEITO como exceção para "atenção"; não mexer em brand-500; paleta src/constants/brandColors.ts; Outfit; dark mode.

ESCOPO DA FASE 3 — rotas e componentes (tudo abaixo de lg):
1. /planejamento-financeiro (src/components/planejamento: PlanejamentoFinanceiro, aposentadoria/* simulador com gráficos, sonhos/* objetivos) — aba "Planejar" da barra.
2. /saude-financeira (src/components/saude-financeira: indicadores, pontuação, gráficos, recomendações).
3. /dividas (src/components/dividas: lista de dívidas, SAC/Price, cronograma de parcelas em tabela, cadastro/edição em modal).
4. /calendario (src/components/calendar: FullCalendar — fase 0 já pôs a visão LISTA abaixo de 768px; eventos, novo evento em sheet, preferências, iCal).
5. /relatorios (src/components/relatorios: relatórios v2 com gráficos/tabelas e exportar PDF).
6. /historico-alteracoes (src/components/historicoAlteracoes: lista de alterações com Desfazer).
7. /profile (src/components/user-profile: dados, avatar, senha, 2FA, "Sair de todos os dispositivos", preferências).
8. /educacao e /educacao/[slug] (src/components/educacao: cursos, vídeos VTurb).
9. /comunidade, /comunidade/[id] (src/components/comunidade: feed, posts, curtidas, comentários — atrás de COMUNIDADE_HABILITADA; moderação fica fora).
10. /conexoes-bancarias (src/components/conexoes: Open Finance/Pluggy LIGADO EM PRODUÇÃO — lista de conexões, jornada ConectarBancoModal com consentimento (textos versionados, NÃO mudar o conteúdo), caixa de entrada de transações → Fluxo, AutorizacaoModal; o widget Pluggy Connect é iframe de terceiro).
11. Pendências leves das fases 1/2 que couberem sem risco (docs/pwa/README.md): ex. barra do mês do Orçamento não sticky, sheet do grupo sem Recolher. Opcional — o arquiteto decide.
12. Testes: nenhuma rota do escopo depende do corte [data-mf-content] (expectFitsWithoutClip a 390/320), e2e mobile por módulo (seguros para CI com banco do seed + build de produção; sem gravar ou restaurando), guardas estruturais de desktop por módulo rodando no CI.
13. Ao final desta fase o PWA vai para produção de uma vez: aponte o que falta para isso (QA geral, teste em aparelho real, instalação, push é fase 5).
Regras do projeto: CLAUDE.md do repo.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 4-5 devs em paralelo, SEM arquivos em comum entre fatias; inclua fatia 0 de contratos se precisar',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, titulo: { type: 'string' }, objetivo: { type: 'string' },
          arquivos_novos: { type: 'array', items: { type: 'string' } },
          arquivos_alterados: { type: 'array', items: { type: 'string' } },
          detalhes: { type: 'string' }, testes: { type: 'string' },
          criterios_aceite: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'titulo', 'objetivo', 'arquivos_novos', 'arquivos_alterados', 'detalhes', 'testes', 'criterios_aceite'],
      },
    },
    componentes_compartilhados: {
      type: 'array',
      items: { type: 'object', properties: { nome: { type: 'string' }, caminho: { type: 'string' }, api: { type: 'string' }, uso: { type: 'string' } }, required: ['nome', 'caminho', 'api', 'uso'] },
    },
    prontidao_producao: { type: 'string', description: 'o que falta para levar o PWA inteiro à main/produção depois desta fase' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'fatias', 'componentes_compartilhados', 'prontidao_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    prototipo_path: { type: 'string' },
    telas: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, descricao: { type: 'string' }, decisoes: { type: 'array', items: { type: 'string' } } }, required: ['nome', 'descricao', 'decisoes'] } },
    especificacao_visual: { type: 'string' },
    acessibilidade: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o arquiteto explícitas' },
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
          descricao: { type: 'string' }, evidencia: { type: 'string' }, sugestao: { type: 'string' },
        },
        required: ['alvo', 'gravidade', 'descricao', 'evidencia', 'sugestao'],
      },
    },
    pontos_fortes: { type: 'array', items: { type: 'string' } },
  },
  required: ['problemas', 'pontos_fortes'],
}

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 3 (demais módulos) do PWA. ${CONTEXTO}
Tarefa: leia o código dos 10 módulos, os primitivos das fases 0–2 e os e2e, e produza a ESPECIFICAÇÃO TÉCNICA da fase 3, pronta para 4-5 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (agrupe módulos por fatia; arquivo compartilhado vai para a fatia 0 ou para UMA fatia, com contrato descrito).
- Concreto: arquivos, exports, props, classes com prefixo de breakpoint, como cada tabela/modal/gráfico vira versão de celular reaproveitando os primitivos, sem mudar regras de negócio, APIs ou textos legais (consentimento Open Finance versionado).
- Diga o que o QA desktop compara, quais e2e entram e o que falta para o PWA ir à produção.
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 3 (demais módulos) do PWA. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Leia os componentes dos 10 módulos e abra docs/pwa/fase2-prototipo.html: siga o MESMO estilo, casca e bancada (seletor de cenários agrupado por módulo, notas, claro/escuro, "Ver a 320px").
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta), iPhone 390x844, com pelo menos um cenário por módulo mostrando a tela principal no celular e a interação mais importante: Planejar (aposentadoria com simulador e gráfico; sonhos), Saúde (pontuação e indicadores), Dívidas (lista, detalhe com parcelas em lista, cadastro em sheet), Agenda (lista + novo evento), Relatórios (relatório e exportar PDF), Histórico (lista com Desfazer), Perfil (dados, segurança, sair de todos), Educação (cursos e player), Comunidade (feed, post, comentário), Conexões bancárias (lista, jornada de consentimento com os textos atuais, caixa de entrada); estados vazio/carregando/erro onde fizer sentido; miniatura do desktop inalterado. Texto pt-BR, dados realistas, só cores da paleta.
4. Especifique medidas, estados, acessibilidade e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (desenho + acessibilidade + regras de negócio + segurança/LGPD) da fase 3 do PWA. ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código real e abra o protótipo em ${ux.prototipo_path} (pode renderizar com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque: fatias sem arquivos em comum; desktop inalterado; nenhuma regra de negócio/API/texto legal alterado (consentimento Open Finance versionado com hash; iframe da Pluggy); Desfazer do histórico (LIFO, 409); 2FA/senha/sair de todos; player VTurb e CSP; gráficos a 320px; FullCalendar; PDF no celular (download/compartilhar); teclado iOS; contraste AA; alvos ≥44px; overlays; e2e viáveis no CI (banco do seed, build de produção, flags desligadas: Pluggy e Comunidade).
Só problemas reais. Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: produza a VERSÃO FINAL incorporando cada crítica válida (rejeitadas em "riscos" com o porquê), implementando exatamente o protótipo. Divergências com o designer ficam EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: ATUALIZE o mesmo arquivo ${ux.prototipo_path} corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a arquitetura (resumo abaixo). Divergências com o arquiteto EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, componentes: arq.componentes_compartilhados })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }