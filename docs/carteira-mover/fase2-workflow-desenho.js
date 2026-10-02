export const meta = {
  name: 'carteira-mover-rf-reservas-desenho',
  description: 'Mover investimentos fase 2 (Reserva de Emergência, Reserva de Oportunidade, Renda Fixa): spec técnica + protótipo + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const REPO = args.repo
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query).
LEIA O CÓDIGO EM ${REPO} (worktree limpa da origin/main; NÃO leia /home/huske/dev/front, que está em outra branch com outro workflow rodando). Não escreva nada no repo.

FEATURE JÁ EM PRODUÇÃO (PR #275, 01/10/2026): "mover investimentos" entre abas e seções da Carteira — DnD com bandeja "Outra aba" no rodapé, sheet no mobile, diálogo na página do ativo (/ativos/[id]), selo "movido", "Voltar ao original", Desfazer via Histórico de alterações. Regras únicas em src/lib/carteiraMover.ts (CATEGORIAS_MOVIVEIS = fimFia, fiis, acoes, stocks, reits, etfs; modelos de preço b3-brl/usd/fundo/fixo; destinosPermitidos; motivoNaoMovivel), serviço src/services/portfolio/moverInvestimento.ts, rota src/app/api/carteira/mover, src/app/api/carteira/_lib/linhaMovida.ts, src/services/portfolio/categoriaAba.ts, componentes src/components/carteira/mover/*. Override por usuário: Portfolio.categoriaOverride/tipoFundo, Watchlist.categoriaOverride (Asset é catálogo COMPARTILHADO e nunca muda). Leia docs/carteira-mover/decisoes.md (11 decisões aprovadas — continuam valendo), spec-desenho.json e prototipo.html (MESMO estilo/bancada).

PEDIDO NOVO (Wellington, 02/10/2026): "liberar" o mover para 3 abas que ficaram de fora: (1) Reserva de Emergência, (2) Reserva de Oportunidade, (3) Renda Fixa (categoria rendaFixaFundos). Continuam FORA: Moedas/Criptos, Previdência/Seguros, Opções, Imóveis/Bens.

FATOS A INVESTIGAR (não assuma — confirme no código):
- categorizarAsset em src/services/portfolio/itemValuation.ts: reservas dependem de ctx.isReserva + tesouroReservaDestino ('emergencia'|'oportunidade'), Asset.type 'emergency'/'opportunity'/'cash', símbolos por usuário RESERVA-EMERG*/RESERVA-OPORT* criados em src/app/api/carteira/operacao/route.ts; RF = bond/tesouro-direto/ação BRL fora do padrão etc. Mapeie TODOS os consumidores de isReserva/tesouroReservaDestino (AlocacaoAtivosTable/Mobile, resumo, caixaParaInvestir, portfolioLiveTotals, saudeFinanceiraServer, cashflowFilters, patrimonioHistoricoBuilder, portfolioRecalculation, planejamento/contexto, portfolioCategoria.ts) e onde fica a flag de reserva (Portfolio? FixedIncomeAsset? notes?).
- Rotas/hooks das abas: reserva-emergencia, reserva-oportunidade, renda-fixa (src/app/api/carteira/*, useRendaFixa, useReserva*), FixedIncomeAsset, subgrupos/seções da aba RF (pós/pré/IPCA? tipo?) e das reservas (há seções?).
- Saúde Financeira usa a Reserva de Emergência como indicador (meses de cobertura) — mover para dentro/fora muda o indicador; Caixa para Investir; Planejamento; Fluxo de Caixa (linhas de aporte por aba); IR; evolução/rentabilidade por classe.

PERGUNTAS DE PRODUTO A RESPONDER COM RECOMENDAÇÃO (o protótipo deve mostrar a recomendação):
a) Quais destinos: as 3 abas entre si (RF ↔ Reserva Emergência ↔ Reserva Oportunidade) — recomendação inicial: SIM; RF/reservas → abas de renda variável: provavelmente NÃO (não tem cotação). Ativos de renda variável/fundos → Reserva (ex.: ETF de renda fixa, fundo DI como reserva de oportunidade)? Avalie e recomende.
b) Subgrupos dentro de cada uma das 3 abas (existem? são editáveis?).
c) Modelo: reutilizar categoriaOverride ou a flag de reserva já existente (tesouroReservaDestino/isReserva)? Escolha a que NÃO quebra consumidores e não duplica fonte de verdade; Desfazer e "Voltar ao original" precisam funcionar.
d) Itens sintéticos de reserva (RESERVA-EMERG/OPORT — saldo em caixa sem ativo de mercado): podem sair da reserva? Para onde?
e) Efeitos colaterais: Saúde Financeira (reserva de emergência), Caixa para Investir, objetivo % (decisão 2 da fase 1), Fluxo, IR (não muda), histórico por classe, planejados (Watchlist).
Regras: paleta src/constants/brandColors.ts obrigatória; tabelas TABLE_STYLES; alvos >=44px; dark mode; desktop e mobile; CSRF via csrfFetch; invalidatePortfolioDerivedQueries após mutação.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    diagnostico: { type: 'string', description: 'como reservas e RF são modeladas hoje, com arquivos/linhas; lista de consumidores afetados' },
    modelo: { type: 'string', description: 'modelo de dados escolhido (override vs flag de reserva), migration se houver, regras de destinos e subgrupos' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 2-5 devs em paralelo, SEM arquivos em comum; fatia 0 de contratos se precisar',
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
    efeitos_colaterais: { type: 'string', description: 'Saúde Financeira, Caixa p/ Investir, Fluxo, IR, histórico, planejamento, objetivo%' },
    plano_producao: { type: 'string' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'diagnostico', 'modelo', 'fatias', 'efeitos_colaterais', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da fase 2 do "mover investimentos" (Reservas + Renda Fixa). ${CONTEXTO}
Tarefa: leia o código real e produza a ESPECIFICAÇÃO TÉCNICA pronta para 2-5 devs em paralelo em git worktrees. Regras:
- Fatias SEM ARQUIVOS EM COMUM (compartilhado vai para a fatia 0 ou para UMA fatia, com contrato).
- Concreto: arquivos, exports, mudanças em carteiraMover.ts (CATEGORIAS_MOVIVEIS, modelos, destinos), serviço, rotas das 3 abas, consumidores de isReserva, migration (se houver — aditiva), Desfazer/Voltar ao original, testes (vitest + e2e).
- Não mudar regras de negócio fora do pedido nem a fase 1.
- Não escreva código no repo. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da fase 2 do "mover investimentos" (Reservas + Renda Fixa). ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Leia ${REPO}/docs/carteira-mover/prototipo.html e as telas reais das abas Reserva de Emergência, Reserva de Oportunidade e Renda Fixa (componentes em ${REPO}/src/components/carteira/). Siga o MESMO estilo e bancada (seletor de cenários, notas, claro/escuro, desktop + mobile 390px).
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) mostrando: arrastar um CDB de liquidez diária da Renda Fixa para a Reserva de Emergência pela bandeja "Outra aba" (desktop); o mesmo pelo sheet no mobile; diálogo na página do ativo com os destinos permitidos e motivos dos bloqueados; aviso dos efeitos (ex.: Saúde Financeira passa a contar o CDB na reserva; objetivo % zera); selo "movido" + "Voltar ao original"; item sintético de reserva (saldo em caixa) e o que acontece com ele; Desfazer. Texto pt-BR, dados realistas, só cores da paleta.
4. Especifique medidas, estados, acessibilidade e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (desenho + dados/finanças + acessibilidade) da fase 2 do "mover investimentos". ${CONTEXTO}
DERRUBE as propostas abaixo com evidência no código real (${REPO}). Abra o protótipo em ${ux.prototipo_path} (Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque em especial: algum consumidor de isReserva/tesouroReservaDestino/categorizarAsset esquecido (pizza, resumo, Saúde Financeira, Caixa p/ Investir, Fluxo, planejamento, histórico/evolução por classe, IR, totais live); duas fontes de verdade para "é reserva"; Tesouro comprado como reserva (compra atômica); itens sintéticos RESERVA-*; Desfazer e Voltar ao original; planejados; consultor agindo; fatias sem arquivos em comum; coerência com as 11 decisões da fase 1; contraste AA; alvos >=44px; desktop e mobile.
Só problemas reais. Não reescreva as propostas.

ESPECIFICAÇÃO DO ARQUITETO:
${JSON.stringify(arq, null, 2)}

PROPOSTA DO DESIGNER:
${JSON.stringify(ux, null, 2)}`, { label: 'revisor-critico', phase: 'Revisão crítica', schema: REVIEW_SCHEMA })

const criticas = rev ? JSON.stringify(rev.problemas, null, 2) : '[]'

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`
REVISÃO: produza a VERSÃO FINAL incorporando cada crítica válida (rejeitadas em "riscos" com o porquê), implementando exatamente o protótipo. Divergências com o designer EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(arq)}
CRÍTICAS: ${criticas}
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: ATUALIZE o mesmo arquivo ${ux.prototipo_path} corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a arquitetura (resumo abaixo). Divergências com o arquiteto EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, modelo: arq.modelo, efeitos: arq.efeitos_colaterais })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
