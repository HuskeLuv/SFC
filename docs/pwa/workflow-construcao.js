export const meta = {
  name: 'pwa-fase0-construcao',
  description: 'Fase 0 do PWA: contratos → 4 devs em worktrees → integração → QA mobile/desktop/código/segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/pwa-fase0' },
    { title: 'Implementação', detail: 'fatias A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, type-check, lint, testes, build' },
    { title: 'QA', detail: 'mobile, desktop, código e segurança em paralelo' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
}

const D = args.dir
const SPEC = `${D}/resultado-desenho.json`
const DEC = `${D}/decisoes.md`
const PROTO = `${D}/prototipo.html`
const QA_DIR = `${D}/qa`
const LIBS = args.libs
const REPO = '/home/huske/dev/front'

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100).
- Especificação final da fase 0 (arquiteto + designer + revisão): ${SPEC} (JSON: arquitetura.fatias[], arquitetura.componentes_compartilhados, arquitetura.service_worker, arquitetura.sessao_30_dias, arquitetura.plano_qa, design.*). Protótipo de referência visual: ${PROTO}. DECISÕES DO WELLINGTON (prevalecem sobre qualquer pergunta em aberto da spec): ${DEC}. Leia os três antes de começar.
- Desktop (>= 1024px / lg) NÃO pode mudar visualmente. Toda mudança visual nova vale só abaixo de lg (lg:hidden, max-lg:, @media (width < 64rem)).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas Tailwind existentes + o vermelho semântico já usado. Não altere brand-500.
- Commits: atômicos, mensagem em português no padrão do repo (ex.: "feat(pwa): ..."), terminando com a linha em branco + "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>". Use git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA faça push, PR, merge em main, nem mexa em .claude/settings.local.json, .gitignore, docs/ ou nos arquivos não rastreados que já existiam.
- Testes: vitest é lento no repo inteiro — rode só os arquivos relevantes (npx vitest run <caminhos>). Sempre rode npx tsc --noEmit -p . e npx eslint nos arquivos tocados antes de commitar. O hook de pre-commit roda eslint --fix + prettier.
- Processos: NÃO use "pkill -f" dentro de comando encadeado (mata o shell). Guarde o PID do servidor e use kill <pid> num comando separado. Servidor em background via run_in_background.
- Playwright no WSL: chromium em /home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome; exporte LD_LIBRARY_PATH=${LIBS}; em scripts avulsos importe de ${REPO}/node_modules/playwright/index.mjs e use chromium.launch({ executablePath }). Para npx playwright test, passe o executablePath via launchOptions no config ou variável de ambiente.
- Banco de dev (Neon) é compartilhado. Usuários de dev: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. O usuario.demo está com cargo equipe na comunidade (não mexa). Login via POST /api/auth/login {email,password,rememberMe?}; o cookie csrf-token só é setado num GET de página; mutações exigem header x-csrf-token.
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) confira que o HEAD contém o commit da fatia 0 ("git log --oneline -5"); se não contiver, rode "git merge --ff-only feat/pwa-fase0" ou "git cherry-pick" dos commits da fatia 0 (git log feat/pwa-fase0). (2) Prepare o ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir). (3) Crie uma branch com nome próprio (git switch -c <nome-pedido>) e commite nela. Informe no retorno o caminho do worktree (pwd), o nome da branch e os SHAs dos commits.
`

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    worktree: { type: 'string' },
    branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' }, description: 'SHAs em ordem, do mais antigo ao mais novo' },
    arquivos: { type: 'array', items: { type: 'string' } },
    testes: { type: 'string', description: 'o que rodou e o resultado' },
    desvios_da_spec: { type: 'array', items: { type: 'string' } },
    pendencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['worktree', 'branch', 'commits', 'arquivos', 'testes', 'desvios_da_spec', 'pendencias'],
}

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
          evidencia: { type: 'string', description: 'arquivo:linha, saída de comando ou caminho de screenshot' },
          reproducao: { type: 'string' },
          sugestao: { type: 'string' },
        },
        required: ['gravidade', 'categoria', 'descricao', 'evidencia', 'reproducao', 'sugestao'],
      },
    },
    evidencias: { type: 'array', items: { type: 'string' }, description: 'screenshots/relatórios gerados' },
  },
  required: ['resumo', 'achados', 'evidencias'],
}

// ---------------------------------------------------------------- Contratos
phase('Contratos')
const f0 = await agent(`Você é o DEV da FATIA 0 ("Contratos compartilhados") do PWA fase 0. ${REGRAS}
Trabalhe DIRETO em ${REPO}, que já está na branch feat/pwa-fase0 (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec (arquitetura.fatias) — globals.css, src/lib/ui/mobile.ts, src/lib/ui/scrollLock.ts, src/hooks/useMediaQuery.ts, src/lib/pwa/installPromptContract.ts e os testes listados. Nada além dela: as fatias A/B/C/D vão ramificar deste commit e dependem desses contratos com os nomes exatos da spec.
Garanta que o desktop não muda (regras novas só em @media (width < 64rem) ou utilitários ainda não usados). Rode tsc, eslint, os testes novos (npx vitest run src/lib/ui src/hooks/__tests__/useMediaQuery.test.ts) e npm run build NÃO é necessário aqui. Commite na branch feat/pwa-fase0. Retorne worktree=${REPO}, branch=feat/pwa-fase0 e os SHAs.`, { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA })
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 }
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`)

