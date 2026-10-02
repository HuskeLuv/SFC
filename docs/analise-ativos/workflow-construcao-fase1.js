export const meta = {
  name: 'analise-ativos-fase1-construcao',
  description:
    'Análise de Ativos Fase 1 (Quadro + Página do ativo): fundação 0a → 5 devs em worktrees (0b, A, B, C, D) → integração → QA desktop/mobile/dados/código+segurança+compliance → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0a na branch feat/analise-ativos-fase1' },
    { title: 'Implementação', detail: 'fatias 0b, A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, e2e' },
    { title: 'QA', detail: 'desktop, mobile, dados, código+segurança+compliance' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/analise-ativos-fase1';
const BASE = args.base;
const QA_DIR = args.qaDir;
const DOCS = `${REPO}/docs/analise-ativos/fase1`;
const SPEC = `${DOCS}/spec-desenho.json`;
const DEC = `${DOCS}/decisoes.md`;
const PROTO = `${DOCS}/prototipo.html`;

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15 App Router, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 02/10/2026. Mutações usam csrfFetch; depois de mutação de carteira, invalidatePortfolioDerivedQueries.
- FEATURE: Análise de Ativos — FASE 1 (Quadro + Página do ativo, só Ações e FIIs) sobre os dados da Fase 0 (já na main: tabelas AssetScore, AssetMultiplesYearly/Current, AssetFundamentalsPeriod, FiiMonthly, AssetEvento etc.; serviços em src/services/analiseAtivos/**). Branch de integração ${BRANCH} (parte da main ${BASE}).
- Especificação final: ${SPEC} (chave "arquitetura": fatias[], apis[], schema_prisma, mapa_dados_por_bloco, plano_producao, plano_qa, riscos; "design"; "revisao"). Protótipo (referência de LEIAUTE e conteúdo; 26 cenários): ${PROTO}. DECISÕES APROVADAS PELO WELLINGTON: ${DEC} — PREVALECEM sobre spec e protótipo (resumo: paleta só My Finance, semáforo azul cheio/meio + vermelho só no "não atende", anel do Índice numa cor; tese 100% privada, consultor 403; universo do Quadro a partir do cadastro com score opcional, sem negócio em 30 pregões = só na busca; incompleto/em conferência/zero pela regra distintos; séries só anos fechados + últ. 12m; DPA > 2× ano anterior = em conferência; nada sem fonte (IBOV, Ibovespa, JCP estimado); Comparar/Salvar/Ranking/Stocks/REITs/Comunidade ESCONDIDOS sem "em breve"; gráfico 5A/10A; URL própria /analise-ativos/[ticker]; Planejar/Registrar pelo wizard existente; números de "Na sua carteira" = os da aba da Carteira (respeita categoriaOverride do mover #275); flag ANALISE_ATIVOS_HABILITADA off = 404, on + fora do beta = tela "Área em beta fechado" e API 404; beta em tabela + script, admins sempre entram; tese 10.000 chars, autosave, sem histórico; paginação 25 + Mostrar mais; selo NOVO até 31/12/2026). Leia os três arquivos antes de começar.
- Nenhuma rota /api/analise-ativos/* chama provedor externo (BRAPI/CVM/B3) no caminho da requisição. Textos da tela saem de um único módulo de textos (textosTela) e passam pela varredura de palavras proibidas da Fase 0 (regras/comum/linguagem.ts). Nada de "comprar/recomendação"; "Índice MF", nunca "nota".
- MIGRATION: aditiva (só CREATE TABLE/INDEX). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev" nem "migrate deploy" no dev. Padrão do repo (ver scripts/analise-ativos/apply-migration-fase0.ts): SQL versionada em prisma/migrations/<timestamp>_analise_ativos_fase1/migration.sql com IF NOT EXISTS + script idempotente scripts/analise-ativos/apply-migration-fase1.ts (raw SQL + INSERT em _prisma_migrations), rodado UMA vez no dev; depois npx prisma generate. Em produção, prisma migrate deploy aplica a SQL (passo humano depois do merge).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas do app + vermelho #D92D20/#F97066. #0079F2 só em elemento não textual. Texto/link #396CAA claro / #6E9DC4 escuro. Fonte Outfit. Dark mode obrigatório. Tabelas no padrão TABLE_STYLES (src/components/ui/table/tableStyles.ts). Alvos >= 44px no celular (48px nos botões principais). Casca PWA mobile existente (src/layout/mobile/*, BottomSheet, ResponsiveTable).
- Commits: atômicos, em português no padrão do repo ("feat(analise-ativos): ...", "fix(analise-ativos): ...", "test(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ fora de docs/analise-ativos/fase1/ ou em arquivos não rastreados pré-existentes. NUNCA tocar em produção (Lightsail/ssh/banco de prod).
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Testes que importam o prisma real: rode com DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Padrão de teste de rota: mock de Prisma via vi.hoisted, mock de requireAuthWithActing (@/utils/auth) — ver src/test/mocks.
- Para ver a área no dev: rode o servidor com ANALISE_ATIVOS_HABILITADA=true (e ANALISE_ATIVOS_ACESSO=beta) no ambiente do processo; o usuário demo precisa estar no beta (a fatia 0a deixa o demo no beta no banco dev e no seed). O banco dev tem histórico reduzido (notas de FII mais baixas que em prod) — é esperado.
- e2e: CI = banco do seed + build de produção (CI=true), flags PLUGGY/COMUNIDADE desligadas e ANALISE_ATIVOS_HABILITADA=true (a fatia 0a põe no ci.yml). Testes novos têm de passar lá (o seed precisa trazer as fixtures da área); screenshots só locais (test.skip(!!process.env.CI)). O que grava (tese) vai em *.escrita.spec.ts (projeto 'escrita') e DESFAZ o que gravou. Snapshots de e2e/desktop-*.spec.ts-snapshots são RECURSO COMPARTILHADO: nenhum dev atualiza; se a sidebar mudar baselines, só o INTEGRADOR atualiza, uma vez, em commit dedicado.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }) (funciona sem libs extras); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify" (a skill é permitida SÓ para essa receita). Use waitUntil:'load' + espera fixa (networkidle trava no dev server).
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. Tese escrita em teste manual deve ser APAGADA ao final; não mexa na carteira do demo (nada de operação real; se abrir o wizard, cancele).
`;

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) rode "git checkout --detach ${BRANCH}" (o worktree pode ter nascido da main) e confira com "git log --oneline -5" que os commits da fatia 0a estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts .; o prisma client compartilhado já foi gerado pela 0a — só rode npx prisma generate se faltar algo, sem apagar nada. (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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

phase('Fundação');
const f0 = await agent(
  `Você é o DEV da FATIA 0a ("Fundação bloqueante") da Análise de Ativos Fase 1. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0a" da spec: schema aditivo (3 models) + migration versionada + script apply idempotente (rode no dev) + prisma generate; contratos src/types/analiseAtivosApi.ts para TODAS as APIs; gate flag + beta (acessoAnalise) para página E API; casca de rotas /analise-ativos e /analise-ativos/[ticker] com o layout que decide 404 / tela de beta; leitores e séries/CAGR ÚNICOS (só anos fechados + últ. 12m; regra DPA > 2× = em conferência); textosTela com teste de palavras proibidas; constantes visuais (paleta das decisões); hooks React Query + queryKeys; fixtures + seed (usuário demo no beta; dados mínimos para e2e no banco do seed) + ci.yml com ANALISE_ATIVOS_HABILITADA=true; STUBS com as props FINAIS para os componentes das fatias 0b, A, B, C, D (cada stub no caminho que a fatia dona vai preencher, exportando a assinatura final, renderizando um placeholder simples). Ponha o usuário demo no beta também no banco dev. Contratos HTTP e props documentados em docblock para que 0b/A/B/C/D trabalhem sem arquivo em comum. Testes vitest da fatia. Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0a-fundacao', phase: 'Fundação', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0a falhou', f0 };
log(`Fatia 0a commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: '0b',
    nome: 'aa-fase1-0b-visual',
    label: 'dev-0b-componentes-comuns',
    porta: 3201,
    extra:
      'Componentes visuais comuns (substitui os stubs da 0a em src/components/analiseAtivos/{shell,comum}): AnelIndice (uma cor, tracejado no incompleto, estados sem_score/fora_do_indice), BadgeCriterio (ícone+texto: atende cheio, parcial meio, não atende vermelho com ✕, sem dado tracejado com ?, não se aplica traço), BarrasDezAnos (lucro/rendimento, prejuízo para baixo, ano sem dado tracejado, em conferência tracejado), ValorAnalise (Estado<T> → valor ou "—" + motivo), selos (incompleto, fonte CVM, estado), RodapeLegal, BannerNovidade, formatarAnalise. role="img" + aria-label completos. Testes RTL dos estados. Página de bancada só se útil (não commite rota de bancada).',
  },
  {
    id: 'A',
    nome: 'aa-fase1-a-quadro',
    label: 'dev-A-quadro-busca',
    porta: 3202,
    extra:
      'Job "quadro" (materialização em analise_quadro_linhas, universo do cadastro com score opcional, noQuadro = negociado nos últimos 30 pregões e não Fiagro) registrado no catálogo de jobs da Fase 0 + rota cron (mesmo padrão das outras em src/app/api/cron/analise-ativos/) + linha no template de cron (infra/modules/lightsail/provision.sh.tftpl) — rode o job no banco DEV e remova o script temporário semear-quadro-dev se a 0a o criou; API do Quadro (filtros, ordem com nulos sempre no fim, página de 25, cache em memória por versão, no-store) e do índice de busca; UI do Quadro (tabs Ações/FIIs com contador, chips, popover Setor/Segmento, Resumo|Detalhado, tabela TABLE_STYLES ordenável acessível com aria-sort, coluna da ordem destacada, Lucro/Rendimento 10 anos, Na carteira, Mostrar mais, estados carregando/vazio/erro) e no celular (cartões, trilho de chips, sheet de ordem); busca com autocomplete combobox (atalho "/", sheet de tela cheia no celular, itens fora do Quadro com selo). Testes do job (vitest com prisma fake), da API (vi.hoisted) e de componente. e2e de leitura do Quadro + busca.',
  },
  {
    id: 'B',
    nome: 'aa-fase1-b-topo',
    label: 'dev-B-ativo-topo',
    porta: 3203,
    extra:
      'Página do ativo — topo: API /api/analise-ativos/ativos/[ticker] (topo numa chamada), cabeçalho (tags sem IBOV, preço do último pregão + data), bloco Índice + semáforo (componentes do Índice em details, caixa "o que falta" no incompleto e "zerado pela regra" no zero_regra, critérios fora da conta "não se aplica"), KPIs (8, 4 colunas → 2 → 1), gráfico Lucro por ação × Cotação base 100 (5A/10A, figure+figcaption, "Ver dados em tabela", tooltip por teclado) e bloco de proventos (ano em conferência tracejado, só anos fechados), próximos eventos (só datas com fonte), card Educação, selo de frescor, estados carregando/404. Use ApexChartWrapper ou SVG conforme a spec. Testes da API e de componente.',
  },
  {
    id: 'C',
    nome: 'aa-fase1-c-analise',
    label: 'dev-C-ativo-analise',
    porta: 3204,
    extra:
      'Página do ativo — análise (carregados quando o bloco aparece): APIs /fundamentos e /valuation; Fundamentos · Essencial (10 anos fechados, último destacado, coluna Ano fixa, rola dentro do card no celular; ações vs FIIs; bancos com padrão individual BR GAAP); Valuation · Múltiplos (chips de grupo, cartões com barra mín/média/máx de 10 anos + ponto atual, barra oculta com histórico < 5 anos ou valor em conferência, frase-resumo neutra); múltiplos históricos (P/L e P/VP; FIIs P/VP e DY); Pares do segmento (5, clicáveis, linha do próprio ativo destacada). Use o utilitário único de séries/CAGR da 0a — nada de recalcular crescimento aqui. Testes das APIs e de componente.',
  },
  {
    id: 'D',
    nome: 'aa-fase1-d-usuario',
    label: 'dev-D-usuario-ativacao',
    porta: 3205,
    extra:
      'Usuário e ativação: overlay /api/analise-ativos/carteira (DB-only, para o filtro "Na minha carteira" e os selos do Quadro); bloco "Na sua carteira" REUSANDO os endpoints/hooks da própria aba (useAcoes/useFii, /api/carteira/resumo e /configuracao) para que valor, % da carteira, peso na aba, objetivo e classe × alvo sejam IDÊNTICOS aos da Carteira, inclusive com item movido de aba; botões "Planejar na Carteira" (wizard existente na etapa Planejar com o ticker) e "Registrar operação" (wizard com o ticker) — se o wizard não aceitar preset, acrescente um preset OPCIONAL sem mudar o comportamento atual; tese privada (API GET/PUT/DELETE /api/analise-ativos/teses/[ticker] com zod, CSRF, 10.000 chars, consultor agindo = 403; UI com autosave 1,5s, estados vazia/editando/salvando/salva/erro, card "pessoal" no modo consultor); item "Análise de Ativos" com selo NOVO abaixo de Carteira na sidebar e no painel Mais do celular, só para quem tem acesso; Agenda: link do evento de resultado para /analise-ativos/[1º símbolo] só para quem tem acesso; script scripts/analise-ativos/beta.ts (--listar/--adicionar/--remover, dry-run sem --apply); docs/analise-ativos/fase1/ATIVACAO.md (runbook de produção). Testes de rota (IDOR da tese, consultor 403, CSRF), de componente, e2e de leitura da área + *.escrita.spec.ts da tese que apaga o que escreveu.',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} da Análise de Ativos Fase 1. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos, stubs, hooks, textosTela e utilitários da fatia 0a (fonte única). Critérios de aceite obrigatórios; onde a spec ou o protótipo contrariarem ${DEC}, seguem as DECISÕES.
${f.extra}
Quando a fatia tiver UI, suba o dev server no seu worktree na porta ${f.porta} (com ANALISE_ATIVOS_HABILITADA=true) e confira com Playwright a 390px (isMobile) e a 1440px, claro e escuro, comparando com os cenários do protótipo; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png. Pare o servidor ao terminar.
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
    snapshots_desktop: { type: 'string', description: 'SHA do commit único de snapshots (se houve) + evidências do diff, ou "nenhuma baseline mudou"' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'snapshots_desktop', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR da Análise de Ativos Fase 1. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0a). Traga os commits das 5 fatias com git cherry-pick, na ordem 0b, A, B, C, D, preservando commits e mensagens:
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
Resolva conflitos preservando a intenção das fatias (stubs da 0a são substituídos pela fatia dona) e registre. Garanta que as peças se encaixam de ponta a ponta: o Quadro abre a página do ativo; a página monta B + C + D na ordem do protótipo; a busca abre ativos; o menu e a Agenda respeitam o gate; nenhum stub sobrou. Depois, na ordem: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com ANALISE_ATIVOS_HABILITADA=true npx next start -p 3210, TODOS os e2e (projetos chromium, mobile e escrita, nessa ordem) — pare o servidor ao terminar. Os e2e também têm de passar no CI (banco do seed): confira que o seed traz o que os testes novos leem.
SNAPSHOTS DE DESKTOP: só a sidebar ganha o item novo — e só para quem tem acesso. Se alguma baseline existente mudar, decida: mudança esperada (item no menu do demo) → atualize UMA vez em COMMIT DEDICADO "test(analise-ativos): snapshots desktop com o item novo no menu" (locais com o chromium local e .ci com ~/.cache/ms-playwright/chromium_headless_shell-1208) e salve pares antes/depois em ${QA_DIR}/desktop-diff-*.png; qualquer outra mudança é bug: investigue.
Corrija problemas de integração com commits "fix(analise-ativos): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Plano de QA do arquiteto: chave "arquitetura.plano_qa" de ${SPEC}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, snapshots: integ.snapshots_desktop })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login. Apague no banco de dev toda tese que escrever.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts . Suba o servidor sempre com ANALISE_ATIVOS_HABILITADA=true no ambiente.`;

const QAS = [
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DESKTOP. ${QA_BASE}
${PREP}. Suba npm run dev -p 3301 (ou build de produção se o dev travar). A 1440x900 e 1080x800, claro e escuro, logado como usuario.demo, percorra item 1 do plano_qa contra o protótipo (${PROTO}) e as decisões (${DEC}): Quadro Ações/FIIs (abas, contadores, chips, popover, Resumo/Detalhado, ordenação com nulos no fim, coluna destacada, Mostrar mais, Na carteira, Só dados completos, estados), busca (combobox por teclado, "/", ativo fora do Quadro), páginas WEGE3, ITUB4, TGMA3, AURE3, HGLG11, HCTR11 e um FoF (todos os blocos, na ordem; incompleto × em conferência × zero pela regra; banco sem Endividamento; histórico curto), tese (vazia/editando/salva/erro simulando falha com page.route; APAGUE ao final), Planejar/Registrar abrem o wizard com o ticker (CANCELE), item NOVO na sidebar, Agenda com link, rodapé legal. Paleta: só cores permitidas (inspecione computed styles), Outfit. Console sem erros novos. Screenshots em ${QA_DIR}/qa-desk-*.png. Pare o servidor.`,
  },
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA MOBILE. ${QA_BASE}
${PREP}. Suba npm run dev -p 3302. Com Playwright 390x844 e 320x568 (isMobile, hasTouch), claro e escuro, logado como usuario.demo: item 2 do plano_qa — sem rolagem horizontal da página em nenhuma tela da área; trilho de chips sem sobrepor Ordem/Resumo|Detalhado (boundingBox); chips/pílulas >= 44px e botões principais >= 48px; sheet de ordem; cartões do Quadro; busca em tela cheia; página do ativo (KPIs 2 colunas, 1 abaixo de 340px; Essencial rolando dentro do card; gráficos a 100%); item NOVO no painel Mais e barra inferior inalterada; teclado (useKeyboardInset) não cobre a tese; voltar do sistema fecha sheets. Screenshots em ${QA_DIR}/qa-mob-*.png. APAGUE tese de teste. Pare o servidor.`,
  },
  {
    label: 'qa-dados',
    isolation: 'worktree',
    prompt: `Você é o QA DE DADOS. ${QA_BASE}
${PREP}. Suba npm run dev -p 3303. Item 3 do plano_qa: para WEGE3, PETR4, ITUB4, BBAS3, KLBN11, TGMA3, AURE3, SOJA3, HGLG11, XPLG11, KNCR11, MXRF11, HFOF11 e HCTR11 (os que existirem no dev), confira CADA número das APIs e da tela contra SQL direto nas tabelas da Fase 0 (read-only via prisma/tsx com o .env de dev): Índice, componentes, critérios, múltiplos, séries de 10 anos (só anos fechados), últ. 12m, CAGR, pares, eventos, frescor, universo do Quadro (noQuadro, ações/FIIs sem negócio em 30 pregões só na busca, FIIs sem score no Quadro), contadores das abas, ordenação com nulos no fim. "Na sua carteira": compare com a resposta de /api/carteira/acoes, /api/carteira/fii e /api/carteira/resumo do demo — peso na aba, objetivo, % da carteira e classe × alvo IDÊNTICOS. Consultor (consultor.demo agindo pelo cliente): vê a posição do cliente; tese 403. Tabela esperado × obtido em ${QA_DIR}/qa-dados.md. Pare o servidor.`,
  },
  {
    label: 'qa-codigo-seguranca-compliance',
    prompt: `Você é o REVISOR DE CÓDIGO, SEGURANÇA, COMPLIANCE E PERFORMANCE (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: gate em TODA rota de página e de API (flag off → 404; fora do beta → API 404 e tela de beta; sem cookie → 401) e no menu/Agenda; tese: IDOR (ticker de outro usuário), zod, CSRF, limite 10.000, consultor 403, nada de tese em log; requireAuthWithActing correto; nenhuma chamada externa nas rotas /api/analise-ativos/*; cache em memória sem vazar dado de usuário entre usuários (parte pessoal sem cache); queries com índice e sem N+1 (meta API < 300 ms); job quadro dentro de 300 MB RSS / 4 min e idempotente; migration aditiva + script apply idempotente; textos só de textosTela e sem palavras proibidas (varredura no DOM das duas páginas); "Registrar operação", nunca "Comprar"; números calculados num só lugar (séries/CAGR); nada sem fonte (IBOV, Ibovespa, JCP estimado); Comparar/Ranking/Stocks/REITs escondidos; dark mode e paleta (grep por hex fora da paleta nos arquivos novos); acessibilidade (aria-sort, combobox, role=img com aria-label, figcaption). Cada achado com arquivo:linha e cenário concreto.`,
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
    `Você é o CORRETOR da Análise de Ativos Fase 1. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(analise-ativos): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da Análise de Ativos Fase 1. ${REGRAS}
${PREP}. Suba npm run dev -p 3321. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1440px quando aplicável). Rode também os e2e da branch (chromium, mobile, escrita) contra um build de produção (npm run build && ANALISE_ATIVOS_HABILITADA=true npx next start -p 3322). Apague teses de teste. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`,
      { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' },
    );
  }
}

return {
  fatia0a: f0,
  devs: devOk,
  integracao: integ,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados, evidencias: qas[i]?.evidencias })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
};
