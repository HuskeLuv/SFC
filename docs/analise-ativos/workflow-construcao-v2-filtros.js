export const meta = {
  name: 'analise-ativos-v2-filtros-construcao',
  description:
    'Análise de Ativos v2.4 (Índice MF → Filtros de Fundamentos): contratos 0 → 5 devs em worktrees (A motor+job, B Quadro, C1 cabeçalho+modais, C2 página, D Comparador) → integração → F limpeza/varredura → QA desktop/mobile/dados/código+compliance → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0 (contratos) na branch feat/analise-ativos-v2-filtros' },
    { title: 'Implementação', detail: 'fatias A, B, C1, C2, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick na ordem 0, A | B, C1, C2, D; checks' },
    { title: 'Limpeza', detail: 'fatia F: código morto do Índice/semáforo/★, varredura global, build, e2e' },
    { title: 'QA', detail: 'desktop, mobile, dados, código+segurança+compliance' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/analise-ativos-v2-filtros';
const BASE = args.base;
const QA_DIR = args.qaDir;
const DOCS = `${REPO}/docs/analise-ativos/v2-filtros`;
const PEDRO = `${REPO}/docs/analise-ativos/spec-v2-pedro-out2026`;
const SPEC = `${DOCS}/spec-desenho.json`;
const DEC = `${DOCS}/decisoes.md`;
const PROTO = `${DOCS}/prototipo.html`;
const FLAGS =
  'ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true ANALISE_ATIVOS_RAIOX_HABILITADO=true ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_CENARIOS_HABILITADO=true';

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15 App Router, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 13/10/2026. Mutações usam csrfFetch; depois de mutação de carteira, invalidatePortfolioDerivedQueries.
- FEATURE: Análise de Ativos v2.4 (spec do Pedro, ${PEDRO}/especificacao-v2.txt; HTML de referência ${PEDRO}/prototipo-pedro-v2.html). Por compliance (CVM/Bacen/ANBIMA) SAEM da superfície o Índice MF (nota 0–10), o semáforo e a ★/"destaque"/"vencedor" do Comparador; ENTRAM os Filtros de Fundamentos: 6 critérios binários por perfil (acao, acao_financeira, fii_tijolo, fii_papel; tipos up/pos/max/months), janela 3|5|10 anos (padrão 5), contagem factual "n de 6" (financeiras "n de 3"), ordem A–Z, marcas ✓/— NEUTRAS (nunca verde/vermelho), dado ausente = "não atende · sem dado nas demonstrações". Fase 0/1/Bloco C/Bloco D já estão na main (src/services/analiseAtivos/**, src/components/analiseAtivos/**, /analise-ativos). Branch de integração ${BRANCH} (main ${BASE} + 1 commit de docs).
- ESPECIFICAÇÃO TÉCNICA FINAL: ${SPEC} — chave "arquitetura" (resumo, mapa_mudancas, criterios, fatias[] com arquivos_novos/alterados/removidos e critérios de aceite, apis, schema_prisma, casos_teste = 33 casos da §4.5, plano_remocao_score, plano_producao, plano_qa, riscos), "design" (telas, especificacao_visual, acessibilidade, desvios_do_prototipo_pedro) e "revisao" (problemas já incorporados). PROTÓTIPO FINAL (leiaute, textos, números, estados): ${PROTO}.
- DECISÕES APROVADAS PELO WELLINGTON: ${DEC} (D1–D6 + as 9 recomendações do desenho, todas APROVADAS em 13/10) — PREVALECEM sobre a spec do Pedro e o HTML dele. Resumo: D1 estrutura/textos/ordem = HTML do Pedro, cores = paleta My Finance; D2 fundamentos da CVM/COTAHIST, "Lucro líq. ⓘ"/"Margem líq. ⓘ" com aviso (não existe "descontado"); D3 FII vacância/inadimplência/LTV = "sem dado" para todos, chip desabilitado, alavancagem = "Obrigações/PL ≤ 20%"; D4 financeiras n de 3 (EBITDA, Dív.líq/EBITDA e FCL "não se aplica"); D5 FORA: Ranking/votos/teses públicas, Stocks/REITs, Salvos/Criar lista/Salvar (escondidos, sem "em breve"); D6 o BANCO do score (AssetScore, colunas indice*/semáforo, ScoringParams) NÃO é apagado nesta rodada — só sai da superfície (API/tela/textos). Recomendações: (1) Planejar = Objetivo que já existe (Portfolio/Watchlist.objetivo, % DENTRO da aba; tela "alvo 25% de Ações · posição 20,4% · desvio −4,6 p.p.", % da carteira só informativo; sem tabela nova); (2) Registrar operação = modal rápido sobre POST /api/carteira/operacao (compra) e /api/carteira/resgate (venda), Venda só com posição, seção da Carteira obrigatória na 1ª compra, instituição da venda = a da última compra, link p/ formulário completo; (3) FoF/sem tipo: imóveis ≥ 50% do PL → tijolo, senão papel; (4) âncora de meses jan/(fim−J+1)–dez/fim, base de proventos que começa depois da janela → sem dado; (5) janela 10 em FII mantida com nota; (6) rodapé legal único PROVISÓRIO (TEXTOS_LITERAIS_OBRIGATORIOS); (7) Comparar não grava (há Copiar link), Quadro em cartões no celular, "Área (CVM)"; (8) Quadro filtrado/ordenado no servidor; (9) consultor agindo pode Ver, Planejar e Registrar, com aviso.
- SEM FLAG NOVA: a troca da UI é atômica (R2), sem UI dupla. As flags existentes da área continuam valendo (HABILITADA/ACESSO/RAIOX/COMPARADOR/CENARIOS). Nenhuma resposta de /api/analise-ativos/* pode conter chave ou texto de índice/nota/semáforo/destaque/★ (teste contratoSemNota).
- Nenhuma rota /api/analise-ativos/* chama provedor externo no caminho da requisição. Textos da tela saem dos arquivos de textos e passam pela varredura de linguagem (linguagemV2: nunca "barato/caro/preço justo/preço-alvo/recomend*/nota/notas/vencedor/melhor/pior/compre/venda" fora dos literais registrados em textosLiterais.ts).
- MIGRATION: aditiva (CREATE TABLE/INDEX IF NOT EXISTS; ADD COLUMN IF NOT EXISTS; FK em DO $$ … EXCEPTION). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev/deploy" no dev. Padrão: SQL em prisma/migrations/20261015000000_analise_ativos_filtros/migration.sql + scripts/analise-ativos/apply-migration-filtros.ts (molde: apply-migration-bloco-d.ts ou bloco-c), rodado UMA vez no dev; depois npx prisma generate; seed-criteria-params no dev.
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas do app + vermelho #D92D20/#F97066 (só para erro, NUNCA para marcar critério). #0079F2 só em elemento não textual. Texto/link #396CAA claro / #6E9DC4 escuro. Dark mode obrigatório. TABLE_STYLES nas tabelas; coluna fixa com fundo opaco. BottomSheet + useMobileHistoryLayer no celular. TODO controle com no mínimo 44px (min-h-11), inclusive no computador.
- Commits: atômicos, em português ("feat(analise-ativos): ...", "fix(analise-ativos): ...", "test(analise-ativos): ...", "refactor(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ fora de docs/analise-ativos/v2-filtros/ e docs/analise-ativos/spec-v2-pedro-out2026/, ou em arquivos não rastreados pré-existentes. NUNCA tocar em produção (Lightsail/ssh/banco de prod).
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Testes que importam o prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Padrão de teste de rota: mock de Prisma via vi.hoisted, mock de requireAuthWithActing — ver src/test/mocks.
- Dev: rode o servidor com ${FLAGS} no ambiente do processo; o usuário demo já está no beta no banco dev. Depois de prisma generate, REINICIE o dev server (senão "Unknown argument"). Admin de dev: admin.demo@finapp.local / 123456. Consultor: consultor.demo@finapp.local / 123456. Demo: usuario.demo@finapp.local / 123456.
- e2e: CI = banco do seed + build de produção (CI=true). Testes novos têm de passar lá (o seed precisa trazer criteria_params e criteria_eval/criterios no Quadro para as fixtures — ajuste o seed da análise se preciso); screenshots só locais (test.skip(!!process.env.CI)). O que grava (objetivo, operação na Carteira, cenário) vai em *.escrita.spec.ts (projeto 'escrita') e DESFAZ o que gravou. Snapshots de e2e/desktop-*.spec.ts-snapshots: nenhum dev atualiza; só a fatia F, uma vez, em commit dedicado, se a mudança for esperada.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch() padrão (se falhar, executablePath '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'); para npx playwright test use PLAYWRIGHT_PORT. Receita de login na skill "verify" (permitida SÓ para essa receita). Use waitUntil:'load' + espera fixa. Em dev, o React Query Devtools cobre botões no canto: esconda .tsqd-parent-container via addStyleTag.
- Banco de dev (Neon) é compartilhado. Objetivos, operações, cenários e ativos planejados criados em teste manual devem ser DESFEITOS/APAGADOS ao final (anote o que criou).
`;

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) rode "git checkout --detach ${BRANCH}" (o worktree pode ter nascido da main) e confira com "git log --oneline -5" que os commits da fatia 0 estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts .; o prisma client compartilhado já foi gerado pela fatia 0 — só rode npx prisma generate se faltar algo. (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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
  `Você é o DEV da FATIA 0 ("Contratos", bloqueante e aditiva) da Análise de Ativos v2.4 (Filtros de Fundamentos). ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" de arquitetura.fatias em ${SPEC}: schema aditivo (CriteriaParams, CriteriaEval, AnaliseQuadroLinha.criterios Json? e perfilCriterios String?) + migration versionada + apply idempotente (rode no dev) + prisma generate; criteriaParamsSchema (zod strict) + criteriaParamsV1 (limites do protótipo) + obterCriteriaParams + seed-criteria-params (rode no dev); tipos src/types/analiseAtivosCriterios.ts; textosCriterios e textosLiterais (TEXTOS_LITERAIS_OBRIGATORIOS, rodapé legal provisório — rec. 6); linguagemV2 + teste; src/test/utils/varrerDom.ts; leitura lerCriterios (stub com assinatura final); componentes neutros CelulaCriterios, MarcaCriterio, PilulasJanela, MiniBarrasAnuais (sem verde/vermelho, 44px); fixtures; e os STUBS com props/assinaturas FINAIS para o que A, B, C1, C2 e D preenchem (cada stub no caminho da fatia dona), divisão dos arquivos compartilhados por dono conforme a spec. Contratos documentados em docblock para que as fatias trabalhem sem arquivo em comum. ANTES de terminar, rode um script que cruze arquivos_novos/alterados/removidos das fatias A, B, C1, C2, D e F da spec e reporte qualquer interseção em pendencias (e resolva-a no contrato se puder). Nesta fatia a tela NÃO muda. Testes vitest da fatia. Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Fundação', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'aa-v2-a-motor-criterios',
    label: 'dev-A-motor-job',
    porta: 0,
    extra:
      "Motor de critérios PURO em regras/criterios (port do CRITERIA/evalCriteria/critCount do screen.js do HTML do Pedro, com as 3 correções da spec: janela 10 'up' usa 11 valores; só os anos da janela são exigidos; 'months' trata dado ausente), perfilCriterios (financeiras via ehFinanceira → n de 3; FoF/sem tipo pela regra ≥ 50% imóveis → tijolo), séries de ação e FII a partir do banco (CVM/COTAHIST; FII com base de cotas ajustada a desdobramento), âncora de meses (rec. 4), executarCriterios + repositorio/criterios (grava criteria_eval por symbol×janela com paramsVersion, e a cópia compacta em AnaliseQuadroLinha.criterios/perfilCriterios no job 'quadro'), job 'criterios' no catálogo de jobs (nomesJobs/catalogoJobs, rota /api/cron/analise-ativos/criterios com o mesmo gate das outras rotas de cron; se o job 'scores' ainda estiver rodando termina 'pulado' com alerta), relatorio-criterios.ts (fonte única dos números para o Pedro: % que atende cada critério por perfil e janela) e exportar-fixtures-criterios.ts. TESTES: os 33 casos da §4.5 (arquitetura.casos_teste) em casos45.test.ts — os que dependem de UI/Carteira (ex.: caso 30 Quadro, caso 33 alvo) ficam com as fatias donas, documente quais; fixtures REAIS do dev (dev-2026-10-13.json). Rode o job no dev (aplicando) e o relatório; confira contra a cobertura medida no desenho (ações não financeiras 95–98% / 75–79%; FIIs 37–72% / ~0%; limites v1 janela 5: Receita 110, Lucro 29, EBITDA 52, Margem 208, Dív/EBITDA 168, FCL 2 de 330) com tolerância ±2 p.p.; RSS < 300 MB e < 4 min. Salve a saída do relatório em ${QA_DIR}/relatorio-criterios-dev.txt.",
  },
  {
    id: 'B',
    nome: 'aa-v2-b-quadro',
    label: 'dev-B-quadro-busca',
    porta: 3402,
    extra:
      'Quadro + busca + casca: BarraFiltrosCriterios (chips por critério combinados com E, pílulas de janela 3|5|10, contador "n ativos atendem", chip FII Vacância/Inadimplência desabilitado com motivo — D3), coluna Critérios (CelulaCriterios "n de 6"/"n de 3"), ordenação padrão A–Z, colunas novas da spec, RodapeCriterios com o literal registrado; filtro/ordenação NO SERVIDOR (rec. 8) em consultaQuadro + rota /quadro (zod: janela, criterios[]), estado na URL (useEstadoQuadroUrl); busca e casca sem Índice; cartões no celular (rec. 7); estado vazio "nenhum ativo atende" com ação para limpar; caso 30. Nenhuma referência a índice/nota/semáforo no Quadro, na busca ou na API delas.',
  },
  {
    id: 'C1',
    nome: 'aa-v2-c1-cabecalho-carteira',
    label: 'dev-C1-cabecalho-modais',
    porta: 3403,
    extra:
      'Cabeçalho do ativo: BarraAcoesAtivo (Comparar · Planejar na carteira · Ver na Carteira · Registrar operação, chips de estado "na carteira"/"planejado"), sem Índice/semáforo; ModalComparar (sugestões do mesmo segmento via GET /api/analise-ativos/ativos/[ticker]/comparar-sugestoes), ModalPlanejar sobre o Objetivo que JÁ existe (Portfolio/Watchlist.objetivo em % da aba; rotas /api/carteira/planejados e /api/carteira/<aba>/objetivo; tela "alvo X% de Ações · posição Y% · desvio ±Z p.p.", % da carteira só informativo; salvar, remover; caso 33 na base da aba — rec. 1), ModalVerNaCarteira (GET /api/ativos/[id]), ModalRegistrarOperacao (rec. 2: Compra via POST /api/carteira/operacao, Venda via POST /api/carteira/resgate só com posição; seção da Carteira obrigatória na 1ª compra (estratégia de ação / tipo de FII), recompra NÃO pede seção, compra de PLANEJADO preserva a seção do plano (confira Portfolio.tipoFii depois), instituição da venda = a da última compra (sem 400), link "abrir formulário completo"; invalidatePortfolioDerivedQueries após sucesso); card "Na sua carteira" em linguagem de desvio; consultor agindo: Ver, Planejar e Registrar com aviso (rec. 9). Leia as rotas reais da Carteira antes de montar os payloads. e2e acoesCarteira.escrita.spec.ts: compra nova de ação, recompra, compra de planejado FII, venda — DESFAZENDO tudo ao final (use o Desfazer do Histórico ou as rotas de exclusão; confira a aba da Carteira depois).',
  },
  {
    id: 'C2',
    nome: 'aa-v2-c2-pagina-ativo',
    label: 'dev-C2-pagina-ativo',
    porta: 3404,
    extra:
      'Página do ativo: CardCriterios + ItemCriterio (6 critérios do perfil com fato, série anual em MiniBarrasAnuais neutras, ✓/— neutros, "não se aplica" para financeiras, "sem dado nas demonstrações", nota de janela 10 em FII — rec. 5; janela 3|5|10 nas pílulas), nova ordem do Essencial conforme o HTML do Pedro (Lucro líq. ⓘ/Margem líq. ⓘ — D2; sem destaque/data-destaque), resumo do Valuation Múltiplos sem nota, cenários com premissas EM BRANCO (§4.4; caso 22), pares sem Índice, PorQueConferencia SEM a linha "No Índice MF" (usada em 16 componentes — conferencia sem efeitoIndice na superfície), API GET /api/analise-ativos/ativos/[ticker] e montarTopoAtivo sem nota/semáforo (passa a trazer criterios por janela). "Área (CVM)" no lugar de ABL (rec. 7). varreduraPagina.test com varrerDom + linguagemV2.',
  },
  {
    id: 'D',
    nome: 'aa-v2-d-comparador',
    label: 'dev-D-comparador',
    porta: 3405,
    extra:
      'Comparador isonômico: SEM ★/destaque/vencedor/Resumo numérico com placar; BlocoCriteriosComparador (critérios lado a lado, ✓/— neutros, "n de 6"/"n de 3"), grupos de indicadores sem destaque, SeletorTipoFii Tijolo|Papel, LeituraDosDados (texto literal registrado, PROVISÓRIO p/ jurídico), Copiar link sem gravar (rec. 7), API /comparador sem chaves destaque/resumo de placar (indicadores.ts e resumo.ts reescritos sem direção "melhor"), celular em cartões. Não remova destaque.ts/ResumoNumerico.tsx (isso é da fatia F) — apenas deixe de usá-los.',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} da Análise de Ativos v2.4 (Filtros de Fundamentos). ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" de arquitetura.fatias em ${SPEC}, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos, stubs, tipos e textos da fatia 0 (fonte única). Critérios de aceite da fatia obrigatórios; onde a spec do Pedro ou o HTML dele contrariarem ${DEC}, seguem as DECISÕES.
${f.extra}
${f.porta ? `Quando a fatia tiver UI, suba o dev server no seu worktree na porta ${f.porta} (com as flags do REGRAS) e confira com Playwright a 390px (isMobile) e a 1440px, claro e escuro, comparando com o protótipo final; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png. Pare o servidor ao terminar.` : ''}
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
    sha_fim_r1: { type: 'string', description: 'SHA do último commit de 0+A (fronteira R1/R2)' },
    commits_integrados: { type: 'array', items: { type: 'string' } },
    conflitos: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'sha_fim_r1', 'commits_integrados', 'conflitos', 'checks', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR da Análise de Ativos v2.4 (Filtros de Fundamentos). ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém docs + fatia 0). Traga os commits das fatias com git cherry-pick, NESTA ORDEM: A primeiro (fecha o R1 = 0+A, invisível; registre o SHA em sha_fim_r1 — depois disso NENHUM commit pode mexer no que é da fatia A sem ser reordenado) e depois B, C1, C2, D, preservando commits e mensagens:
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
Confirme que o ponto sha_fim_r1 compila sozinho (git stash se preciso; npx tsc --noEmit -p . num checkout detached desse SHA num worktree temporário) e que nele a tela é idêntica à main. Resolva conflitos preservando a intenção das fatias (stubs da 0 são substituídos pela fatia dona) e registre. Garanta o ponta a ponta: Quadro (janela, chips, contagem, A–Z) → página do ativo (card Critérios, Essencial, Valuation, cenários em branco) → cabeçalho (Comparar, Planejar, Ver, Registrar) → Comparador sem ★; nenhum stub sobrou. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy). Corrija problemas de integração com commits "fix(analise-ativos): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees. NÃO faça a limpeza da fatia F (vem depois).`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('Limpeza');
const LIMP_SCHEMA = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' } },
    removidos: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    e2e: { type: 'string' },
    snapshots_desktop: { type: 'string' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['commits', 'removidos', 'checks', 'e2e', 'snapshots_desktop', 'problemas_abertos'],
};
const limp = await agent(
  `Você é o DEV da FATIA F ("Limpeza, integração e varredura global", sequencial) da Análise de Ativos v2.4. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já tem 0, A, B, C1, C2, D integrados; problemas da integração: ${JSON.stringify(integ.problemas_abertos)}). Implemente EXATAMENTE a fatia id "F" de ${SPEC}: remova da SUPERFÍCIE o código morto do Índice, semáforo e ★ (arquivos_removidos da fatia; tipos IndiceLinha etc.; ~30 chaves do textosTela; analiseAtivosVisual; curadoria/marcasCaso sem Índice; MenuBlocoAtivo), ligue linguagemV2Global.test e contratoSemNota.test (nenhuma resposta de /api/analise-ativos/* com /indice|semaforo|destaque|nota/ — por substring nos JSONs de todas as rotas da área), escreva docs/analise-ativos/spec-v2-pedro-out2026/ATIVACAO.md (runbook R1 → R2 → D6 conforme arquitetura.plano_producao: migration via deploy, seed-criteria-params dry-run/--apply, job criterios sem aplicar/aplicando com RSS e tempo, cron 30 10 * * * entre scores e quadro, SQL de conferência só leitura, R2 deploy + QA como admin, [OK] a cada passo, rollback) e docs/analise-ativos/spec-v2-pedro-out2026/decisoes.md (aponta para ${DEC}). NÃO apague nada do BANCO nem os jobs scores/quadro (D6 é etapa separada): o job scores continua gravando AssetScore/AssetMultiplesCurrent e a sanidade do Bloco C. Garanta que o seed do CI (banco do seed + prisma/seed da análise) traz criteria_params e criterios no Quadro para os e2e.
Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, variáveis dummy), rm -rf .next && npm run build e, com as flags ligadas, npx next start -p 3410 e TODOS os e2e (chromium, mobile, escrita, nessa ordem). Os e2e têm de passar também no CI (confira .github/workflows: flags da área no job de e2e). SNAPSHOTS DE DESKTOP: a UI da área muda por desenho; se baselines de desktop-*.spec.ts-snapshots da área mudarem por motivo esperado, atualize UMA vez em COMMIT DEDICADO e salve pares antes/depois em ${QA_DIR}/desktop-diff-*.png; mudança fora da Análise de Ativos é bug. Pare o servidor ao terminar. Commits atômicos.`,
  { label: 'dev-F-limpeza', phase: 'Limpeza', schema: LIMP_SCHEMA },
);

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Plano de QA do arquiteto: chave arquitetura.plano_qa de ${SPEC}. Relatórios: integração ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks })}; limpeza ${JSON.stringify(limp ? { problemas_abertos: limp.problemas_abertos, checks: limp.checks, e2e: limp.e2e } : 'FALHOU')}.
Salve evidências em ${QA_DIR}/. Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login. Desfaça/apague no banco de dev todo objetivo, operação, planejado ou cenário que criar.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts . Suba o servidor sempre com ${FLAGS} no ambiente.`;

const QAS = [
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DESKTOP. ${QA_BASE}
${PREP}. Suba npm run dev -p 3501 (ou build de produção se o dev travar). A 1440x900 e 1080x800, claro e escuro, contra o protótipo (${PROTO}) e as decisões (${DEC}): Quadro (janelas 3/5/10, chips combinados com E, contagem, A–Z, vazio, URL), página de WEGE3, PETR4, ITUB4 e BBAS3 (n de 3, "não se aplica"), HGLG11, KNCR11, MXRF11 (FII "sem dado" em vacância/inadimplência/LTV, janela 10 com nota), Essencial na ordem nova, Valuation sem nota, cenários com premissas em branco; cabeçalho: Comparar, Planejar (base da aba; salvar, chip, remover), Ver na Carteira, Registrar (compra nova de ação com seção obrigatória, recompra sem seção, compra de planejado FII, venda sem 400 de instituição) — confira a aba da Carteira depois e DESFAÇA tudo; Comparador misto sem ★; consultor agindo (consultor.demo) com aviso; PorQueConferencia sem "No Índice MF". Nenhum texto de nota/índice/semáforo/destaque na tela (varra o DOM). Paleta (computed styles, ✓/— sem verde/vermelho), alvos >= 44px (boundingBox), teclado e foco nos modais, console sem erros novos. Regressão: Raio-X + CSV, reportar dado, Carteira, Planejamento. Screenshots em ${QA_DIR}/qa-desk-*.png. Pare o servidor.`,
  },
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA MOBILE. ${QA_BASE}
${PREP}. Suba npm run dev -p 3502. Playwright 390x844 e 320x568 (isMobile, hasTouch), claro e escuro: sem rolagem horizontal da PÁGINA em nenhuma tela; Quadro em cartões com a contagem de critérios, barra de filtros/chips roláveis, pílulas de janela; card Critérios na página; modais (Comparar, Planejar, Ver, Registrar) como BottomSheet com campos 48px fonte 16px, botão voltar do sistema fecha (history); Comparador em cartões sem ★; toques >= 44px (boundingBox) em chips, pílulas, links de ticker, CelulaCriterios e botões dos modais. Screenshots em ${QA_DIR}/qa-mob-*.png. Desfaça o que criou. Pare o servidor.`,
  },
  {
    label: 'qa-dados',
    isolation: 'worktree',
    prompt: `Você é o QA DE DADOS. ${QA_BASE}
