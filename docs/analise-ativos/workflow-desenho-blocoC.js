export const meta = {
  name: 'analise-ativos-blocoC-desenho',
  description: 'Análise de Ativos bloco C (reportar dado incorreto + regras de sanidade em todos os indicadores): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch MAIN):
ANÁLISE DE ATIVOS — BLOCO C. Fase 0 (dados/scores) e Fase 1 (Quadro + Página do ativo, Ações+FIIs, em /analise-ativos) estão EM PRODUÇÃO, visíveis SÓ PARA ADMIN (flag ANALISE_ATIVOS_HABILITADA + ANALISE_ATIVOS_ACESSO=beta, beta vazio por decisão do Wellington). O bloco C tem DUAS partes:

(1) "REPORTAR DADO INCORRETO" — spec §"Regras de sanidade": botão em cada bloco da página do ativo cria um data_report (user_id, asset_id, field, message, expected_source, status); SLA de resposta 5 dias úteis. Hoje o botão está ESCONDIDO (docs/analise-ativos/fase1/decisoes.md, decisão 7). Precisa: modelo aditivo no Prisma, API com zod + CSRF (csrfFetch) + rate limit/anti-spam, consultor agindo por cliente (requireAuthWithActing), fila de curadoria para o ADMIN (já existe painel /admin só leitura — src/app/(admin)/admin ou similar — e Notification para admin@appmyfinance.com.br via ANALISE_ATIVOS_ALERTA_ADMIN=true que os jobs já usam), estados do relatório (aberto/em análise/corrigido/rejeitado) e retorno ao usuário (notificação in-app quando resolvido?). Ligar o botão ao contexto do bloco (campo, valor exibido, período, fonte e frescor exibidos) para o curador reproduzir.

(2) REGRAS DE SANIDADE EM TODOS OS INDICADORES — hoje só existe a trava de plausibilidade do DY 12m (src/services/analiseAtivos/regras/calculo/plausibilidadeProventos.ts: 'em conferência' tira o componente do Índice MF, flag na linha, selo na tela; parâmetros em ScoringParams.sanidade.proventos.plausibilidade). A spec pede: variação > 40% num indicador entre dois períodos → revisão (não publica); campo obrigatório ausente → incomplete + selo + componente 0; divergência > 5% provedor×CVM no mesmo campo → revisão, CVM prevalece; selo de frescor por bloco. Estender a abordagem 'em conferência' para lucro/receita/margens/ROE/dívida, múltiplos (P/L, P/VP, EV/EBITDA), payout, nº de ações (escala — já houve casos ÷1000 como VAMOS 2018 e PDTC3), cotação (preço esporádico, desdobramento sem evento como CACR11) e FIIs (VP/cota, PL, cotistas, vacância — que NÃO bate com gerencial, ver RELATORIO-FASE-A). CUIDADO: variação > 40% é NORMAL em muitos casos (lucro de cíclicas, prejuízo→lucro, base pequena); a regra precisa de critérios que não derrubem metade do Quadro — MEÇA no banco DEV quantos ativos cada regra marcaria e proponha limiares/exceções; o estado 'em conferência' deve ser consistente em Índice MF, semáforo, Quadro e página. Pense também em como o relatório de usuário e a regra automática se encontram (ex.: indicador em conferência mostra o motivo; report vira caso na mesma fila do curador).

LEIA ANTES (precedência): docs/analise-ativos/decisoes-fase0.md (prevalece sobre a spec); docs/analise-ativos/fase1/decisoes.md e spec-desenho.json (o que a Fase 1 construiu); docs/analise-ativos/especificacao-v1.3.txt (§ regras de sanidade, data_reports); docs/analise-ativos/fase1/diagnostico-dy-absurdo.md e diagnostico-proventos-parados.md (como os erros de dado realmente aparecem); docs/analise-ativos/fase-a/RELATORIO-FASE-A.md; docs/analise-ativos/fase0/RUNBOOK.md. Código: src/services/analiseAtivos/** (regras/, calculo/recalcularScores.ts, quadro/, leitura/ativo/, textosTela.ts, regras/comum/linguagem.ts = compliance), src/app/(admin)/analise-ativos/**, src/components/analise-ativos/** (ou onde a Fase 1 pôs os componentes), prisma/schema.prisma (tabelas Asset*/Fii*/ScoringParams, ~linha 1835+).

