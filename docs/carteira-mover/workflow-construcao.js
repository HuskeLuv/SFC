export const meta = {
  name: 'carteira-mover-construcao',
  description:
    'Mover investimentos entre abas/seções da Carteira: contratos → 5 devs em worktrees → integração → QA funcional/mobile/dados/código+segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/carteira-mover' },
    { title: 'Implementação', detail: 'fatias A, B, C, D, E em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, e2e, snapshots desktop 1x' },
    { title: 'QA', detail: 'funcional desktop, mobile, dados/consumidores, código+segurança' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/carteira-mover';
const BASE = args.base;
const QA_DIR = args.qaDir;
const SPEC = `${REPO}/docs/carteira-mover/spec-desenho.json`;
const DEC = `${REPO}/docs/carteira-mover/decisoes.md`;
const PROTO = `${REPO}/docs/carteira-mover/prototipo.html`;

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright, @dnd-kit). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 01/10/2026. Mutações usam csrfFetch; depois de mutação de carteira, invalidatePortfolioDerivedQueries (src/lib/invalidatePortfolio.ts).
- FEATURE: "mover investimentos entre abas e seções da Carteira" + ação na página do ativo. Branch de integração ${BRANCH} (parte da main ${BASE}).
- Especificação final: ${SPEC} (chave "arquitetura": modelo_dados, consumidores[], api, fatias[], plano_producao, plano_qa, riscos; "design"; "revisao"). Protótipo: ${PROTO}. DECISÕES APROVADAS PELO WELLINGTON: ${DEC} — PREVALECEM sobre spec e protótipo. Em especial: (1) arrastar para outra aba = BANDEJA "Outra aba" fixa no rodapé durante o arrasto (como no protótipo), NÃO a barra de abas (a spec do arquiteto ainda descreve a barra de abas — ignore essa parte e siga o protótipo; o popover de seção abre acima do chip da bandeja); (2) objetivo zera na troca de ABA para posições (mantém para planejados); (3) IR NÃO muda (segue Asset.type); (4) histórico por classe segue a aba nova retroativamente (aplicado na leitura); (5) Fluxo de Caixa: aportes/resgates do ativo movido de aba vão para a linha da aba nova; (6) compra de ativo já possuído NÃO regrava subgrupo + corrigir BDR que não salva estratégia; (7) página do ativo de item não movível: só frase, sem botão; (8) ETF região livre; ETF USD ↔ Stocks/REITs bloqueado "em validação"; (9) consultor agindo pode mover ("via consultor"); (10) selo "movido"/"Voltar ao original" só na troca de ABA, a partir do UserChangeLog; (11) FORA: units B3 como ação, divergência pizza×aba de fundos legados, contraste TABLE_STYLES. Leia os três arquivos antes de começar.
- Asset.type de catálogo NUNCA muda. Override só gravado quando destino ≠ aba base; voltar à base grava null.
- MIGRATION: aditiva (3 colunas TEXT NULL). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev". Siga o padrão do repo: crie prisma/migrations/<timestamp>_carteira_mover_override/migration.sql com a SQL (ALTER TABLE ... ADD COLUMN IF NOT EXISTS), um script idempotente scripts/apply-carteira-mover-migration.ts (raw SQL + INSERT em _prisma_migrations, como os outros scripts/apply-*-migration.ts) e rode-o UMA vez no dev; depois npx prisma generate. Em produção, prisma migrate deploy aplica a SQL versionada (passo humano depois do merge).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas + vermelho #D92D20/#F97066. #0079F2 só em elemento não textual (contornos, realce, foco). Botão primário em patrimonio #396CAA (Button do app). Fonte Outfit. Dark mode obrigatório. Alvos >= 44px no celular.
- Commits: atômicos, em português no padrão do repo ("feat(carteira): ...", "fix(carteira): ...", "test(carteira): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ (exceto quando pedido) ou arquivos não rastreados pré-existentes. NUNCA tocar em produção (Lightsail/ssh) — nada de banco de prod.
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Alguns testes importam o prisma real: rode com DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Padrão de teste de rota: mock de Prisma via vi.hoisted, mock de requireAuthWithActing (@/utils/auth) — ver src/test/mocks.
- e2e: CI = banco do seed + build de produção (CI=true), flags PLUGGY/COMUNIDADE desligadas. Testes novos têm de passar lá; screenshots só locais (test.skip(!!process.env.CI)). O que grava vai em *.escrita.spec.ts (projeto 'escrita', E2E_ALLOW_WRITES=1 só no CI) e DESFAZ o que gravou. Baselines .ci de snapshot são gravadas com ~/.cache/ms-playwright/chromium_headless_shell-1208.
- Desktop: a Carteira muda de propósito (alça ⠿ e menu ⋯ nas linhas movíveis, bandeja durante o arrasto, selo "movido"), e a página do ativo ganha "Mover na Carteira" + linha "Na Carteira: aba › seção". Nada mais pode mudar no desktop. Snapshots de e2e/desktop-*.spec.ts-snapshots são RECURSO COMPARTILHADO: NENHUM dev atualiza snapshot; quem atualiza é o INTEGRADOR, uma única vez, em commit dedicado.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); se faltar lib de sistema use LD_LIBRARY_PATH=${args.libs}; para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify" (a skill é permitida SÓ para essa receita). Use waitUntil:'load' + espera fixa (networkidle trava no dev server).
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. QUALQUER movimento em teste manual deve ser DESFEITO ao final (o ativo volta à aba/seção original, objetivo restaurado); nunca excluir conta nem posições do demo.
`;

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) rode "git checkout --detach ${BRANCH}" (o worktree pode ter nascido da main) e confira com "git log --oneline -5" que os commits da fatia 0 estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts .; npx prisma generate se o client não tiver as colunas novas (o node_modules é compartilhado — gere UMA vez, sem apagar nada). (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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
  `Você é o DEV da FATIA 0 ("Contratos: schema, migration, categoria efetiva, matriz, where, movidoInfo, tipos de UI e queryKeys") da feature mover investimentos. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec: colunas no schema + migration versionada + script apply idempotente (rode no dev) + prisma generate; src/lib/carteiraMover.ts (puro: CATEGORIAS_MOVIVEIS, regex, SUBGRUPOS_POR_CATEGORIA, campos, categoriaBaseDaAba, overrideEfetivo, modeloDePreco, destinosPermitidos com motivo — ETF USD ↔ Stocks/REITs bloqueado "em validação" (decisão 8) —, subgrupoPadrao, subgrupoSugerido, mudaRegraIR, moverInvestimentoSchema zod e tipos); categoriaEfetiva em itemValuation.ts; src/services/portfolio/categoriaAba.ts (wherePortfolioDaCategoria/whereWatchlistDaCategoria); src/services/portfolio/movidoInfo.ts; tipos de UI e queryKeys que as fatias D/E usam; contratos HTTP (rotas, payloads, respostas) documentados em docblock no carteiraMover.ts para as fatias A-E. Testes vitest da fatia (matriz completa, overrideEfetivo, where nunca lista um item em duas abas). Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'carteira-mover-a-api',
    label: 'dev-A-api-historico',
    porta: 3201,
    extra:
      'API mover/restaurar: rotas da spec (zod + requireAuthWithActing + CSRF; usuário só move posição/planejado DELE; consultor agindo pode — registra via consultor), transação gravando categoriaOverride/subgrupo/objetivo conforme as regras e decisões 2/10, registro no UserChangeLog (section carteira, actions investimento.mover/planejado.mover/investimento.restaurar/planejado.restaurar) com snapshot suficiente para desfazer, handlers de desfazer no registry do Histórico v2 (src/services/changeHistory) e no endpoint de desfazer, Fluxo de Caixa (decisão 5: aportes/resgates migram para a linha da aba nova — use os serviços existentes de sync do cashflow de investimentos, não reinvente), resposta com o estado novo para update otimista. Testes de rota (vi.hoisted) cobrindo: troca de seção sem override, troca de aba com override, volta à base = null, incompatível = 400 com motivo, IDOR = 404, consultor, desfazer.',
  },
  {
    id: 'B',
    nome: 'carteira-mover-b-abas',
    label: 'dev-B-rotas-abas',
    porta: 3202,
    extra:
      'Rotas GET das abas (acoes, stocks, fii, etf, reit, fim-fia) passam a usar wherePortfolioDaCategoria/whereWatchlistDaCategoria e a seção pelo campo de subgrupo da categoria efetiva (fim-fia: Portfolio.tipoFundo antes de notes.tipoFundo), operação (/api/carteira/operacao): compra de ativo já possuído NÃO regrava estrategia/tipoFii/regiaoEtf/tipoFundo + BDR passa a salvar estrategia (decisão 6); cada linha devolve os campos que a UI precisa (categoria efetiva, movível, movido etc. — conforme contrato da fatia 0). Testes das rotas alteradas (incluindo item movido aparece só na aba destino).',
  },
  {
    id: 'C',
    nome: 'carteira-mover-c-consumidores',
    label: 'dev-C-consumidores',
    porta: 3203,
    extra:
      'Demais consumidores no servidor listados em "consumidores" da spec: pizza/alocação/resumo, alocação-alvo/objetivo, relatórios e rentabilidade por classe (retroativo, decisão 4), Saúde Financeira, assistente de IA, análises, consultor — todos pela categoriaEfetiva/overrideEfetivo. IR NÃO muda (decisão 3) — garanta com teste que o IR de um FII movido para Ações continua como FII. Faça você mesmo um grep final (categorizarAsset, CATEGORIA_ASSET_TYPE_FILTERS, type: \'fii\', type: { in) e registre em pendencias qualquer consumidor que a spec não listou. Testes por consumidor alterado.',
  },
  {
    id: 'D',
    nome: 'carteira-mover-d-ui',
    label: 'dev-D-ui-dialogo-ativo',
    porta: 3204,
    extra:
      'UI do mover (sem o arrastar): hooks React Query com update otimista + rollback + invalidação; diálogo "Mover para…" (desktop, D10 do protótipo), BottomSheet do celular (M2-M6, padrão MovePanel do Fluxo), popover de seção para a bandeja (D5 — componente que a fatia E monta), toast com Desfazer e "Ver em <aba>", selo "movido" + "Voltar para…" (só troca de aba), página do ativo /ativos/[id] (A1-A6: linha "Na Carteira: aba › seção", botão "Mover na Carteira" ao lado de "Editar produto", frase para não movível, celular com linha própria + botão Mover), wizard de compra mostrando a seção atual "definida por você" quando o ativo já está na carteira. Textos pt-BR do protótipo. Testes de componente (RTL) dos estados principais.',
  },
  {
    id: 'E',
    nome: 'carteira-mover-e-dnd',
    label: 'dev-E-arrastar-tabelas',
    porta: 3205,
    extra:
      'Arrastar nas tabelas da Carteira com @dnd-kit, reaproveitando o padrão de src/components/cashflow/CashflowDnd.tsx: alça ⠿ (botão acessível) e menu ⋯ ("Abrir ativo", "Mover para…", "Voltar para…") nas linhas movíveis do GenericAssetTable/tabelas por aba; seções como alvos de drop (realce + "Soltar aqui" em fundo seguranca); BANDEJA "Outra aba" fixa no rodapé da viewport durante o arrasto (decisão 1 — NÃO usar a barra de abas), com chips compatíveis/travados com motivo; soltar num chip abre o popover de seção da fatia D; arrasto por teclado (announcements do dnd-kit) ao menos entre seções; celular: botão "Mover" nos cartões abertos (abre o sheet da fatia D), sem drag. e2e: um spec de leitura (alça/menu presentes nas abas movíveis, ausentes em Renda Fixa) e um *.escrita.spec.ts que move um ativo do demo de seção e de aba, confere, e DESFAZ.',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} da feature mover investimentos entre abas e seções da Carteira. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos da fatia 0 (src/lib/carteiraMover.ts é a fonte única de matriz/subgrupos/payloads). Critérios de aceite obrigatórios; onde a spec ou o protótipo contrariarem ${DEC}, seguem as DECISÕES.
