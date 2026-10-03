export const meta = {
  name: 'analise-ativos-blocoC-construcao',
  description:
    'Análise de Ativos bloco C (relatar dado + regras de sanidade): contratos 0 → 4 devs em worktrees (A motor, B tela, C curadoria, D relato) → integração → QA desktop/mobile/dados/código+segurança+LGPD → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0 (contratos) na branch feat/analise-ativos-blocoC' },
    { title: 'Implementação', detail: 'fatias A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, e2e, integração no dev' },
    { title: 'QA', detail: 'desktop, mobile, dados, código+segurança+LGPD' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
};

const REPO = '/home/huske/dev/front';
const BRANCH = 'feat/analise-ativos-blocoC';
const BASE = args.base;
const QA_DIR = args.qaDir;
const DOCS = `${REPO}/docs/analise-ativos/blocoC`;
const SPEC = `${DOCS}/spec-desenho.json`;
const DEC = `${DOCS}/decisoes.md`;
const PROTO = `${DOCS}/prototipo.html`;

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15 App Router, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Hoje é 03/10/2026. Mutações usam csrfFetch.
- FEATURE: Análise de Ativos — BLOCO C = (1) "Reportar dado incorreto" (relato do usuário, Meus relatos, fila do curador em /admin/curadoria, notificações) e (2) regras de sanidade "em conferência" em todos os indicadores, generalizando a trava de proventos existente (regras/calculo/plausibilidadeProventos.ts). Fase 0 e Fase 1 já estão na main (src/services/analiseAtivos/**, src/components/analiseAtivos/**, /analise-ativos). Branch de integração ${BRANCH} (parte da main ${BASE} + 1 commit de docs).
- Especificação final: ${SPEC} (chave "arquitetura": fatias[] com arquivos de cada fatia, apis[], schema_prisma, regras_sanidade[] com medições, fluxo_curadoria, plano_producao, plano_qa, riscos; "design"; "revisao"). Protótipo (leiaute e conteúdo; cenários R1–R9, U1–U3, C1–C7, K1–K10, M1–M7): ${PROTO}.
- DECISÕES APROVADAS PELO WELLINGTON: ${DEC} — PREVALECEM sobre spec e protótipo. Pontos onde a spec/protótipo DIVERGEM e as decisões mandam:
  * Decisão 16: NÃO existe "conferência manual pelo curador" nesta fase (a spec/QA mencionam conferenciaManual / HGLG11 com conferência manual / grupo 'manual' com efeito na tela): NÃO implemente ação de pôr dado em conferência à mão. O curador só decide status/resolução e pode LIBERAR (dado_confirmado). A vacância do HGLG11 = nota fixa "a tela segue a CVM" + o relato vira caso de revisão.
  * Limites (6): 5 relatos/dia por usuário, 3/h por ativo, 1 aberto por usuário×ativo×campo (duplicado NÃO cria; responde levando ao relato existente — mantenha o código HTTP que a spec final escolheu e use o mesmo no front), 300/dia global.
  * Retenção (19): 12 meses após o fechamento (anonimiza texto livre), relatos no /api/profile/export, exclusão de conta limpa mensagem e fonte.
  * Rota da fila: /admin/curadoria e /admin/curadoria/[id]; curadores = admins (requireAdmin).
  * Nome: "Reportar dado incorreto" / "relato"; rejeitado aparece ao usuário como "Conferido, sem alteração".
  * Lucro com salto e "variação > 40%"/"provedor×CVM": SÓ caso de revisão (flag rev:), nada muda na tela nem no Índice.
  * Flag ANALISE_ATIVOS_REPORTE_HABILITADO (desligada por padrão) esconde botão/APIs de relato; a área inteira continua atrás de ANALISE_ATIVOS_HABILITADA + beta.
  * Diretório de docs do bloco: docs/analise-ativos/blocoC/ (NÃO "bloco-c"). decisoes.md JÁ EXISTE e não deve ser reescrito; o runbook de produção vai em docs/analise-ativos/blocoC/ATIVACAO.md.
- COMPATIBILIDADE: com ScoringParams v1 ativo (o de prod hoje) NADA muda na tela nem nos números (v1 não grava 'conf:'; caminho legado de proventos preservado). As regras novas só valem com a v2 (sanidade.conferencia.ligada=true). Teste de regressão v1 obrigatório.
- Nenhuma rota /api/analise-ativos/* chama provedor externo no caminho da requisição. Textos da tela saem de textosTela e passam pela varredura de palavras proibidas (regras/comum/linguagem.ts). Texto livre do usuário NUNCA vira HTML (renderizar como texto; saneador de controle/bidi/zero-width).
- MIGRATION: aditiva (só CREATE TABLE/INDEX IF NOT EXISTS). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev/deploy" no dev. Padrão: SQL em prisma/migrations/<timestamp>_analise_ativos_bloco_c/migration.sql + script idempotente scripts/analise-ativos/apply-migration-bloco-c.ts (molde: apply-migration-fase1.ts), rodado UMA vez no dev; depois npx prisma generate.
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas do app + vermelho #D92D20/#F97066. #0079F2 só em elemento não textual. Texto/link #396CAA claro / #6E9DC4 escuro. Dark mode obrigatório. TABLE_STYLES nas tabelas. Alvos >= 44px (48px nos botões principais do celular). BottomSheet + useMobileHistoryLayer no celular.
- Commits: atômicos, em português ("feat(analise-ativos): ...", "fix(analise-ativos): ...", "test(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / .). NUNCA push, PR, merge em main, nem mexer em .claude/settings.local.json, .gitignore, docs/ fora de docs/analise-ativos/blocoC/ ou em arquivos não rastreados pré-existentes. NUNCA tocar em produção (Lightsail/ssh/banco de prod).
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes. 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Testes que importam o prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Padrão de teste de rota: mock de Prisma via vi.hoisted, mock de requireAuthWithActing — ver src/test/mocks.
- Dev: rode o servidor com ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true no ambiente do processo; o usuário demo já está no beta no banco dev. Admin no dev: confira se existe usuário admin no banco dev (role admin); se não existir, a fatia 0 cria um admin de DEV via seed/script (documente credenciais em ATIVACAO.md como só-dev).
- e2e: CI = banco do seed + build de produção (CI=true). Testes novos têm de passar lá (o seed traz as fixtures necessárias); screenshots só locais (test.skip(!!process.env.CI)). O que grava (relato, decisão do curador) vai em *.escrita.spec.ts (projeto 'escrita') e DESFAZ o que gravou. Snapshots de e2e/desktop-*.spec.ts-snapshots: nenhum dev atualiza; só o INTEGRADOR, uma vez, em commit dedicado, se a mudança for esperada.
- Processos: NÃO use "pkill -f" em comando encadeado. Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify" (permitida SÓ para essa receita). Use waitUntil:'load' + espera fixa. Em dev, o React Query Devtools cobre botões no canto: esconda .tsqd-parent-container via addStyleTag.
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 e consultor.demo@finapp.local / 123456. Relatos/casos criados em teste manual devem ser APAGADOS ao final.
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
  `Você é o DEV da FATIA 0 ("Contratos") do bloco C da Análise de Ativos. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec, exceto o que as decisões removem (sem grupo/ação de conferência manual; decisoes.md já existe — não reescreva; ATIVACAO.md em docs/analise-ativos/blocoC/): schema aditivo (3 models + relações) + migration versionada + script apply idempotente (rode no dev) + prisma generate; ScoringParams v2 (sanidade.conferencia) com seed (v1 continua ativa por padrão) e teste de que v1 fica idêntica; contrato de conferência (regras/comum/conferencia.ts: grupos, escopo empresa/ticker, política ocultar/selo, flags conf:/rev:/info:, legado de proventos separado); contrato de curadoria (estados, transições, SLA em dias úteis com feriadosB3, sanearTextoLivre, limites); tipos de API; textosTela novos com teste de palavras proibidas; flag ANALISE_ATIVOS_REPORTE_HABILITADO em analiseAtivosConfig + /config; nomes/catálogo de jobs ('curadoria'); STUBS com as props/assinaturas FINAIS para o que as fatias A, B, C e D preenchem (cada stub no caminho da fatia dona, exportando a assinatura final). Contratos documentados em docblock para que A/B/C/D trabalhem sem arquivo em comum. Testes vitest da fatia. Rode tsc, eslint e os testes novos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0-contratos', phase: 'Fundação', schema: DEV_SCHEMA },
);
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 };
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`);

phase('Implementação');
const FATIAS = [
  {
    id: 'A',
    nome: 'aa-blocoC-a-motor',
    label: 'dev-A-motor-sanidade',
    porta: 3201,
    extra:
      'Motor de sanidade: regras puras por grupo (acoes_escala, historico, preco_base, preco_esporadico com piso P/VP 0,25 + 2º sinal, fundamentos_escala, fii_vp, fii_obrigacoes, e as de revisão rev:variacao_nivel / rev:variacao_lucro / rev:divergencia_fonte) com os limiares de regras_sanidade da spec; integração nos jobs derivados/scores e no recalcular-analise (--versao-params=2 em dry-run com relatório por regra); escopo ticker × empresa (ON/PN); grupo bloqueado entra no Índice/semáforo como ausente(em_conferencia) reaproveitando o caminho do DY; leitura de liberações (dado_confirmado) vindas da curadoria. SEM conferência manual (decisão 16). Testes com fixtures REAIS do dev: devem marcar CBAV3, LAND3, HAPV3, SBSP3 (29/04/26), GSRF11, APXU11, POMO3 2015–19; NÃO devem marcar INHF11, CGAS3, KNRE11, RECT11, PRIO3 (queda real de lucro), SYNE3 (só revisão). Regressão v1 byte a byte. Rode recalcular-analise --versao-params=2 em DRY-RUN no dev e salve o relatório por regra em ' + QA_DIR + '/dev-A-dryrun-v2.txt (NÃO aplique v2 no dev — isso é do integrador).',
  },
  {
    id: 'B',
    nome: 'aa-blocoC-b-tela',
    label: 'dev-B-tela-consistente',
    porta: 3202,
    extra:
      'Tela consistente: "em conferência" lido de um helper só (conferencia.ts) em Quadro (tabela e cartões; "—" vai para o fim na ordenação), página do ativo (KPIs, Índice/semáforo com componente tracejado = 0, dividendos, gráfico com trecho tracejado, Fundamentos Essencial com célula hachurada, Valuation com barra oculta), chip "em conferência" que abre o "Por quê?" (popover no computador, sheet no celular; termina em "Tem uma informação sobre isso? Reportar" — o atalho chama o BotaoReportarDado/stub da fatia D via prop/callback do contrato), selo de frescor POR BLOCO com "atualização em atraso", nota fixa da vacância do HGLG11 ("a tela segue a CVM"), menu ⋯ por bloco no cabeçalho do CartaoAnalise (prop acao do contrato; renderiza o item só se reporteHabilitado). Matriz de consistência (matrizConsistencia.test.ts) grupo × classe × exibição. Regressão: com v1 a tela fica idêntica (DY de proventos com valor + selo).',
  },
  {
    id: 'C',
    nome: 'aa-blocoC-c-curadoria',
    label: 'dev-C-curadoria-admin',
    porta: 3203,
    extra:
      'Curadoria: job "curadoria" (sincronizarCasos: abre/atualiza casos de regra a partir das flags conf:/rev:; autorresolve só caso de regra pura cujo campo voltou a ok; misto/com relato NUNCA fecha sozinho; idempotente; digest 1×/dia com "vence em até 2 dias úteis" e vencidos, sem casos só de regra nas pendências; alerta ao admin a cada caso novo de usuário, dependendo só de ANALISE_ATIVOS_REPORTE_HABILITADO) + rota cron + linha no template de cron (infra/modules/lightsail/provision.sh.tftpl, 10:55); APIs admin (lista com filtros/contadores, detalhe, decidir: status + resolução obrigatória ao fechar + resposta pública até 500 com varredura de linguagem + nota interna até 2.000; concorrência otimista 409; auditoria em analise_casos_eventos; requireAdmin; "Fechar e avisar" cria Notification + push para cada autor UMA vez; "liberar o valor" = resolução dado_confirmado lida pela fatia A no próximo cálculo); telas /admin/curadoria e /admin/curadoria/[id] (TABLE_STYLES, contadores-filtro, efeito, prazo com forma+texto, "regra parou de marcar", estados carregando/vazio/erro; celular em cartões); card no /admin (overview) com pendências. SEM ação de conferência manual (decisão 16). Texto do usuário renderizado como texto (teste de XSS).',
  },
  {
    id: 'D',
    nome: 'aa-blocoC-d-relato',
    label: 'dev-D-relato-usuario',
    porta: 3204,
    extra:
      'Relato do usuário: POST /api/analise-ativos/reportes (zod strict, CSRF, saneador, HTML rejeitado, limites das decisões no banco + tier de IP só nessa rota em src/lib/rateLimit.ts, duplicado leva ao existente, consultor agindo = autor consultor + clienteId sem notificar o cliente, retrato do servidor da linha exibida, anexa a caso de regra só se o campo pertence ao grupo, senão caso novo); GET /api/analise-ativos/meus-reportes (só do logado, paginado, bucket próprio); "Você reportou" vindo no GET do ativo (contrato da 0); BotaoReportarDado + formulário (modal 560px no computador, sheet tela cheia no celular; Qual dado? pré-preenchido, contexto só-leitura, mensagem 10–1.000, valor esperado opcional até 40, fonte opcional; estados inválido/enviando/enviado com protocolo e prazo/erro/limite/duplicado/consultor); página Meus relatos (lista, vazio, carregando, erro; resposta nova destacada) + link no Quadro; LGPD: exclusão de conta anonimiza mensagem/fonte (src/app/api/profile/route.ts), relatos no export, retenção 12 meses no cron lgpd-retention. e2e *.escrita.spec.ts: relatar → Meus relatos, apagando o que criou.',
  },
];

const devs = await parallel(
  FATIAS.map(
    (f) => () =>
      agent(
        `Você é o DEV da FATIA ${f.id} do bloco C da Análise de Ativos. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_da_spec). Use os contratos, stubs, tipos e textosTela da fatia 0 (fonte única). Critérios de aceite obrigatórios; onde a spec ou o protótipo contrariarem ${DEC}, seguem as DECISÕES.
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
    integracao_dev: { type: 'string', description: 'resultado do dry-run e do apply da v2 no banco dev: contagens antes/depois por estado e classe, casos abertos pela curadoria' },
    snapshots_desktop: { type: 'string' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'integracao_dev', 'snapshots_desktop', 'problemas_abertos'],
};
const integ = await agent(
  `Você é o INTEGRADOR do bloco C da Análise de Ativos. ${REGRAS}
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
Resolva conflitos preservando a intenção das fatias (stubs da 0 são substituídos pela fatia dona) e registre. Garanta o ponta a ponta: regra marca → Quadro/página mostram em conferência igual → job curadoria abre caso → usuário relata pelo menu ⋯ ou pelo "Por quê?" → caso na fila → admin decide → Notification ao autor → Meus relatos mostra a resposta; nenhum stub sobrou; nada da conferência manual (decisão 16).
INTEGRAÇÃO NO BANCO DEV (item 4 do plano_qa): apply-migration-bloco-c (se a 0 já rodou, é idempotente) → seed ScoringParams v2 no dev → recalcular-analise --versao-params=2 DRY-RUN (salve em ${QA_DIR}/integ-dryrun-v2.txt) → apply → job quadro → job curadoria. Registre contagens antes/depois por estado×classe (esperado: ações calculadas ~iguais; FIIs −3 a −8) em integracao_dev. Se uma regra marcar mais de 3% do Quadro de uma classe, registre em problemas_abertos (não recalibre sozinho além do óbvio).
Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam, com as variáveis dummy), rm -rf .next && npm run build e, com as flags ligadas, npx next start -p 3210 e TODOS os e2e (chromium, mobile, escrita, nessa ordem). Pare o servidor ao terminar. Os e2e também têm de passar no CI (banco do seed).
SNAPSHOTS DE DESKTOP: o admin ganha card/rota novos; o usuário comum não deveria mudar. Se baseline existente mudar por motivo esperado, atualize UMA vez em COMMIT DEDICADO e salve pares antes/depois em ${QA_DIR}/desktop-diff-*.png; qualquer outra mudança é bug.
Corrija problemas de integração com commits "fix(analise-ativos): ..." pequenos. Se uma fatia faltou, NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA },
);
if (!integ) return { erro: 'integração falhou', devs: devOk };

phase('QA');
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Plano de QA do arquiteto: chave "arquitetura.plano_qa" de ${SPEC} (ignore o que a decisão 16 removeu). Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, integracao_dev: integ.integracao_dev })}.
Salve evidências em ${QA_DIR}/. Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes (o resultado se perde) — a skill "verify" é permitida só para a receita de login. Apague no banco de dev todo relato/caso que criar.`;
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local (se existir), cp ${REPO}/next-env.d.ts . Suba o servidor sempre com ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true no ambiente.`;

const QAS = [
  {
    label: 'qa-desktop',
    isolation: 'worktree',
    prompt: `Você é o QA DESKTOP. ${QA_BASE}
${PREP}. Suba npm run dev -p 3301 (ou build de produção se o dev travar). A 1440x900 e 1080x800, claro e escuro, contra o protótipo (${PROTO}) e as decisões (${DEC}): menu ⋯ em cada bloco (teclado: setas, Esc devolve foco), formulário (pré-preenchido, validação, enviando, enviado com protocolo e prazo, erro simulado via page.route, limite, duplicado, consultor agindo), Meus relatos, "Você reportou" no bloco; ativos em conferência no dev (SBSP3, CBAV3, um FII de obrigações > 100%, WEGE3 proventos) — chip, "Por quê?", "—" vs valor+selo, mesma marca no Quadro e na página, ordenação com "—" no fim; frescor por bloco; HGLG11 vacância com a nota; como ADMIN: /admin/curadoria (contadores-filtro, efeito, prazo, detalhe, decidir sem resolução bloqueia, termo proibido bloqueia, fechar e avisar → Notification no sino do autor), card no /admin. Com flag de relato desligada o menu não mostra "Reportar". Paleta (computed styles), console sem erros novos. Screenshots em ${QA_DIR}/qa-desk-*.png. Apague o que criou. Pare o servidor.`,
  },
  {
    label: 'qa-mobile',
    isolation: 'worktree',
    prompt: `Você é o QA MOBILE. ${QA_BASE}
${PREP}. Suba npm run dev -p 3302. Playwright 390x844 e 320x568 (isMobile, hasTouch), claro e escuro: sem rolagem horizontal em nenhuma tela nova; ⋯ abre BottomSheet com opções >= 52px; formulário em sheet tela cheia, campos 48px fonte 16px, Enviar fixo e não coberto pelo teclado; "Por quê?" em sheet; chip com área de toque >= 44px (boundingBox); Meus relatos em cartões; curadoria em cartões; botão voltar do sistema fecha sheets (history). Screenshots em ${QA_DIR}/qa-mob-*.png. Apague o que criou. Pare o servidor.`,
  },
  {
    label: 'qa-dados',
    isolation: 'worktree',
    prompt: `Você é o QA DE DADOS. ${QA_BASE}
${PREP}. Read-only via prisma/tsx com o .env de dev (o integrador já aplicou a v2 no dev). Confira: (1) cada regra de regras_sanidade contra SQL direto — os casos que devem marcar (CBAV3, LAND3, HAPV3, SBSP3, GSRF11, APXU11, POMO3 anos 2015–19) marcam com o grupo e escopo certos, e os que NÃO devem (INHF11, CGAS3, KNRE11, RECT11, PRIO3, SYNE3 só revisão, AZEV3/4) não bloqueiam; (2) Índice/semáforo dos marcados = componente do grupo zerado e estado incompleto; escopo ticker não contamina a ON de referência; (3) contagens por estado×classe antes/depois batem com integracao_dev e com o impacto previsto; (4) com params v1 ativos (troque só num processo de teste, sem gravar) os números ficam idênticos aos da main; (5) casos do job curadoria batem com as flags (1 caso por ativo×grupo×campo×período), idempotência rodando 2×. Suba npm run dev -p 3303 e confira que API e tela mostram o mesmo. Tabela esperado × obtido em ${QA_DIR}/qa-dados.md. Pare o servidor.`,
  },
  {
    label: 'qa-codigo-seguranca-lgpd',
    prompt: `Você é o REVISOR DE CÓDIGO, SEGURANÇA, LGPD, COMPLIANCE E PERFORMANCE (nível alto, foco em bugs de correção). ${QA_BASE}
Revise você mesmo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: gate em TODA rota nova (flag da área, beta, flag de relato → 404; sem cookie → 401; admin → requireAdmin, 403 para não-admin); relato: zod strict, CSRF, limites (5/dia, 3/h/ativo, 1 aberto, 300/dia, IP) aplicados no banco de forma atômica (sem corrida que passe do limite), saneador (controle, bidi U+202E, zero-width), HTML rejeitado, XSS na fila do admin e em Meus relatos (texto nunca vira HTML), enumeração (usuário só vê os próprios relatos; ids não sequenciais ou checados), consultor agindo; curadoria: transições válidas, 409 otimista, auditoria completa, Notification 1× por autor, resposta pública passa pela varredura de linguagem; motor: v1 idêntica, sem N+1, job dentro de 300 MB RSS / 4 min, idempotente; curadoria job idempotente e não fecha misto; LGPD: exclusão de conta anonimiza, export inclui, retenção 12 meses; migration aditiva + apply idempotente; nenhuma chamada externa nas rotas; textos só de textosTela; ausência de conferência manual (decisão 16); paleta (grep hex fora da paleta) e acessibilidade (role=dialog, aria-modal, aria-invalid, aria-describedby). Cada achado com arquivo:linha e cenário concreto.`,
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
    `Você é o CORRETOR do bloco C da Análise de Ativos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(analise-ativos): ...". Ao final: tsc, lint, vitest nos testes afetados (variáveis dummy) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA },
  );

  if (correcao?.corrigidos?.length) {
    phase('Reverificação');
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO do bloco C da Análise de Ativos. ${REGRAS}
${PREP}. Suba npm run dev -p 3321. Para cada correção abaixo, reproduza o cenário original e confirme que foi resolvido sem regressão (390px e 1440px quando aplicável). Rode também os e2e da branch (chromium, mobile, escrita) contra um build de produção (npm run build && flags ligadas npx next start -p 3322). Apague relatos/casos de teste. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
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