NÚMEROS DE PROD (03/10, após correções #277/#279/#282): Quadro ações 162 calculado / 123 incompleto / 44 zero_regra; FIIs 233 calc / 57 FoF / 46 incompl / 23 sem score. Banco DEV (Neon, .env local) tem histórico reduzido — consulte read-only com prisma via npx tsx --env-file=.env (ex.: WEGE3, PETR4, ITUB4, VAMO3, CACR11, HGLG11, XPLG11, KNCR11, MXRF11). NÃO acesse produção.

REGRAS DO APP: paleta OBRIGATÓRIA src/constants/brandColors.ts (texto/links #396CAA claro / #6E9DC4 escuro; #0079F2 só não-textual; negativos #D92D20/#F97066), fonte Outfit, dark mode, alvos >= 44px, TABLE_STYLES para tabelas, casca mobile PWA (BottomSheet, useMobileHistoryLayer para voltar fechar sheet), compliance (nada de recomendação; textos neutros), CSRF via csrfFetch, erros padronizados (withErrorHandler), invalidação React Query. Protótipos de referência de estilo/bancada: docs/analise-ativos/fase1/prototipo.html (USE ESTE como base visual — mesma página do ativo), docs/carteira-mover/prototipo.html.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 3-5 devs em paralelo, SEM arquivos em comum; fatia 0 de contratos (schema, tipos, params) se precisar',
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
      items: { type: 'object', properties: { rota: { type: 'string' }, metodo: { type: 'string' }, contrato: { type: 'string' }, seguranca: { type: 'string' } }, required: ['rota', 'metodo', 'contrato', 'seguranca'] },
    },
    schema_prisma: { type: 'string', description: 'tabelas/colunas novas, só aditivas' },
    regras_sanidade: {
      type: 'array',
      description: 'uma entrada por regra proposta',
      items: {
        type: 'object',
        properties: {
          regra: { type: 'string' }, indicadores: { type: 'string' }, criterio: { type: 'string' },
          excecoes: { type: 'string' }, efeito_no_indice_e_tela: { type: 'string' },
          medicao_dev: { type: 'string', description: 'quantos ativos/linhas a regra marca no DEV, com exemplos reais e falsos positivos vistos' },
        },
        required: ['regra', 'indicadores', 'criterio', 'excecoes', 'efeito_no_indice_e_tela', 'medicao_dev'],
      },
    },
    fluxo_curadoria: { type: 'string', description: 'do clique do usuário / regra automática até a resolução: fila, estados, notificações, SLA, quem vê o quê' },
    plano_producao: { type: 'string', description: 'migration, params novos, recalcular-analise, o que ligar e em que ordem; impacto esperado no Quadro de prod' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'fatias', 'apis', 'schema_prisma', 'regras_sanidade', 'fluxo_curadoria', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD do bloco C da Análise de Ativos. ${CONTEXTO}
Tarefa: leia o código real (regras e cálculo da Fase 0, telas/APIs da Fase 1, painel /admin, Notification, rate limit em src/middleware.ts, padrões de rota/auth/zod/React Query) e produza a ESPECIFICAÇÃO TÉCNICA do bloco C, pronta para 3-5 desenvolvedores em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (compartilhado vai para a fatia 0 com contrato descrito).
- Concreto: modelo Prisma aditivo do relatório, rotas de API com contrato JSON e segurança (zod, CSRF, rate limit por usuário/ativo, tamanho máximo, sem HTML, consultor agindo), tela/fila de curadoria do admin (ler e mudar status; o /admin hoje é só leitura — diga o que muda), notificações, e o motor de sanidade: onde roda (job scores/recalcular-analise), parâmetros em ScoringParams (versão nova?), flags por indicador, efeito no Índice MF/semáforo/Quadro/página — consistente com a trava do DY já existente (reaproveite a forma, não duplique).
- MEÇA no banco DEV (read-only, scripts temporários fora do repo ou em /tmp) quantos ativos cada regra marcaria e liste falsos positivos; calibre limiares para não esvaziar o Quadro. Dê os números em regras_sanidade[].medicao_dev.
- Diga o plano de QA e o de produção (migration, recalcular-analise --apply com OK, impacto previsto).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX do bloco C da Análise de Ativos. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Parta de docs/analise-ativos/fase1/prototipo.html (mesma bancada, mesma página do ativo) e olhe os componentes reais da Fase 1 em src/ para o visual ficar igual ao app.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) com bancada: DESKTOP (1440) e CELULAR (390x844), claro/escuro, "Ver a 320px", seletor de cenários. Telas mínimas: página do ativo (WEGE3 e HGLG11) com o ponto de entrada "reportar dado incorreto" em cada bloco (discreto, sem poluir; no celular dentro do menu do bloco ou sheet); formulário de relato (campo/indicador pré-preenchido com o valor e o período exibidos, mensagem, fonte esperada opcional, envio, sucesso, erro, limite atingido); "meus relatos" ou retorno ao usuário quando resolvido; indicadores EM CONFERÊNCIA pela regra automática em vários tipos (lucro com salto, P/L com escala suspeita, cotação com desdobramento sem evento, vacância de FII divergente) com motivo em linguagem simples e o efeito no Índice; selo de frescor por bloco; Quadro mostrando ativo com indicador em conferência; FILA DO CURADOR no /admin (lista filtrável, detalhe com contexto do bloco, mudar status, responder ao usuário, SLA 5 dias úteis vencendo/vencido). Estados vazio/carregando/erro. Texto pt-BR neutro (sem recomendação), números realistas, SÓ cores da paleta My Finance.
4. Especifique medidas, estados, acessibilidade (formulário com rótulos e erros anunciados, foco, sheet acessível, status não só por cor) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (produto + dados + segurança/abuso + acessibilidade + compliance) do bloco C da Análise de Ativos. ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código e o banco DEV reais (read-only) e abra o protótipo em ${ux.prototipo_path} (renderize com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png, desktop e 390px, claro e escuro).
Cheque em especial: as regras de sanidade foram MEDIDAS e não esvaziam o Quadro (refaça ao menos 2 medições você mesmo); variação > 40% sem exceções derrubaria cíclicas/viradas de prejuízo; consistência do 'em conferência' com a trava de DY existente (Índice, semáforo, Quadro, página); relatório de usuário: abuso/spam (rate limit, tamanho, duplicados), XSS (texto do usuário na tela do admin), CSRF, isolamento (usuário só vê os próprios relatos), consultor agindo, LGPD (o que se guarda do usuário, retenção); o admin hoje é só leitura — a mudança de status está protegida (requireAdmin, auditoria)?; SLA de 5 dias úteis é realista com 1 curador (Wellington) — sugerir alerta; compliance (texto neutro); paleta/contraste AA claro/escuro; alvos >= 44px; fatias sem arquivos em comum e realistas.
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
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, apis: arq.apis, regras_sanidade: arq.regras_sanidade, fluxo_curadoria: arq.fluxo_curadoria })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
