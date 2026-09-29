export const meta = {
  name: 'pwa-fase5-desenho',
  description: 'Fase 5 do PWA (web push + acabamento): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch MAIN):
O PWA (fases 0–3: base instalável + casca mobile, Carteira, Fluxo, demais módulos) está EM PRODUÇÃO na main desde 28/09/2026. A fase 5 é a ÚLTIMA do plano: WEB PUSH + ACABAMENTO. Trabalha DIRETO da main (sem branch de integração — PRs normais para main). Desktop >= lg NÃO pode mudar visualmente (guardas e2e), exceto adições explicitamente aprovadas (ex.: seção de preferências de notificação no Perfil). Consultor e Admin continuam FORA do escopo mobile.

FATOS DO CÓDIGO (verificados hoje — confirme lendo):
- Notificações in-app JÁ EXISTEM: model Notification (userId, title, message, type, metadata Json, readAt, inviteId) em prisma/schema.prisma; rota App Router src/app/api/notifications/route.ts; sino/central no header. FONTES que criam Notification: src/services/cashflow/orcamentoAlertas.ts (orçamento estourando), src/services/calendario/lembretes.ts (lembretes da agenda, via cron), src/services/comunidade/notificacoes.ts (curtidas/comentários — flag COMUNIDADE_HABILITADA, OFF em prod), src/app/api/profile/export/route.ts, convites de consultor (src/app/api/consultant/invitations/*).
- public/sw.js NÃO tem handler de push/notificationclick ainda; registrado por src/components/pwa/ServiceWorkerRegistrar; SW só registra em build de produção.
- PRODUÇÃO: Lightsail único (app systemd "myfinance" + Caddy + Postgres 16 local), deploy = GitHub Actions no push à main, crons em /etc/cron.d/myfinance (pluggy-sync */5, agenda). Env em /etc/myfinance/app.env. Novas VAPID keys entram lá (e no .env dev). Padrão de config edge-safe: src/lib/pluggyConfig.ts.
- CSP com nonce por request em src/middleware.ts. web-push (Node) NÃO roda em edge/middleware.
- Aviso de Privacidade/Termos são versionados e dos ADVOGADOS — NÃO alterar texto legal; se push exigir menção, vira pendência "levar aos advogados".

REUTILIZE O QUE JÁ EXISTE (leia antes): docs/pwa/README.md (pendências acumuladas das fases + gotchas), decisões docs/pwa/fase{1,2,3}-decisoes.md, protótipos docs/pwa/fase{2,3}-prototipo.html (MESMA casca, estilo e bancada). Primitivos: src/layout/mobile/*, BottomSheet/MobileEditSheet/MobileSaveToast, ResponsiveTable, ResponsiveTabNav, useKeyboardInset, ApexChartWrapper. Regras fixas: overlay novo usa Modal/BottomSheet ou data-mf-overlay; alvos >=44px; paleta src/constants/brandColors.ts (#0079F2 só não-textual; texto/links #396CAA claro / #6E9DC4 escuro; negativos #D92D20/#F97066; âmbar de atenção aceito); Outfit; dark mode.

ESCOPO DA FASE 5:
A) WEB PUSH de ponta a ponta, ligado às notificações EXISTENTES (sem inventar tipos novos):
   1. Tabela PushSubscription (multi-aparelho por usuário) + migration aditiva; VAPID keys por env; lib web-push no servidor (Node only).
   2. Envio no momento em que a Notification é criada (todas as fontes listadas), com decisão explícita: síncrono vs fila/cron; limpeza de subscriptions mortas (404/410); TTL; payload MÍNIMO (LGPD: avaliar título genérico + deep link vs conteúdo — recomendação clara).
   3. sw.js: handlers push + notificationclick com deep link para a tela certa (ex.: /fluxodecaixa, /calendario, /comunidade/[id]); dedupe/badge.
   4. UI de opt-in: pedido de permissão SEMPRE atrás de gesto do usuário e no momento certo (nunca na carga); preferências por categoria (orçamento, agenda, comunidade, consultor/conta) no Perfil; estado "permissão negada" com instrução de reverter; iOS: push só com PWA INSTALADO (iOS 16.4+) — detectar e orientar instalação.
   5. Respeitar flags (COMUNIDADE_HABILITADA); consultor agindo por cliente NÃO dispara push para o cliente sobre ações do próprio consultor? — analisar e recomendar; push também funciona no navegador desktop (mesmo código) — recomendar se liga junto.
   6. Testes: unit dos serviços (mock web-push), e2e viável no CI (mock de PushManager; sem depender de push real).
B) ACABAMENTO (o arquiteto decide o que entra por custo/risco e fatia; o resto fica registrado como descartado):
   - Pendências leves acumuladas em docs/pwa/README.md: ~20 achados a11y da fase 0 (Modal sem nome acessível, ThemeToggle sem label, texto "Manter conectado por 30 dias" p/ admin/consultor, revogação do token iCal); fase 1 (lacuna "Jan 1970" no histórico, GET RSC na troca de aba → history.replaceState); fase 2 (GroupSheet sem Recolher, barra do mês do Orçamento não sticky, Desfazer do lançamento rápido não volta fórmula/comentário); fase 3 (links text-blue-600 na Saúde fora da paleta, título repetido nos Relatórios, campo Nome do objetivo sem borda de erro, selos da Comunidade contraste no escuro, RegistrarMesSheet fecha sem esperar API, chip MobileTabRail 42px).
   - Rodada Lighthouse (PWA/performance/a11y) nas rotas principais em build de produção, com metas numéricas e correções de maior impacto.
   - Auditoria visual de dark mode nas telas mobile das fases 1–3 (contraste real, não só cálculo).
   - Remover dependência órfã react-dnd (drag-and-drop do Fluxo foi reimplementado sem ela — confirmar que nada importa).
   FORA do escopo: tabela de sessões/revogação de JWT por aparelho (registrar como decisão), Capacitor/lojas, consultor/admin mobile.
Regras do projeto: CLAUDE.md do repo.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 3-5 devs em paralelo, SEM arquivos em comum entre fatias; inclua fatia 0 de contratos se precisar',
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
    acabamento_escopo: { type: 'string', description: 'quais pendências de acabamento ENTRAM (com fatia) e quais ficam de fora, com o porquê' },
    plano_producao: { type: 'string', description: 'passos de ativação em produção: VAPID no app.env, migration, restart, como testar push real; e o que fica p/ QA do Pedro em aparelho' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'fatias', 'componentes_compartilhados', 'acabamento_escopo', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 5 (web push + acabamento) do PWA. ${CONTEXTO}
Tarefa: leia o código real (notificações, sw.js, ServiceWorkerRegistrar, middleware/CSP, fontes de Notification, docs/pwa/README.md) e produza a ESPECIFICAÇÃO TÉCNICA da fase 5, pronta para 3-5 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (arquivo compartilhado vai para a fatia 0 ou para UMA fatia, com contrato descrito).
- Concreto: arquivos, exports, schema Prisma, formato do payload de push, contrato sw <-> app, como cada preferência é respeitada no envio, decisões síncrono/fila com recomendação.
- NÃO mudar regras de negócio, APIs existentes além do necessário, nem textos legais.
- Diga o que o QA desktop compara, quais e2e entram e o plano de ativação em produção (Lightsail).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 5 (web push + acabamento) do PWA. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Leia o header/sino de notificações atual, o Perfil e docs/pwa/fase3-prototipo.html: siga o MESMO estilo, casca e bancada (seletor de cenários, notas, claro/escuro, "Ver a 320px").
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta), iPhone 390x844, com pelo menos: convite de ativar notificações no momento certo (contextual, atrás de gesto — proponha o momento); Perfil > Notificações (master + categorias orçamento/agenda/comunidade/conta, estados: nunca pediu, ativo, permissão negada com instrução por navegador/iOS, iOS sem instalar com orientação de instalação); mock da notificação no aparelho (lockscreen) com deep link; central/sino no celular; "Enviar notificação de teste"; miniatura do desktop (Perfil ganha a seção — mostre). Estados vazio/carregando/erro onde fizer sentido. Texto pt-BR, dados realistas, só cores da paleta.
4. Especifique medidas, estados, acessibilidade e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (desenho + push/web standards + acessibilidade + segurança/LGPD) da fase 5 do PWA. ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código real e abra o protótipo em ${ux.prototipo_path} (pode renderizar com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque em especial: permissão só atrás de gesto e nunca na carga; iOS 16.4+ exige PWA instalado (fluxo de orientação correto?); VAPID/env e web-push fora do edge; payload sem dado sensível (LGPD) e sem texto legal alterado; limpeza 404/410 e multi-aparelho; preferências realmente filtram TODAS as fontes de Notification (orçamento, agenda cron, comunidade flag off, consultor, export); consultor agindo por cliente; deep links certos no notificationclick; sw.js compatível com o SW atual (update/skipWaiting, só build de produção); CSP; fatias sem arquivos em comum; desktop inalterado além do aprovado; e2e viáveis no CI com PushManager mockado; escopo de acabamento realista (não virar fase infinita); contraste AA; alvos >=44px.
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