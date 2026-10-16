export const meta = {
  name: 'analise-v25-regras-pedro-construcao',
  description: 'Análise v2.5: regras como a spec do Pedro + camada de fontes p/ provedor pago — fatia 0 → A/B/C em worktrees → integração → QA → correções → reverificação',
  phases: [
    { title: 'Fundação', detail: 'fatia 0 (contratos) na branch feat/analise-ativos-v25-regras-pedro' },
    { title: 'Implementação', detail: 'fatias A (fontes/motor/jobs), B (telas de leitura), C (Carteira) em worktrees' },
    { title: 'Integração', detail: 'cherry-pick 0 | A, B, C; checks; build; e2e; baselines' },
    { title: 'QA', detail: 'telas (desktop+mobile) e dados+código+compliance' },
    { title: 'Correções' },
    { title: 'Reverificação' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/analise-ativos-v25-regras-pedro'
const BASE = args.base
const QA_DIR = args.qaDir
const DESENHO = `${REPO}/docs/analise-ativos/v25-regras-pedro/desenho.json`
const PEDRO = `${REPO}/docs/analise-ativos/spec-v2-pedro-out2026`
const FLAGS = 'ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true ANALISE_ATIVOS_RAIOX_HABILITADO=true ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_CENARIOS_HABILITADO=true'

const REGRAS = `
REGRAS GERAIS (todo agente):
- Repo ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma 6, React Query, Vitest, Playwright). Siga CLAUDE.md e o estilo do código ao redor. Hoje é 15/10/2026. Mutações usam csrfFetch; depois de mutação de carteira, invalidatePortfolioDerivedQueries.
- FEATURE v2.5 da Análise de Ativos: as REGRAS dos Filtros de Fundamentos voltam a ser O MAIS PRÓXIMO POSSÍVEL da spec do Pedro (${PEDRO}/especificacao-v2.txt §3.2, §4.1, §4.4, §5, §6; HTML ${PEDRO}/prototipo-pedro-v2.html), ignorando a limitação de dados grátis, e a área fica PREPARADA para um provedor de dados pago (contratar = conector + env + nova criteria_params, SEM migration). Diretriz do dono (Wellington) de 15/10.
- DESENHO FINAL APROVADO: ${DESENHO} — chave "final" (resumo, mudancas_por_item, camada_fontes, migrations, fatias[] com escopo/arquivos/testes, ativacao_prod, riscos) e "achados" (revisão já incorporada). É a fonte da verdade; siga-o.
- DECISÕES DO WELLINGTON sobre as dúvidas do desenho (15/10), todas = recomendação: (1) mostrar no card "Na sua carteira" a linha informativa "Objetivo na aba ‹Aba› da Carteira: X%" quando houver Objetivo > 0; o alvo novo (planning_asset_targets, % da carteira TOTAL) fica só na Análise nesta rodada (não aparece na tela de Planejamento). (2) Registrar operação com seção automática + linha discreta "Na Carteira: Ações · Value (dá para mover depois)" + link "abrir o formulário completo". (3) FCL de financeiras calculado (literal da spec); religável por parâmetro. (4) Séries mensais/trimestrais → valor do ano = ÚLTIMO período do ano (criteria_params.fontes.agregacaoAnual='ultimo', configurável). Financeiras = "n de 6" (naoSeAplica vazio por padrão, religável por params). 
- FORA DE ESCOPO (não mexer): Ranking/votos/teses públicas, Stocks/REITs, Salvos/Criar lista/Salvar, Comunidade, D6 (banco do score), flags COMPARADOR/CENARIOS. Não implementar conector pago real — só a interface, a CVM como implementação e um conector de EXEMPLO bloqueado em produção para os testes.
- Compliance: nenhuma resposta de /api/analise-ativos/* com chave/texto de índice/nota/semáforo/destaque (teste contratoSemNota); textos só dos arquivos de textos e passando pela varredura linguagemV2 (proibidas: barato/caro/preço justo/preço-alvo/recomend*/nota/vencedor/melhor/pior/compre/faltam…); ✓/— neutros, nunca verde/vermelho. Nenhuma rota chama terceiros na requisição.
- MIGRATION: só ADITIVA (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, FK em DO $$ … EXCEPTION). O banco de dev (Neon) tem schema drift: NÃO use "prisma migrate dev/deploy" no dev. Padrão do repo: SQL em prisma/migrations/<ts>_analise_ativos_fontes_alvos/migration.sql + scripts/analise-ativos/apply-migration-fontes-alvos.ts (molde: apply-migration-filtros.ts) rodado UMA vez no dev; depois npx prisma generate. criteria_params v2 semeada no dev com seed-criteria-params.
- Cores: só paleta My Finance (src/constants/brandColors.ts) + cinzas do app; dark mode obrigatório; TABLE_STYLES; controles com min-h-11 (44px) em qualquer largura; BottomSheet + useMobileHistoryLayer no celular.
- Commits atômicos em português ("feat(analise-ativos): …", "fix(…)", "test(…)", "refactor(…)"), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA -A/.). NUNCA push/PR/merge, nunca mexer em .claude/settings.local.json, .gitignore, arquivos não rastreados pré-existentes, nem docs fora de docs/analise-ativos/v25-regras-pedro/ e docs/analise-ativos/spec-v2-pedro-out2026/ATIVACAO*.md. NUNCA tocar produção (ssh/Lightsail/banco de prod).
- Testes: não rode o vitest do repo inteiro; rode os arquivos relevantes. Testes que importam o prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Mock de rota: vi.hoisted + mock de requireAuthWithActing (src/test/mocks). Os casos 24–33 da §4.5 (casos45.test.ts etc.) têm de passar com a v2 (e os que mudam de base pela spec — caso 33 na base da carteira total — com os números ORIGINAIS da spec).
- Dev server: rode com ${FLAGS} no ambiente; admin.demo@finapp.local / 123456; consultor.demo@finapp.local / 123456; usuario.demo@finapp.local / 123456. Depois de prisma generate, REINICIE o dev server. Dev server frio dá timeout: aqueça as páginas antes do Playwright. NÃO use "pkill -f" encadeado (mata o shell); guarde o PID e kill <pid> em comando separado.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs, chromium.launch() (fallback executablePath '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'); waitUntil:'load' + espera fixa; seções da página do ativo são lazy (content-visibility) — role até o card montar (helper e2e/helpers/secaoPreguicosa.ts). Esconda .tsqd-parent-container.
- e2e: CI = banco do seed + build de produção (CI=true); o seed precisa trazer o que os testes usam (criteria_params v2). O que grava (alvo, operação) vai em *.escrita.spec.ts e DESFAZ o que gravou. Baselines de e2e/desktop-*.spec.ts-snapshots: só o integrador atualiza, uma vez, em commit dedicado, e nunca as -ci-.
- Banco de dev (Neon) é compartilhado: desfaça/apague alvos, operações e planejados criados em teste manual.
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) "git checkout --detach ${BRANCH}" e confira com "git log --oneline -5" que os commits da fatia 0 estão lá. (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts . (o prisma client já foi gerado pela fatia 0). (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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
const f0 = await agent(`Você é o DEV da FATIA 0 ("Contratos", bloqueante) da v2.5. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" de final.fatias em ${DESENHO}: schema aditivo + migration + apply-migration (rode no dev) + prisma generate; tipos; criteria_params v2 (com o alias legado→spec no parse, a v1 continua válida) + CRITERIA_PARAMS_CODIGO; resolvedor puro de séries; leitura dos pontos; TODOS os textos (congelados para as fatias); seed da v2 no dev e no seed do CI; e os stubs/assinaturas FINAIS para o que A, B e C preenchem. ANTES de terminar, cruze os arquivos das fatias A, B e C do desenho e reporte interseções em pendencias (resolva no contrato se puder). Nesta fatia a tela não precisa mudar. Testes vitest da fatia; tsc; eslint. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0', phase: 'Fundação', schema: DEV_SCHEMA })
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 }
log(`Fatia 0: ${f0.commits.length} commits`)

phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'v25-a-fontes-motor', label: 'dev-A-fontes-motor', porta: 0,
    extra: 'Camada de fontes (registro, fonteCvm incluindo vacancy_physical, fonteExemplo bloqueada em prod, sanidade §6 configurável, ingestão point-in-time, aprovar/rejeitar ponto via caso de curadoria), motor de critérios com a v2 (financeiras n de 6, lucro descontado com fallback por janela + obs, alavancagem leverage_pct, rendimento income_per_share com fallback de proventos, vac/inad/ltv ativos, agregação anual "ultimo"), job criterios lendo a v2 quando vigente, job fontes-fundamentos no catálogo (sem cron), relatorio-criterios com a v2. TESTES: casos45 com v1 e v2; testes de resolvedor/prioridade/sanidade com a fonte de exemplo (provedor sobrepõe CVM; pending não aparece; variação > 40% vai para revisão). Rode no dev: job criterios --sem-aplicar com a v2 e o relatorio; salve em ' + QA_DIR + '/relatorio-criterios-v2-dev.txt e compare com a v1 (financeiras n de 6; FIIs de tijolo com vacância avaliada; luc com obs de fallback).' },
  { id: 'B', nome: 'v25-b-telas-leitura', label: 'dev-B-telas', porta: 3602,
    extra: 'Telas de leitura conforme o desenho: Quadro (Tipo só Tijolo/Papel, FoF/Híbrido no segmento, chips todos ativos com o par de papel em cinza, ?criterios=vac preservado, explicação nova sem n de 3), Comparador e Pares com rótulos da v2, página do ativo: card Critérios (n de 6 em financeiras, sem a nota da janela 10 de FII, obs de fallback do lucro no tooltip), Essencial com as 14 colunas da §3.2 também em financeiras ("Lucro descontado"/"Margem descontada" com tooltip quando cai no lucro líquido; "—" com tooltip sem dado), chip "Dív. líq./EBITDA < 3×", "Alavancagem ≤ 20% do PL". Confira com Playwright a 390 e 1440, claro e escuro (WEGE3, ITUB4, ITSA4, BBSE3, HGLG11, KNCR11, MXRF11), screenshots em ' + QA_DIR + '/dev-B-*.png.' },
  { id: 'C', nome: 'v25-c-carteira', label: 'dev-C-carteira', porta: 3603,
    extra: 'Carteira conforme o desenho: tabela planning_asset_targets (rota /api/analise-ativos/alvos/[ticker] GET/PUT/DELETE com zod, CSRF, consultor com log), serviço, overlay; export LGPD (/api/profile/export) e exclusão de conta incluem os alvos; ModalPlanejar da spec ("Peso-alvo na carteira (%)" em branco com placeholder "ex.: 5", classe no Planejamento, posição atual, resumo ao vivo, Salvar no Planejamento / Remover do plano, chip Planejado), card "Na sua carteira" na base TOTAL + linha informativa do Objetivo da aba (decisão 1); ModalRegistrarOperacao da spec (operação, quantidade, preço pré-preenchido, data, corretora, resumo ao vivo: total, nova posição, novo PM) com seção automática + linha "Na Carteira: … (dá para mover depois)" + link "abrir o formulário completo" (decisão 2); ModalVerNaCarteira com o alvo planejado e desvio. Caso 33 com os números originais da spec. e2e *.escrita.spec.ts: planejar/remover alvo, compra de ação nova (Value), compra de FII de papel (TVM), venda — DESFAZENDO tudo. Confira com Playwright a 390 e 1440, screenshots em ' + QA_DIR + '/dev-C-*.png.' },
]

