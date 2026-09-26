export const meta = {
  name: 'pwa-fase1-construcao',
  description: 'Fase 1 do PWA (Carteira): contratos → 4 devs em worktrees → integração → QA mobile/desktop/código/segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/pwa-fase1-carteira' },
    { title: 'Implementação', detail: 'fatias A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, type-check, lint, testes, build' },
    { title: 'QA', detail: 'mobile, desktop, código e segurança em paralelo' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/pwa-fase1-carteira'
const BASE = args.base
const QA_DIR = args.qaDir
const SPEC = `${REPO}/docs/pwa/fase1-spec-desenho.json`
const DEC = `${REPO}/docs/pwa/fase1-decisoes.md`
const PROTO = `${REPO}/docs/pwa/fase1-prototipo.html`

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Mutação de carteira: csrfFetch + invalidatePortfolioDerivedQueries como o código atual já faz — não mude regras de cálculo, rotas de API nem payloads.
- Contexto: PWA do My Finance. A fase 0 (casca mobile, BottomSheet, Modal→sheet, ResponsiveTable/TABLE_MOBILE_STYLES, e2e mobile/desktop) já está na base. Esta é a FASE 1 (Carteira). Leia docs/pwa/README.md.
- Especificação final: ${SPEC} (JSON: arquitetura.fatias[], componentes_compartilhados, performance, plano_qa, riscos; design.telas, design.especificacao_visual, design.acessibilidade; revisao.problemas). Protótipo visual: ${PROTO}. DECISÕES DO WELLINGTON: ${DEC} — PREVALECEM sobre a spec. Atenção às divergências já resolvidas: h1 da /carteira VISÍVEL (não sr-only), pizza "Tipos de investimento" FICA, SEM Desfazer. Leia os três antes de começar.
- Desktop (>= 1024px / lg) NÃO pode mudar. Tudo novo vale só abaixo de lg (lg:hidden, max-lg:, @media (width < 64rem), ou hook de breakpoint existente).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas Tailwind + vermelho semântico #D92D20/#F97066. #0079F2 só em elemento não textual. Não altere brand-500.
- Commits: atômicos, em português no padrão do repo ("feat(pwa): ...", "test(pwa): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main/feat/pwa-fase0, nem mexer em .claude/settings.local.json, .gitignore, docs/ ou arquivos não rastreados pré-existentes.
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes (npx vitest run <caminhos>). 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Pre-commit roda eslint --fix + prettier.
- e2e: o CI usa banco do seed + build de produção (CI=true). Testes novos precisam passar lá: nada de depender de dados do usuário demo do dev; screenshots só locais (test.skip(!!process.env.CI)). Nunca confirmar wizard em e2e (parar na etapa "info"); edição em e2e restaura o valor original.
- Processos: NÃO use "pkill -f" em comando encadeado (mata o shell). Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT (o config aceita). Receita de login na skill "verify".
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente, tem carteira real) e consultor.demo@finapp.local / 123456. QUALQUER edição feita em teste manual (objetivo, valor, observação, alocação) deve ser revertida ao valor original; NUNCA confirmar cadastro/resgate/aporte.
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) confira que o HEAD contém os commits da fatia 0 ("git log --oneline -8" e compare com "git -C ${REPO} log --oneline -8 ${BRANCH}"); se não contiver, rode "git merge --ff-only ${BRANCH}". (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts . (sem ele o tsc acusa erros falsos). (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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
    evidencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'achados', 'evidencias'],
}

