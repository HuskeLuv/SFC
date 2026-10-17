export const meta = {
  name: 'analise-bloco1-salvos-construcao',
  description: 'Bloco 1 da Análise (Salvos, filtros salvos, comparações + PDF, alertas): fatia 0 → A/B/C/D em worktrees → integração → QA → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0 (contratos) na branch feat/analise-ativos-bloco1-salvos' },
    { title: 'Implementação', detail: 'A backend, B entradas, C página Salvos + casca, D alertas — em worktrees' },
    { title: 'Integração', detail: 'cherry-pick A, B, C, D; checks; build; e2e; runbook' },
    { title: 'QA', detail: 'telas (desktop+mobile) e código+segurança+LGPD+compliance' },
    { title: 'Correções' },
    { title: 'Reverificação' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/analise-ativos-bloco1-salvos'
const BASE = args.base
const QA_DIR = args.qaDir
const DESENHO = `${REPO}/docs/analise-ativos/bloco1-salvos/desenho.json`
const PROTO = `${REPO}/docs/analise-ativos/bloco1-salvos/prototipo.html`
const PEDRO = `${REPO}/docs/analise-ativos/spec-v2-pedro-out2026`
const DB = 'postgresql://postgres:postgres@localhost:5433/sfc_test?schema=public'
const FLAGS = `DATABASE_URL="${DB}" JWT_SECRET=dev-local ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true ANALISE_ATIVOS_RAIOX_HABILITADO=true ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_CENARIOS_HABILITADO=true ANALISE_ATIVOS_SALVOS_HABILITADO=true ANALISE_ATIVOS_ALERTAS_HABILITADO=true ANALISE_ATIVOS_PDF_HABILITADO=true`

const REGRAS = `
REGRAS GERAIS (todo agente):
- Repo ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga CLAUDE.md e o estilo do código ao redor. Hoje é 16/10/2026.
- FEATURE: BLOCO 1 da Análise de Ativos — Salvos (listas com nome, Salvar no ativo e no Quadro, página Salvos com abas por classe), Filtros salvos no Quadro, Salvar comparação + Exportar PDF no Comparador, Alertas das listas (job diário, Notification in-app + push, aba Alertas de 90 dias). Spec do Pedro: ${PEDRO}/especificacao-v2.txt (§3, §3.1, §3.2, §3.3, §3.5, §9) e HTML ${PEDRO}/prototipo-pedro-v2.html.
- DESENHO APROVADO: ${DESENHO} — "arquitetura" (resumo, modelos_prisma, apis, alertas, pdf, flags_e_ativacao, fatias[], riscos) é a FONTE DA VERDADE; "design" (especificacao_visual, textos, estados, acessibilidade) e o protótipo ${PROTO} definem visual/textos/comportamento; "criticas" já foram incorporadas. Em divergência arquitetura × design, vale a ARQUITETURA.
- DECISÕES DO WELLINGTON (16/10), todas = recomendação: (1) listas/filtros/comparações/alertas são PESSOAIS: consultor agindo por cliente vê vazio com podeSalvar=false, mutações 403, botões desabilitados com o texto do protótipo (molde: teses/[ticker]/route.ts e cenarios/[ticker]/route.ts); PDF continua liberado sem dado pessoal. (2) PDF gerado NO SERVIDOR (pdfkit), sem opções, nunca posição/nome/e-mail, aviso legal em toda página, 10/h por usuário em balde próprio, iOS com fallback "Compartilhar PDF"; sem mini-gráficos. (3) Alertas = 3 tipos neutros (resultado entregue à CVM e provento anunciado ligados por padrão; mudança no "n de 6" em 5 anos desligada por padrão); SEM alerta de preço e SEM "provento pago"; resumo fixo acima de 5 no dia; aba Alertas lendo as Notification (GET /alertas, POST /alertas/lidos), retenção 90 dias. (4) 1ª lista se chama "Salvos"; toasts com os literais do Pedro. (5) Salvar: 0 listas → cria "Salvos"; 1 → alterna nela; 2+ → "Salvar em…". Sem reordenar listas, sem tabelas personalizadas. "Abrir comparador" do modal continua sem gravar.
- NÃO confundir com o modelo Watchlist da Carteira (planejados/objetivo): modelos novos Analise* com @@map analise_*.
- FLAGS novas desligadas por padrão (src/lib/analiseAtivosConfig.ts): ANALISE_ATIVOS_SALVOS_HABILITADO, ANALISE_ATIVOS_ALERTAS_HABILITADO (exige SALVOS), ANALISE_ATIVOS_PDF_HABILITADO (exige COMPARADOR); tudo só vale com a área liberada (beta/admin). Sem flag: rotas 404, UI escondida, job termina 'pulado'.
- Compliance: textos SÓ nos arquivos de textos e passando pelas varreduras (linguagemV2, varreduraTextos, PALAVRAS_PROIBIDAS*; literais novos registrados em textosLiterais.ts). Proibidas: compre/compra/barato/caro/preço justo/oportunidade/recomend*/faltam/ranking (a pílula Ranking do bloco 3 fica reservada SEM rótulo)… Nenhuma resposta de /api/analise-ativos/* com chave de nota/índice/semáforo/destaque (contratoSemNota). Nenhuma rota chama terceiros na requisição.
- LGPD: export (/api/profile/export) inclui listas, itens, filtros, comparações e alertas; exclusão de conta apaga tudo (cascade) + Notification type 'analise_ativos_salvos_alerta'; retenção de 90 dias unificada (job, export, lgpd-retention).
- Segurança: zod strict em todo body/query; csrfFetch nas mutações; withErrorHandler; requireAuthWithActing; rate limit (balde do PDF); limites por usuário do contrato (nome 40, 20 listas, 200 por lista, 500 por usuário, 20 filtros por classe, 30 comparações, 10 PDFs/h) checados no servidor; isolamento por userId em TODA query.
- BANCO DE DEV: o Neon está FORA (cota). Use SÓ o Postgres local do Docker: DATABASE_URL="${DB}" (prefixe TODO comando prisma/tsx/next/vitest-de-integração com ele; o .env aponta para o Neon e falha). Ele está limpo (migrate deploy + seed + fixtures, igual ao CI), então a migration nova roda com "DATABASE_URL=... npx prisma migrate deploy" e depois "npx prisma generate". Migration ADITIVA (CREATE TABLE/INDEX IF NOT EXISTS, FK em DO $$ … EXCEPTION), em prisma/migrations/20261017000000_analise_ativos_salvos/migration.sql. Atualize o seed/fixtures se os e2e precisarem. Nunca use o .env do Neon nem produção.
- Cores: só paleta My Finance (src/constants/brandColors.ts) + cinzas do app; dark mode; TABLE_STYLES; controles min-h-11 (44px); BottomSheet + useMobileHistoryLayer no celular.
- Commits atômicos em português ("feat(analise-ativos): …", "fix(…)", "test(…)"), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA -A/.). NUNCA push/PR/merge, nunca mexer em .claude/settings.local.json, .gitignore, .env, .env.local, arquivos não rastreados pré-existentes, nem docs fora de docs/analise-ativos/bloco1-salvos/. NUNCA tocar produção (ssh/Lightsail).
- Testes: não rode o vitest do repo inteiro; rode os arquivos relevantes. Testes unitários que importam o prisma: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Mock de rota: vi.hoisted + mock de requireAuthWithActing (src/test/mocks).
- Dev server: ${FLAGS} npx next dev -p <porta>. Usuários: admin.demo@finapp.local, usuario.demo@finapp.local (no beta), consultor.demo@finapp.local — senha 123456. Depois de prisma generate, REINICIE o dev server. Dev frio dá timeout: aqueça as páginas antes do Playwright. Não use "pkill -f" encadeado; guarde o PID e kill <pid> em comando separado. O banco local é compartilhado entre agentes: apague o que criar em teste manual.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs, chromium.launch() (fallback executablePath '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'); waitUntil:'load' + espera; seções lazy da página do ativo (e2e/helpers/secaoPreguicosa.ts). Esconda .tsqd-parent-container. Receita de login: skill/projeto "verify" (cookies + CSRF) se precisar.
- e2e: CI = postgres sfc_test + migrate deploy + seed + build de produção (CI=true) — .github/workflows/ci.yml; acrescente lá as flags novas no job de e2e. O que grava vai em *.escrita.spec.ts e DESFAZ o que gravou. Baselines e2e/desktop-*.spec.ts-snapshots: só o integrador atualiza, uma vez, em commit dedicado, nunca as -ci-.
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) "git checkout --detach ${BRANCH}" e confira com "git log --oneline -5" que os commits da fatia 0 estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local; cp ${REPO}/next-env.d.ts . (o prisma client e a migration já foram aplicados pela fatia 0 no banco local). (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
`

const DEV_SCHEMA = { type: 'object', properties: {
  worktree: { type: 'string' }, branch: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
  arquivos: { type: 'array', items: { type: 'string' } }, testes: { type: 'string' },
  desvios_do_desenho: { type: 'array', items: { type: 'string' } }, pendencias: { type: 'array', items: { type: 'string' } } },
  required: ['worktree', 'branch', 'commits', 'arquivos', 'testes', 'desvios_do_desenho', 'pendencias'] }

const FINDINGS = { type: 'object', properties: {
  resumo: { type: 'string' },
  achados: { type: 'array', items: { type: 'object', properties: {
    gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] }, categoria: { type: 'string' }, descricao: { type: 'string' },
    evidencia: { type: 'string' }, reproducao: { type: 'string' }, sugestao: { type: 'string' } },
    required: ['gravidade', 'categoria', 'descricao', 'evidencia', 'reproducao', 'sugestao'] } },
  evidencias: { type: 'array', items: { type: 'string' } } }, required: ['resumo', 'achados', 'evidencias'] }

