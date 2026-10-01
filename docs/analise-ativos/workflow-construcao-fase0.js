export const meta = {
  name: 'analise-ativos-fase0-construcao',
  description: 'Análise de Ativos — Fase 0 (Fundação de dados): arquitetura → contratos → 5 devs em worktrees → integração + backfill dev → QA dados/código/segurança/operação → correções → reverificação',
  phases: [
    { title: 'Arquitetura', detail: 'arquiteto escreve a spec fatiada; revisor crítico ajusta' },
    { title: 'Contratos', detail: 'fatia 0: schema, migration, tipos, ScoringParams' },
    { title: 'Implementação', detail: 'fatias A-E em worktrees paralelos' },
    { title: 'Integração', detail: 'cherry-pick, checks, build, backfill no banco dev' },
    { title: 'QA', detail: 'dados, código, segurança, operação' },
    { title: 'Correções', detail: 'corretor confirma e corrige' },
    { title: 'Reverificação', detail: 'confere as correções' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/analise-ativos-fase0'
const BASE = args.base
const DIR = `${REPO}/docs/analise-ativos`
const OUT = `${DIR}/fase0`
const SPEC = `${OUT}/spec-fase0.json`

const REGRAS = `
REGRAS GERAIS (todo agente):
- Repo ${REPO} (Next.js 15, React 19, TypeScript strict, Prisma 6, Postgres, Vitest). Siga o CLAUDE.md e o estilo do código ao redor (Prettier: semi, singleQuote, trailingComma all, printWidth 100; comentários e nomes de domínio em português como no resto do repo). Hoje é 30/09/2026.
- Projeto: nova área "Análise de Ativos". Esta é a FASE 0 = FUNDAÇÃO DE DADOS, SEM TELA: tabelas, ingestão (CVM + B3), regras de sanidade, cálculos (per-share, múltiplos, Índice MF, semáforo, fórmulas do Valuation), jobs cron e backfill. Classes: Ações B3 e FIIs (Stocks/REITs só deixam campos prontos: source/sourceConcept/accession).
- LEIA ANTES: ${DIR}/decisoes-fase0.md (DECISÕES — prevalecem sobre tudo), ${DIR}/fase-a/RELATORIO-FASE-A.md (§4 regras de sanidade = testes obrigatórios com os casos reais; §5 modelo e jobs propostos), ${DIR}/especificacao-v1.3.txt (§4 regras de negócio, §4.6 os 23 casos de teste do Valuation, §5, §6), e os relatórios por papel em ${DIR}/fase-a/*.md. Os spikes em scripts/analise-ativos/spike-*.ts mostram parsing que já funcionou (reaproveite a lógica, não os arquivos).
- NOMES: tabelas com prefixo Asset*/Fii*/Cvm*/Analise*/Scoring* e @@map snake_case; rotas /api/cron/analise-ativos/*; serviços em src/services/analiseAtivos/. NÃO use /api/analises (já existe) nem altere o comportamento de telas/serviços existentes (Carteira, Proventos, asset_price_history, dividendService). Os bugs do app atual (preço D-1, dataCom=ex) NÃO são corrigidos nesta fase.
- RESTRIÇÕES DE OPERAÇÃO (medidas): produção roda num Lightsail com 1,9 GB de RAM compartilhada com o app → todo job de cron processa só o ano/mês corrente em STREAMING (zip → linhas, filtrando cedo), pico < 300 MB de RSS e < 4 min (o cron chama por curl -m 300). Backfill histórico é SCRIPT (scripts/analise-ativos/backfill-*.ts, dry-run por padrão, --apply explícito, idempotente, retomável), nunca cron. Downloads só de dados.cvm.gov.br e b3.com.br/bvmf (allowlist), com timeout, limite de tamanho e validação de cabeçalho do CSV (layout mudou em 2021 e ago/2025: se mudar, falha alto).
- BANCO: o .env aponta para o Neon de DEV (118 MB hoje; mantenha o banco dev < 450 MB no total). Escrita no dev só em tabelas NOVAS desta fase. NUNCA acessar produção/Lightsail (nem ssh). Migration só na fatia 0 (aditiva: novas tabelas + colunas opcionais em Asset); nenhuma outra fatia cria migration — precisou mudar schema? registre em pendencias.
- Regras de cálculo = funções puras sem I/O (src/services/analiseAtivos/regras/**), cobertas por Vitest com os CASOS REAIS do relatório §4 (ex.: WEGE3 2016 = 1.614,4 mi ações; BBAS3 3T25 controladora=0; PETR4 2024 payout ≈ 274%) e os 23 casos da §4.6 (tolerância 0,005 em R$, 0,5 em % inteiro). Três estados explícitos: ausente ≠ zero ≠ "não se aplica" (nunca comparar null direto). Todo limiar vem de ScoringParams (JSON validado por zod), versão 1 = valores da spec ajustados pelas decisões.
- Commits: atômicos, em português no padrão do repo ("feat(analise-ativos): ...", "test(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". git add com caminhos explícitos (NUNCA -A / .). NUNCA push, PR, merge, nem mexer em .claude/, .gitignore, docs/ fora de ${OUT}/, ou arquivos não rastreados pré-existentes. NUNCA tocar em /etc/ ou produção; linhas novas de cron entram só no template infra/modules/lightsail/provision.sh.tftpl (aplicar em prod é passo humano).
- Testes: vitest do repo inteiro é lento — rode só os arquivos relevantes (npx vitest run <paths>). Testes que importam o prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy. Antes de commitar: npx tsc --noEmit -p . e npx eslint nos arquivos tocados. Fixtures de teste = trechos PEQUENOS de CSV real (< 50 KB cada) em __tests__/fixtures/.
- Processos: não use "pkill -f" encadeado; guarde o PID e mate em comando separado.
`

const WT = `
VOCÊ ESTÁ NUM GIT WORKTREE ISOLADO. Antes de tudo: (1) git checkout --detach ${BRANCH} e confira com git log --oneline -5 que os commits da fatia 0 estão lá. (2) ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/.env.local .env.local 2>/dev/null; cp ${REPO}/next-env.d.ts . 2>/dev/null. NÃO rode prisma generate nem migrate (o client já foi gerado pela fatia 0 no node_modules compartilhado). (3) git switch -c <branch-pedida> e commite nela. Retorne o caminho (pwd), a branch e os SHAs.
`

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    worktree: { type: 'string' }, branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    arquivos: { type: 'array', items: { type: 'string' } },
    testes: { type: 'string' },
    medicoes: { type: 'string', description: 'tempo/memória/linhas medidos ao rodar jobs/scripts' },
    desvios_da_spec: { type: 'array', items: { type: 'string' } },
    pendencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['worktree', 'branch', 'commits', 'arquivos', 'testes', 'desvios_da_spec', 'pendencias'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    achados: { type: 'array', items: { type: 'object', properties: {
      gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      categoria: { type: 'string' }, descricao: { type: 'string' }, evidencia: { type: 'string' },
      reproducao: { type: 'string' }, sugestao: { type: 'string' } },
      required: ['gravidade', 'categoria', 'descricao', 'evidencia', 'reproducao', 'sugestao'] } },
    evidencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'achados', 'evidencias'],
}

// ---------------- Arquitetura ----------------
phase('Arquitetura')
const arq = await agent(
  `Você é o ARQUITETO da Fase 0 da Análise de Ativos. ${REGRAS}
Leia os documentos citados e o código existente relevante (prisma/schema.prisma; src/services/pricing/{cotahistB3Parser,cvmFundSync,dividendService,brapiSync}.ts; src/app/api/cron/**; src/utils/cron* ou requireCronSecret; src/services/calendario/fontes/*; infra/modules/lightsail/provision.sh.tftpl; scripts/backfill-cotahist-b3.ts; scripts/analise-ativos/spike-*.ts). NÃO escreva código de produção.
Escreva ${SPEC} (JSON) com: "modelo" (cada model Prisma completo: campos, tipos, chaves únicas, índices, @@map — partindo da proposta §5 do relatório, corrigindo o que achar errado e justificando; inclua as colunas novas de Asset), "contratos" (tipos TS compartilhados, assinatura das funções puras por módulo, formato do ScoringParams v1 com TODOS os valores preenchidos — spec §4 + decisões), "fatias" (exatamente 0, A, B, C, D, E; cada uma com objetivo, arquivos que CRIA/ALTERA — DISJUNTOS entre fatias A-E —, testes obrigatórios com casos reais, critérios de aceite, comandos de verificação), "backfill" (ordem, scripts, subconjunto para o banco dev caber em < 450 MB: estime linhas/bytes por tabela; ex.: AssetStatementLine só para ~40 companhias no dev), "jobs" (rota, horário UTC, limites de memória/tempo, idempotência, alertas via AnaliseJobRun) e "riscos".
Distribuição sugerida (ajuste se precisar, mantendo 5 fatias paralelas com arquivos disjuntos): 0 = schema+migration+contratos+ScoringParams v1 (seed); A = ações CVM (FCA/DFP/ITR/FRE → CvmCompany, AssetFundamentalsPeriod, AssetStatementLine, AssetShareCount; regras §4.2 10-15,18,19; cron cvm-cias; backfill); B = FIIs CVM (FiiTickerMap, FiiMonthly, FiiQuarterly, tipo com histerese; regras §4.3; crons fii-mensal/fii-trimestral; backfill); C = B3 (COTAHIST diário/anual → AssetQuoteDaily com FATCOT/VOLTOT; liquidez 21 pregões; ClassifSetorial + lista FIIs → colunas de Asset e setor; regras §4.4; crons cotahist e b3-cadastro; backfill 2015+); D = cálculo (eventos corporativos confirmados pela razão de ações, auditoria de proventos com data-com verdadeira = lastDatePrior e dedup de repetições da BRAPI, AssetPerShareYearly, AssetMultiplesYearly/Current, Índice MF + semáforo por classe com "não se aplica", fórmulas do Valuation §4.5 com os 23 casos, AssetScore; cron scores; scripts de recálculo) — D trabalha contra os contratos e fixtures, lendo as tabelas das outras fatias só via funções de repositório declaradas na fatia 0; E = eventos IPE → AssetEvento + nova fonte em services/calendario/fontes (atrás de flag ANALISE_ATIVOS_HABILITADA desligada por padrão, espelho do comunidadeConfig) + observabilidade (AnaliseJobRun, painel de frescor via função, alerta de 2 falhas seguidas usando o mecanismo de alerta/log existente) + linhas de cron no template infra + runbook ${OUT}/RUNBOOK.md (backfill em prod passo a passo, para execução humana posterior).
Retorne um resumo de 20 linhas.`,
  { label: 'arquiteto', phase: 'Arquitetura' },
)
const rev = await agent(
  `Você é o REVISOR CRÍTICO da arquitetura da Fase 0 da Análise de Ativos. ${REGRAS}
Leia ${SPEC} (escrito pelo arquiteto; resumo: ${arq}) contra decisoes-fase0.md, o relatório da Fase A §4/§5 e o código real. Procure: regra de sanidade §4 sem teste/fatia dona; arquivos sobrepostos entre fatias A-E (quebra o paralelismo); dependência escondida de D/E sobre A/B/C que não esteja em contrato da fatia 0; chaves únicas que permitem duplicata ou perdem versões; Decimal vs Float; job que não cabe em 300 MB/4 min; backfill que estoura o banco dev; colisão com nomes existentes; ScoringParams v1 com valor faltando ou divergente das decisões; FII híbrido/FoF/bancos mal especificados; qualquer coisa que obrigue migration fora da fatia 0. CORRIJA o ${SPEC} diretamente (edite o JSON) e acrescente a chave "revisao" com a lista do que mudou e por quê. Retorne 15 linhas.`,
  { label: 'revisor-arquitetura', phase: 'Arquitetura' },
)
log('Spec da Fase 0 revisada')

// ---------------- Contratos ----------------
phase('Contratos')
const f0 = await agent(
  `Você é o DEV da FATIA 0 ("schema, migration, contratos, ScoringParams v1") da Fase 0 da Análise de Ativos. ${REGRAS}
Trabalhe DIRETO em ${REPO}, na branch ${BRANCH} (confira com git branch --show-current; se não estiver nela, pare e reporte). Implemente EXATAMENTE a fatia "0" de ${SPEC}: models + colunas novas de Asset em prisma/schema.prisma; npx prisma migrate dev --name analise_ativos_fase0 (Neon dev; migration ADITIVA — confira o SQL gerado: nada de DROP/ALTER destrutivo; se o migrate reclamar de drift do dev, use o procedimento do repo: SQL manual + registro em _prisma_migrations, e documente); npx prisma generate; contratos TS e funções de repositório declaradas; schema zod + seed do ScoringParams v1 (script idempotente); testes da fatia. tsc + eslint + testes. Commits atômicos. Retorne worktree=${REPO}, branch=${BRANCH} e os SHAs.`,
  { label: 'dev-fatia-0', phase: 'Contratos', schema: DEV_SCHEMA },
)
if (!f0 || !f0.commits?.length) return { erro: 'fatia 0 falhou', arq, rev, f0 }
log(`Fatia 0: ${f0.commits.length} commits`)

// ---------------- Implementação ----------------
phase('Implementação')
const FATIAS = [
  { id: 'A', nome: 'aa-fase0-a-acoes-cvm', label: 'dev-A-acoes-cvm' },
  { id: 'B', nome: 'aa-fase0-b-fiis-cvm', label: 'dev-B-fiis-cvm' },
  { id: 'C', nome: 'aa-fase0-c-b3', label: 'dev-C-b3-cotahist' },
  { id: 'D', nome: 'aa-fase0-d-calculo', label: 'dev-D-calculo-indice' },
  { id: 'E', nome: 'aa-fase0-e-eventos-ops', label: 'dev-E-eventos-ops' },
]
const devs = await parallel(FATIAS.map((f) => () => agent(
  `Você é o DEV da FATIA ${f.id} da Fase 0 da Análise de Ativos. ${REGRAS} ${WT}
Branch a criar: ${f.nome}. Implemente EXATAMENTE a fatia "${f.id}" de ${SPEC}, só nos arquivos dela (arquivo de outra fatia = pendência, não edição). Use os contratos da fatia 0 como fonte única de tipos/repositórios/ScoringParams.
Testes obrigatórios com os casos reais listados na spec. Se a fatia tem job/script de ingestão: rode-o de verdade contra a fonte real — no banco DEV, no subconjunto que a spec define para o dev — e MEÇA tempo, pico de RSS (/usr/bin/time -v ou process.memoryUsage) e linhas gravadas/rejeitadas; compare os números-chave com o relatório da Fase A (ex.: nº de companhias com 10 anos, VP/cota do HGLG11) e registre em medicoes. A rota cron precisa ser exercitada localmente (next dev na porta 33${f.id.charCodeAt(0) - 60} ou chamando o handler exportado num script tsx) com o segredo de cron do .env. Zips já baixados da CVM podem ser usados como cache local de desenvolvimento em ${args.cvmDir}, mas o código tem de baixar sozinho.
Commits atômicos na sua branch. Retorne o schema.`,
  { label: f.label, phase: 'Implementação', schema: DEV_SCHEMA, isolation: 'worktree' },
)))
const devOk = devs.map((d, i) => ({ fatia: FATIAS[i].id, ...(d || { erro: 'agente falhou' }) }))
log(`Implementação: ${devOk.map((d) => `${d.fatia}=${d.commits ? d.commits.length + ' commits' : 'FALHOU'}`).join(' · ')}`)

// ---------------- Integração ----------------
phase('Integração')
const INTEG = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commits_integrados: { type: 'array', items: { type: 'string' } },
    conflitos: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    backfill_dev: { type: 'string', description: 'o que rodou no banco dev, tempos, linhas, tamanho final do banco' },
    cobertura: { type: 'string', description: 'números finais vs Fase A (companhias c/10 anos, FIIs, scores calculados etc.)' },
    problemas_abertos: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'commits_integrados', 'conflitos', 'checks', 'backfill_dev', 'cobertura', 'problemas_abertos'],
}
const integ = await agent(
  `Você é o INTEGRADOR da Fase 0 da Análise de Ativos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH} (já tem a fatia 0). Traga os commits das fatias com git cherry-pick na ordem A, B, C, D, E, preservando mensagens:
${JSON.stringify(devOk.map((d) => ({ fatia: d.fatia, branch: d.branch, worktree: d.worktree, commits: d.commits, desvios: d.desvios_da_spec, pendencias: d.pendencias, medicoes: d.medicoes, erro: d.erro })), null, 1)}
Resolva conflitos preservando a intenção e registre. Depois: npx tsc --noEmit -p .; npm run lint; vitest em todos os testes novos/alterados (git diff --name-only ${BASE}..HEAD | grep -E 'test\\.tsx?$'); rm -rf .next && npm run build.
Em seguida rode o BACKFILL COMPLETO NO BANCO DEV na ordem da spec (subconjunto dev), ponta a ponta até AssetScore, medindo tempo e tamanho do banco (select pg_size_pretty(pg_database_size(current_database()))) — tem de ficar < 450 MB. Rode cada rota cron uma vez localmente (handler via tsx ou next start -p 3340 + curl com o segredo) e confirme AnaliseJobRun gravado. Gere ${OUT}/cobertura-dev.md com: cobertura por classe, 20 ativos com Índice MF + 5 critérios + incompleto, a tabela de "notas reais × protótipo" para os ativos do protótipo (decisão 1), e divergências vs Fase A.
Corrija problemas de integração com commits "fix(analise-ativos): ..." pequenos. Fatia faltando: NÃO implemente, registre. Não remova worktrees.`,
  { label: 'integrador', phase: 'Integração', schema: INTEG },
)
if (!integ) return { erro: 'integração falhou', devs: devOk }