const devs = await parallel(FATIAS.map((f) => () => agent(`Você é o DEV da FATIA ${f.id} da v2.5. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" de final.fatias em ${DESENHO}, respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se inevitável, documente em desvios_do_desenho). Use os contratos, tipos e textos da fatia 0.
${f.extra}
${f.porta ? `Para UI, suba o dev server no seu worktree na porta ${f.porta} com as flags e pare ao terminar.` : ''}
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
const integ = await agent(`Você é o INTEGRADOR da v2.5. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já tem docs + fatia 0). Traga os commits com git cherry-pick, na ordem A, B, C, preservando mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_do_desenho, pendencias: d.pendencias, erro: d.erro })), null, 2)}
Resolva conflitos preservando a intenção (stubs da 0 são substituídos pela fatia dona). Garanta ponta a ponta: Quadro → página do ativo (critérios, Essencial) → Planejar/Ver/Registrar; nenhum stub sobrou; nenhum import estático de CRITERIA_PARAMS_V1 fora de params/ e testes. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, variáveis dummy), rm -rf .next && npm run build e, com as flags, npx next start -p 3610 e os e2e (chromium, mobile, escrita, nessa ordem; também têm de passar no CI — confira .github/workflows e o seed). BASELINES de desktop: se mudarem por motivo esperado da área, atualize UMA vez em COMMIT DEDICADO (nunca as -ci-); mudança fora da Análise é bug. Escreva docs/analise-ativos/spec-v2-pedro-out2026/ATIVACAO-v25.md a partir de final.ativacao_prod (cada escrita em prod com [OK], dry-run antes, SQL de conferência só leitura, rollback). Correções de integração em commits "fix(analise-ativos): …" pequenos. Se uma fatia faltou, NÃO a implemente — registre. Não remova worktrees. Pare servidores.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA })
if (!integ) return { erro: 'integração falhou', devs: devOk }

phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base ${BASE} = main). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks, e2e: integ.e2e })}.
Salve evidências em ${QA_DIR}/. Reporte SÓ problemas reais com evidência reproduzível; estilo nunca é alta. NÃO edite nem commite código. NÃO invoque skills de revisão nem subagentes. Desfaça no banco de dev o que criar.`
const PREP = `Você está num worktree isolado; rode "git checkout --detach ${BRANCH}" e confira com git log -1. ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts . Suba o servidor com ${FLAGS}.`
const QAS = [
  { label: 'qa-telas', isolation: 'worktree', prompt: `Você é o QA DE TELAS (desktop + mobile). ${QA_BASE}
${PREP} Porta 3701 (build de produção se o dev travar). Compare com a spec do Pedro (${PEDRO}) e o desenho: 1440 e 390 (isMobile), claro e escuro. Quadro (Tipo Tijolo/Papel, chips de FII todos ativos com par cinza, ?criterios=vac, contagem, A–Z, vazio); página de WEGE3, ITUB4, BBAS3, ITSA4, BBSE3 (n de 6; Essencial 14 colunas; Lucro descontado com tooltip), HGLG11, KNCR11, MXRF11 (vacância avaliada, inad/LTV sem dado, sem nota de 2016), chip "Dív. líq./EBITDA < 3×", "Alavancagem ≤ 20% do PL"; Planejar (campo em branco, resumo ao vivo, salvar, chip Planejado, remover, linha do Objetivo da aba), Ver na Carteira, Registrar (compra nova de ação → Value, FII papel → TVM, linha "Na Carteira", link formulário completo, venda) conferindo /carteira e DESFAZENDO tudo; consultor agindo com aviso. Sem rolagem horizontal; alvos >= 44px; ✓/— sem verde/vermelho; varra o DOM por palavras proibidas; console sem erros novos. Regressão: Raio-X, Comparador, Carteira. Screenshots ${QA_DIR}/qa-telas-*.png. Pare o servidor.` },
  { label: 'qa-dados-codigo', isolation: 'worktree', prompt: `Você é o QA DE DADOS + REVISOR DE CÓDIGO/SEGURANÇA/LGPD/COMPLIANCE (foco em bugs de correção). ${QA_BASE}
