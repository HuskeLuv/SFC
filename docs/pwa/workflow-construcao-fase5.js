export const meta = {
  name: 'pwa-fase5-construcao',
  description:
    'Fase 5 do PWA (web push + acabamento): contratos → 5 devs em worktrees → integração → QA mobile/desktop/código/segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/pwa-fase5' },
    { title: 'Implementação', detail: 'fatias A, B, C, D, E em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, e2e, snapshots desktop 1x' },
    { title: 'QA', detail: 'mobile, desktop, código e segurança em paralelo' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/pwa-fase5';
const BASE = args.base;
const QA_DIR = args.qaDir;
const SPEC = `${REPO}/docs/pwa/fase5-spec-desenho.json`;
const DEC = `${REPO}/docs/pwa/fase5-decisoes.md`;
const PROTO = `${REPO}/docs/pwa/fase5-prototipo.html`;

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 29/09/2026. Mutações usam csrfFetch e as mesmas invalidações do resto do app. NÃO mude regras de negócio, cálculos nem textos legais. src/lib/openFinanceConsentimento.ts, src/components/conexoes/TextoConsentimento.tsx e os textos de Termos/Aviso NÃO podem entrar no diff.
- Contexto: PWA do My Finance, fases 0-3 JÁ EM PRODUÇÃO na main. Esta é a FASE 5 (a última): WEB PUSH ligado às notificações existentes + ACABAMENTO. A fase parte da main; branch de integração ${BRANCH}. Leia docs/pwa/README.md.
- Especificação final: ${SPEC} (chave "arquitetura": fatias[], componentes_compartilhados, acabamento_escopo, plano_producao, plano_qa, riscos; "design"; "revisao"). Protótipo: ${PROTO}. DECISÕES DO WELLINGTON: ${DEC} — PREVALECEM sobre a spec e o protótipo (inclui 2 desyncs: TTL da categoria conta = 7 DIAS; lista de aparelhos ENTRA). Leia os três antes de começar.
- PUSH: as envs VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT/WEB_PUSH_HABILITADO JÁ estão no ${REPO}/.env (dev; nunca commitá-las nem logá-las). Payload NUNCA leva a Notification.message (embute R$): título real + corpo genérico, conforme contrato PushPayloadV1 da fatia 0. requestPermission SÓ dentro de gesto do usuário. O service worker só registra em BUILD DE PRODUÇÃO (npm run build && npx next start). Em teste com Playwright use context.grantPermissions(['notifications']) e mocks de PushManager; nunca dependa de push real de FCM/APNs no CI. PushSubscription criada em teste manual no banco de dev deve ser removida ao final.
- Desktop (>= 1024px / lg) NÃO pode mudar, EXCETO a lista fechada aprovada: (1) seção "Notificações" no Perfil; (2) links da Saúde Financeira na paleta; (3) título repetido removido nos Relatórios; (4) string neutra do "Manter conectado" no SignInForm. Em /relatorios e /saude-financeira toda diferença de celular usa a variante mscreen:, nunca max-lg:. Snapshots de e2e/desktop-*.spec.ts-snapshots são RECURSO COMPARTILHADO: NENHUM dev atualiza snapshot; quem atualiza é o INTEGRADOR, uma única vez, em commit dedicado (regra da decisão 4).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas + vermelho #D92D20/#F97066 + âmbar #D97706/#FBBF24 (ponto) e #B45309 (texto). #0079F2 só em elemento não textual (interruptor ligado ok). Não altere brand-500.
- Commits: atômicos, em português no padrão do repo ("feat(pwa): ...", "fix(pwa): ...", "test(pwa): ..."), terminando com linha em branco + "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ ou arquivos não rastreados pré-existentes. NUNCA tocar em /etc/ nem em produção (Lightsail) — ativação em prod é passo humano posterior.
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Alguns testes importam o prisma real: rode com DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados.
- e2e: CI = banco do seed + build de produção (CI=true), flags PLUGGY/COMUNIDADE desligadas. Testes novos têm de passar lá; screenshots só locais (test.skip(!!process.env.CI)). O que grava vai em *.escrita.spec.ts (projeto 'escrita', E2E_ALLOW_WRITES=1 só no CI). Baselines .ci de snapshot são gravadas com o browser do CI: ~/.cache/ms-playwright/chromium_headless_shell-1208.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify" (a skill é permitida SÓ para essa receita).
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. QUALQUER edição em teste manual deve ser revertida; nunca excluir conta, nunca "sair de todos" no demo (derruba a sessão dos outros agentes); notificações de teste criadas no banco devem ser apagadas ao final.
`;

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) rode "git checkout --detach ${BRANCH}" (o worktree pode ter nascido da main) e confira com "git log --oneline -5" que os commits da fatia 0 estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts . (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
`;

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    worktree: { type: 'string' },
    branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    arquivos: { type: 'array', items: { type: 'string' } },
    testes: { type: 'string' },
    desvios_da_spec: { type: 'array', items: { type: 'string' } },
    pendencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['worktree', 'branch', 'commits', 'arquivos', 'testes', 'desvios_da_spec', 'pendencias'],
};