// ---------------- QA ----------------
phase('QA')
const QA_BASE = `${REGRAS}
Você revisa a branch ${BRANCH} (base ${BASE}). Diff: git -C ${REPO} diff ${BASE}..${BRANCH}. Integração: ${JSON.stringify({ checks: integ.checks, backfill: integ.backfill_dev, cobertura: integ.cobertura, problemas: integ.problemas_abertos })}. Spec: ${SPEC}.
Salve evidências em ${OUT}/qa/. Reporte SÓ problemas reais com evidência reproduzível. NÃO edite nem commite código. NÃO invoque skills nem subagentes (o resultado se perde).`
const QAS = [
  { label: 'qa-dados', prompt: `Você é o QA DE DADOS (cético). ${QA_BASE}
No banco DEV (só leitura), sorteie 25 números calculados — mistura de ações (inclua 3 bancos, 1 seguradora, 2 com split recente, 1 com prejuízo) e FIIs (tijolo, papel, FoF, híbrido): lucro/receita/PL do ano, nº de ações, LPA/VPA/DPA ajustados, payout, P/L e P/VP de fim de ano e atuais, liquidez 30d, VP/cota, cotistas, tipo de FII, cada componente do Índice MF e status do semáforo. Confira cada um contra fonte pública INDEPENDENTE (RI/release, Status Invest, Fundamentus, Investidor10, relatório gerencial — WebFetch/WebSearch via ToolSearch), tolerância 1% em valores e 0,5 p.p. em percentuais, explicando diferenças metodológicas legítimas. Verifique também: três estados (ausente/zero/não se aplica) visíveis nos dados; selos "dados incompletos" onde devem estar; nenhum ativo com Índice MF calculado sobre dado ausente tratado como zero.` },
  { label: 'qa-codigo', prompt: `Você é o REVISOR DE CÓDIGO (foco em bugs de correção). ${QA_BASE}
Revise o diff arquivo por arquivo: regras puras vs §4 do relatório (cada regra tem teste com o caso real? o teste realmente falharia sem a regra?); os 23 casos da §4.6; escolha de maior versão por (cnpj, período); exercício ÚLTIMO vs PENÚLTIMO; escala MIL/UNIDADE; consolidado vs individual (bancos = individual BR GAAP); TTM YTD vs soma; ajuste de split com data > data-com; data-com verdadeira; dedup de proventos repetidos; janela de 12 meses de calendário; histerese do tipo de FII; comparação com null; Decimal/Float e arredondamento; idempotência de upserts e reprocessamento de versões novas; migration aditiva; ScoringParams v1 = decisões. Cada achado com arquivo:linha e cenário concreto.` },
  { label: 'qa-seguranca', prompt: `Você é o REVISOR DE SEGURANÇA. ${QA_BASE}
Foque: rotas /api/cron/analise-ativos/* com requireCronSecret e sem vazar erro/stack; downloads com allowlist de host, sem SSRF por parâmetro, timeout, limite de tamanho e proteção contra zip bomb/caminho no zip; parsing de CSV sem eval/regex catastrófica; SQL cru parametrizado; nenhum segredo em log; flag ANALISE_ATIVOS_HABILITADA desligada por padrão e rotas públicas inexistentes nesta fase; scripts de backfill com dry-run padrão e sem apontar para produção; linhas de cron no template usam o mesmo mecanismo autenticado das existentes. Cada achado com arquivo:linha.` },
  { label: 'qa-operacao', isolation: 'worktree', prompt: `Você é o QA DE OPERAÇÃO (produção de 1,9 GB de RAM, cron via curl -m 300). ${QA_BASE}
Você está num worktree: git checkout --detach ${BRANCH}; ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env. Faça rm -rf .next && npm run build && (npx next start -p 3350 em background, guarde o PID). Chame CADA rota cron com o segredo e meça: tempo total, pico de RSS do processo do next (amostre /proc/<pid>/status VmRSS a cada 1 s), linhas gravadas; chame 2× seguidas para provar idempotência (mesmos totais, sem duplicata) e simule falha de rede/cabeçalho alterado (ex.: variável de ambiente ou fixture apontando para CSV com coluna renomeada) para ver se falha alto e grava AnaliseJobRun com erro. Rode um script de backfill em dry-run e confira que não grava. Reprove qualquer rota com pico > 300 MB ou tempo > 240 s. Pare o servidor ao final (kill <pid> em comando separado).` },
]
const qas = await parallel(QAS.map((q) => () => agent(q.prompt, { label: q.label, phase: 'QA', schema: FINDINGS, ...(q.isolation ? { isolation: q.isolation } : {}) })))
const todos = []
qas.forEach((r, i) => (r?.achados || []).forEach((a) => todos.push({ origem: QAS[i].label, ...a })))
const graves = todos.filter((a) => a.gravidade !== 'baixa')
log(`QA: ${todos.length} achados (${graves.length} alta/média) — ${QAS.map((q, i) => `${q.label}=${qas[i] ? qas[i].achados.length : 'FALHOU'}`).join(' · ')}`)