phase('Fundação')
const f0 = await agent(`Você é o DEV da FATIA 0 ("Contratos", bloqueante) do bloco 1. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" de arquitetura.fatias em ${DESENHO}: schema Prisma (modelos e relações em User) + migration aditiva aplicada no banco LOCAL com migrate deploy + prisma generate; flags e recursos (acessoAnalise, /config, dependências); tipos e zod (salvos/contrato.ts com limites e TICKER_RE_POR_CLASSE); hooks de React Query com as chaves; TODA a cópia (textos* + literais registrados) e os componentes compartilhados (ModalNomeLista, ListaComparacoesSalvas, mostrarToastSalvo etc.) para que A, B, C e D só importem; stubs/assinaturas FINAIS do que A, B, C e D preenchem. ANTES de terminar, cruze os arquivos das fatias A–D e reporte interseções em pendencias (resolva no contrato se puder). Testes vitest da fatia (contrato, varredura de textos); tsc; eslint. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0', phase: 'Fundação', schema: DEV_SCHEMA })
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 }
log(`Fatia 0: ${f0.commits.length} commits`)

phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'b1-a-backend', label: 'dev-A-backend', porta: 3611,
    extra: 'Backend: rotas de listas, itens (Salvar/sentinela padrao), filtros salvos, comparações, PDF (pdfkit no servidor, rota comparacao-pdf com balde próprio), LGPD (export, exclusão, retenção). Testes de rota (200/400/401/403 consultor/404 sem flag/limites/isolamento por usuário) e do PDF (gera, sem dado pessoal, aviso legal em toda página).' },
  { id: 'B', nome: 'b1-b-entradas', label: 'dev-B-entradas', porta: 3612,
    extra: 'Entradas na UI: Salvar no cabeçalho do ativo (regra 0/1/2+), marcador na linha/cartão do Quadro, chooser (popover desktop / BottomSheet celular), Filtros salvos no Quadro (?filtro=<id>, estado "alterado"), Salvar comparação + Comparações salvas + Exportar PDF no Comparador (com o fallback do iOS). Confira com Playwright a 390 e 1440, claro e escuro, screenshots em ' + QA_DIR + '/dev-B-*.png.' },
  { id: 'C', nome: 'b1-c-salvos', label: 'dev-C-salvos', porta: 3613,
    extra: 'Página /analise-ativos/salvos (notFound sem flag) + casca declarativa de pílulas (Quadro | Comparador | [Ranking reservado sem rótulo] | Salvos) + "Criar lista" onde o desenho manda: rail de listas, renomear, apagar com confirmação, abas Ações · FIIs com colunas do Quadro + "Adicionado em" + remover com Desfazer, cartões no celular, "antes N de 6 · data", estados vazio/carregando/erro, modo consultor. Confira com Playwright a 390 e 1440, claro e escuro, screenshots em ' + QA_DIR + '/dev-C-*.png.' },
  { id: 'D', nome: 'b1-d-alertas', label: 'dev-D-alertas', porta: 3614,
    extra: 'Alertas: job diário (catálogo de jobs da área, scripts/myfinance-job.sh, sem cron no repo — o cron vai no runbook), dedupe por companhia (createMany skipDuplicates), marcos de critérios, resumo acima de 5, Notification + push (serviço de push existente, categoria "Análise de Ativos" em Perfil › Notificações), GET /alertas e POST /alertas/lidos, segmento Listas | Alertas da página Salvos e "Alertas da lista" (switches), retenção 90 dias. Rode o job no banco local com dados de teste e desfaça. Escreva docs/analise-ativos/bloco1-salvos/ATIVACAO.md a partir de arquitetura.flags_e_ativacao (migration, cron, flags na ordem SALVOS → PDF → ALERTAS, cada escrita em prod com [OK], SQL de conferência só leitura, rollback; molde docs/analise-ativos/blocoD/ATIVACAO.md).' },
]

const devs = await parallel(FATIAS.map((f) => () => agent(`Você é o DEV da FATIA ${f.id} do bloco 1. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" de arquitetura.fatias em ${DESENHO}, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_do_desenho). Use os contratos, tipos, hooks, textos e componentes da fatia 0.
${f.extra}
Para UI, suba o dev server no seu worktree na porta ${f.porta} com as flags e pare ao terminar.
Commits atômicos na sua branch. Retorne o schema.`,
  { label: f.label, phase: 'Implementação', schema: DEV_SCHEMA, isolation: 'worktree' })))

const devOk = devs.map((d, i) => ({ fatia: FATIAS[i].id, ...(d || { erro: 'agente falhou' }) }))
log(`Implementação: ${devOk.map((d) => `${d.fatia}=${d.commits ? d.commits.length + ' commits' : 'FALHOU'}`).join(' · ')}`)

phase('Integração')
const INTEG_SCHEMA = { type: 'object', properties: {
  ok: { type: 'boolean' }, commits_integrados: { type: 'array', items: { type: 'string' } }, conflitos: { type: 'array', items: { type: 'string' } },
  checks: { type: 'string' }, e2e: { type: 'string' }, baselines: { type: 'string' }, runbook: { type: 'string' },
  problemas_abertos: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'e2e', 'baselines', 'runbook', 'problemas_abertos'] }
const integ = await agent(`Você é o INTEGRADOR do bloco 1. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já tem docs + fatia 0). Traga os commits com git cherry-pick, na ordem A, B, C, D, preservando mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_do_desenho, pendencias: d.pendencias, erro: d.erro })), null, 2)}
Resolva conflitos preservando a intenção (stubs da 0 são substituídos pela fatia dona). Garanta ponta a ponta: Quadro (marcador, filtros salvos) → ativo (Salvar) → Salvos (listas, abas, alertas) → Comparador (salvar, salvas, PDF); nenhum stub sobrou. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, variáveis dummy), rm -rf .next && npm run build e, com as flags, npx next start -p 3620 e os e2e (chromium, mobile, escrita — também têm de passar no CI: confira .github/workflows/ci.yml, as flags novas no job e o seed). BASELINES de desktop: se mudarem por motivo esperado da área (ex.: pílula Salvos), atualize UMA vez em COMMIT DEDICADO (nunca as -ci-); mudança fora da Análise é bug. Confira/complete docs/analise-ativos/bloco1-salvos/ATIVACAO.md. Correções de integração em commits "fix(analise-ativos): …" pequenos. Se uma fatia faltou, NÃO a implemente — registre. Não remova worktrees. Pare servidores.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA })
if (!integ) return { erro: 'integração falhou', devs: devOk }

phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base ${BASE} = main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, e2e: integ.e2e })}.
Salve evidências em ${QA_DIR}/. Reporte SÓ problemas reais com evidência reproduzível; estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills nem subagentes. Desfaça no banco local o que criar.`
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local; cp ${REPO}/next-env.d.ts . Suba o servidor com ${FLAGS}.`
const QAS = [
  { label: 'qa-telas', prompt: `Você é o QA DE TELAS (desktop + mobile). ${QA_BASE}
${PREP} Porta 3701 (build de produção se o dev travar). Compare com o protótipo ${PROTO} e a spec: 1440 e 390 (isMobile), claro e escuro. Fluxos: 1º Salvar cria "Salvos" + toast literal; 1 lista alterna; 2+ abre "Salvar em…" (popover / BottomSheet, voltar fecha o sheet); marcador na linha e no cartão do Quadro; Criar/renomear/apagar lista (nome repetido, limite); página Salvos (abas, colunas, remover + Desfazer, vazios, "antes N de 6"); Filtros salvos (salvar, aplicar, alterado → salvar alterações/como novo, apagar, ?filtro=); Comparador (Salvar comparação nos 2 lugares, Comparações salvas abrir/apagar, Exportar PDF baixa um PDF válido — abra o arquivo e confira que não tem posição/nome/e-mail e tem o aviso legal; emule iOS); Alertas (segmento, lista, marcar lidos, Alertas da lista, Perfil › Notificações); consultor agindo (tudo desabilitado com o texto, PDF ok); flags desligadas uma a uma escondem o que devem. Sem rolagem horizontal; alvos >= 44px; varra o DOM por palavras proibidas; console sem erros novos. Regressão: Quadro, ativo, Comparador, Cenários, Carteira. Screenshots ${QA_DIR}/qa-telas-*.png. Pare o servidor.` },
  { label: 'qa-codigo', prompt: `Você é o REVISOR DE CÓDIGO/SEGURANÇA/LGPD/COMPLIANCE (foco em bugs de correção). ${QA_BASE}
${PREP} Porta 3702. Revise o diff arquivo por arquivo: migration aditiva/segura; gate de TODA rota nova (sem flag → 404, sem cookie → 401, zod → 400, CSRF, consultor → 403/vazio); isolamento por userId (tente ler/alterar/apagar lista, item, filtro, comparação e alerta de OUTRO usuário via API — prove com curl); limites no servidor (20/200/500/20/30/10 por hora) inclusive sob corrida (2 POSTs simultâneos); PDF (sem dado pessoal, aviso legal, rate limit, entrada maliciosa no nome); job de alertas (dedupe por companhia, só eventos após o item salvo, resumo > 5, idempotente se rodar 2×, sem flag = pulado, sem N+1 caro); push com corpo genérico; LGPD (export traz tudo; exclusão apaga tudo incluindo Notification do tipo; retenção 90 dias); textos pelas varreduras; contratoSemNota; paleta. Rode o job no banco local com dados de teste e desfaça. Cada achado com arquivo:linha e cenário concreto. Pare o servidor.` },
]
const qas = await parallel(QAS.map((q) => () => agent(q.prompt, { label: q.label, phase: 'QA', schema: FINDINGS, isolation: 'worktree' })))
const todos = []
qas.forEach((r, i) => (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })))
const graves = todos.filter((a) => a.gravidade !== 'baixa')
log(`QA: ${todos.length} achados (${graves.length} alta/média)`)

let correcao = null, reverif = null
if (graves.length) {
  phase('Correções')
  correcao = await agent(`Você é o CORRETOR do bloco 1. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite o desenho, commit "fix(analise-ativos): …". Ao final: tsc, lint, vitest nos testes afetados, rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: { type: 'object', properties: {
      corrigidos: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, commit: { type: 'string' }, como: { type: 'string' } }, required: ['achado', 'commit', 'como'] } },
      rejeitados: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, motivo: { type: 'string' } }, required: ['achado', 'motivo'] } },
      checks: { type: 'string' } }, required: ['corrigidos', 'rejeitados', 'checks'] } })
  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(`Você é o QA de REVERIFICAÇÃO do bloco 1. ${REGRAS}
${PREP} Para cada correção, reproduza o cenário original e confirme a resolução sem regressão (390 e 1440 quando aplicável). Rode os e2e (chromium, mobile, escrita) contra build de produção (npm run build && flags + npx next start -p 3722). Desfaça o que criar. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`,
      { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' })
  }
}

return { fatia0: f0, devs: devOk, integracao: integ,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'), correcao, reverificacao: reverif }
