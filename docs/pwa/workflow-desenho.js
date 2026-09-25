export const meta = {
  name: 'pwa-fase0-desenho',
  description: 'Fase 0 do PWA (base): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma; repo em /home/huske/dev/front; leia o CLAUDE.md do repo):
Decidimos transformar o SISTEMA INTEIRO em um PWA instalável e bem utilizável no celular, SEM criar uma área separada (/m): a MESMA base fica responsiva; mudanças valem só abaixo do breakpoint de desktop (lg) e o layout de computador NÃO pode mudar.

Fases do projeto: 0 Base (ESTA) → 1 Carteira → 2 Fluxo de caixa (edição completa no celular + lançamento rápido) → 3 demais módulos → 5 push + acabamento. Consultor e Admin ficam para depois.

ESCOPO DA FASE 0 (Base):
1. App instalável: web manifest (nome "My Finance", ícones gerados a partir do LOGO ATUAL em public/images/logo/{logo.svg,logo-icon.svg}), meta tags iOS (apple-touch-icon, status bar), theme-color na paleta, splash.
2. Service worker mínimo: página offline + cache SÓ de assets estáticos (/_next/static, ícones, fontes). NUNCA cachear /api/** nem HTML autenticado (dado financeiro, celular compartilhado). Logout limpa caches. Atualização após deploy integrada ao VersionWatcher existente (src/components/common/VersionWatcher.tsx, usa /api/version BUILD_ID).
3. Cartão "Instalar app": Android via beforeinstallprompt; iPhone com instruções (Compartilhar → Adicionar à Tela de Início); dispensável e lembrado (localStorage com try/catch).
4. Casca mobile: BARRA DE ABAS INFERIOR abaixo de lg no lugar do botão hambúrguer (src/layout/MobileSidebarTrigger.tsx), abas DECIDIDAS: Carteira · Fluxo · ＋ Lançar (central, destaque) · Planejamento · Mais. "Mais" abre um painel (bottom sheet) com todas as outras seções do menu atual (src/layout/AppSidebar.tsx — respeitar os mesmos filtros: Pluggy só com flag, Comunidade só com flag COMUNIDADE_HABILITADA, admin só role admin, itens permitidos quando consultor está personificando). O "＋ Lançar" na fase 0 pode abrir um placeholder/atalho (o lançamento rápido real é da fase 2) — proponha o comportamento. Cabeçalho mobile compacto com título da página, sino de notificações (hoje o NotificationDropdown vive no SidebarFooter, src/layout/SidebarFooter.tsx) e avatar/perfil. Safe areas do iPhone (env(safe-area-inset-*)), 100dvh, conteúdo não pode ficar escondido atrás da barra. BUG CONHECIDO a corrigir: hoje o botão hambúrguer fixo cobre o título de todas as páginas no celular.
5. Primitivos reutilizáveis que as próximas fases vão usar: (a) Modal vira bottom sheet no celular (src/components/ui/modal/index.tsx, mantendo API); (b) padrão "tabela → lista de cartões" no celular a partir do padrão único TABLE_STYLES (src/components/ui/table/tableStyles.ts); (c) helpers de safe-area/altura; (d) alvos de toque ≥44px.
6. Sessão de 30 dias (DECIDIDO): hoje o login emite JWT de 1d, ou 7d com rememberMe (src/app/api/auth/login/route.ts, cookie httpOnly sameSite lax; o middleware Edge verifica com jose). Proponha 30 dias com renovação deslizante segura.
7. Teste Playwright de regressão que abre TODAS as rotas autenticadas a 390px e falha se document.documentElement.scrollWidth > largura (hoje /carteira = 474px e /calendario = 448px transbordam — a fase 0 só precisa do teste + correções GLOBAIS; o conserto da carteira em si é fase 1, então o teste pode ter uma lista de exceções conhecidas documentada).
8. Acessibilidade básica: <html lang="en"> em src/app/layout.tsx deveria ser pt-BR.

Arquivos-chave: src/app/layout.tsx, src/app/(admin)/layout.tsx, src/app/(admin)/AdminLayoutClient.tsx, src/layout/*, src/middleware.ts (CSP com nonce por request, PUBLIC_FILE deixa arquivos com extensão públicos, matcher), src/components/common/VersionWatcher.tsx, src/constants/brandColors.ts (PALETA OBRIGATÓRIA em qualquer cor nova), src/components/ui/*, e2e/ (Playwright existente), src/app/api/auth/login/route.ts, logout route.
Estado medido a 390px: Planejamento/Saúde ok; Carteira transborda e é lenta; Fluxo mostra só Itens+Total anual; Agenda transborda; hambúrguer cobre títulos.
Paleta My Finance (brandColors.ts): potencia #2D2D2D, seguranca #314666, patrimonio #396CAA, outside #0079F2 (assinatura), tranquilidade #6E9DC4, transparencia #CCCCCC, escolha #EAEAEA. Fonte do app: Outfit. Tailwind com classes brand-500 etc. Modo escuro existe (classe dark).
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 2-3 devs em paralelo, SEM arquivos em comum entre fatias',
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
    service_worker: { type: 'string' },
    sessao_30_dias: { type: 'string' },
    plano_qa: { type: 'string', description: 'o que QA mobile, QA desktop e segurança devem checar' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'fatias', 'componentes_compartilhados', 'service_worker', 'sessao_30_dias', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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
    perguntas_para_wellington: { type: 'array', items: { type: 'string' } },
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 0 do PWA. ${CONTEXTO}
Tarefa: leia o código dos arquivos-chave (e o que mais precisar) e produza a ESPECIFICAÇÃO TÉCNICA da fase 0, pronta para 2-3 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Divida em fatias SEM ARQUIVOS EM COMUM entre elas (o merge precisa ser trivial). Se um arquivo precisa ser tocado por duas partes, atribua-o a UMA fatia e descreva o contrato (props/exports) que a outra consome.
- Seja concreto: nomes de arquivos, exports, props, classes Tailwind/breakpoints, trechos de CSP (ex.: worker-src/manifest-src se necessário com o nonce atual), como registrar o SW sem quebrar a CSP com nonce, como gerar os PNGs dos ícones a partir do SVG (ferramenta disponível no repo? sharp não está instalado — proponha e justifique, ex.: gerar uma vez com script e commitar os PNGs).
- Desktop não pode mudar: diga como garantir (breakpoint lg, e o que o QA desktop compara).
- Sessão 30 dias: descreva mudança exata e segurança (renovação deslizante no middleware Edge? refresh no GET /api/auth/me? riscos de CSRF/roubo de cookie; logout).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 0 do PWA. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela (tokens de cor em :root, dark mode, sem scroll horizontal, bibliotecas só dos CDNs permitidos, tudo inline).
2. Leia os arquivos de layout/sidebar/modal/tabela do repo para entender o visual atual (Outfit, cantos arredondados 2xl, cinzas Tailwind, paleta brandColors). Leia public/images/logo/logo.svg e logo-icon.svg e EMBUTA o SVG real no protótipo (sem inventar logo).
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta), simulando um iPhone (390x844) com seletor de cenário, mostrando: (a) casca com barra de abas inferior (Carteira · Fluxo · ＋ Lançar central em destaque · Planejamento · Mais) e cabeçalho compacto (título, sino com badge, avatar) sobre uma página de exemplo com conteúdo real-ish da carteira; (b) painel "Mais" em bottom sheet com as demais seções (Saúde Financeira, Dívidas, Agenda, Perfil, Histórico, Relatórios, Educação, Comunidade, Conexões bancárias) agrupadas com ícones; (c) comportamento do "＋ Lançar" na fase 0 (proponha: ex. sheet com atalhos "Lançar despesa/receita" que leva ao fluxo, "Novo investimento" que abre o cadastro de ativo — deixe claro que o lançamento rápido completo é fase 2); (d) cartão "Instalar app" nas variantes Android e iPhone (com passo a passo); (e) exemplo de Modal virando bottom sheet; (f) exemplo de tabela → cartões (use uma tabela de ativos da carteira: Ticker, Qtd, Preço médio, Valor atual, Rentabilidade, % carteira); (g) página offline; (h) toggle claro/escuro; (i) uma miniatura de como fica no DESKTOP (inalterado) para deixar claro que só muda no celular. Textos em português do Brasil, números em R$ realistas. Todas as cores da paleta My Finance.
4. Especifique medidas (altura da barra, área de toque ≥44px, safe-area), estados (ativo, pressionado, badge), animações curtas, acessibilidade (aria, foco, contraste AA).
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (QA de desenho + acessibilidade + segurança) da fase 0 do PWA. ${CONTEXTO}
Seu trabalho é DERRUBAR as propostas abaixo: encontre o que vai quebrar ou decepcionar. Verifique contra o código real do repo (leia os arquivos citados) e abra o protótipo HTML em ${ux.prototipo_path} (leia o arquivo; se quiser, renderize com Playwright: chromium em /home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome, libs em LD_LIBRARY_PATH=${OUT}/../libs/extracted/usr/lib/x86_64-linux-gnu, import de /home/huske/dev/front/node_modules/playwright/index.mjs; screenshots em ${OUT}/revisao-*.png).
Cheque especialmente: fatias realmente sem arquivos em comum; CSP com nonce x registro do service worker; SW que possa servir dado autenticado velho ou de outro usuário; renovação de sessão no Edge; desktop inalterado; conteúdo escondido atrás da barra inferior/teclado; iPhone SE (320-375px) e textos longos; dark mode; contraste AA com a paleta; alvos de toque; filtros do menu (Pluggy/Comunidade/admin/personificação) no painel "Mais"; o que o "＋" faz antes da fase 2; teste de overflow viável.
Aponte só problemas reais com evidência (arquivo:linha ou trecho). Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: você já fez uma primeira versão (abaixo) e o revisor crítico apontou problemas. Produza a VERSÃO FINAL da especificação incorporando cada crítica válida (e diga em "riscos" as que você rejeitou e por quê). Mantenha a proposta de UX em mente (resumo do designer abaixo) para que a especificação implemente exatamente o protótipo.
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN (resumo + telas + especificação visual): ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: você já fez o protótipo em ${ux.prototipo_path}. O revisor crítico apontou os problemas abaixo. ATUALIZE o mesmo arquivo corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Garanta coerência com a especificação técnica do arquiteto (resumo abaixo).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA (resumo + componentes): ${JSON.stringify({ resumo: arq.resumo, componentes: arq.componentes_compartilhados })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