${f.extra}
Quando a fatia tiver UI, suba o dev server no seu worktree na porta ${f.porta} e confira com Playwright a 390px (isMobile) e a 1280px antes de commitar; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png. Desfaça qualquer movimento feito no demo. Pare o servidor ao terminar.
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
  `Você é o INTEGRADOR da feature mover investimentos. ${REGRAS}
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
Resolva conflitos preservando a intenção das fatias e registre. Garanta que as peças se encaixam de ponta a ponta (a fatia E monta o popover/diálogo/sheet da D; as rotas da B devolvem o que a UI da D/E lê; o desfazer da A funciona a partir do toast da D). Depois, na ordem: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com npx next start -p 3210, TODOS os e2e (projetos chromium, mobile e escrita, nessa ordem) — pare o servidor ao terminar.
SNAPSHOTS DE DESKTOP: a Carteira (alça/menu nas linhas) e a página do ativo mudam de propósito. Atualize os snapshots UMA vez, em COMMIT DEDICADO "test(carteira): snapshots desktop do mover" — locais com o chromium local e .ci com ~/.cache/ms-playwright/chromium_headless_shell-1208 — e salve pares antes/depois de cada baseline alterada em ${QA_DIR}/desktop-diff-*.png. Nenhuma baseline fora da Carteira/página do ativo pode mudar — se mudar, é bug: investigue.
Corrija problemas de integração com commits "fix(carteira): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, snapshots: integ.snapshots_desktop })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login. Desfaça no banco de dev todo movimento que fizer.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts .`;