// ---------------------------------------------------------------- Implementação
phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'pwa-fase0-a-plataforma', label: 'dev-A-plataforma', extra: 'Gere os PNGs dos ícones a partir de public/images/logo/logo-icon.svg (marca #0079F2 sobre fundo branco — decisão 4) com um script em scripts/ e commite os PNGs gerados. O service worker só pode ser testado de verdade num build de produção: rode npm run build && npx next start -p 3201 no seu worktree e confira com Playwright que /manifest.webmanifest, os ícones, /sw.js e /offline.html respondem, que o SW registra sem erro de CSP no console e que context.setOffline(true) + navegação mostra a página offline. Pare o servidor ao terminar.' },
  { id: 'B', nome: 'pwa-fase0-b-casca', label: 'dev-B-casca', extra: 'Siga o protótipo para a casca (cabeçalho, barra de abas com rótulo "Planejar" — decisão 8 —, painel Mais agrupado com seção Conta — decisões 9 e 12 —, + Lançar com Novo investimento e Resgatar funcionando e Despesa/receita "Em breve" — decisão 3 —, cartão Instalar app — decisão 11). Suba o dev server no seu worktree (npx next dev -p 3202) e confira com Playwright a 390px (isMobile) e a 1366px (desktop inalterado) antes de commitar; salve screenshots em ${QA_DIR}/dev-B-*.png. Pare o servidor ao terminar.' },
  { id: 'C', nome: 'pwa-fase0-c-primitivos', label: 'dev-C-primitivos', extra: 'O teste de transbordo deve seguir a correção da revisão: comparar com a largura FIXA (390) e esperar o conteúdo sair do skeleton; exceções conhecidas documentadas (/carteira, /calendario) com test.fail. Rode os testes Playwright novos contra um dev server do seu worktree (npx next dev -p 3203) e reporte o resultado; os testes podem depender da casca da fatia B que ainda não existe no seu worktree — nesse caso rode o que for independente e documente. Pare o servidor ao terminar.' },
  { id: 'D', nome: 'pwa-fase0-d-sessao', label: 'dev-D-sessao', extra: 'Inclui a decisão 2: endpoint para "Sair de todos os dispositivos" (incrementa sessionVersion) + botão com confirmação na página de Perfil (src/components/user-profile). Se precisar de coluna nova (sessionVersion), crie a migração Prisma em prisma/migrations/<timestamp>_session_version/migration.sql e APLIQUE no Neon dev (npx prisma db execute --file <sql> --schema prisma/schema.prisma + INSERT em _prisma_migrations com checksum sha256 do arquivo; o dev tem drift, não use migrate dev) e rode npx prisma generate. ATENÇÃO ao tornar requireRole/requireAdmin assíncronos: todo chamador precisa de await (um await esquecido vira Promise sempre verdadeira) — faça grep em todo src/ e confira um a um; rode os testes de todas as rotas afetadas. Teste o login real via curl contra um dev server do seu worktree (npx next dev -p 3204): cookie com Max-Age de 30 dias com rememberMe, cookie de sessão sem ele, renovação, admin/consultor 1 dia, e "sair de todos" invalidando uma segunda sessão. Pare o servidor ao terminar.' },
]

const devs = await parallel(FATIAS.map((f) => () =>
  agent(`Você é o DEV da FATIA ${f.id} do PWA fase 0. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec (arquitetura.fatias), respeitando a lista de arquivos dela — não toque em arquivos de outra fatia (se for inevitável, documente em desvios_da_spec). Use os contratos da fatia 0 com os nomes exatos. Critérios de aceite da fatia são obrigatórios.
${f.extra}
Commits atômicos na sua branch. Retorne o schema.`, { label: f.label, phase: 'Implementação', schema: DEV_SCHEMA, isolation: 'worktree' })))

const devOk = devs.map((d, i) => ({ fatia: FATIAS[i].id, ...(d || { erro: 'agente falhou' }) }))
log(`Implementação: ${devOk.map((d) => `${d.fatia}=${d.commits ? d.commits.length + ' commits' : 'FALHOU'}`).join(' · ')}`)