const FINDINGS = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          categoria: { type: 'string' },
          descricao: { type: 'string' },
          evidencia: { type: 'string' },
          reproducao: { type: 'string' },
          sugestao: { type: 'string' },
        },
        required: ['gravidade', 'categoria', 'descricao', 'evidencia', 'reproducao', 'sugestao'],
      },
    },
    evidencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'achados', 'evidencias'],
};

phase('Contratos');
const f0 = await agent(
  `Você é o DEV da FATIA 0 ("Contratos fechados, schema e fundação de push") da fase 5 do PWA. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec: models PushSubscription + PushPreferencia e migration aditiva (npx prisma migrate dev, banco Neon de dev); npm install web-push + @types/web-push (dev) e REMOÇÃO de react-dnd e react-dnd-html5-backend (confirme antes com grep que não há import em src/, e2e/, scripts/); src/lib/push/contract.ts (PushPayloadV1: título real + corpo genérico; CATEGORIA_POR_TYPE usando as constantes exportadas pelos serviços reais; tag por grupo/evento; TTLs — categoria conta = 7 DIAS, decisão do Wellington; deepLinkDaNotificacao com validação same-origin; docblock do contrato HTTP incluindo GET de listagem e DELETE por id); src/lib/push/pushConfig.ts edge-safe; src/lib/pwa/pushClient.ts (isPushSupported, isIosSemPwa com heurística de iPad MacIntel+maxTouchPoints, permissaoAtual, assinarPush só-por-gesto, cancelarAssinatura, sincronizarAssinaturaSeAtiva) + chamada única no ServiceWorkerRegistrar; testes vitest da fatia. Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'pwa-fase5-a-envio',
    label: 'dev-A-envio-servidor',
    porta: 3201,
    extra:
      'Envio no servidor: src/lib/webPush.ts (Node only), services/push/enviarPush.ts (síncrono best-effort: falha de push NUNCA falha a criação da Notification; respeita PushPreferencia por categoria; limpeza de subscriptions 404/410; TTL por categoria do contrato), gancho nas 5 fontes reais que criam Notification (orcamentoAlertas, calendario/lembretes, comunidade/notificacoes, convites de consultor, e o que mais a spec listar — NUNCA inventar tipo novo), rotas /api/push/subscriptions (POST upsert por endpoint, GET listagem com rótulo por user-agent, DELETE por endpoint), /api/push/subscriptions/[id] (DELETE por id, só do dono), /api/push/preferencias (GET com vapidPublicKey e comunidadeVisivel, PATCH parcial), /api/push/test (envia só para a subscription do aparelho chamador; tier de rate limit próprio ~5/min). Testes vitest com web-push mockado (vi.hoisted), incluindo 404/410 removendo a subscription e preferência desligada bloqueando a categoria.',
  },
  {
    id: 'B',
    nome: 'pwa-fase5-b-sw',
    label: 'dev-B-service-worker',
    porta: 3202,
    extra:
      'Service worker: handlers push + notificationclick em public/sw.js seguindo o contrato PushPayloadV1 (tag por grupo/evento substitui em vez de empilhar; notificationclick foca aba/app aberto via clients.matchAll antes de abrir data.url, validado same-origin; payload malformado não quebra o SW). SEM setAppBadge (cortado da v1). Harness de teste conforme a spec. Valide em BUILD DE PRODUÇÃO (npm run build && npx next start -p 3202) com Playwright + grantPermissions + push simulado (dispatchEvent no SW ou mock), screenshots em ' +
      QA_DIR +
      '/dev-B-*.png. Cuidado: mudanças no sw.js afetam o update do SW dos usuários — preserve o comportamento atual de cache/offline.',
  },
  {
    id: 'C',
    nome: 'pwa-fase5-c-ui',
    label: 'dev-C-ui-optin',
    porta: 3203,
    extra:
      'UI de opt-in: Perfil › Notificações (desktop >= lg E mobile, mesma seção — única mudança nova de desktop aprovada) com os 4 estados do protótipo (nunca pediu / ativas / permissão negada com segmento iPhone|Android e "Já liberei — verificar de novo" / iOS sem instalar com passos), master por aparelho + 4 categorias da conta (comunidade SÓ renderiza com COMUNIDADE_HABILITADA), LISTA DE APARELHOS com remoção à distância (GET + DELETE por id — decisão 3; ignore o bullet do protótipo P2 que diz que ficou fora), botão "Enviar notificação de teste" com cooldown de 30 s, textos do protótipo (sem valores em R$). PushInviteSheet pós-salvar lembrete na Agenda (C1, gancho no modal da Agenda; "Agora não" = 14 dias de silêncio por aparelho em localStorage com try/catch) — o cartão C2 no sino NÃO entra. e2e mobile dos estados com PushManager mockado.',
  },
  {
    id: 'D',
    nome: 'pwa-fase5-d-acabamento',
    label: 'dev-D-acabamento',
    porta: 3204,
    extra:
      'Acabamento re-auditado: ANTES de cada item, grep na main para confirmar que ainda é pendência (iCal e MobileTabRail JÁ foram resolvidos — não refaça). Itens aprovados: links text-blue-600 da Saúde → paleta (mscreen NÃO se aplica: é cor, muda desktop também — aprovado); selos da Comunidade no escuro; borda de erro do campo Nome do objetivo; RegistrarMesSheet esperar a API antes de fechar; Modal sem nome acessível; ThemeToggle sem label; barra do mês do Orçamento sticky; lacuna "Jan 1970" no histórico de patrimônio; troca de aba da carteira sem GET RSC (history.replaceState em useReplaceCarteiraAba); título repetido nos Relatórios (ComponentCard — desktop também, aprovado); string do "Manter conectado por 30 dias" neutra para admin/consultor. FORA: Desfazer fórmula/comentário, sessões por aparelho, setAppBadge. Cada item = commit atômico próprio. NÃO atualize snapshots de desktop (integrador faz).',
  },
  {
    id: 'E',
    nome: 'pwa-fase5-e-lighthouse-dark',
    label: 'dev-E-lighthouse-dark',
    porta: 3205,
    extra:
      'Lighthouse + auditoria dark: em BUILD DE PRODUÇÃO no seu worktree, rode Lighthouse (npx lighthouse, chrome do Playwright, --chrome-flags="--headless") nas rotas /carteira, /fluxodecaixa, /planejamento-financeiro e /signin logado quando aplicável; metas PWA>=90 (instalável), a11y>=95, performance>=70 mobile (gargalo conhecido: API do resumo — fora do escopo). Auditoria VISUAL de dark mode das telas mobile das fases 1-3 (screenshots claro/escuro em ' +
      QA_DIR +
      '/dev-E-dark-*.png, contraste medido). Corrija SÓ o que a spec da sua fatia lista como seu; problema em arquivo de outra fatia vira pendência no retorno, nunca edição. Relatório final em ' +
      QA_DIR +
      '/dev-E-relatorio.md com números antes/depois.',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} da fase 5 (web push + acabamento) do PWA. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos da fatia 0 (src/lib/push/contract.ts é a fonte única do payload/tags/TTLs/rotas). Critérios de aceite obrigatórios; onde a spec ou o protótipo contrariarem ${DEC}, seguem as DECISÕES.
${f.extra}
Suba o dev server (ou build de produção quando indicado) no seu worktree na porta ${f.porta} e confira com Playwright a 390px e 320px (isMobile) e a 1280px antes de commitar; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png (crie a pasta). Pare o servidor ao terminar.
Commits atômicos na sua branch. Retorne o schema.`,
        { label: f.label, phase: 'Implementação', schema: DEV_SCHEMA, isolation: 'worktree' },
      ),
  ),
);

