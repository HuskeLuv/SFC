export const meta = {
  name: 'analise-ativos-fase1-desenho',
  description: 'Análise de Ativos Fase 1 (Quadro + Página do ativo, Ações+FIIs): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch MAIN, que já contém a Fase 0):
ANÁLISE DE ATIVOS — FASE 1 = QUADRO + PÁGINA DO ATIVO, só AÇÕES e FIIs (Stocks/REITs = Fase 4; Comparador/Raio-X/Cenários = Fase 2; voto/ranking/teses públicas = Fase 3). Primeira fase COM TELA.

LEIA ANTES (documentos que mandam, em ordem de precedência):
1. docs/analise-ativos/decisoes-fase0.md — decisões do Wellington/Pedro; PREVALECE sobre a spec.
2. docs/analise-ativos/plano-execucao-set2026.md — linha "1 · Quadro + Página do ativo" define o escopo: Quadro (filtros, ordenação por coluna, modos Resumo/Detalhado, coluna Lucro 10 anos, coluna/filtro "Na carteira", paginação/virtualização), Página do ativo (semáforo, KPIs + posição do usuário na carteira/Planejamento, gráfico Lucro × Cotação, dividendos, Fundamentos nível ESSENCIAL, Valuation nível MÚLTIPLOS com barra de posição de 10 anos, pares, eventos/agenda, card Educação), busca com autocomplete, tese PRIVADA do usuário, item "NOVO" no sidebar, flag ANALISE_ATIVOS_HABILITADA (src/lib/analiseAtivosConfig.ts) + beta por usuário, rodapé legal.
3. docs/analise-ativos/especificacao-v1.3.txt (spec do Pedro; seções 3.1 Quadro e 3.2 Página do ativo, §4 regras, requisitos de performance: API < 300 ms com cache, página < 1,5 s no 4G, NENHUMA chamada a provedor externo no caminho da requisição).
4. docs/analise-ativos/prototipo-pedro.html — referência de CONTEÚDO e LEIAUTE, NÃO de cores/fontes (decisão: paleta My Finance).
5. docs/analise-ativos/fase-a/RELATORIO-FASE-A.md e docs/analise-ativos/fase0/ (spec-fase0.json, RUNBOOK.md, cobertura-dev.md) — o que os dados realmente têm.

DADOS (Fase 0 em produção desde 02/10/2026; tabelas no prisma/schema.prisma a partir da linha ~1835): ScoringParams, CvmCompany, CvmCompanyTicker, AssetFundamentalsPeriod, AssetStatementLine, AssetShareCount, FiiTickerMap, FiiMonthly, FiiQuarterly, FiiTipoOverride, AssetQuoteDaily, AssetQuoteResumo, AssetSetorB3, AssetProventoAuditado, AssetPerShareYearly, AssetMultiplesYearly, AssetMultiplesCurrent, AssetScore (Índice MF + semáforo), AssetEvento. Serviços/regras em src/services/analiseAtivos/** (regras/calculo/{indiceMf,semaforo,multiplos,pares,...}.ts, regras/comum/linguagem.ts = textos de compliance, observabilidade/frescor.ts). Crons de prod já rodando (cvm-cias, fii-mensal, cotahist, scores...). NÃO existe ainda NENHUMA API de leitura nem tela — é isso que a Fase 1 cria.
Números de PROD (02/10): 747 scores (dataRef 2026-10-01): ações 385 com score, 179 INCOMPLETAS; FIIs 362, 46 incompletos; 778 múltiplos. Ou seja, "dado incompleto/insuficiente" é estado de PRIMEIRA CLASSE no Quadro e na página. Alertas conhecidos: 95 ações + 34 FIIs 'pagador_recorrente_parado' (DY 12m ausente). O banco DEV (Neon, .env local) tem perfil reduzido de histórico (notas de FII no dev são mais baixas que em prod) — dá para consultar read-only com prisma via npx tsx --env-file=.env para ver formatos reais (WEGE3, PETR4, ITUB4, HGLG11, XPLG11, KNCR11, MXRF11).

INTEGRAÇÕES NO APP EXISTENTE: posição do usuário = Portfolio + src/services/portfolio/itemValuation.ts; Planejamento/alvo = AlocacaoConfig; Watchlist / ativos planejados existem; "Na carteira" e "adicionar à carteira/planejamento" devem REUSAR fluxos existentes (wizard de operação, ativos planejados), não criar paralelos. Agenda (src/services/calendario) já mostra datas de resultado quando a flag está ligada. Área Educacional (accessLevel) existe — card Educação linka para ela. Colisão de nome: /api/analises/* já é analytics da carteira → a área nova usa /analise-ativos (rota de página e de API). Consultor agindo por cliente: requireAuthWithActing (src/utils/auth.ts). PWA em prod: casca mobile src/layout/mobile/*, BottomSheet, ResponsiveTable, ResponsiveTabNav, ApexChartWrapper; padrão único de tabela TABLE_STYLES (procure tableStyles.ts em src/components/ui/table); paleta OBRIGATÓRIA src/constants/brandColors.ts (#0079F2 só não-textual; texto/links #396CAA claro / #6E9DC4 escuro; negativos #D92D20/#F97066; semáforo verde/âmbar/vermelho precisa caber na paleta — proponha), fonte Outfit, dark mode, alvos >= 44px. Compliance: nada de "recomendação de compra"; textos neutros (regras/comum/linguagem.ts), rodapé legal; tese é PRIVADA nesta fase (pública só na Fase 3 com parecer).
Referência de estilo dos protótipos anteriores (casca, bancada com seletor de cenários, claro/escuro, "Ver a 320px"): docs/carteira-mover/prototipo.html e docs/pwa/fase3-prototipo.html.
Regras do projeto: CLAUDE.md do repo.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 3-5 devs em paralelo, SEM arquivos em comum entre fatias; inclua fatia 0 de contratos (tipos, rotas, schema) se precisar',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, titulo: { type: 'string' }, objetivo: { type: 'string' },
          arquivos_novos: { type: 'array', items: { type: 'string' } },
          arquivos_alterados: { type: 'array', items: { type: 'string' } },
          detalhes: { type: 'string' }, testes: { type: 'string' },
          criterios_aceite: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'titulo', 'objetivo', 'arquivos_novos', 'arquivos_alterados', 'detalhes', 'testes', 'criterios_aceite'],
      },
    },
    apis: {
      type: 'array',
      items: { type: 'object', properties: { rota: { type: 'string' }, metodo: { type: 'string' }, contrato: { type: 'string' }, cache_e_performance: { type: 'string' } }, required: ['rota', 'metodo', 'contrato', 'cache_e_performance'] },
    },
    schema_prisma: { type: 'string', description: 'tabelas/colunas novas (ex.: tese privada, beta por usuário) — só aditivas; ou "nenhuma"' },
    mapa_dados_por_bloco: { type: 'string', description: 'para cada bloco do Quadro e da Página do ativo: tabela/serviço de origem, cobertura real e o estado quando falta dado' },
    plano_producao: { type: 'string', description: 'flag, beta por usuário, migration, o que ligar em prod e em que ordem' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'fatias', 'apis', 'schema_prisma', 'mapa_dados_por_bloco', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    prototipo_path: { type: 'string' },
    telas: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, descricao: { type: 'string' }, decisoes: { type: 'array', items: { type: 'string' } } }, required: ['nome', 'descricao', 'decisoes'] } },
    especificacao_visual: { type: 'string' },
    acessibilidade: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o arquiteto explícitas' },
  },
  required: ['resumo', 'prototipo_path', 'telas', 'especificacao_visual', 'acessibilidade', 'perguntas_para_wellington'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alvo: { type: 'string', enum: ['arquitetura', 'design', 'ambos'] },
          gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          descricao: { type: 'string' }, evidencia: { type: 'string' }, sugestao: { type: 'string' },
        },
        required: ['alvo', 'gravidade', 'descricao', 'evidencia', 'sugestao'],
      },
    },
    pontos_fortes: { type: 'array', items: { type: 'string' } },
  },
  required: ['problemas', 'pontos_fortes'],
}

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da Fase 1 da Análise de Ativos. ${CONTEXTO}
Tarefa: leia o código real (schema das tabelas da Fase 0, src/services/analiseAtivos/**, itemValuation, AlocacaoConfig, ativos planejados, sidebar, casca PWA, padrões de rota/auth/React Query) e produza a ESPECIFICAÇÃO TÉCNICA da Fase 1, pronta para 3-5 desenvolvedores implementarem EM PARALELO em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (compartilhado vai para a fatia 0 com contrato descrito).
- Concreto: rotas de página e de API (/analise-ativos), contratos JSON, queries Prisma e índices necessários, estratégia de cache (tabelas pré-calculadas, revalidate, React Query), paginação/virtualização do Quadro, busca/autocomplete, tese privada (schema aditivo), gate da flag + beta por usuário (onde fica a lista, como bloquear página E API), integração com carteira/planejamento reusando o que existe, estados de dado incompleto/defasado (frescor), textos de compliance.
- Meça no banco DEV (read-only) a cobertura real dos blocos antes de prometer algo; diga o que fica vazio e como aparece.
- Diga o que o QA desktop/mobile compara, quais e2e entram e o plano de ativação em produção (flag + beta).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da Fase 1 da Análise de Ativos. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Leia docs/analise-ativos/prototipo-pedro.html (conteúdo/leiaute desejado pelo Pedro), a spec (3.1, 3.2) e os protótipos docs/carteira-mover/prototipo.html e docs/pwa/fase3-prototipo.html (MESMA bancada e estilo do app). Olhe as telas reais da Carteira (tabelas TABLE_STYLES, cards, sidebar) para o visual ficar igual ao app.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) com bancada: alternar DESKTOP (1440) e CELULAR (390x844), claro/escuro, "Ver a 320px", seletor de cenários. Telas mínimas: Quadro Ações e Quadro FIIs (tabs com contador, filtros, ordenação, Resumo/Detalhado, Lucro 10 anos, Na carteira, paginação; no celular como lista/cards), busca com autocomplete, Página do ativo WEGE3 (ação) e HGLG11 (FII) com todos os blocos do escopo, um ativo com DADO INCOMPLETO (score parcial, sem DY 12m, histórico curto) e um ativo FORA do beta/flag (o que o usuário vê), tese privada (vazia, editando, salva), estado "Na carteira" com posição e alvo do Planejamento vs ativo não detido (ação de adicionar ao planejamento/carteira), sidebar com item NOVO, rodapé legal. Estados vazio/carregando/erro. Texto pt-BR, números realistas (use os do protótipo do Pedro ou do banco dev), SÓ cores da paleta My Finance.
4. Especifique medidas, estados, acessibilidade (tabela ordenável acessível, gráficos com alternativa textual, semáforo não só por cor) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (produto + dados + performance + acessibilidade + compliance/segurança) da Fase 1 da Análise de Ativos. ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código e o banco DEV reais (read-only) e abra o protótipo em ${ux.prototipo_path} (pode renderizar com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png, desktop e 390px, claro e escuro).
Cheque em especial: cada número da tela tem origem real nas tabelas da Fase 0 (nada inventado; Lucro 10 anos, múltiplos, semáforo, pares, eventos); estado de dado incompleto/defasado coberto (179 ações incompletas em prod); escopo respeitado (sem Comparador, ranking, voto, Stocks/REITs); decisões de decisoes-fase0.md respeitadas; performance (Quadro de ~750 ativos: API < 300 ms, sem provedor externo no request, paginação); gate da flag + beta bloqueia página E API; consultor agindo por cliente; tese privada isolada por usuário (sem vazamento, zod, CSRF); compliance (sem linguagem de recomendação, rodapé legal); integração com carteira/planejamento reusa fluxos existentes; paleta My Finance e TABLE_STYLES; contraste AA claro/escuro; alvos >=44px; tabela ordenável acessível; fatias sem arquivos em comum e realistas para 3-5 devs.
Só problemas reais. Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: produza a VERSÃO FINAL incorporando cada crítica válida (rejeitadas em "riscos" com o porquê), implementando exatamente o protótipo. Divergências com o designer ficam EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: ATUALIZE o mesmo arquivo ${ux.prototipo_path} corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a arquitetura (resumo abaixo). Divergências com o arquiteto EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, apis: arq.apis, mapa_dados_por_bloco: arq.mapa_dados_por_bloco })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
