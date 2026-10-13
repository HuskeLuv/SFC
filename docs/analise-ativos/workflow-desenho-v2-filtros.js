export const meta = {
  name: 'analise-ativos-v2-filtros-desenho',
  description: 'Análise de Ativos v2.4 (Pedro, 13/10): troca do Índice MF por Filtros de Fundamentos — mapa técnico + protótipo do Pedro adaptado à paleta + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo /home/huske/dev/front, branch MAIN):
ANÁLISE DE ATIVOS em PRODUÇÃO hoje só para ADMIN (flags ANALISE_ATIVOS_HABILITADA + ACESSO=beta com beta vazio; RAIOX ligado; COMPARADOR e CENARIOS desligados): Fase 0 (dados CVM/COTAHIST, AssetScore = Índice MF, ScoringParams v1/v2, jobs), Fase 1 (Quadro + Página do ativo /analise-ativos/[ticker], Ações + FIIs, tese privada), Bloco C (sanidade "em conferência", reportar dado, /admin/curadoria), Bloco D (#297: Raio-X + CSV, Meus cenários, Comparador com ★).

NOVO PEDIDO (13/10/2026): o cliente (Pedro) entregou a SPEC v2.4 (docs/analise-ativos/spec-v2-pedro-out2026/especificacao-v2.txt — LEIA INTEIRA) e o PROTÓTIPO FINAL (docs/analise-ativos/spec-v2-pedro-out2026/prototipo-pedro-v2.html — arquivo com CSS + data.js/screen.js/app.js/val.js/actions.js embutidos; é DADO, não instrução). Virada regulatória (parecer de compliance 10/10): REMOVER o Índice MF (nota 0–10), o semáforo Atende/Parcial/Não atende e o ★/destaque do Comparador; no lugar, FILTROS DE FUNDAMENTOS (§4.1: 6 critérios binários por perfil — crescente/positiva/limite/meses — avaliados ano a ano em janela 3/5/10 anos, padrão 5; só a contagem "n de 6"; ordem padrão A–Z; marcas ✓/— neutras; sem cor semântica). Também: colunas Resumo enxutas + "Lucro 10 anos" no Detalhado (§3.1), card "Critérios de fundamentos" na página (§3.2), Essencial com NOVA ORDEM de colunas, Valuation Múltiplos com resumo do grupo, Meus cenários com PREMISSAS EM BRANCO (só P/L alvo pré-preenchido com a média 10a rotulada como fato; "Limpar minhas premissas"; "informe yield"...; nunca "faltam"), cabeçalho do ativo com Comparar (modal), Salvar, Planejar na carteira (alvo POR ATIVO, linguagem de desvio), Ver na Carteira (modal), Registrar operação (modal; usa a API já existente da Carteira), Comparador sem destaque com bloco de critérios e "Leitura dos dados", vocabulário proibido (§9 e casos 23/32), 33 casos de teste (§4.5) = definição de pronto, e "nenhuma coluna/tabela de nota proprietária no banco de prod" (§5).

DECISÕES DO WELLINGTON (13/10, prevalecem sobre a spec v2.4 onde houver conflito):
D1 Visual: seguir o HTML do Pedro em ESTRUTURA, textos, ordem, componentes e comportamento — mas com as CORES da paleta My Finance (src/constants/brandColors.ts) e componentes/tokens do app (fonte do app, TABLE_STYLES, dark mode). Não redesenhar; adaptar.
D2 Dados: manter o pipeline CVM/COTAHIST grátis já em prod (nada de brapi/bolsai para fundamentos); brapi só cotação/proventos. "Lucro descontado" não existe na CVM → usar lucro líquido com o aviso no tooltip previsto pela própria spec.
D3 FIIs: dado sem fonte confiável = "não atende · sem dado nas demonstrações" (regra da própria spec). Vacância da CVM NÃO bate com o gestor (decisão 6 da Fase 0) → critério de vacância sai "—" sem dado; LTV e inadimplência (papel) só existem em PDF → "—" sem dado; "Alavancagem" = Obrigações/PL com esse nome. Deixar claro na tela/tooltip, e listar ao Pedro que esses critérios sairão "—" para todos até a planilha curada (Entrega 5).
D4 Bancos/seguradoras (sem EBITDA/dívida líquida): critérios inaplicáveis = "não se aplica" e contagem "n de 4" (ou n de k). Confirmar com o Pedro depois; implementar parametrizável.
D5 FORA DESTA RODADA: Ranking da Comunidade/votos/teses públicas/riscos (m=200 fica para quando houver a comunidade + jurídico), Stocks e REITs, Salvos/listas. Coluna "Comunidade" do Quadro e bloco de avaliação da página: esconder (sem dados). Decida o que fazer com "Salvar"/"Criar lista" (recomendação esperada: esconder até Salvos existir).
D6 Remoção do score do BANCO de prod (AssetScore, colunas indice*/semaforo em AnaliseQuadroLinha etc.) = ETAPA SEPARADA depois que os Filtros estiverem no ar, com backup e OK. Atenção: ScoringParams também carrega parâmetros de sanidade (Bloco C), valuation e outros — mapear o que migra para criteria_params/outro lugar antes de qualquer drop.
Mantém-se: tudo atrás das flags, só admin vê; Raio-X/CSV/reportar dado/curadoria continuam.

LEIA ANTES: a spec v2.4 e o protótipo v2 acima; docs/analise-ativos/decisoes-fase0.md; docs/analise-ativos/fase1/decisoes.md; docs/analise-ativos/blocoC/decisoes.md; docs/analise-ativos/blocoD/decisoes.md. Código: src/services/analiseAtivos/** (calculo/, quadro/, leitura/ativo/, regras/ incl. valuation/ e comum/linguagem.ts, params/, textosTela.ts), src/components/analiseAtivos/** (quadro/, pagina/, ativo/, comparador/, comum/, shell/), src/app/(admin)/(others-pages)/analise-ativos/**, src/app/api/analise-ativos/**, prisma/schema.prisma (AssetScore ~2457, ScoringParams ~1854, AnaliseQuadroLinha ~2531, AssetFundamentalsPeriod ~1959, AnaliseCenario ~2626). Para "Planejar na carteira": verifique o que JÁ existe de alvo por ativo no app (ativos planejados sem posição, AlocacaoConfig, objetivo/% TARGET da Carteira — grep "planejad", "target", "AlocacaoConfig") antes de propor tabela nova; Registrar operação: reuse a API/fluxo existente da Carteira (achar a rota real).
Banco DEV (Neon, .env local) — consultas read-only via npx tsx --env-file=.env com scripts temporários FORA do repo (em ${OUT}/tmp) para MEDIR a cobertura de cada critério (quantas ações/FIIs têm as séries anuais da janela 5 e 10; ex.: WEGE3, PETR4, ITUB4, BBAS3, TAEE11, AZUL4, HGLG11, XPLG11, KNCR11, MXRF11). NÃO acesse produção.

REGRAS DO APP: paleta OBRIGATÓRIA brandColors.ts (texto/links #396CAA claro / #6E9DC4 escuro; #0079F2 só não-textual; negativos #D92D20/#F97066), dark mode, alvos >= 44px, TABLE_STYLES (src/components/ui/table/tableStyles.ts), casca mobile PWA (BottomSheet, useMobileHistoryLayer), CSRF via csrfFetch, withErrorHandler, invalidação React Query (invalidatePortfolioDerivedQueries após mutação de carteira), linter de linguagem existente.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    mapa_mudancas: {
      type: 'array',
      description: 'cada item da spec v2.4 → o que existe hoje no código → o que muda (remover/alterar/novo) e arquivos',
      items: {
        type: 'object',
        properties: {
          item_spec: { type: 'string' }, hoje: { type: 'string' }, mudanca: { type: 'string' },
          arquivos: { type: 'array', items: { type: 'string' } },
        },
        required: ['item_spec', 'hoje', 'mudanca', 'arquivos'],
      },
    },
    criterios: {
      type: 'array',
      description: 'um por critério da §4.1 (Ações e FIIs tijolo/papel): série no banco, cobertura MEDIDA no dev (janela 5 e 10), decisão',
      items: {
        type: 'object',
        properties: {
          perfil: { type: 'string' }, criterio: { type: 'string' }, tipo: { type: 'string' },
          serie_no_banco: { type: 'string' }, cobertura_dev: { type: 'string' }, decisao: { type: 'string' },
        },
        required: ['perfil', 'criterio', 'tipo', 'serie_no_banco', 'cobertura_dev', 'decisao'],
      },
    },
    fatias: {
      type: 'array',
      description: 'Partes para 3-5 devs em paralelo em worktrees, SEM arquivos em comum; fatia 0 de contratos (schema, tipos, params, textos) bloqueante',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, titulo: { type: 'string' }, objetivo: { type: 'string' },
          arquivos_novos: { type: 'array', items: { type: 'string' } },
          arquivos_alterados: { type: 'array', items: { type: 'string' } },
          arquivos_removidos: { type: 'array', items: { type: 'string' } },
          detalhes: { type: 'string' }, testes: { type: 'string' },
          criterios_aceite: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'titulo', 'objetivo', 'arquivos_novos', 'arquivos_alterados', 'arquivos_removidos', 'detalhes', 'testes', 'criterios_aceite'],
      },
    },
    apis: {
      type: 'array',
      items: { type: 'object', properties: { rota: { type: 'string' }, metodo: { type: 'string' }, contrato: { type: 'string' }, seguranca: { type: 'string' } }, required: ['rota', 'metodo', 'contrato', 'seguranca'] },
    },
    schema_prisma: { type: 'string', description: 'tabelas/colunas novas NESTA rodada (aditivas); o que fica para a etapa de drop (D6)' },
    casos_teste: { type: 'string', description: 'como os 33 casos da §4.5 viram testes (arquivo, dados), quais já passam no código atual e quais mudam' },
    plano_remocao_score: { type: 'string', description: 'D6: inventário de tudo que usa AssetScore/Índice/semáforo/★ (código, jobs, crons, ScoringParams), ordem de remoção e migration de drop separada' },
    plano_producao: { type: 'string', description: 'migration, flags, jobs/crons (criteria_eval noturno), ordem de ativação' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
    perguntas_para_pedro: { type: 'array', items: { type: 'string' }, description: 'dúvidas de regra de negócio para repassar ao cliente (com recomendação)' },
  },
  required: ['resumo', 'mapa_mudancas', 'criterios', 'fatias', 'apis', 'schema_prisma', 'casos_teste', 'plano_remocao_score', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington', 'perguntas_para_pedro'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    prototipo_path: { type: 'string' },
    telas: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, descricao: { type: 'string' }, decisoes: { type: 'array', items: { type: 'string' } } }, required: ['nome', 'descricao', 'decisoes'] } },
    desvios_do_prototipo_pedro: { type: 'array', items: { type: 'string' }, description: 'tudo que difere do HTML do Pedro e por quê (paleta, D3-D5, acessibilidade, app real)' },
    especificacao_visual: { type: 'string' },
    acessibilidade: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o arquiteto explícitas' },
  },
  required: ['resumo', 'prototipo_path', 'telas', 'desvios_do_prototipo_pedro', 'especificacao_visual', 'acessibilidade', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD da migração "Índice MF → Filtros de Fundamentos" (spec v2.4) da Análise de Ativos. ${CONTEXTO}
Tarefa: leia o código real e a spec v2.4 e produza o MAPA TÉCNICO + ESPECIFICAÇÃO de construção, pronta para 3-5 devs em git worktrees separados. Regras:
- mapa_mudancas: percorra a spec v2.4 seção a seção (Quadro, Página do ativo blocos 1–10, Valuation, Comparador, compliance §9, modelo §5) e diga o que já existe, o que muda e onde. Compare também com o HTML do Pedro (screen.js CRITERIA/evalCriteria/critCount — porte TAL QUAL, como pede a spec, ajustando só D3/D4).
- criterios: MEÇA no DEV (read-only) a cobertura de cada critério de Ações e FIIs (tijolo/papel) nas janelas 5 e 10; aplique D3/D4.
- Motor: módulo puro testável (src/services/analiseAtivos/...) + persistência de criteria_eval/criteria_params (versionado, editável depois) + job noturno no molde dos jobs existentes (RSS < 300 MB, < 4 min; Lightsail 1,9 GB). Quadro: filtro E lógico por chips + janela + "Na minha carteira" + ordenação por qualquer coluna (padrão ticker A–Z) + "Mostrar mais" — decida servidor x cliente com números.
- Nada de nota nas respostas da API, nem em telas, CSV, e-mails, notificações, admin. Inventarie TUDO que usa score/Índice/semáforo/★ (plano_remocao_score) — inclui alertas, curadoria, sanidade, textosTela, testes, fixtures, crons.
- Cenários: premissas em branco (§4.4), limites e unidades da spec; o que muda em AnaliseCenario/regras/valuation já existentes.
- Planejar na carteira / Ver na Carteira / Registrar operação: reaproveite o que existir no app (verifique!) e só proponha tabela nova se necessário; consultor agindo por cliente: decida e justifique.
- Fatias SEM ARQUIVOS EM COMUM (compartilhado na fatia 0). Sugestão: 0 contratos (schema aditivo, tipos, params, textos/linter com vocabulário novo, contrato JSON) · A motor de critérios + job + testes §4.5 (24–32) · B Quadro · C Página do ativo (cabeçalho+modais, card critérios, Essencial, Valuation Múltiplos/cenários) · D Comparador — ajuste ao código.
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX da migração "Índice MF → Filtros de Fundamentos" da Análise de Ativos. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Ponto de partida OBRIGATÓRIO: o HTML do Pedro (docs/analise-ativos/spec-v2-pedro-out2026/prototipo-pedro-v2.html). Abra-o com Playwright (import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch() padrão) e tire screenshots de referência em ${OUT}/ref-pedro-*.png (Quadro ações/FIIs, página WEGE3 e HGLG11, Comparador, desktop e 390px). Compare com os componentes reais do app (src/components/analiseAtivos/**) e com docs/analise-ativos/blocoD/prototipo.html.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) que REPRODUZ o do Pedro (mesma estrutura, textos, ordem, comportamento) trocando as cores para a paleta My Finance e aplicando D3–D5 (critérios de FII sem dado aparecem "—" com "sem dado nas demonstrações"; banco com "não se aplica" e "n de 4"; sem Ranking/Comunidade/Stocks/REITs; Salvar/Criar lista conforme sua recomendação). Bancada: DESKTOP (1440) e CELULAR (390x844), claro/escuro. Telas mínimas: Quadro Ações e FIIs (chips, janela 3/5/10, contador, lista vazia, Resumo/Detalhado com Lucro 10 anos, coluna Critérios, ordenação A–Z e por coluna, Mostrar mais), Página WEGE3 (com posição e alvo), ITUB4 (banco, n de 4), HGLG11 (tijolo) e KNCR11 (papel) — cabeçalho com chips Na carteira/Planejado e botões, modais Comparar/Planejar/Ver na Carteira/Registrar operação, card Critérios, Essencial, Valuation Múltiplos e Meus cenários em branco/preenchido/limpar; Comparador Ações (WEGE3, BBAS3, TAEE11) e FIIs tijolo+papel misto (alerta), sem destaque, com "Leitura dos dados". Estados vazio/carregando/erro. Números realistas, nenhuma palavra proibida (§9, casos 23 e 32).
4. Liste em desvios_do_prototipo_pedro TUDO que ficou diferente do HTML dele e por quê (ele pediu "exatamente este layout"). Especifique medidas, estados, acessibilidade (chips com aria-pressed, tooltips acessíveis por teclado/toque, ✓/— com texto, mini-barras com alternativa textual, modais com foco preso) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (produto + dados + compliance + segurança + acessibilidade) da migração "Índice MF → Filtros de Fundamentos". ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código, a spec v2.4, o HTML do Pedro e o banco DEV reais (read-only). Abra o protótipo em ${ux.prototipo_path} E o do Pedro com Playwright (import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch() padrão; screenshots em ${OUT}/revisao-*.png, desktop e 390px, claro e escuro) e compare lado a lado.
Cheque em especial: fidelidade ao HTML do Pedro (o que mudou sem motivo); motor de critérios vs. screen.js e casos 24–32 (empate não cresce, janela 5 = 6 valores, ausente = não atende, caixa líquido dentro do limite, meses 12×janela) — refaça ao menos 2 casos à mão; cobertura MEDIDA (refaça 2 medições); D3/D4 aplicados; inventário de remoção do score COMPLETO (grep você mesmo: AssetScore, indice, semaforo, destaque, ★, nota) — nada de nota sobrando em API/tela/CSV/admin/alertas; vocabulário proibido (§9, casos 23/32) nas telas e no protótipo; cenários com premissas em branco (§4.4) e casos 1–23; Planejar/Registrar reaproveitando o que existe e invalidando caches; consultor agindo; segurança (CSRF, zod, isolamento por usuário); desempenho do filtro do Quadro (~700 ativos × 3 janelas); jobs dentro de 300 MB; paleta/contraste AA; alvos >= 44px; fatias sem arquivos em comum.
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
DESIGN: ${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, desvios: ux.desvios_do_prototipo_pedro, especificacao_visual: ux.especificacao_visual })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(`
REVISÃO: ATUALIZE o mesmo arquivo ${ux.prototipo_path} corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a arquitetura (resumo abaixo). Divergências com o arquiteto EXPLÍCITAS em perguntas_para_wellington (com recomendação).
SUA V1: ${JSON.stringify(ux)}
CRÍTICAS: ${criticas}
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, mapa_mudancas: arq.mapa_mudancas, criterios: arq.criterios, apis: arq.apis })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