const devOk = devs.map((d, i) => ({ fatia: FATIAS[i].id, ...(d || { erro: 'agente falhou' }) }));
log(
  `Implementação: ${devOk.map((d) => `${d.fatia}=${d.commits ? d.commits.length + ' commits' : 'FALHOU'}`).join(' · ')}`,
);

phase('Integração');
const INTEG_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commits_integrados: { type: 'array', items: { type: 'string' } },
    conflitos: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    snapshots_desktop: { type: 'string', description: 'SHA do commit único de snapshots + onde estão as evidências do diff' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'snapshots_desktop', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR da fase 5 do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0). Traga os commits das 5 fatias com git cherry-pick, na ordem A, B, C, D, E, preservando commits e mensagens:
${JSON.stringify(
  devOk.map((d) => ({
    fatia: d.fatia,
    branch: d.branch,
    worktree: d.worktree,
    commits: d.commits,
    desvios: d.desvios_da_spec,
    pendencias: d.pendencias,
    erro: d.erro,
  })),
  null,
  2,
)}
Resolva conflitos preservando a intenção das fatias e registre. Depois, na ordem: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com npx next start -p 3210, TODOS os e2e (projetos chromium, mobile e escrita, nessa ordem) — pare o servidor ao terminar. Confirme que git diff ${BASE}..HEAD -- src/lib/openFinanceConsentimento.ts src/components/conexoes/TextoConsentimento.tsx está VAZIO e que .env NÃO está no diff.
SNAPSHOTS DE DESKTOP (decisão 4): as mudanças aprovadas de desktop (seção Notificações no Perfil, links da Saúde, título dos Relatórios, string do SignInForm) vão alterar baselines. Atualize os snapshots UMA vez, em COMMIT DEDICADO "test(pwa): snapshots desktop da fase 5" — os locais com o chromium local e os .ci com ~/.cache/ms-playwright/chromium_headless_shell-1208 — e salve pares antes/depois de cada baseline alterada em ${QA_DIR}/desktop-diff-*.png (o Wellington aprova esse diff antes do merge). Nenhuma baseline pode mudar por outro motivo — se mudar, é bug: investigue.
Corrija problemas de integração com commits "fix(pwa): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main com o PWA fases 0-3). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, snapshots: integ.snapshots_desktop })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts .`;