// ---------------------------------------------------------------- Contratos
phase('Contratos')
const f0 = await agent(`Você é o DEV da FATIA 0 ("Contratos, primitivos, guardas de teste e baselines") da fase 1 do PWA. ${REGRAS}
Trabalhe DIRETO em ${REPO}, que já está na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec (arquitetura.fatias) — primitivos (ResponsiveCardList expansível, MobileEditSheet com contrato false/exceção = falha e SEM Desfazer, MobileNumberField, aviso de "salvo", ResponsiveTabNav, CardSectionBand), quantoFaltaMobileClass, chaves novas de TABLE_MOBILE_STYLES, hook de teclado (visualViewport) no Sidebar/BottomSheet, helpers de e2e e a guarda estrutural de desktop. EXCEÇÕES às decisões: MobileSaveToast sem ação de desfazer; READY_SELECTOR da /carteira continua servindo com o h1 visível (pode aceitar também [data-mf-carteira-ready]); a fatia 0 NÃO edita docs/. As fatias A/B/C/D vão ramificar deste commit e usam esses contratos com os nomes exatos da spec.
A baseline da guarda estrutural de desktop deve ser gravada ANTES de qualquer mudança visual (o código visual da carteira ainda é o da base) — rode contra um dev server seu (npx next dev -p 3200) e commite. Garanta desktop inalterado. Rode tsc, eslint e os testes novos. Pare o servidor ao terminar. Commite em ${BRANCH}. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`, { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA })
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 }
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`)

// ---------------------------------------------------------------- Implementação
phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'pwa-fase1-a-casca-resumo', label: 'dev-A-casca-resumo', porta: 3201, extra: 'Inclui: navegação (chips + "Todas", aba na URL com router.replace), h1 VISÍVEL compacto e subtítulo/botões Adicionar/Resgatar só no desktop, listener do + Lançar e wizards lazy em CarteiraTabs (funcionando com a Análise aberta), Resumo em uma coluna com a pizza mantida, Alocação em cartões com Aplicar + barra Salvar/Descartar, Caixa para Investir, skeleton/vazio/erro, carregamento sob demanda das abas e a medição de performance (build de produção: registre os números antes/depois no retorno em "testes").' },
  { id: 'B', nome: 'pwa-fase1-b-cartoes', label: 'dev-B-cartoes', porta: 3202, extra: 'Inclui: as abas do GenericAssetTable (Ações, FII, ETF, Stocks, REIT, Fundos, Moedas/Cripto, Opções, Previdência) em cartões com ResponsiveCardList, faixas de seção com subtotal, cartão de total, ordenar (só celular), seções vazias escondidas no celular, ativos planejados, edição por MobileEditSheet (objetivo, valor, texto) preservando as mesmas mutações, e as pizzas das abas legíveis abaixo de lg.' },
  { id: 'C', nome: 'pwa-fase1-c-rf-analise', label: 'dev-C-rf-analise', porta: 3203, extra: 'Inclui: Renda Fixa, Reservas (emergência/oportunidade), Imóveis & Bens e a Análise inteira (rentabilidade, proventos, risco × retorno, sensibilidade, cobertura FGC, IR) no celular. "IR se resgatar hoje" só se já existir cálculo pronto no front/back (procure); se não existir, NÃO crie — registre em pendencias.' },
  { id: 'D', nome: 'pwa-fase1-d-wizards-ativo', label: 'dev-D-wizards-ativo', porta: 3204, extra: 'Inclui: AddAssetWizard e RedeemAssetWizard (uma etapa por tela, progresso pelas etapas visíveis reais, tipos agrupados em Adicionar/Planejar, calendário nativo em TODOS os DatePicker via nativeOnMobile mantendo o aviso de dia útil, inputmode/enterkeyhint, rodapé acima do teclado com o hook da fatia 0) e as páginas /ativos/[id] e /ativos/[id]/editar. e2e do wizard para na etapa "info" e nunca confirma.' },
]

const devs = await parallel(FATIAS.map((f) => () =>
  agent(`Você é o DEV da FATIA ${f.id} da fase 1 (Carteira) do PWA. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec (arquitetura.fatias), respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se for inevitável, documente em desvios_da_spec). Use os contratos da fatia 0 com os nomes exatos. Critérios de aceite da fatia são obrigatórios; onde a spec contrariar ${DEC}, siga as decisões.
${f.extra}
Escreva o e2e mobile da sua fatia (arquivo próprio, como a spec define). Suba o dev server no seu worktree (npx next dev -p ${f.porta}) e confira com Playwright a 390px e 320px (isMobile) e a 1280px (desktop inalterado) antes de commitar; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png (crie a pasta). Pare o servidor ao terminar.
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
    checks: { type: 'string', description: 'tsc, eslint, vitest, build, e2e — comandos e resultado' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'problemas_abertos'],
}
const integ = await agent(`Você é o INTEGRADOR da fase 1 (Carteira) do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0). Traga os commits das 4 fatias com git cherry-pick, na ordem A, B, C, D, preservando os commits atômicos e as mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_da_spec, pendencias: d.pendencias, erro: d.erro })), null, 2)}
Se houver conflito, resolva preservando a intenção das duas fatias (leia a spec e as decisões) e registre. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam), npm run build e, com npx next start -p 3210, os e2e mobile/desktop da carteira (e2e/mobile-*.spec.ts, e2e/desktop-*.spec.ts) — pare o servidor ao terminar. Corrija problemas de integração com commits "fix(pwa): ..." pequenos. Se uma fatia faltou (agente falhou), NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`, { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA })
if (!integ) return { erro: 'integração falhou', devs: devOk }

// ---------------------------------------------------------------- QA
phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, fim da fase 0). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código.`

const PREP = `Você está num worktree isolado criado a partir do HEAD (${BRANCH}): confira com git log -1; prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local, cp ${REPO}/next-env.d.ts .`

const QAS = [
  { label: 'qa-mobile', isolation: 'worktree', prompt: `Você é o QA FUNCIONAL MOBILE. ${QA_BASE}