// ---------------------------------------------------------------- Integração
phase('Integração')
const INTEG_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commits_integrados: { type: 'array', items: { type: 'string' } },
    conflitos: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'tsc, eslint, vitest, build — comandos e resultado' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'problemas_abertos'],
}
const integ = await agent(`Você é o INTEGRADOR do PWA fase 0. ${REGRAS}
Trabalhe em ${REPO}, branch feat/pwa-fase0 (já contém a fatia 0). Traga os commits das 4 fatias com git cherry-pick, na ordem A, D, C, B, preservando os commits atômicos e as mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_da_spec, pendencias: d.pendencias, erro: d.erro })), null, 2)}
Se houver conflito, resolva preservando a intenção das duas fatias (leia a spec) e registre. Depois: npx prisma generate (se o schema mudou), npx tsc --noEmit -p ., npm run lint, vitest só nos testes tocados pelas fatias (git diff --name-only 10af38fa..HEAD | grep test) e npm run build (produção). Corrija problemas de integração com commits "fix(pwa): ..." pequenos. Se uma fatia faltou (agente falhou), NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`, { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA })
if (!integ) return { erro: 'integração falhou', devs: devOk }

// ---------------------------------------------------------------- QA
phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch feat/pwa-fase0 (base: commit 10af38fa da main). Diff: git -C ${REPO} diff 10af38fa..feat/pwa-fase0. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; nada de estilo/preferência como gravidade alta. NÃO edite nem commite código.`

const QAS = [
  { label: 'qa-mobile', isolation: 'worktree', prompt: `Você é o QA FUNCIONAL MOBILE. ${QA_BASE}
Você está num worktree isolado criado a partir do HEAD (feat/pwa-fase0): confira com git log -1; prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local. Invoque a skill "verify" (ferramenta Skill) para a receita de runtime do repo. Faça npm run build && npx next start -p 3301 (o service worker só funciona em produção).
Dirija com Playwright (viewport 390x844, isMobile, hasTouch; e também 320x568) logado como usuario.demo e como consultor.demo:
- barra de abas (Carteira, Fluxo, + Lançar, Planejar, Mais) navega e marca a aba ativa; hambúrguer sumiu; título não fica coberto; nada escondido atrás da barra (role até o fim de /planejamento-financeiro e /fluxodecaixa);
- painel Mais: grupos, filtros (Pluggy/Comunidade conforme flags do .env), seção Conta, avatar abre na Conta, modo escuro funciona, Sair funciona;
- + Lançar: Novo investimento abre o wizard (e a barra/cabeçalho somem por cima dele), Resgatar abre o wizard de resgate, Despesa/receita desabilitado; ?acao some da URL;
- foco num input esconde a barra; Modal existente (ache um, ex.: em /dividas ou /carteira) abre como sheet; Esc e X fecham; scroll da página destrava;
- cartão Instalar app aparece só na 2ª visita da Carteira (localStorage), Agora não esconde;
- manifest/ícones/sw.js/offline.html respondem; SW registra sem erro de CSP; offline (context.setOffline) mostra a página offline; logout limpa caches (caches.keys() vazio) e desregistra o SW;
- sessão: com rememberMe o cookie token tem Max-Age ~30 dias; sem, é cookie de sessão; "Sair de todos os dispositivos" no Perfil derruba uma segunda sessão (outro contexto) na próxima requisição;
- rode os testes Playwright novos da branch (e2e/*mobile*/*overflow* e o desktop-layout) contra o servidor 3301 e reporte;
- console sem erros novos em cada página.
Pare o servidor (kill do PID em comando separado) ao terminar.` },
  { label: 'qa-desktop', isolation: 'worktree', prompt: `Você é o QA DE REGRESSÃO DESKTOP. ${QA_BASE}
Objetivo: provar que o computador NÃO mudou. Você está num worktree isolado a partir de feat/pwa-fase0 (confira com git log -1; prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local). Crie um SEGUNDO worktree da base: git worktree add ${D}/qa-base 10af38fa (mesmo preparo de node_modules/.env). Suba os dois com next dev (base na porta 3311, branch na 3312), um de cada vez se a memória apertar.
Com Playwright a 1366x900 e 1280x800 (sem isMobile), logado como usuario.demo, capture ANTES e DEPOIS de: /carteira, /fluxodecaixa, /planejamento-financeiro, /saude-financeira, /dividas, /calendario, /relatorios, /profile, /historico-alteracoes, /educacao, e um modal aberto (ex.: em /dividas). Espere o conteúdo carregar (não o skeleton). Compare: ideal numérico (Playwright toHaveScreenshot usando o antes como baseline, ou comparação de pixels com o que estiver disponível no Node); valide visualmente lendo as imagens. Diferença de dado dinâmico (hora, cotação) não é regressão — mudança de layout, cor, espaçamento, sidebar, rodapé da sidebar (tema/sino/perfil), modal ou tabela É. Confira também a 1024px (limite do breakpoint) e 1023px (deve virar mobile). Salve pares em ${QA_DIR}/desk-antes-*.png e desk-depois-*.png.
Ao terminar pare os servidores e remova o worktree da base (git worktree remove --force ${D}/qa-base).` },
  { label: 'qa-codigo', prompt: `Você é o REVISOR DE CÓDIGO. ${QA_BASE}