const QAS = [
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA FUNCIONAL MOBILE E DE PUSH. ${QA_BASE}
${PREP}. Faça npm run build && npx next start -p 3301 (build de produção: o SW registra). Com Playwright (390x844 e 320x568, isMobile, hasTouch, grantPermissions(['notifications'])), logado como usuario.demo, percorra contra o protótipo (${PROTO}) e as decisões (${DEC}): Perfil › Notificações nos 4 estados (nunca pediu → ativar → categorias → desligar com confirmação; negada via permissão bloqueada no contexto; iOS sem instalar via emulação de UA iPhone Safari não-standalone — os passos de instalação aparecem, requestPermission NÃO é chamado); lista de aparelhos (crie uma segunda subscription noutro contexto e remova à distância); "Enviar notificação de teste" (chega via SW, cooldown de 30 s, deep link abre a tela certa); convite pós-lembrete na Agenda (aparece uma vez, "Agora não" silencia — verifique o localStorage; NÃO deixe lembrete de teste no demo: exclua ao final); escalada de orçamento com tag (dois pushes do mesmo grupo substituem, não empilham — use o harness da fatia B); categoria desligada bloqueia o push mas o sino continua; COMUNIDADE off → linha some; sino/central intactos. Acabamento: cada item da fatia D verificado a 390px (barra do mês sticky, RegistrarMesSheet espera API, borda de erro do Nome, "Jan 1970" resolvido, troca de aba sem GET RSC — confira na aba Network). Modo escuro nas telas novas; console sem erros novos; nenhuma rota passa de 390px. Rode os e2e mobile da branch contra o 3301. Limpe do banco as PushSubscription/Notification de teste ao final. Pare o servidor.`,
  },
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DE REGRESSÃO DESKTOP. ${QA_BASE}
Objetivo: provar que o computador só mudou na LISTA APROVADA (seção Notificações no Perfil; links da Saúde na paleta; título repetido removido nos Relatórios; string do "Manter conectado" no SignInForm). ${PREP}. Crie um SEGUNDO worktree da base: git worktree add ${QA_DIR}/qa-base ${BASE} (mesmo preparo). Suba os dois (base 3311, branch 3312), um de cada vez se a memória apertar.
A 1280x800, 1366x900 e 1024x768 (sem isMobile), logado como usuario.demo, capture ANTES e DEPOIS de: /profile, /saude-financeira, /relatorios, /signin (deslogado), /carteira, /fluxodecaixa?modo=orcamento, /planejamento-financeiro, /calendario, /dividas, /historico-alteracoes. Compare pixel a pixel (mascarando números de mercado): fora da lista aprovada, TUDO deve ser idêntico; nas 4 mudanças aprovadas, descreva exatamente o que mudou (isso vira o material de aprovação do Wellington). IMPRESSÃO: /relatorios e /saude-financeira em PDF A4 antes/depois — o layout impresso não pode mudar (a cor dos links da Saúde pode; nº de páginas e estrutura não). Push no desktop: na branch, ative avisos no Perfil (grantPermissions) e confirme a seção funcionando a 1280px. Salve pares em ${QA_DIR}/desk-antes-*.png e desk-depois-*.png. Confira também o commit de snapshots do integrador: cada baseline alterada corresponde a uma mudança aprovada. Limpe subscriptions de teste, pare os servidores e remova o worktree da base.`,
  },
  {
    label: 'qa-codigo',
    prompt: `Você é o REVISOR DE CÓDIGO (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: contrato do payload respeitado em TODAS as fontes (nenhuma Notification.message/R$ vaza no push; título vem do title real); enviarPush best-effort de verdade (um throw de web-push não pode falhar a criação da Notification nem a rota que a criou — cheque cada gancho); limpeza 404/410 sem apagar subscription errada; preferências filtram TODAS as fontes (inclusive o cron de lembretes e a flag da Comunidade); rotas /api/push/* com auth do dono + zod + csrf (DELETE por id não pode permitir IDOR); requestPermission só dentro de gesto (nenhum useEffect); sw.js defensivo (payload malformado, data.url validada same-origin, clients.matchAll com fallback) e sem quebrar o update/cache atual do SW; pushClient com try/catch em localStorage e detecção de iPad; race na sincronização de assinatura na abertura; cooldown do teste no cliente E rate limit no servidor; migration aditiva; react-dnd removido sem sobrar import; itens da fatia D sem regressão (history.replaceState preserva scroll/estado? sticky sem quebrar overflow?); hooks condicionais; listeners/timers sem cleanup; testes frágeis. Cada achado com arquivo:linha e cenário concreto.`,
  },
  {
    label: 'qa-seguranca',
    prompt: `Você é o REVISOR DE SEGURANÇA/LGPD. ${QA_BASE}
Revise você mesmo o diff. Foque: VAPID_PRIVATE_KEY nunca no cliente, em log, em erro serializado ou em bundle (grep no .next após build se preciso); vapidPublicKey só via rota autenticada; payload sem PII/valores (LGPD — decisão 1: título real verificado + corpo genérico; confira fonte por fonte, inclusive metadata); endpoint de subscription tratado como segredo (GET de listagem devolve o endpoint? a spec diz que sim, para marcar "este aparelho" — avalie o risco e reporte se houver alternativa barata, ex. hash); IDOR nas rotas /api/push/* (subscription/preferência de outro usuário; DELETE por id de outro dono); consultor personificando não pode assinar push nem mudar preferências EM NOME do cliente (requireAuthWithActing — qual userId assina?); rate limit do /api/push/test não contornável; sw.js não abre URL externa (data.url same-origin estrita, sem //evil); nenhum texto legal alterado; CSP intocada ou mudança justificada; e2e não grava em produção; .env fora do diff. Cada achado com arquivo:linha e cenário.`,
  },
];