${PREP} (1) Read-only via prisma/tsx no dev: recalcule À MÃO com a v2 os 6 critérios (janelas 3/5/10) de WEGE3, ITUB4, BBAS3, ITSA4, BBSE3, HGLG11, KNCR11, MXRF11 e compare com criteria_eval/Quadro/API (porta 3702). (2) Casos 24–33 da §4.5 com a v2 (caso 33 na base total, números originais). (3) Camada de fontes: com a fonte de EXEMPLO, prove que provedor sobrepõe CVM sem migration, que pending/rejeitado não aparece, sanidade >40% → revisão, fonte de exemplo bloqueada em prod. (4) Revise o diff arquivo por arquivo: migration aditiva/segura (IF NOT EXISTS, sem lock longo), gate de toda rota nova (flag/beta → 404, sem cookie 401, zod 400, CSRF), alvos isolados por usuário e consultor via requireAuthWithActing com log, LGPD (export e exclusão incluem alvos), Registrar (payloads corretos de /api/carteira/operacao e /resgate, seção automática correta, sem dupla submissão, invalidação), alias legado→spec cobrindo TODAS as leituras (params, criteria_eval v1, MarcaCompacta — grep por 'dlEbitda'/'margemLiquida' e afins), contratoSemNota, linguagemV2, paleta. Cada achado com arquivo:linha e cenário concreto. Tabela esperado×obtido em ${QA_DIR}/qa-dados.md. Pare o servidor.` },
]
const qas = await parallel(QAS.map((q) => () => agent(q.prompt, { label: q.label, phase: 'QA', schema: FINDINGS, isolation: q.isolation })))
const todos = []
qas.forEach((r, i) => (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })))
const graves = todos.filter((a) => a.gravidade !== 'baixa')
log(`QA: ${todos.length} achados (${graves.length} alta/média)`)

let correcao = null, reverif = null
if (graves.length) {
  phase('Correções')
  correcao = await agent(`Você é o CORRETOR da v2.5. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média abaixo: CONFIRME que é real (leia o código, reproduza); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite o desenho e a spec, commit "fix(analise-ativos): …". Ao final: tsc, lint, vitest nos testes afetados, rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`,
    { label: 'corretor', phase: 'Correções', schema: { type: 'object', properties: {
      corrigidos: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, commit: { type: 'string' }, como: { type: 'string' } }, required: ['achado', 'commit', 'como'] } },
      rejeitados: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, motivo: { type: 'string' } }, required: ['achado', 'motivo'] } },
      checks: { type: 'string' } }, required: ['corrigidos', 'rejeitados', 'checks'] } })
  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(`Você é o QA de REVERIFICAÇÃO da v2.5. ${REGRAS}
${PREP} Porta 3721. Para cada correção, reproduza o cenário original e confirme a resolução sem regressão (390 e 1440 quando aplicável). Rode os e2e (chromium, mobile, escrita) contra build de produção (npm run build && flags + npx next start -p 3722). Desfaça o que criar. Reporte só o que continua quebrado ou quebrou. Pare os servidores.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 2)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 2)}`,
      { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' })
  }
}

return { fatia0: f0, devs: devOk, integracao: integ,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'), correcao, reverificacao: reverif }