Invoque a skill "code-review" (ferramenta Skill) com nível high sobre o diff 10af38fa..feat/pwa-fase0 para usar o método dela, mas devolva os achados NO SCHEMA deste agente (não use ReportFindings). Foque: bugs de correção, efeitos em desktop (classe sem max-lg/lg:hidden), hidratação SSR x client (useMediaQuery, localStorage), fetch duplicado de notificações, listeners sem cleanup, travas de scroll desbalanceadas, acessibilidade (foco preso, aria), filtros do menu divergentes entre sidebar/barra/Mais, testes frágeis. Cada achado com arquivo:linha.` },
  { label: 'qa-seguranca', prompt: `Você é o REVISOR DE SEGURANÇA. ${QA_BASE}
Invoque a skill "security-review" (ferramenta Skill) para o método, mas devolva os achados NO SCHEMA deste agente. Foque: service worker (nunca cachear /api/** nem HTML autenticado; escopo; atualização; limpeza no logout; risco de prender usuário em versão ruim; kill switch), CSP (worker-src/manifest-src, nonce, nada afrouxado além do necessário), sessão de 30 dias (renovação deslizante no middleware Edge, teto de 90 dias, cookie sem rememberMe, admin/consultor 1 dia, sessionVersion checado em TODAS as rotas autenticadas inclusive admin; await esquecido em requireRole/requireAdmin agora assíncronos — faça grep de todos os chamadores; CSRF na rota "sair de todos"), parâmetro ?acao (open redirect/injeção), localStorage (sem dado sensível), personificação de consultor (30 min preservados). Cada achado com arquivo:linha e cenário de ataque.` },
]

const qas = await parallel(QAS.map((q) => () =>
  agent(q.prompt, { label: q.label, phase: 'QA', schema: FINDINGS, ...(q.isolation ? { isolation: q.isolation } : {}) })))

const todos = []
qas.forEach((r, i) => (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })))
const graves = todos.filter((a) => a.gravidade !== 'baixa')
log(`QA: ${todos.length} achados (${graves.length} alta/média) — ${QAS.map((q, i) => `${q.label}=${qas[i] ? qas[i].achados.length : 'FALHOU'}`).join(' · ')}`)

// ---------------------------------------------------------------- Correções
let correcao = null
let reverif = null
if (graves.length) {
  phase('Correções')
  const FIX_SCHEMA = {
    type: 'object',
    properties: {
      corrigidos: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, commit: { type: 'string' }, como: { type: 'string' } }, required: ['achado', 'commit', 'como'] } },
      rejeitados: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, motivo: { type: 'string' } }, required: ['achado', 'motivo'] } },
      checks: { type: 'string' },
    },
    required: ['corrigidos', 'rejeitados', 'checks'],
  }
  correcao = await agent(`Você é o CORRETOR do PWA fase 0. ${REGRAS}
Trabalhe em ${REPO}, branch feat/pwa-fase0. Abaixo estão os achados de gravidade alta/média dos QAs. Para CADA um: primeiro CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(pwa): ..." (achados relacionados podem ir juntos). Não trate achados de gravidade baixa. Ao final: npx tsc --noEmit -p ., npm run lint, vitest nos testes afetados e npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`, { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA })

  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(`Você é o QA de REVERIFICAÇÃO do PWA fase 0. ${REGRAS}
Você está num worktree isolado a partir de feat/pwa-fase0 (confira git log -1; prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local). Suba npm run build && npx next start -p 3321. Para cada correção abaixo, reproduza o cenário original do achado e confirme que foi resolvido sem regressão (mobile 390px e desktop 1366px quando aplicável). Rode também os testes Playwright novos da branch contra o servidor. Reporte no schema só o que continua quebrado ou quebrou (achados vazios = tudo ok). Pare o servidor ao terminar.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`, { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' })
  }
}

return {
  fatia0: f0,
  devs: devOk,
  integracao: integ,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados, evidencias: qas[i]?.evidencias })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
}
