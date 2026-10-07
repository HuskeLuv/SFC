export const meta = {
  name: 'pluggy-importar-destino-desenho',
  description: 'Escolher aba/seção da Carteira no momento da importação Open Finance: spec técnica + protótipo + revisão crítica + revisão final',
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
LEIA O CÓDIGO EM ${REPO} (worktree limpa da origin/main). NÃO escreva nada no repo. NÃO rode dev server.

PEDIDO (Wellington, 06/10/2026): na integração Open Finance (Pluggy), o usuário deve poder ESCOLHER PARA ONDE VAI cada investimento importado (aba da Carteira e seção/subgrupo) NO MOMENTO DA IMPORTAÇÃO — hoje só dá para mover depois, com o "Mover na Carteira".

COMO FUNCIONA HOJE (confirmado por levantamento — reconfira no código):
- Importação: src/services/pluggy/importarCarteira.ts (importarPendentes/importarInvestimento/atualizarImportados/ignorarInvestimento) chamada por src/services/pluggy/sync.ts sincronizarConexao (sincronizarPosicoes espelha em BankInvestment; depois importarPendentes). Roda (a) DENTRO do POST /api/pluggy/connections na 1ª conexão (antes do modal "Conexão realizada"), (b) no webhook e (c) no cron diário — sem UI. Também POST /api/pluggy/carteira/importar (manual).
- BankInvestment.importStatus: pendente | importado | vinculado | ignorado | sem-suporte | erro (+ importError, assetId, portfolioId, fixedIncomeAssetId). Origem estável PluggyImportacaoOrigem (userId, chave). Só itens 'pendente' são importados (idempotente).
- Tipos: listado EQUITY/ETF com ticker → Asset de catálogo (stock/fii/etf/bdr), cria StockTransaction 'compra' + Portfolio (só FII ganha tipoFii via secaoImportada.ts; NÃO grava estrategia/regiaoEtf/tipoFundo/categoriaOverride); já tinha Portfolio → 'vinculado' (não mexe). RF bancária (CDB/LCI/LCA...) → Asset sintético PLUGGY-RF-* type 'bond' + FixedIncomeAsset → aba Renda Fixa (seção derivada do título). Fundos MUTUAL_FUND/SECURITY → catálogo CVM por CNPJ ou sintético PLUGGY-FUNDO-*/PLUGGY-PREV-* (type define a seção de fundos; previdência). COE/Tesouro/outros → sem-suporte. Empréstimos → Dívidas.
- UI: src/components/conexoes/ConexaoRealizadaModal.tsx (só contagens + "Entendi") e CarteiraImportada.tsx ("Investimentos e empréstimos do banco": status por item; ações só Ignorar e Importar pendentes; não mostra aba/seção; sem desfazer). Hooks em src/hooks/useConexoesBancarias.ts; mobile ResponsiveCardList; tela /conexoes-bancarias (ConexoesBancariasRoot.tsx).
- Mover na Carteira (EM PROD): regras puras em src/lib/carteiraMover.ts (CATEGORIAS_MOVIVEIS, CATEGORIAS_CAIXA_RF atrás de MOVER_CAIXA_RF_HABILITADO — LIGADA EM PROD; SUBGRUPOS_POR_CATEGORIA, SUBGRUPO_EDITAVEL, CAMPO_SUBGRUPO_PORTFOLIO, categoriaBaseDaAba, overrideEfetivo, modeloDePreco, destinosPermitidos com motivos, subgrupoPadrao/subgrupoSugerido); serviço src/services/portfolio/moverInvestimento.ts (moverInvestimento/obterOpcoesMover; grava categoriaOverride=null quando destino==base; objetivo=0 ao trocar de aba); rota src/app/api/carteira/mover (GET opções, POST mover/restaurar; grava histórico investimento.mover → selo "movido", "Voltar ao original", Desfazer). Componentes src/components/carteira/mover/*. Decisões aprovadas: docs/carteira-mover/decisoes.md (fase 1, 11 decisões) e fase2-decisoes.md. Protótipos de referência de estilo: docs/carteira-mover/prototipo.html e fase2-prototipo.html.
- Matriz por tipo: b3-brl (ações/FIIs/ETFs BR) → aba e seção livres entre acoes/fiis/etfs/fimFia; usd → stocks/reits/etfs; fundo (CVM/PLUGGY-FUNDO) → só seção em Fundos; curva (RF) → RF ↔ Reserva Emergência ↔ Reserva Oportunidade; fixo (previdência etc.) → nada. Item 'vinculado' = posição que já existia (a escolha não deve se aplicar).

PERGUNTAS DE PRODUTO A RESPONDER COM RECOMENDAÇÃO (o protótipo deve mostrar a recomendação):
a) Momento da escolha: (A) importação ESPERA a escolha — novo status (ex.: 'aguardando-destino') que importarPendentes pula até o usuário confirmar, com tela de revisão logo após conectar e itens novos de syncs futuros caindo numa fila "para revisar"; ou (B) importa direto no destino sugerido e oferece passo "Confirmar destinos" (trocar = moverInvestimento + histórico) logo após conectar e na tela de Conexões; ou híbrido. Considere: 1ª conexão síncrona, webhook/cron sem UI, usuário que nunca volta à tela (posição nunca entra na Carteira?), saldo/rentabilidade, Saúde Financeira.
b) Granularidade: item a item, em lote ("todos os FIIs em Tijolo"), regras lembradas por tipo para próximas importações?
c) Sugestão inicial por item (subgrupoSugerido/secaoImportada/tipo), mostrar só destinos PERMITIDOS com motivo dos bloqueados, item 'vinculado' e 'sem-suporte'.
d) Histórico/Desfazer: a escolha na importação conta como "movido" (selo + Voltar ao original) ou é o destino original? Desfazer da importação inteira está fora?
e) Consultor agindo pelo cliente (Pluggy hoje bloqueia consultor com 403 em /api/pluggy/*).
Regras: paleta src/constants/brandColors.ts obrigatória; tabelas TABLE_STYLES (src/components/ui/table/tableStyles.ts); alvos >=44px; dark mode; desktop e mobile 390px; CSRF via csrfFetch; invalidatePortfolioDerivedQueries após mutação; textos pt-BR não técnicos.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    diagnostico: { type: 'string', description: 'pipeline atual com arquivos/linhas e pontos de intervenção' },
    modelo: { type: 'string', description: 'modelo escolhido (status novo? override gravado na importação? regras lembradas?), migration aditiva se houver, regras de destinos' },
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
    efeitos_colaterais: { type: 'string', description: 'saldo/rentabilidade, Saúde Financeira, Caixa p/ Investir, Fluxo, IR, histórico, objetivo%, syncs em segundo plano' },
    plano_producao: { type: 'string', description: 'migração dos itens já importados em prod, flag, rollout' },
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da feature "escolher o destino na importação Open Finance". ${CONTEXTO}
Tarefa: leia o código real e produza a ESPECIFICAÇÃO TÉCNICA pronta para 2-5 devs em paralelo em git worktrees. Regras:
- Fatias SEM ARQUIVOS EM COMUM (compartilhado vai para a fatia 0 ou para UMA fatia, com contrato).
- Concreto: arquivos, exports, mudanças em importarCarteira.ts/sync.ts/rotas /api/pluggy/carteira*, reuso de carteiraMover.ts/moverInvestimento.ts (não duplicar regra de destino), migration aditiva se houver, histórico/Desfazer, o que acontece com itens já importados em prod, testes (vitest + e2e).
- Não mudar regras do mover nem da importação fora do pedido.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da feature "escolher o destino na importação Open Finance". ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Leia ${REPO}/docs/carteira-mover/prototipo.html e as telas reais de Conexões (${REPO}/src/components/conexoes/: ConexaoRealizadaModal, CarteiraImportada, ConexoesBancariasRoot) e do mover (${REPO}/src/components/carteira/mover/). Siga o MESMO estilo e bancada (seletor de cenários, notas, claro/escuro, desktop + mobile 390px).
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) mostrando: logo após conectar um banco (Itaú/XP fictícios), a revisão dos investimentos trazidos com o destino sugerido por item (aba + seção) e a troca; ações BR, FII, ETF, CDB (RF ↔ Reservas), fundo (só seção), previdência (fixo, sem escolha), item 'Já estava na Carteira' e 'Cadastrar à mão'; ação em lote; confirmação; depois, a lista de Conexões com investimentos novos que chegaram por sincronização aguardando revisão (se for a recomendação); estado na Carteira. Texto pt-BR, dados realistas, só cores da paleta.
4. Especifique medidas, estados, acessibilidade e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (desenho + dados/finanças + acessibilidade) da feature "escolher o destino na importação Open Finance". ${CONTEXTO}
DERRUBE as propostas abaixo com evidência no código real (${REPO}). Abra o protótipo em ${ux.prototipo_path} (Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png).
Cheque em especial: 1ª conexão síncrona × webhook/cron sem UI (itens presos para sempre? posição que nunca entra na Carteira); idempotência e reconexão (PluggyImportacaoOrigem); item 'vinculado'; regra de destino duplicada em vez de reusar carteiraMover; override gravado errado (destino==base deve ser null; coluna de seção certa); histórico/selo movido/Desfazer; Saúde Financeira/objetivo%; consultor; fatias sem arquivos em comum; contraste AA; alvos >=44px; desktop e mobile.
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
