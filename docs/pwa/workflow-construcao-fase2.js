export const meta = {
  name: 'pwa-fase2-construcao',
  description: 'Fase 2 do PWA (Fluxo de caixa): contratos → 4 devs em worktrees → integração → QA mobile/desktop/código/segurança → correções → reverificação',
  phases: [
    { title: 'Contratos', detail: 'fatia 0 na branch feat/pwa-fase2-fluxo' },
    { title: 'Implementação', detail: 'fatias A, B, C, D em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, type-check, lint, testes, build, e2e' },
    { title: 'QA', detail: 'mobile, desktop, código e segurança em paralelo' },
    { title: 'Correções', detail: 'corretor aplica achados confirmados' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/pwa-fase2-fluxo'
const BASE = args.base
const QA_DIR = args.qaDir
const SPEC = `${REPO}/docs/pwa/fase2-spec-desenho.json`
const DEC = `${REPO}/docs/pwa/fase2-decisoes.md`
const PROTO = `${REPO}/docs/pwa/fase2-prototipo.html`

const REGRAS = `
REGRAS GERAIS (valem para todo agente):
- Repo: ${REPO} (Next.js 15, React 19, Tailwind v4, Prisma, React Query, Vitest, Playwright). Siga o CLAUDE.md do repo e as convenções do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100). Mutações do fluxo usam as MESMAS rotas/hooks do desktop (batch-update, comments, items, item/reorder, item/move, orcamento), csrfFetch e as mesmas invalidações; rota nova só a do lançamento rápido (zod + csrf + requireAuthWithActing). Não mude regras de cálculo, fórmulas, linhas derivadas nem a personalização clone-on-write.
- Contexto: PWA do My Finance. Fases 0 (casca, BottomSheet, Modal→sheet, ResponsiveTable) e 1 (Carteira: MobileEditSheet, MobileNumberField, MobileSaveToast, ResponsiveTabNav, CardSectionBand, useKeyboardInset, numberInput, helpers e2e mobileFit/desktopStructure) já estão na base. Esta é a FASE 2 (Fluxo de caixa). Leia docs/pwa/README.md.
- Especificação final: ${SPEC} (JSON: arquitetura.fatias[], componentes_compartilhados, lancamento_rapido, plano_qa, riscos; design.telas, design.especificacao_visual, design.acessibilidade; revisao.problemas). Protótipo visual: ${PROTO}. DECISÕES DO WELLINGTON: ${DEC} — PREVALECEM sobre a spec e o protótipo. Atenção às decisões que diferem do protótipo: linhas SEM valor no mês ficam ESCONDIDAS com "Mostrar N linhas sem valor"; Desfazer SÓ no lançamento rápido; situação = ponto colorido; ano inteiro só leitura. Leia os três antes de começar.
- Desktop (>= 1024px / lg) NÃO pode mudar. Tudo novo só abaixo de lg (lg:hidden, max-lg:, @media (width < 64rem), ou useIsBelowLg com fallback de servidor false).
- Cores: só a paleta My Finance (src/constants/brandColors.ts) + cinzas Tailwind + vermelho semântico #D92D20/#F97066; cores de situação escolhidas pelo usuário (CASHFLOW_COLOR_LEGEND) só no ponto. #0079F2 só em elemento não textual. Não altere brand-500.
- Commits: atômicos, em português no padrão do repo ("feat(pwa): ...", "test(pwa): ...", "refactor(pwa): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA git add -A / git add .). NUNCA push, PR, merge em main/feat/pwa-fase0, nem mexer em .claude/settings.local.json, .gitignore, docs/ ou arquivos não rastreados pré-existentes.
- Testes: vitest no repo inteiro é lento — rode só os arquivos relevantes (npx vitest run <caminhos>). 3 arquivos travam também na main: Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx — exclua-os. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Pre-commit roda eslint --fix + prettier.
- e2e: o CI usa banco do seed + build de produção (CI=true); o seed só tem o ano corrente e o anterior e hoje é 26/09/2026 (use ?mes=6 / "Mês anterior", nunca "Próximo" em dezembro). Testes novos precisam passar lá: nada de depender de dados do usuário demo do dev; screenshots só locais (test.skip(!!process.env.CI)). Lançamento rápido em e2e só até a PRÉVIA; edição em e2e restaura o valor original (serial).
- Processos: NÃO use "pkill -f" em comando encadeado (mata o shell). Guarde o PID e use kill <pid> em comando separado. Servidor em background via run_in_background.
- Playwright no WSL: import de ${REPO}/node_modules/playwright/index.mjs e chromium.launch({ executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' }); para npx playwright test use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_PORT. Receita de login na skill "verify".
- Banco de dev (Neon) é compartilhado. Usuários: usuario.demo@finapp.local / 123456 (cliente) e consultor.demo@finapp.local / 123456. QUALQUER edição feita em teste manual (valor, cor, comentário, nome, posição, meta) deve ser revertida ao original; lançamento rápido manual só com Desfazer em seguida e conferindo que voltou; nunca importar planilha de verdade (pare na prévia).
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) confira que o HEAD contém os commits da fatia 0 ("git log --oneline -8" e compare com "git -C ${REPO} log --oneline -8 ${BRANCH}"); se não contiver, rode "git checkout --detach ${BRANCH}" (o worktree pode ter nascido da main). (2) Ambiente: ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local (se existir); cp ${REPO}/next-env.d.ts . (sem ele o tsc acusa erros falsos). (3) git switch -c <nome-pedido> e commite nela. Informe no retorno o caminho do worktree (pwd), a branch e os SHAs.
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
const f0 = await agent(`Você é o DEV da FATIA 0 ("Contratos, extrações sem mudança de comportamento, primitivos e guardas") da fase 2 do PWA. ${REGRAS}
Trabalhe DIRETO em ${REPO}, que já está na branch ${BRANCH} (confira com git branch --show-current; se não estiver, pare e reporte). Implemente EXATAMENTE a fatia id "0" da spec (arquitetura.fatias), na ORDEM da spec: commit 1 = só a baseline desktop-fluxo.spec (estrutura local + ci, screenshots locais) sobre o código ATUAL (rode contra um dev server seu: npx next dev -p 3200); depois ajustes de e2e existentes; depois extrações (useCashflowView, useCashflowMutations, derivedIndices, itemCapabilities, monthParam, cashflowEvents, cellColor), primitivos (BottomSheet com pilha de camadas, MobileSaveToast com ação opcional, MonthStepper, ComponentCard.bodyClassName) e stubs de contrato (CashflowEditSheets, CashflowYearGridSheet) com os nomes exatos da spec. O desktop-fluxo.spec deve continuar verde depois de cada commit (rode de novo sem --update-snapshots ao final). EXCEÇÕES: não edite docs/ (o README fica comigo); siga ${DEC} (ex.: itemCapabilities já contempla "Gerida em Dívidas"). Rode tsc, eslint e os testes novos. Pare o servidor ao terminar. Commite em ${BRANCH}. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`, { label: 'dev-fatia-0-contratos', phase: 'Contratos', schema: DEV_SCHEMA })
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', f0 }
log(`Fatia 0 commitada: ${f0.commits.join(', ')}`)

// ---------------------------------------------------------------- Implementação
phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'pwa-fase2-a-visao-mes', label: 'dev-A-visao-mes', porta: 3201, extra: 'Inclui: página /fluxodecaixa abaixo de lg (h1 visível + ⋯, segmento Planilha|Orçamento, barra do mês FIXA com MonthStepper e ?mes=, altura/rolagem para o sticky funcionar), visão do mês (resumo, faixas nível 1/2/3 recolhíveis com subtotal, linhas com ponto de situação e "ano R$" desligável, linhas calculadas no lugar da planilha com sheet explicando a conta, Conta Corrente e Aporte/Resgate só leitura), LINHAS SEM VALOR ESCONDIDAS com "Mostrar N linhas sem valor" (decisão 1), menu ⋯ (ano inteiro, expandir/recolher, total do ano, importar), trocar de mês por setas/deslizar/sheet de 12 meses, estados vazio/carregando/erro e data-mf-fluxo-ready.' },
  { id: 'B', nome: 'pwa-fase2-b-edicao', label: 'dev-B-edicao', porta: 3202, extra: 'Inclui: sheet da célula (valor com teclado + barra de fórmula, situação, comentário, gráfico do ano), ações da linha (Renomear/porquê/nível, Mover cima/baixo/outra seção, Excluir com aviso de sem Desfazer; Dívidas sem Renomear/Excluir), ⋯ do grupo (adicionar linha, reordenar com setas + Concluir, recolher), falha = sheet aberto (inclusive results[i].success=false do batch-update). Aviso "Salvo" SEM Desfazer. Use as mutações extraídas na fatia 0 (useCashflowMutations) — mesmas rotas do desktop.' },
  { id: 'C', nome: 'pwa-fase2-c-lancamento', label: 'dev-C-lancamento', porta: 3203, extra: 'Inclui: serviço compartilhado extraído de services/assistente/lancamento.ts (aplicação SEM o token assinado; o assistente delega a ele e continua IGUAL — rode todos os testes de src/services/assistente e da rota do assistente), rota POST /api/cashflow/lancamento-rapido (zod, csrf, requireAuthWithActing, confirmar:false = prévia, somar × definir até "Até", recusa quando algum mês diminui sem confirmação, carimbo só com descrição, origem "(lançamento rápido)", devolve historicoId para o Desfazer) com Vitest cobrindo gravação e desfazer, e o sheet "Despesa ou receita" no + Lançar (LaunchSheet deixa de mostrar "Em breve"; abre em qualquer tela; prévia; confirmação de meses que diminuem; aviso com Desfazer via histórico; se estiver no Fluxo pula para o mês e pisca a linha; invalidação das queries do fluxo/orçamento). e2e só até a prévia.' },
  { id: 'D', nome: 'pwa-fase2-d-ano-orcamento', label: 'dev-D-ano-orcamento', porta: 3204, extra: 'Inclui: "Ano inteiro" em tela cheia SÓ LEITURA (itens fixos 128px, Total não fixo, mês atual marcado, toque no nome do mês → visão do mês), Orçamento vs Real no celular (mesmo mês da barra, Mês|Acumulado e Lançado|Consolidado, selos Dentro da meta/Atenção/Estourou com cortes <80/80–100/>100, avisos, categorias em lista com medidor e meta editável no sheet, rosca com legenda embaixo, orçado × real em barras horizontais) e Importar planilha no celular (tela cheia, 3 passos, mesmas chamadas do ImportPlanilhaModal; desktop do modal intocado).' },
]

const devs = await parallel(FATIAS.map((f) => () =>
  agent(`Você é o DEV da FATIA ${f.id} da fase 2 (Fluxo de caixa) do PWA. ${REGRAS} ${WT}
Nome da branch a criar: ${f.nome}.
Implemente EXATAMENTE a fatia id "${f.id}" da spec (arquitetura.fatias), respeitando a lista de arquivos dela — não toque em arquivo de outra fatia (se for inevitável, documente em desvios_da_spec). Use os contratos/stubs da fatia 0 com os nomes exatos (substitua o stub que for da sua fatia). Critérios de aceite obrigatórios; onde a spec contrariar ${DEC}, siga as decisões.
${f.extra}
Escreva o e2e mobile da sua fatia (arquivo próprio, como a spec define; cenários que dependem de outra fatia ficam com test.skip condicionado ao seletor, como a spec prevê). Suba o dev server no seu worktree (npx next dev -p ${f.porta}) e confira com Playwright a 390px e 320px (isMobile) e a 1280px (desktop inalterado) antes de commitar; salve screenshots em ${QA_DIR}/dev-${f.id}-*.png (crie a pasta). Pare o servidor ao terminar.
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
const integ = await agent(`Você é o INTEGRADOR da fase 2 (Fluxo de caixa) do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já contém a fatia 0). Traga os commits das 4 fatias com git cherry-pick, na ordem A, B, C, D, preservando os commits atômicos e as mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_da_spec, pendencias: d.pendencias, erro: d.erro })), null, 2)}
Se houver conflito, resolva preservando a intenção das duas fatias (leia a spec e as decisões) e registre. Depois: npx tsc --noEmit -p ., npm run lint, vitest nos testes tocados (git diff --name-only ${BASE}..HEAD | grep test, sem os 3 que travam) + todos de src/services/assistente e src/app/api/assistente (o assistente não pode quebrar), rm -rf .next && npm run build e, com npx next start -p 3210, os e2e mobile/desktop (e2e/mobile-*.spec.ts, e2e/desktop-*.spec.ts) — pare o servidor ao terminar. Os e2e que ficaram com skip por dependerem de outra fatia devem RODAR agora; corrija o que for de integração. Commits "fix(pwa): ..." pequenos. Se uma fatia faltou (agente falhou), NÃO a implemente — registre em problemas_abertos. Não remova os worktrees.`, { label: 'integrador', phase: 'Integração', schema: INTEG_SCHEMA })
if (!integ) return { erro: 'integração falhou', devs: devOk }

// ---------------------------------------------------------------- QA
phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base: commit ${BASE}, fim da fase 1). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Relatório da integração: ${JSON.stringify({ problemas_abertos: integ.problemas_abertos, checks: integ.checks })}.
Salve evidências em ${QA_DIR}/ (crie a pasta). Reporte SÓ problemas reais com evidência reproduzível; preferência de estilo nunca é alta. NÃO edite nem commite código.`

const PREP = `Você está num worktree isolado; ele pode ter nascido da main: rode "git checkout --detach ${BRANCH}" e confira com git log -1. Prepare ln -s ${REPO}/node_modules node_modules, cp ${REPO}/.env .env, cp ${REPO}/.env.local .env.local, cp ${REPO}/next-env.d.ts .`

const QAS = [
  { label: 'qa-mobile', isolation: 'worktree', prompt: `Você é o QA FUNCIONAL MOBILE. ${QA_BASE}
${PREP}. Invoque a skill "verify" (ferramenta Skill). Faça npm run build && npx next start -p 3301.
Com Playwright (390x844 e 320x568, isMobile, hasTouch), logado como usuario.demo, percorra o Fluxo contra o protótipo (${PROTO}) e as decisões (${DEC}):
- /fluxodecaixa: h1 visível, barra do mês fixa ao rolar, trocar de mês (setas, sheet dos 12 meses, ?mes=), nada passa de 390px sem corte; resumo do mês; faixas recolhíveis com subtotal; linhas sem valor escondidas + "Mostrar N"; ponto de situação; linhas calculadas abrem explicação; Aporte/Resgate só leitura;
- edição: valor com teclado e fórmula (=100+50 mostra 150,00), situação, comentário; salvar mostra "Salvo" e atualiza; simule falha (route abort) e confira sheet aberto com erro; Renomear, Mover (cima/baixo/outra seção), Reordenar com setas, Adicionar linha, Excluir (numa linha que você mesmo adicionou) — REVERTA tudo ao original;
- Dívidas sem Renomear/Excluir; ano inteiro só leitura, toque no mês volta à visão do mês;
- Orçamento: selos, avisos, meta no sheet (restaure), Mês/Acumulado, Lançado/Consolidado, barras horizontais a 320px;
- + Lançar → Despesa ou receita em outra tela (ex.: /carteira) e no Fluxo: prévia, "todo mês" com meses que diminuem exigindo confirmação, lançar UM valor pequeno e usar o Desfazer do aviso, conferindo que a célula voltou;
- Importar: abrir, escolher arquivo não é obrigatório — confira os passos e feche sem importar;
- modo escuro; console sem erros novos; rode os e2e mobile/desktop da branch contra o 3301 e reporte.
Pare o servidor (kill do PID em comando separado) ao terminar.` },
  { label: 'qa-desktop', isolation: 'worktree', prompt: `Você é o QA DE REGRESSÃO DESKTOP. ${QA_BASE}
Objetivo: provar que o computador NÃO mudou. ${PREP}. Crie um SEGUNDO worktree da base: git worktree add ${QA_DIR}/qa-base ${BASE} (mesmo preparo). Suba os dois com next dev (base 3311, branch 3312), um de cada vez se a memória apertar.
Com Playwright a 1280x800, 1366x900 e 1024x768 (sem isMobile), logado como usuario.demo, capture ANTES e DEPOIS de: /fluxodecaixa (planilha expandida e recolhida, modo edição de um grupo aberto e CANCELADO, modal de comentário aberto e fechado, modal Importar aberto e fechado pelo botão), /fluxodecaixa?modo=orcamento (Mês, Acumulado, Consolidado), e confira que o + Lançar / sheets novos NÃO existem no desktop. Compare pixel a pixel (mascarando só números) e visualmente lendo as imagens. Confira 1023px (deve virar celular). Salve pares em ${QA_DIR}/desk-antes-*.png e desk-depois-*.png. Ao terminar pare os servidores e remova o worktree da base (git worktree remove --force ${QA_DIR}/qa-base).` },
  { label: 'qa-codigo', prompt: `Você é o REVISOR DE CÓDIGO (nível alto, foco em bugs de correção). ${QA_BASE}
IMPORTANTE: NÃO invoque a skill "code-review" nem subagentes — na fase 1 ela rodou em segundo plano e o resultado se perdeu. Faça você mesmo a revisão lendo o diff ${BASE}..${BRANCH} arquivo por arquivo. Foque: mutações do celular iguais às do desktop (mesmas rotas, payload, invalidações; results[i].success do batch-update; personalização clone-on-write: o id da linha muda depois da 1ª edição de template), fórmulas e parse de número (milhar "1.234", vírgula, "−"), serviço extraído do assistente (comportamento idêntico para o assistente; somar × definir; meses que diminuem; carimbo só com descrição; recordChange e desfazer), cálculo do mês/linhas derivadas sem duplicar lógica, hidratação SSR × client (?mes, breakpoint), listeners/timers sem cleanup, pilha de camadas do BottomSheet (Esc/Tab), classes que vazam para o desktop, testes frágeis ou dependentes de dados do dev. Cada achado com arquivo:linha e cenário concreto.` },
  { label: 'qa-seguranca', prompt: `Você é o REVISOR DE SEGURANÇA. ${QA_BASE}
NÃO invoque skills nem subagentes; revise você mesmo o diff. Foque: rota POST /api/cashflow/lancamento-rapido (auth, requireAuthWithActing e escopo do targetUserId — um usuário não pode lançar em item de OUTRO usuário; validação zod; limites de valor/mês/ano; csrf; rate/abuso), serviço extraído do assistente (o assistente continua exigindo token assinado; nenhuma porta aberta para aplicar proposta sem assinatura por outra rota), mutações novas sem csrfFetch, comentário/descrição (XSS ao renderizar; dangerouslySetInnerHTML), ?mes e ?modo (injeção), dados do consultor personificando, localStorage com dado financeiro. Cada achado com arquivo:linha e cenário.` },
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
  correcao = await agent(`Você é o CORRETOR da fase 2 (Fluxo de caixa) do PWA. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Abaixo estão os achados de gravidade alta/média dos QAs. Para CADA um: primeiro CONFIRME que é real (leia o código, reproduza quando possível); se não for, rejeite com motivo. Se for, corrija do jeito mais simples que respeite a spec e as decisões, com commit "fix(pwa): ..." (achados relacionados podem ir juntos). Não trate os de gravidade baixa. Ao final: npx tsc --noEmit -p ., npm run lint, vitest nos testes afetados (+ src/services/assistente) e rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 2)}`, { label: 'corretor', phase: 'Correções', schema: FIX_SCHEMA })

  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(`Você é o QA de REVERIFICAÇÃO da fase 2 (Fluxo de caixa) do PWA. ${REGRAS}
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