let correcao = null
let reverif = null
if (graves.length) {
  phase('Correções')
  const FIX = {
    type: 'object',
    properties: {
      corrigidos: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, commit: { type: 'string' }, como: { type: 'string' } }, required: ['achado', 'commit', 'como'] } },
      rejeitados: { type: 'array', items: { type: 'object', properties: { achado: { type: 'string' }, motivo: { type: 'string' } }, required: ['achado', 'motivo'] } },
      checks: { type: 'string' },
    },
    required: ['corrigidos', 'rejeitados', 'checks'],
  }
  correcao = await agent(
    `Você é o CORRETOR da Fase 0 da Análise de Ativos. ${REGRAS}
Trabalhe em ${REPO}, branch ${BRANCH}. Para CADA achado alta/média: CONFIRME que é real (leia o código, reproduza); se não for, rejeite com motivo. Se for, corrija do jeito mais simples, com teste que falharia antes, commit "fix(analise-ativos): ...". Se a correção muda dados já gravados no dev, reprocesse o trecho afetado. Ao final: tsc, lint, vitest dos testes afetados, rm -rf .next && npm run build.
ACHADOS: ${JSON.stringify(graves, null, 1)}`,
    { label: 'corretor', phase: 'Correções', schema: FIX },
  )
  if (correcao?.corrigidos?.length) {
    phase('Reverificação')
    reverif = await agent(
      `Você é o QA de REVERIFICAÇÃO da Fase 0 da Análise de Ativos. ${REGRAS}
Em ${REPO}, branch ${BRANCH} (só leitura de código; pode rodar testes, scripts em dry-run, rotas cron localmente e consultas no banco dev). Para cada correção, reproduza o cenário original e confirme que foi resolvido sem regressão. Rode tsc e a suíte de testes da pasta src/services/analiseAtivos e das rotas novas. Reporte só o que continua quebrado ou quebrou.
CORREÇÕES: ${JSON.stringify(correcao.corrigidos, null, 1)}
ACHADOS ORIGINAIS: ${JSON.stringify(graves, null, 1)}`,
      { label: 'qa-reverificacao', phase: 'Reverificação', schema: FINDINGS },
    )
  }
}

return {
  arquitetura: { arq, rev },
  fatia0: f0,
  devs: devOk,
  integracao: integ,
  qa: QAS.map((q, i) => ({ label: q.label, resumo: qas[i]?.resumo, achados: qas[i]?.achados })),
  baixas: todos.filter((a) => a.gravidade === 'baixa'),
  correcao,
  reverificacao: reverif,
}