${PREP}. Read-only via prisma/tsx com o .env de dev. (1) Recalcule À MÃO, a partir das séries no banco (SQL direto), os 6 critérios nas janelas 3, 5 e 10 de WEGE3, PETR4, ITUB4, BBAS3, BBSE3, ITSA4 (financeiras n de 3), TAEE11, AZUL3, HGLG11 (split), XPLG11, KNCR11, MXRF11 (FoF/papel) e compare com criteria_eval, com AnaliseQuadroLinha.criterios e com o que API e tela mostram (suba npm run dev -p 3503); (2) relatorio-criterios contra os números do desenho (±2 p.p.); (3) os 33 casos da §4.5 (arquitetura.casos_teste) — quais têm teste e passam; (4) janela: âncora de meses, 'up' com 11 valores na janela 10, base de proventos curta = sem dado; (5) desvio do alvo na base da aba (caso 33) com uma carteira real do demo; (6) nenhuma resposta JSON de /api/analise-ativos/* contém indice/semaforo/destaque/nota. Tabela esperado × obtido em ${QA_DIR}/qa-dados.md. Pare o servidor.`,
  },
  {
    label: 'qa-codigo-seguranca-compliance',
    prompt: `Você é o REVISOR DE CÓDIGO, SEGURANÇA, LGPD, COMPLIANCE E PERFORMANCE (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: motor de critérios (fidelidade ao screen.js + 3 correções; dado ausente; financeiras; FoF); job criterios (idempotência, paramsVersion, não sobrepor scores, memória); migration aditiva e segura em prod (sem lock longo, IF NOT EXISTS); gate em toda rota nova/alterada (flag da área, beta, recurso → 404; sem cookie → 401; 400 para entrada inválida; zod strict); Registrar operação (payloads corretos para /operacao e /resgate, CSRF, isolamento por usuário, consultor com requireAuthWithActing e aviso, venda só com posição, sem dupla submissão, invalidatePortfolioDerivedQueries); Planejar (objetivo na base da aba, sem quebrar o somatório da aba); comparar-sugestoes (rate limit, sem N+1); contrato sem nota em TODAS as rotas da área (inclusive comparador, ativo, quadro, busca, curadoria); textos só dos arquivos de textos com varredura linguagemV2 e literais registrados; rodapé literal; ✓/— sem cor semântica; o que a fatia F removeu não deixou import morto nem quebrou curadoria/reporte/Raio-X; o banco do score ficou intacto (D6) e o job scores segue gravando AssetMultiplesCurrent; R1 (sha ${integ.sha_fim_r1}) é realmente invisível; paleta (grep hex fora da paleta) e acessibilidade (role=region+tabIndex na tabela larga, th scope, aria-pressed nos chips, aria-live no contador com debounce, modais com role=dialog/aria-modal e foco devolvido). Cada achado com arquivo:linha e cenário concreto.`,
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
      sha_fim_r1: { type: 'string', description: 'fronteira R1/R2 depois das correções (mude só se reordenar)' },
      checks: { type: 'string' },
    },
    required: ['corrigidos', 'rejeitados', 'sha_fim_r1', 'checks'],
  };
  correcao = await agent(
    `Você é o CORRETOR da Análise de Ativos v2.4. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Fronteira R1/R2 atual: ${integ.sha_fim_r1} (0+A antes dela). Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(analise-ativos): ...". Correção em arquivo da fatia A (motor/job/migration) entra no fim da branch mesmo; informe em sha_fim_r1 o SHA atual se não reordenar, e liste no 'como' quais correções tocam o R1. Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da Análise de Ativos v2.4. ${REGRAS}
${PREP}. Suba npm run dev -p 3521. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1440px quando aplicável). Rode também os e2e da branch (chromium, mobile, escrita) contra um build de produção (npm run build && flags ligadas npx next start -p 3522). Desfaça o que criar no banco de dev. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
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
  limpeza: limp,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados, evidencias: qas[i]?.evidencias })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
};