const QAS = [
  {
    label: 'qa-funcional-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA FUNCIONAL DESKTOP. ${QA_BASE}
${PREP}. Suba npm run dev -p 3301 (ou build de produção se o dev travar). A 1280x800 e 1366x900, logado como usuario.demo, percorra contra o protótipo (${PROTO}) e as decisões (${DEC}): arrastar entre seções (FIIs, Ações, ETFs, Fundos), arrastar até a bandeja "Outra aba" e escolher seção no popover, chip travado (motivo, soltar não faz nada), Esc cancela, menu ⋯ → diálogo "Mover para…" (só teclado também: Tab, setas, Enter), selo "movido" e "Voltar para…", toast com Desfazer (desfaz de verdade) e item no Histórico de alterações (desfazível depois), objetivo zera na troca de aba e volta no desfazer, ativo planejado, página do ativo (botão, diálogo, frase em CDB/RF), Renda Fixa/Reservas sem alça. Depois de cada movimento confira que o item aparece SÓ na aba destino (nunca em duas) e que a pizza/resumo da Carteira mudou de classe e o total geral NÃO mudou. Consultor (consultor.demo agindo pelo cliente): pode mover, selo diz consultor. Modo escuro. Console sem erros novos. Screenshots em ${QA_DIR}/qa-desk-*.png. DESFAÇA tudo ao final e confira. Pare o servidor.`,
  },
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA MOBILE. ${QA_BASE}
${PREP}. Suba npm run dev -p 3302. Com Playwright 390x844 e 320x568 (isMobile, hasTouch), logado como usuario.demo: cartões das abas movíveis com botão "Mover" (44px), BottomSheet (M2-M6 do protótipo: grupos por aba, seção atual desabilitada, abas recusadas recolhidas com motivo, Movendo…, erro mantém aberto — simule falha bloqueando a rota com page.route —, sucesso com toast + Desfazer acima da barra), página do ativo no celular (linha "Na Carteira" + Mover), nenhuma rota passa de 390px, modo escuro, foco/voltar do sistema fecha o sheet. Screenshots em ${QA_DIR}/qa-mob-*.png. DESFAÇA tudo. Pare o servidor.`,
  },
  {
    label: 'qa-dados-consumidores',
    isolation: 'worktree',
    prompt: `Você é o QA DE DADOS (consistência dos consumidores). ${QA_BASE}
${PREP}. Suba npm run dev -p 3303. Logado como usuario.demo, pegue um FII e uma ação do demo. ANTES de mover, grave via API (GET) os números de: resumo/pizza da Carteira, alocação-alvo/objetivos, relatórios por classe e rentabilidade por classe, Saúde Financeira, IR (apuração do ativo), Fluxo de Caixa (linhas de investimento do ano), proventos. Mova o FII para Ações (e outro para Fundos) pela API da feature e regrave tudo. Confira: valor total da carteira idêntico; o valor do ativo saiu da classe origem e entrou na destino em TODOS os consumidores de classe (inclusive histórico retroativo, decisão 4); IR IDÊNTICO (decisão 3); Fluxo de Caixa com aportes/resgates na linha da aba nova e totais iguais (decisão 5); objetivo zerado na posição (decisão 2). Volte à aba original (restaurar) e confira que TUDO voltou aos números de antes. Faça grep no diff e no código por consumidores de categoria que não usem categoriaEfetiva (categorizarAsset, CATEGORIA_ASSET_TYPE_FILTERS, type: 'fii', type: { in ...) e reporte os que ficaram de fora. Tabela antes/depois/restaurado em ${QA_DIR}/qa-dados.md. Pare o servidor.`,
  },
  {
    label: 'qa-codigo-seguranca',
    prompt: `Você é o REVISOR DE CÓDIGO E SEGURANÇA (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: Asset.type de catálogo nunca alterado; override gravado só quando ≠ base e null ao voltar; where nunca lista item em duas abas nem some com item (casos limite: catálogo muda depois do override; categoria não movível); matriz respeitada no SERVIDOR (não só na UI); IDOR (mover posição/planejado de outro usuário; consultor sem vínculo); zod + CSRF + requireAuthWithActing em toda rota nova; transação atômica (override + subgrupo + objetivo + changelog + fluxo); desfazer restaura exatamente (inclusive objetivo e fluxo de caixa) e não quebra se o ativo foi vendido depois; compra não regrava subgrupo; BDR estratégia; update otimista com rollback correto e invalidação completa; dnd-kit: listeners/sensores sem vazamento, bandeja em portal sem quebrar scroll; migration aditiva e script apply idempotente; IR intocado; nenhum consumidor esquecido. Cada achado com arquivo:linha e cenário concreto.`,
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
          properties: { achado: { type: 'string' }, commit: { type: 'string' }, como: { type: 'string' } },
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
    `Você é o CORRETOR da feature mover investimentos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(carteira): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da feature mover investimentos. ${REGRAS}
${PREP}. Suba npm run dev -p 3321. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1280px quando aplicável). Rode também os e2e da branch (chromium, mobile, escrita) contra um build de produção (npm run build && npx next start -p 3322). Desfaça dados de teste. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
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
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados, evidencias: qas[i]?.evidencias })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
};