const qas = await parallel(
  QAS.map(
    (q) => () =>
      agent(q.prompt, {
        label: q.label,
        phase: 'QA',
        schema: FINDINGS,
        ...(q.isolation ? { isolation: q.isolation } : {}),
      }),
  ),
);

const todos = [];
qas.forEach((r, i) => (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })));
const graves = todos.filter((a) => a.gravidade !== 'baixa');
log(
  `QA: ${todos.length} achados (${graves.length} alta/média) — ${QAS.map((q, i) => `${q.label}=${qas[i] ? qas[i].achados.length : 'FALHOU'}`).join(' · ')}`,
);

let correcao = null;
let reverif = null;
if (graves.length) {
  phase('Correções');
  const FIX_SCHEMA = {
    type: 'object',
    properties: {
      corrigidos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            achado: { type: 'string' },
            commit: { type: 'string' },
            como: { type: 'string' },
          },
          required: ['achado', 'commit', 'como'],
        },
      },
      rejeitados: {
        type: 'array',
        items: {
          type: 'object',
          properties: { achado: { type: 'string' }, motivo: { type: 'string' } },
          required: ['achado', 'motivo'],
        },
      },
      checks: { type: 'string' },
    },
    required: ['corrigidos', 'rejeitados', 'checks'],
  };
  correcao = await agent(
    `Você é o CORRETOR da fase 5 do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(pwa): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da fase 5 do PWA. ${REGRAS}
${PREP}. Suba npm run build && npx next start -p 3321 (o SW registra em produção). Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1280px quando aplicável; push com grantPermissions e o harness quando for de push). Rode também os e2e da branch (chromium, mobile, escrita). Limpe dados de teste do banco. Reporte só o que continua quebrado ou quebrou. Pare o servidor ao terminar.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`,
      { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' },
    );
  }
}

return {
  fatia0: f0,
  devs: devOk,
  integracao: integ,
  qa: QAS.map((q, i) => ({
    label: q.label,
    resumo: qas[i]?.resumo,
    achados: qas[i]?.achados,
    evidencias: qas[i]?.evidencias,
  })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
};