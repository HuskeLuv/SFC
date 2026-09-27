export const meta = {
  name: 'pwa-fase3-construcao',
  description:
    'Fase 3 do PWA (demais módulos): contratos → 5 devs em worktrees → integração → QA mobile/desktop/código/segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/pwa-fase3' },
    { title: 'Implementação', detail: 'fatias A, B, C, D, E em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, type-check, lint, testes, build, e2e' },
    { title: 'QA', detail: 'mobile, desktop/impressão, código e segurança em paralelo' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/pwa-fase3';
const BASE = args.base;
const QA_DIR = args.qaDir;
const SPEC = `${REPO}/docs/pwa/fase3-spec-desenho.json`;
const DEC = `${REPO}/docs/pwa/fase3-decisoes.md`;
const PROTO = `${REPO}/docs/pwa/fase3-prototipo.html`;

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Mutações usam as MESMAS rotas/hooks do desktop, csrfFetch e as mesmas invalidações. NÃO mude regras de negócio, cálculos, rotas de API nem textos legais. src/lib/openFinanceConsentimento.ts e src/components/conexoes/TextoConsentimento.tsx NÃO podem entrar no diff.
- Contexto: PWA do My Finance. Fases 0 (casca, BottomSheet em pilha, Modal→sheet, ResponsiveTable), 1 (Carteira: MobileEditSheet, MobileNumberField, MobileSaveToast, ResponsiveTabNav, CardSectionBand, useKeyboardInset, numberInput) e 2 (Fluxo) já estão na base. Esta é a FASE 3 (demais módulos), a última antes do merge na main. Leia docs/pwa/README.md.
- Especificação final: ${SPEC} (arquitetura.fatias[], componentes_compartilhados, prontidao_producao, plano_qa, riscos; design.*; revisao.problemas). Protótipo: ${PROTO}. DECISÕES DO WELLINGTON: ${DEC} — PREVALECEM sobre a spec e o protótipo. Atenção: Agenda com corte de 768px (não 1024); NENHUM h1 novo (o título existente fica visível compacto); 2FA com link otpauth no celular; Comunidade com flag desligada no CI. Leia os três antes de começar.
- Desktop (>= 1024px / lg) NÃO pode mudar, nem a IMPRESSÃO. Em /relatorios e /saude-financeira toda diferença de celular usa a variante mscreen: (criada na fatia 0), nunca max-lg:. No resto: max-lg:, lg:hidden ou useIsBelowLg (fallback de servidor = desktop).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas Tailwind + vermelho #D92D20/#F97066 + âmbar de atenção #D97706/#FBBF24 (ponto) e #B45309 (texto). #0079F2 só em elemento não textual. Sem verde no celular. Não altere brand-500.
- Commits: atômicos, em português no padrão do repo ("feat(pwa): ...", "test(pwa): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main/feat/pwa-fase0, nem mexer em .claude/settings.local.json, .gitignore, docs/ ou arquivos não rastreados pré-existentes.
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Alguns testes importam o prisma real: rode com DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados.
- e2e: CI = banco do seed + build de produção (CI=true), flags PLUGGY/COMUNIDADE desligadas; hoje é 26/09/2026. Testes novos têm de passar lá; screenshots só locais (test.skip(!!process.env.CI)). Nenhum desktop-*.spec grava; o que grava vai em *.escrita.spec.ts (projeto 'escrita' da fatia 0).
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify".
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. QUALQUER edição em teste manual deve ser revertida ao original; nunca desconectar banco real, nunca registrar consentimento, nunca excluir conta, nunca "sair de todos" no usuário demo (quebra as sessões dos outros agentes) — teste esses fluxos só até a confirmação.
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
  required: [
    'worktree',
    'branch',
    'commits',
    'arquivos',
    'testes',
    'desvios_da_spec',
    'pendencias',
  ],
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
  `Você é o DEV da FATIA 0 ("Contratos, primitivos, guardas de desktop/impressão, projeto 'escrita' e CI") da fase 3 do PWA. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec, na ORDEM da spec: commit 1 = baseline (playwright.config com projeto 'escrita', ci.yml com E2E_ALLOW_WRITES, helpers api/print, desktop-fase3(.escrita).spec e snapshots local + ci) sobre o código ATUAL, gravada contra um dev server seu (npx next dev -p 3200); a baseline CI com banco semeado como o ci.yml faz (se não conseguir um Postgres local, registre em pendencias). Depois ajustes de e2e existentes, depois a variante mscreen: no globals.css e os primitivos (MobileTabRail, MobileActionSheet, useResponsiveConfirm, MobileCollapsible, MobileStatusPill, MobileMetricGrid, MobilePageState, mobileChartOptions, useMobileHistoryView) com os nomes exatos da spec. O desktop-fase3.spec deve continuar verde depois de cada commit. Não edite docs/. Rode tsc, eslint e os testes novos. Pare o servidor ao terminar. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'pwa-fase3-a-planejar',
    label: 'dev-A-planejar',
    porta: 3201,
    extra:
      'Planejar: /planejamento-financeiro (Aposentadoria: premissas em cartão 3×3 + sheet alto com MobileNumberField, resultado primeiro, abas Projeção/Acompanhamento/Evolução, registrar mês em sheet; Meus Sonhos: cartões com progresso, filtro de prazo, detalhe, novo/editar objetivo em sheet alto, excluir com confirmação em sheet).',
  },
  {
    id: 'B',
    nome: 'pwa-fase3-b-saude-relatorios',
    label: 'dev-B-saude-relatorios',
    porta: 3202,
    extra:
      'Saúde financeira + Relatórios (as páginas que IMPRIMEM): toda diferença visual de celular com mscreen:, extras de celular montados por JS e marcados hidden mscreen:block|flex; Status no topo só no celular; blocos recolhíveis; Exportar PDF abre os blocos antes de window.print(); a guarda de impressão A4 da fatia 0 tem de continuar igual.',
  },
  {
    id: 'C',
    nome: 'pwa-fase3-c-dividas-agenda',
    label: 'dev-C-dividas-agenda',
    porta: 3203,
    extra:
      'Dívidas (lista em cartões, detalhe com ?divida=id via pushState SÓ no celular, cronograma em lista agrupada por ano, registrar pagamento, nova/editar em sheet alto, situação em sheet, confirmações em sheet) e Agenda (corte em 768px: abaixo disso lista + cabeçalho próprio mês/Hoje/Filtros, detalhe e novo evento em sheet; 768–1023 mantém a grade). e2e que grava (evento da Agenda) em *.escrita.spec.ts.',
  },
  {
    id: 'D',
    nome: 'pwa-fase3-d-conexoes-historico',
    label: 'dev-D-conexoes-historico',
    porta: 3204,
    extra:
      'Conexões bancárias (cartões de banco, caixa de entrada como cartão-resumo que abre tela própria com ?caixa=1 via pushState só no celular, jornada de consentimento no sheet alto SEM mudar nenhum caractere do texto nem os arquivos de texto, widget Pluggy em tela cheia com data-mf-overlay, desconectar com confirmação em sheet) e Histórico (cartões até lg, chips de seção, Detalhes, Desfazer com confirmação em sheet e erro 409 dentro do sheet). e2e do Desfazer em *.escrita.spec.ts; Conexões só até a etapa 2 e só se a flag estiver ligada (no CI pula).',
  },
  {
    id: 'E',
    nome: 'pwa-fase3-e-perfil-edu-comunidade',
    label: 'dev-E-perfil-edu-comunidade',
    porta: 3205,
    extra:
      'Perfil (lista de ajustes em grupos, cada formulário atual em sheet, 2FA com QR + copiar chave + link "Abrir no app autenticador" otpauth:// só no celular + one-time-code, Sair de todos com a confirmação atual — NÃO execute de verdade no demo —, excluir conta isolada no fim), Educação (continuar assistindo, lista de cursos, player VTurb 16:9 de borda a borda e fixo ao rolar, lista de aulas), Comunidade (feed, chips, compositor em sheet alto, post com comentário fixo acima da barra; flag desligada no CI — spec mobile pula com anotação; valide no dev ligando COMUNIDADE_HABILITADA só no .env do SEU worktree) e a barra do mês do Orçamento fixa ao rolar (pendência da fase 2).',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} da fase 3 (demais módulos) do PWA. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os primitivos da fatia 0 com os nomes exatos. Critérios de aceite obrigatórios; onde a spec contrariar ${DEC}, siga as decisões.
${f.extra}
Escreva os e2e mobile da sua fatia (e a guarda de desktop continua sendo a da fatia 0). Suba o dev server no seu worktree (npx next dev -p ${f.porta}) e confira com Playwright a 390px e 320px (isMobile) e a 1280px (desktop inalterado) antes de commitar; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png (crie a pasta). Pare o servidor ao terminar.
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
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR da fase 3 do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0). Traga os commits das 5 fatias com git cherry-pick, na ordem A, B, C, D, E, preservando os commits e as mensagens:
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
Resolva conflitos preservando a intenção das fatias e registre. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com npx next start -p 3210, TODOS os e2e (projetos chromium, mobile e escrita, nessa ordem) — pare o servidor ao terminar. Confirme que git diff ${BASE}..HEAD -- src/lib/openFinanceConsentimento.ts src/components/conexoes/TextoConsentimento.tsx está VAZIO. Corrija problemas de integração com commits "fix(pwa): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, fim da fase 2). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (na fase 1 o resultado se perdeu) — a skill "verify" é permitida só para a receita de login.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local, cp ${REPO}/next-env.d.ts .`;

const QAS = [
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA FUNCIONAL MOBILE. ${QA_BASE}
${PREP}. Faça npm run build && npx next start -p 3301. Com Playwright (390x844 e 320x568, isMobile, hasTouch), logado como usuario.demo, percorra os 10 módulos contra o protótipo (${PROTO}) e as decisões (${DEC}): Planejamento (premissas em sheet com vírgula, abas, sonhos, objetivo), Saúde (status no topo, blocos), Dívidas (lista, detalhe com ?divida= e voltar do navegador, cronograma, pagamento e cadastro em sheet — cancele sem salvar), Agenda (lista < 768, tablet 800px com grade, filtros, novo evento — crie e EXCLUA), Relatórios (período, blocos, Exportar PDF abre blocos), Histórico (Detalhes; Desfazer só até a confirmação), Perfil (sheets; 2FA até o código, sem ativar; Sair de todos só até a confirmação), Educação (lista, aula, player), Comunidade (se a flag estiver desligada, confira que some do menu), Conexões (se a flag Pluggy estiver ligada no .env: lista, caixa de entrada com ?caixa=1, jornada até a etapa 2 SEM autorizar). Nenhuma rota passa de 390px sem corte; modo escuro; console sem erros novos. Rode os e2e mobile da branch contra o 3301 e reporte. Pare o servidor ao terminar.`,
  },
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DE REGRESSÃO DESKTOP E IMPRESSÃO. ${QA_BASE}
Objetivo: provar que o computador e a IMPRESSÃO não mudaram. ${PREP}. Crie um SEGUNDO worktree da base: git worktree add ${QA_DIR}/qa-base ${BASE} (mesmo preparo). Suba os dois (base 3311, branch 3312), um de cada vez se a memória apertar.
A 1280x800, 1366x900 e 1024x768 (sem isMobile), logado como usuario.demo, capture ANTES e DEPOIS de: /planejamento-financeiro (as duas ferramentas e as 3 abas), /saude-financeira, /dividas e o detalhe de uma dívida, /calendario, /relatorios, /historico-alteracoes, /profile, /educacao e uma aula, /conexoes-bancarias (se a flag estiver ligada), /fluxodecaixa?modo=orcamento. Compare pixel a pixel (mascarando números de mercado) e visualmente. IMPRESSÃO: para /relatorios e /saude-financeira gere page.pdf (A4) nas duas versões e compare nº de páginas e imagem de cada página; confirme também que a 1023px vira celular e que 800px na /calendario mostra a grade. Salve pares em ${QA_DIR}/desk-antes-*.png e desk-depois-*.png. Pare os servidores e remova o worktree da base.`,
  },
  {
    label: 'qa-codigo',
    prompt: `Você é o REVISOR DE CÓDIGO (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: mutações do celular iguais às do desktop (mesmas rotas, payload, invalidações), parse de números (vírgula, milhar "1.234", o MobileNumberField no simulador mandando o mesmo número ao handleChange), pushState de ?divida/?caixa (voltar, hidratação, só no celular), confirmações (texto igual ao do desktop, sem confirmar duas vezes), impressão (nenhuma classe max-lg: em /relatorios e /saude-financeira; mscreen usado certo), hooks chamados condicionalmente, listeners/timers sem cleanup, classes que vazam para o desktop, arquivos de texto legal intocados, testes frágeis ou que gravam fora do projeto 'escrita'. Cada achado com arquivo:linha e cenário concreto.`,
  },
  {
    label: 'qa-seguranca',
    prompt: `Você é o REVISOR DE SEGURANÇA/LGPD. ${QA_BASE}
Revise você mesmo o diff. Foque: jornada de consentimento Open Finance (texto e hash intocados; nada que permita autorizar sem o aceite; widget com data-mf-overlay), 2FA (link otpauth só com o segredo que a API já devolve ao próprio usuário; nada logado; nada em localStorage), Sair de todos e exclusão de conta (mesmas rotas e confirmações), ?divida e ?caixa (IDOR: só abre o que é do usuário; injeção), dangerouslySetInnerHTML na Comunidade/Educação, player VTurb e CSP, e2e 'escrita' e E2E_ALLOW_WRITES (não pode ligar gravação em produção), dados do consultor personificando. Cada achado com arquivo:linha e cenário.`,
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
qas.forEach((r, i) =>
  (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })),
);
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
    `Você é o CORRETOR da fase 3 do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(pwa): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da fase 3 do PWA. ${REGRAS}
${PREP}. Suba npm run build && npx next start -p 3321. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1280px quando aplicável; impressão A4 quando for de Relatórios/Saúde). Rode também os e2e da branch (chromium, mobile, escrita). Reporte só o que continua quebrado ou quebrou. Pare o servidor ao terminar.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`,
      {
        label: 'qa-reverificacao',
        phase: 'Reverificação',
        schema: FINDINGS,
        isolation: 'worktree',
      },
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
