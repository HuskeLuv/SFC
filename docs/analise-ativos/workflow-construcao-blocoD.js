export const meta = {
  name: 'analise-ativos-blocoD-construcao',
  description:
    'Análise de Ativos bloco D (Raio-X, Meus cenários, Comparador): contratos 0 → 4 devs em worktrees (A Raio-X, B cenários, C comparador, D entradas) → integração → QA desktop/mobile/dados/código+segurança+compliance → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0 (contratos) na branch feat/analise-ativos-blocoD' },
    { title: 'Implementação', detail: 'fatias A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, e2e' },
    { title: 'QA', detail: 'desktop, mobile, dados, código+segurança+compliance' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/analise-ativos-blocoD';
const BASE = args.base;
const QA_DIR = args.qaDir;
const DOCS = `${REPO}/docs/analise-ativos/blocoD`;
const SPEC = `${DOCS}/spec-desenho.json`;
const DESIGN = `${DOCS}/design-e-revisao.json`;
const DEC = `${DOCS}/decisoes.md`;
const PROTO = `${DOCS}/prototipo.html`;
const FLAGS = 'ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true ANALISE_ATIVOS_RAIOX_HABILITADO=true ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_CENARIOS_HABILITADO=true';

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15 App Router, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 08/10/2026. Mutações usam csrfFetch.
- FEATURE: Análise de Ativos — BLOCO D (Fase 2), só Ações e FIIs: (A) Fundamentos · Raio-X + Exportar CSV, (B) Valuation · Meus cenários, (C) Comparador, (D) entradas do Comparador (pílulas, modo Comparar do Quadro, botão no cabeçalho do ativo). Fase 0, Fase 1 e Bloco C já estão na main (src/services/analiseAtivos/**, src/components/analiseAtivos/**, /analise-ativos). As fórmulas dos cenários JÁ existem (src/services/analiseAtivos/regras/valuation/metodos.ts, metaRenda.ts, cenario.ts) — não reescreva fórmula. Branch de integração ${BRANCH} (main ${BASE} + 1 commit de docs).
- Especificação técnica final: ${SPEC} (fatias[] com arquivos de cada fatia, apis[], schema_prisma, cobertura_raio_x[] medida no DEV, metodos_cenarios, regras_comparador, plano_producao, plano_qa, riscos). Design final e revisão: ${DESIGN}. Protótipo (leiaute, textos e números; cenários F1–F9, V1–V13, C1–C9, E1–E2): ${PROTO}.
- DECISÕES APROVADAS PELO WELLINGTON: ${DEC} — PREVALECEM sobre spec e protótipo. Onde a SPEC diverge e as decisões mandam (atenção, a spec diz o contrário):
  * Decisão 3 — TAXA DE ADMINISTRAÇÃO DO FII **APARECE** no Raio-X (bloco Alavancagem e custos) como "Taxa de adm. (% do PL no ano)" = soma dos 12 meses de taxaAdmPct (com menos de 12 meses, "—"); ano com soma fora da escala (ex.: XPLG11 2020 = 10,8%; use limiar documentado, ex.: > 3%) fica "em conferência" (hachura + chip, política ocultar). O card Múltiplos (Fase 1) passa a rotular a taxa como "no mês". A spec dizia que a taxa saía do Raio-X e o critério de aceite da fatia A dizia "nenhuma taxa de adm. aparece" — IGNORE esses dois pontos. (A "regra 21" do schema vale para dyMesCvmPct/rentEfetivaMesPct, não para a taxa.)
  * Decisão 4 — inadimplência e prazo médio dos contratos NÃO aparecem (nem vencimentos/indexadores).
  * Decisão 5 — rendimento distribuído e payout do resultado do FII APARECEM (regra 2º tri + 4º tri).
  * Decisão 1 — regra per-share (salto_acoes_sem_evento/dados_incompletos + critério "nº de ações < 1/10 da mediana dos anos") vale no Raio-X E no Essencial (que está em produção).
  * Decisão 13 — vale o PROTÓTIPO FINAL, não a v2 da arquitetura: CSV nome raio-x_<TICKER>_<AAAA-MM-DD>.csv, ';' + vírgula decimal + BOM + CRLF, anti-injeção; nível Essencial/Raio-X na URL (?fund=raiox), NÃO localStorage; a bandeja do Quadro e o botão do cabeçalho abrem o Comparador a partir de 1 ativo (com 1 ativo: "adicione mais um para ver destaques"); "Restaurar valores do ativo" SEM confirmação, com toast "Desfazer" por 5 s; no celular os métodos dos cenários viram CARTÕES (não tabela com rolagem); TODO controle com no mínimo 44px, inclusive no computador.
  * Decisões 9–12: Resumo numérico sem placar (Índice na ordem dos slots, * no incompleto, critérios atendidos, frase "não indica qual ativo escolher"); dados de imóveis da CVM com "fonte CVM" e SEM ★; payout neutro (sem ★); máximo 4 ativos; tijolo+papel permitido com aviso e n/a (P/VP sem ★ quando mistura); ação+FII recusado; sem "Salvar comparação"/PDF.
  * Decisões 6–8, 14: dado em conferência nos cenários = política "selo"; consultor agindo: GET 200 com salvo=null e podeSalvar=false, PUT/DELETE 403 (calcula com a posição do cliente); Meta de renda → POST /api/planejamento-sonhos com target = cotas × cotação, available = posição × cotação, botão some quando faltam 0, aviso de que vira linha no Fluxo de Caixa; rodapé dos cenários = texto literal TEXTOS_ANALISE.rodapeValuation.
  * Decisão 15: 3 flags separadas, desligadas por padrão: ANALISE_ATIVOS_RAIOX_HABILITADO, ANALISE_ATIVOS_COMPARADOR_HABILITADO, ANALISE_ATIVOS_CENARIOS_HABILITADO. Com as 3 desligadas a tela de hoje fica IDÊNTICA (regressão obrigatória) — EXCETO a decisão 1 no Essencial, que vale sempre.
  * decisoes.md JÁ EXISTE e não deve ser reescrito. Runbook de produção em ${DOCS}/ATIVACAO.md (molde: docs/analise-ativos/blocoC/ATIVACAO.md).
- Nenhuma rota /api/analise-ativos/* chama provedor externo no caminho da requisição. Textos da tela saem dos arquivos de textos e passam pela varredura de palavras proibidas (regras/comum/linguagem.ts; nunca "barato/caro/preço justo/preço-alvo/recomend*", nem "nota/notas"). "vs. cotação" e barras sem cor semântica. ★ sempre com texto "destaque".
- MIGRATION: aditiva (só CREATE TABLE/INDEX IF NOT EXISTS; FK em DO $$ … EXCEPTION). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev/deploy" no dev. Padrão: SQL em prisma/migrations/20261014000000_analise_ativos_bloco_d/migration.sql + scripts/analise-ativos/apply-migration-bloco-d.ts (molde: apply-migration-bloco-c.ts), rodado UMA vez no dev; depois npx prisma generate.
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas do app + vermelho #D92D20/#F97066. #0079F2 só em elemento não textual. Texto/link #396CAA claro / #6E9DC4 escuro. Dark mode obrigatório. TABLE_STYLES nas tabelas; coluna fixa com fundo opaco. BottomSheet + useMobileHistoryLayer no celular.
- Commits: atômicos, em português ("feat(analise-ativos): ...", "fix(analise-ativos): ...", "test(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ fora de docs/analise-ativos/blocoD/ ou em arquivos não rastreados pré-existentes. NUNCA tocar em produção (Lightsail/ssh/banco de prod).
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Testes que importam o prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Padrão de teste de rota: mock de Prisma via vi.hoisted, mock de requireAuthWithActing — ver src/test/mocks.
- Dev: rode o servidor com ${FLAGS} no ambiente do processo; o usuário demo já está no beta no banco dev. Depois de prisma generate, REINICIE o dev server (senão "Unknown argument"). Admin de dev: admin.demo@finapp.local / 123456 (prisma/seedAdminDev.ts). Consultor: consultor.demo@finapp.local / 123456.
- e2e: CI = banco do seed + build de produção (CI=true). Testes novos têm de passar lá (o seed traz as fixtures necessárias; no CI as 3 flags ficam ligadas); screenshots só locais (test.skip(!!process.env.CI)). O que grava (cenário salvo, objetivo) vai em *.escrita.spec.ts (projeto 'escrita') e DESFAZ o que gravou. Snapshots de e2e/desktop-*.spec.ts-snapshots: nenhum dev atualiza; só o INTEGRADOR, uma vez, em commit dedicado, se a mudança for esperada.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch() padrão (se falhar, executablePath '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'); para npx playwright test use PLAYWRIGHT_PORT. Receita de login na skill "verify" (permitida SÓ para essa receita). Use waitUntil:'load' + espera fixa. Em dev, o React Query Devtools cobre botões no canto: esconda .tsqd-parent-container via addStyleTag.
- Banco de dev (Neon) é compartilhado. Cenários salvos/objetivos criados em teste manual devem ser APAGADOS ao final.
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
  `Você é o DEV da FATIA 0 ("Contratos") do bloco D da Análise de Ativos. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec, ajustada pelas decisões (decisoes.md já existe — não reescreva): schema aditivo (AnaliseCenario + relação em User) + migration versionada + apply idempotente (rode no dev) + prisma generate; as 3 flags em analiseAtivosConfig + exigirRecursoAnalise + ConfigResposta.recursos no /config; boundedTtlCache (LRU com maxKeys) + teste; tier de rate limit para raio-x e comparador (30/min por IP); tipos de API do bloco D; hooks esqueleto; textos (textosRaioX, textosCenarios, textosComparador, textosEntradasComparador) com teste de varredura (inclui 'nota/notas'); SeletorNivel; queryKeys; STUBS com as props/assinaturas FINAIS para o que A, B, C e D preenchem (cada stub no caminho da fatia dona). Garanta no contrato os pontos da decisão 13 (nível na URL ?fund=raiox; CSV com nome raio-x_<TICKER>_<data>.csv) e a linha da taxa de adm. (decisão 3) no tipo do Raio-X FII. Contratos documentados em docblock para que A/B/C/D trabalhem sem arquivo em comum. Com as 3 flags desligadas, nada muda na tela. Testes vitest da fatia. Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Fundação', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'aa-blocoD-a-raiox',
    label: 'dev-A-raiox-csv',
    porta: 3401,
    extra:
      'Raio-X + CSV + conferência anual compartilhada: extraia conferirLinha para conferenciaAnual.ts (paridade com o Essencial atual, teste), regra per-share da decisão 1 (salto/dados_incompletos + critério 1/10 da mediana) aplicada no Raio-X E no Essencial; leitor puro do Raio-X por classe (ações: 3 blocos; bancos com n/a e linhas ocultas em "Sobre os dados"; FIIs: 4 blocos tijolo / carteira de recebíveis no papel) usando cobertura_raio_x da spec; FII por cota na base de hoje (fatorCotasApos), resultado/cota pela média mensal de cotas, rendimento distribuído = 2T+4T, payout do resultado; TAXA DE ADM. no ano (decisão 3) com conferência para soma fora da escala e o card Múltiplos rotulado "no mês"; sem inadimplência/prazo (decisão 4); "fcf" = Caixa de financiamento (nunca "FCF"); rota GET /api/analise-ativos/ativos/[ticker]/raio-x (+ ?formato=csv gerado no servidor com Content-Disposition, nome raio-x_<TICKER>_<AAAA-MM-DD>.csv, ;, vírgula decimal, BOM, CRLF, anti-injeção = + - @, rodapé legal; sem PII) com cache boundedTtlCache e rate limit; BlocoFundamentos com SeletorNivel Essencial|Raio-X (nível em ?fund=raiox), chips de bloco (celular abre no 1º bloco), tabela com coluna fixa opaca, linhas de razão itálico/fundo, negativos em vermelho, estados carregando/erro/vazio, chip em conferência do Bloco C. Testes com fixtures REAIS do DEV (WEGE3, ITUB4, TAEE11, CBAV3, HGLG11 2017 = 112,73, KNCR11, XPLG11) e consistência célula a célula Essencial × Raio-X; CSV byte a byte.',
  },
  {
    id: 'B',
    nome: 'aa-blocoD-b-cenarios',
    label: 'dev-B-meus-cenarios',
    porta: 3402,
    extra:
      'Meus cenários: montarCenarios.ts puro (só chama metodos.ts e metaRenda.ts; conta com o valor visível arredondado: R$ 2 casas, rendimento/cota de FII 3 casas), baseCenarios.ts (cache), rotas GET/PUT/DELETE /api/analise-ativos/cenarios/[ticker] (zod strict, CSRF, isolamento por usuário, limite de 300 cenários por usuário → 409, consultor agindo: GET 200 com salvo=null/podeSalvar=false, PUT/DELETE 403); BlocoValuation com seletor Múltiplos | Meus cenários; calculadora (campos com origem "do ativo", editado + "voltar ao valor do ativo", validação com limites e "—" com motivo, slider Margem 0–50% passo 5 acessível, tabela Método·Suas premissas·Resultado·vs. cotação·Com sua margem sem cor, barras lado a lado com linha tracejada da cotação, "Sua posição" (P/L ou P/VP e yield sobre custo), salvar/estados/erro, dado do ativo mudou desde o salvamento); política "selo" para dado em conferência; Restaurar SEM confirmação com toast Desfazer 5 s; celular: métodos em CARTÕES, campos 48px fonte 16px; FII: Renda desejada, P/VP alvo e Meta de renda (cotas, custo, faltam) + "Criar objetivo no Planejamento" via POST /api/planejamento-sonhos (target = cotas × cotação, available = posição × cotação, botão some com faltam 0, aviso do Fluxo de Caixa, consultor: no Planejamento do cliente com aviso); rodapé literal rodapeValuation; cenários no /api/profile/export (LGPD) e cascade na exclusão. Casos-limite: LPA ≤ 0, VPA ≤ 0, k ≤ g, DPA 0, AURE3 (P/L alvo vazio: histórico < 5 anos). e2e cenarios.escrita.spec.ts desfazendo o que gravar.',
  },
  {
    id: 'C',
    nome: 'aa-blocoD-c-comparador',
    label: 'dev-C-comparador',
    porta: 3403,
    extra:
      'Comparador: indicadores.ts (catálogo por classe/tipo conforme regras_comparador + decisões: payout neutro, dados de imóveis CVM sem ★ com "fonte CVM", CRIs com critério provisório, Dív. líq./PL e P/Receita do AssetMultiplesCurrent), destaque.ts puro (★ só com direção, ≥ 2 candidatos, sem empate no valor exibido, sem conferência, P/VP perto de 1 no papel e sem ★ quando tijolo+papel), escala.ts (base 100, mesma escala, por cota ajustada a desdobramento, anos com salto = null), montarComparador em lote com boundedTtlCache; rota GET /api/analise-ativos/comparador?t=A,B,C,D (dedupe, máx 4, classe do 1º ticker, ignorados com motivo outra_classe, rate limit); página /analise-ativos/comparador (abas Ações|FIIs, slots com remover 44px, slot vazio com busca e 3 sugestões do mesmo segmento, tabela critério×ativo com coluna fixa, ★ com fundo+filete+ícone+texto "destaque", mini-gráficos com alternativa textual por célula, Resumo numérico SEM placar, aviso tijolo+papel, limite de 4, 1 ativo = "adicione mais um", estados vazio/carregando/erro geral e por ativo, Copiar link, rodapé legal; celular: slots empilhados, "Adicionar" em BottomSheet, critérios em cartões com grade de valores). Sem CTA de compra.',
  },
  {
    id: 'D',
    nome: 'aa-blocoD-d-entradas',
    label: 'dev-D-entradas',
    porta: 3404,
    extra:
      'Entradas: PilulasArea (Quadro | Comparador, aria-current, 44px; só com config.recursos.comparador); modo "Comparar" no Quadro (botão aria-pressed 44px, coluna de caixas 44×44 com nome "Comparar WEGE3", cartões no celular com caixa 44px, BandejaComparar sticky no computador e fixa acima da tabbar no celular com safe-area, "n de 4 selecionadas", limite 4 com demais desabilitadas e motivo em aria-live, trocar de aba limpa, seleção em sessionStorage) — a bandeja abre o Comparador a partir de 1 ativo (decisão 13); botão "Comparar" no CabecalhoAtivo abrindo o Comparador com o ativo no 1º slot; levar "Planejar" e "Registrar" a 44px no celular. Com a flag do comparador desligada, Quadro, casca e cabeçalho idênticos (regressão). e2e de entradas (computador e celular).',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} do bloco D da Análise de Ativos. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos, stubs, tipos e textos da fatia 0 (fonte única). Critérios de aceite obrigatórios; onde a spec ou o protótipo contrariarem ${DEC}, seguem as DECISÕES (releia a lista de divergências no REGRAS).
${f.extra}
Quando a fatia tiver UI, suba o dev server no seu worktree na porta ${f.porta} (com as flags do REGRAS) e confira com Playwright a 390px (isMobile) e a 1440px, claro e escuro, comparando com os cenários do protótipo; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png. Pare o servidor ao terminar.
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
    regressao_flags_desligadas: { type: 'string', description: 'o que foi conferido com as 3 flags desligadas (tela idêntica, salvo o Essencial da decisão 1)' },
    snapshots_desktop: { type: 'string' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'regressao_flags_desligadas', 'snapshots_desktop', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR do bloco D da Análise de Ativos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0). Traga os commits das 4 fatias com git cherry-pick, na ordem A, B, C, D, preservando commits e mensagens:
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
Resolva conflitos preservando a intenção das fatias (stubs da 0 são substituídos pela fatia dona) e registre. Garanta o ponta a ponta: página do ativo → Fundamentos Essencial|Raio-X (URL ?fund=raiox) → CSV baixa → Valuation Múltiplos|Meus cenários → salvar/restaurar/Desfazer → Meta de renda → objetivo no Planejamento; Quadro → modo Comparar → bandeja → Comparador; cabeçalho do ativo → Comparar; nenhum stub sobrou. Escreva ${DOCS}/ATIVACAO.md (molde do bloco C: migration via deploy, dry-run read-only em prod da amostra do Raio-X incl. regra 2T+4T ±15% contra a B3, ordem RAIOX → COMPARADOR → CENARIOS com [OK] a cada passo, rollback = remover a flag + restart).
Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com as flags ligadas, npx next start -p 3410 e TODOS os e2e (chromium, mobile, escrita, nessa ordem). Repita os e2e de regressão da área com as 3 flags do bloco D DESLIGADAS (desktop-layout, analise-ativos-*, quadro, mobile-analise-ativos-*) e registre em regressao_flags_desligadas. Pare o servidor ao terminar. Os e2e também têm de passar no CI (banco do seed; garanta as 3 flags ligadas no job de e2e do CI se o workflow do GitHub definir as flags da área — confira .github/workflows).
SNAPSHOTS DE DESKTOP: com as flags desligadas nada muda, exceto o Essencial da decisão 1 (CBAV3/anos com salto). Se baseline existente mudar por motivo esperado, atualize UMA vez em COMMIT DEDICADO e salve pares antes/depois em ${QA_DIR}/desktop-diff-*.png; qualquer outra mudança é bug.
Corrija problemas de integração com commits "fix(analise-ativos): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Plano de QA do arquiteto: chave "plano_qa" de ${SPEC}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, regressao: integ.regressao_flags_desligadas })}.
Salve evidências em ${QA_DIR}/. Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login. Apague no banco de dev todo cenário/objetivo que criar.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts . Suba o servidor sempre com ${FLAGS} no ambiente.`;

const QAS = [
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DESKTOP. ${QA_BASE}
${PREP}. Suba npm run dev -p 3501 (ou build de produção se o dev travar). A 1440x900 e 1080x800, claro e escuro, contra o protótipo (${PROTO}) e as decisões (${DEC}): Raio-X de WEGE3, ITUB4 (bancos: n/a e linhas ocultas), CBAV3 (anos em conferência, Essencial igual), HGLG11, KNCR11, XPLG11 (taxa de adm. no ano e 2020 em conferência), coluna fixa ao rolar, ?fund=raiox no link e voltar do navegador, CSV (abra o arquivo: nome, ;, vírgula, BOM, anti-injeção); Meus cenários WEGE3 com/sem posição (Sua posição 25,9× / 5,2% com os dados do protótipo ou os reais do dev), k ≤ g, AURE3, valor inválido, salvar/erro/Restaurar+Desfazer, dado mudou, MXRF11 Meta + criar objetivo (confira e APAGUE o objetivo), consultor agindo (consultor.demo) sem salvar; Comparador ações e FIIs (★ conferem com a regra, payout sem ★, CVM sem ★, tijolo+papel, limite 4, classe recusada, 1 ativo, Copiar link, URL ?t=), Quadro modo Comparar e botão do cabeçalho; teclado (tabela larga com foco e setas, slider com setas/Home/End, popovers devolvem foco). Com as 3 flags desligadas (reinicie o servidor sem elas) a área fica como na main. Paleta (computed styles), alvos >= 44px (boundingBox), console sem erros novos. Screenshots em ${QA_DIR}/qa-desk-*.png. Pare o servidor.`,
  },
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA MOBILE. ${QA_BASE}
${PREP}. Suba npm run dev -p 3502. Playwright 390x844 e 320x568 (isMobile, hasTouch), claro e escuro: sem rolagem horizontal da PÁGINA em nenhuma tela nova (a tabela do Raio-X rola dentro do card); Raio-X abre no 1º bloco com chips roláveis; cenários com campos 48px fonte 16px, métodos em cartões, slider com área >= 44px; Comparador com slots empilhados, Adicionar em BottomSheet, critérios em cartões com 4 valores cabendo a 320px; bandeja do Quadro acima da tabbar (safe-area) sem cobrir conteúdo; toques >= 44px (boundingBox) em pílulas, caixas, remover, seletores; botão voltar do sistema fecha sheets (history). Screenshots em ${QA_DIR}/qa-mob-*.png. Apague o que criou. Pare o servidor.`,
  },
  {
    label: 'qa-dados',
    isolation: 'worktree',
    prompt: `Você é o QA DE DADOS. ${QA_BASE}
${PREP}. Read-only via prisma/tsx com o .env de dev. Confira contra SQL direto: (1) Raio-X de WEGE3, PETR4, ITUB4, VALE3, TAEE11, HGLG11, XPLG11, KNCR11, MXRF11 e HFOF11 — célula a célula numa amostra de 3 anos por ativo e todas as linhas; FII: rendimento distribuído = 2T+4T, resultado/cota pela média mensal de cotas (HGLG11 2025 ≈ 12,90), base de cotas de hoje (HGLG11 2017 VP 112,73), taxa de adm. = soma dos 12 meses (e < 12 meses = "—"); (2) conferência: CBAV3 2021–2025 per-share oculto no Raio-X E no Essencial, flags da linha do Quadro nunca em coluna anual, WEGE3 proventos só no Últ. 12m/cenários, SBSP3 e GSRF11 nos cenários/comparador; (3) cenários: resultados de WEGE3, TAEE11, AURE3, MXRF11 recalculados à mão a partir da base (Bazin, Graham, P/L alvo = média 10a, Gordon, Meta de renda com rendimento de 3 casas); (4) comparador: ★ de 5 comparações (WEGE3×PETR4×ITUB4×VALE3; HGLG11×XPLG11; KNCR11×MXRF11; HGLG11×KNCR11; SBSP3×SAPR11) recalculados pelas regras_comparador + decisões; escala base 100 com desdobramento; (5) CSV = tela. Suba npm run dev -p 3503 e confira que API e tela mostram o mesmo. Tabela esperado × obtido em ${QA_DIR}/qa-dados.md. Pare o servidor.`,
  },
  {
    label: 'qa-codigo-seguranca-compliance',
    prompt: `Você é o REVISOR DE CÓDIGO, SEGURANÇA, LGPD, COMPLIANCE E PERFORMANCE (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: gate em TODA rota nova (flag da área, beta, flag do recurso → 404; sem cookie → 401; 400 para ticker inválido); cenários: zod strict (limites das premissas iguais aos da tela), CSRF em PUT/DELETE, isolamento por usuário (nunca ler/gravar cenário de outro; consultor GET salvo=null e PUT/DELETE 403), limite de 300 atômico, DELETE idempotente, cascade e export LGPD; objetivo no Planejamento (target > 0, consultor cria no cliente com aviso); CSV: anti-injeção (= + - @ e tab/CR no início), sem PII, Content-Disposition seguro (ticker saneado), BOM/CRLF; comparador: dedupe, máximo 4, classe, cache com maxKeys (sem crescimento ilimitado), sem N+1 (lote), rate limit 30/min/IP; Raio-X sem N+1, cache; nenhuma chamada externa nas rotas; textos só dos arquivos de textos com varredura (nenhum barato/caro/preço justo/alvo/recomend*/nota), rodapé literal; ★ com texto, vs. cotação sem cor; regressão com flags desligadas (nada muda, salvo decisão 1 no Essencial); paleta (grep hex fora da paleta) e acessibilidade (role=region+tabIndex na tabela larga, th scope, caption, aria-valuetext no slider, aria-live com debounce, aria-invalid/aria-describedby, sheet com role=dialog/aria-modal). Cada achado com arquivo:linha e cenário concreto.`,
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
    `Você é o CORRETOR do bloco D da Análise de Ativos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(analise-ativos): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO do bloco D da Análise de Ativos. ${REGRAS}
${PREP}. Suba npm run dev -p 3521. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1440px quando aplicável). Rode também os e2e da branch (chromium, mobile, escrita) contra um build de produção (npm run build && flags ligadas npx next start -p 3522). Apague cenários/objetivos de teste. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
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