${PREP}. Invoque a skill "verify" (ferramenta Skill). Faça npm run build && npx next start -p 3301.
Com Playwright (390x844 e 320x568, isMobile, hasTouch), logado como usuario.demo, percorra a Carteira contra o protótipo (${PROTO}) e as decisões:
- /carteira: h1 visível e não coberto; trilho de chips e "Todas" (sheet com as 14 classes) trocam de aba e atualizam ?aba=; Voltar do navegador; nenhuma aba passa de 390px (scrollWidth do conteúdo, sem depender do corte [data-mf-content]);
- Resumo: pizza, Caixa para Investir, mercado, Alocação em cartões com Aplicar + barra Salvar/Descartar (teste Descartar; se testar Salvar, restaure os valores);
- cada aba de classe: cartões fechado/aberto, faixas de seção, total, ordenar, seção vazia escondida, Quanto Falta com a palavra, planejado;
- edição: objetivo/valor/observação abre sheet com teclado certo; salvar mostra aviso e atualiza o cartão; simule falha (DevTools/route abort) e confira que o sheet fica aberto com erro; restaure todo valor alterado;
- Renda Fixa/Reservas/Imóveis e Análise (rentabilidade, proventos, risco, FGC, IR) legíveis a 320px;
- + Lançar com Resumo e com Análise abertos abre o wizard; wizard de cadastro e de resgate até a etapa "info" (NÃO confirme): progresso, tipos agrupados, data nativa, rodapé visível com foco num campo;
- /ativos/[id] e /editar a 390px;
- modo escuro; console sem erros novos; rode os e2e mobile/desktop da branch contra o 3301 e reporte.
Pare o servidor (kill do PID em comando separado) ao terminar.` },
  { label: 'qa-desktop', isolation: 'worktree', prompt: `Você é o QA DE REGRESSÃO DESKTOP. ${QA_BASE}
Objetivo: provar que o computador NÃO mudou. ${PREP}. Crie um SEGUNDO worktree da base: git worktree add ${QA_DIR}/qa-base ${BASE} (mesmo preparo). Suba os dois com next dev (base 3311, branch 3312), um de cada vez se a memória apertar.
Com Playwright a 1280x800, 1366x900 e 1024x768 (sem isMobile), logado como usuario.demo, capture ANTES e DEPOIS de: /carteira em TODAS as abas (Resumo e Análise, cada classe e cada sub-aba da Análise), /ativos/[id] de um ativo existente e /ativos/[id]/editar, e o wizard de cadastro aberto (etapa 1). Espere o conteúdo, não o skeleton. Compare pixel a pixel (mascarando só números de mercado) e confira visualmente lendo as imagens: layout, cor, espaçamento, tabela, abas, botões, modal. Confira 1023px (deve virar celular). Salve pares em ${QA_DIR}/desk-antes-*.png e desk-depois-*.png.
Ao terminar pare os servidores e remova o worktree da base (git worktree remove --force ${QA_DIR}/qa-base).` },
  { label: 'qa-codigo', prompt: `Você é o REVISOR DE CÓDIGO. ${QA_BASE}
Invoque a skill "code-review" (ferramenta Skill) com nível high sobre o diff ${BASE}..${BRANCH} para usar o método dela, mas devolva os achados NO SCHEMA deste agente (não use ReportFindings). Foque: correção das mutações no celular (mesmos callbacks, invalidações, retorno false = falha), estado duplicado/divergente entre cartão e tabela, classes que vazam para o desktop, hidratação SSR × client (breakpoint, URL ?aba), listeners/timers sem cleanup, lazy loading quebrando o + Lançar, ordenação alterando dado (deve ser só apresentação), acessibilidade (aria-expanded/controls, foco nos sheets), testes frágeis ou dependentes de dados do dev. Cada achado com arquivo:linha.` },
  { label: 'qa-seguranca', prompt: `Você é o REVISOR DE SEGURANÇA. ${QA_BASE}
Invoque a skill "security-review" (ferramenta Skill) para o método, mas devolva os achados NO SCHEMA deste agente. Foque: parâmetro ?aba e ?acao (injeção, open redirect), mutações novas sem csrfFetch ou fora do fluxo atual, dado de outro usuário/consultor personificando exposto no celular, localStorage/sessionStorage com dado financeiro, dangerouslySetInnerHTML, nenhuma rota de API nova sem autenticação. Cada achado com arquivo:linha e cenário.` },
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
  correcao = await agent(`Você é o CORRETOR da fase 1 (Carteira) do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Abaixo estão os achados de gravidade alta/média dos QAs. Para CADA um: primeiro CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(pwa): ..." (achados relacionados podem ir juntos). Não trate os de gravidade baixa. Ao final: npx tsc --noEmit -p ., npm run lint, vitest nos testes afetados e npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`, { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA })

  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(`Você é o QA de REVERIFICAÇÃO da fase 1 (Carteira) do PWA. ${REGRAS}
${PREP}. Suba npm run build && npx next start -p 3321. Para cada correção abaixo, reproduza o cenário original do achado e confirme que foi resolvido sem regressão (390px e 1280px quando aplicável). Rode também os e2e mobile/desktop da branch contra o servidor. Reporte no schema só o que continua quebrado ou quebrou (achados vazios = tudo ok). Pare o servidor ao terminar.
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