export const meta = {
  name: 'analise-ativos-blocoD-desenho',
  description: 'Análise de Ativos bloco D (Fase 2: Comparador, Fundamentos Raio-X + CSV, Meus cenários): especificação técnica + protótipo UI/UX + revisão crítica + revisão final',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
CONTEXTO DO PROJETO (My Finance — Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Prisma, React Query; repo em /home/huske/dev/front, branch MAIN):
ANÁLISE DE ATIVOS — BLOCO D = FASE 2 do plano (docs/analise-ativos/plano-execucao-set2026.md, linha "2 · Comparador + Raio-X + Cenários"). EM PRODUÇÃO hoje (só ADMIN vê; flag ANALISE_ATIVOS_HABILITADA + ANALISE_ATIVOS_ACESSO=beta com beta vazio): Fase 0 (dados/scores/jobs), Fase 1 (Quadro + Página do ativo /analise-ativos/[ticker], Ações + FIIs; tese privada) e Bloco C (regras de sanidade "em conferência" em todos os indicadores, ScoringParams v2, botão "Reportar dado incorreto" + fila do curador em /admin/curadoria, flag ANALISE_ATIVOS_REPORTE_HABILITADO ligada 08/10).
ESCOPO DO BLOCO D (spec docs/analise-ativos/especificacao-v1.3.txt §3.2 Fundamentos/Valuation, §3.3 Comparador, §4.3, linha ~258 origem dos métodos, linha ~411 tabela de cenários, linhas ~518 e ~534 regras do comparador; SÓ AÇÕES E FIIs — Stocks/REITs continuam fora):
(1) FUNDAMENTOS RAIO-X: seletor Essencial | Raio-X no card Fundamentos da página do ativo. Raio-X = demonstrativos completos, anos em colunas (mais recente à esquerda), primeira coluna fixa, linhas de razão em itálico com fundo cinza, negativos em vermelho da paleta, "Valores em R$ mi · ano fiscal · fonte: CVM", botão "Exportar CSV". Blocos por classe (Ações: Lucro e geração de caixa · Caixa e dívida · Fluxo de caixa; FIIs: Resultado e distribuição · Patrimônio e cota · Carteira de imóveis · Alavancagem e custos). DESCUBRA o que a base realmente tem (AssetStatementLine, AssetFundamentalsPeriod, AssetPerShareYearly, AssetMultiplesYearly, FiiMonthly/FiiQuarterly, AssetShareCount) e diga linha a linha o que dá e o que NÃO dá (sem fonte = não mostrar, decisão 6 da Fase 1: nada sem fonte). Indicadores "em conferência" do Bloco C devem aparecer com o mesmo selo no Raio-X.
(2) VALUATION — MEUS CENÁRIOS: calculadora com dados do ativo pré-preenchidos (editáveis) e premissas do usuário; slider "Margem que você exige" 0–50%; tabela Método · Suas premissas · Resultado · vs. cotação · Com sua margem; barras lado a lado com a linha da cotação; linha "Sua posição" (preço médio da Carteira → P/L ou P/VP sobre custo, yield sobre custo); "Salvar cenário" / "Restaurar valores do ativo". Métodos Ações: Bazin (DPA ÷ yield desejado), Graham (√(22,5 × LPA × VPA)), múltiplo alvo (P/L alvo × LPA, padrão = média 10a), Gordon (DPA × (1+g) ÷ (k − g)). FIIs: renda desejada (rendimento 12m ÷ yield), P/VP alvo × VP/cota, Meta de renda (cotas p/ R$ X/mês, custo hoje, quantas faltam — pode virar objetivo no Planejamento). Rodapé legal fixo da spec. COMPLIANCE FORTE: sem verde/vermelho na coluna vs. cotação, nunca "barato/caro/preço justo/preço-alvo", nada de recomendação (regras em src/services/analiseAtivos/regras/comum/linguagem.ts e textosTela.ts). Casos-limite: LPA negativo (Graham indefinido), k ≤ g (Gordon indefinido), DPA zero, dado em conferência (usar? avisar?). Spec decide se a seção "Múltiplos" (chips por grupo com posição nos 10 anos) já existe da Fase 1 — verifique no código e, se faltar, diga se entra aqui.
(3) COMPARADOR: página nova da área (pill "Comparador" — hoje escondida, decisão 7 da Fase 1), até 4-5 ativos da MESMA classe (FIIs: tijolo/papel/misto com indicadores próprios), ★ destaque = valor numericamente mais favorável por critério (NUNCA "melhor"), "Resumo numérico", mini-gráficos que compartilham min/max, sem CTA de compra, entrada pelo Quadro ("Comparar", hoje escondido) e pela página do ativo; URL compartilhável (?t=WEGE3,ITUB4); celular com slots empilhados. Indicadores em conferência/incompletos: como aparecem e se entram no ★.
Persistência: cenários salvos por usuário (spec linha ~411); consultor agindo por cliente segue a regra da tese (decisão 2 da Fase 1: privado, consultor não lê nem escreve) — CONFIRME se vale para cenários. CSV: sem PII, nome de arquivo, separador ; e vírgula decimal pt-BR? decida e justifique.

LEIA ANTES (precedência): docs/analise-ativos/decisoes-fase0.md; docs/analise-ativos/fase1/decisoes.md e spec-desenho.json; docs/analise-ativos/blocoC/decisoes.md e spec-desenho.json; docs/analise-ativos/especificacao-v1.3.txt; docs/analise-ativos/plano-execucao-set2026.md. Código: src/services/analiseAtivos/** (leitura/ativo/, quadro/, regras/, textosTela.ts, regras/comum/linguagem.ts), src/components/analiseAtivos/** (pagina/PaginaAtivo.tsx, ativo/, quadro/, comum/, shell/), src/app/(admin)/(others-pages)/analise-ativos/**, src/app/api/analise-ativos/**, prisma/schema.prisma (modelos Asset*/Fii*/Analise*, ~linha 1867+).
Banco DEV (Neon, .env local) tem histórico reduzido — consulte read-only com prisma via npx tsx --env-file=.env (scripts temporários FORA do repo, ex.: no scratchpad ${OUT}/tmp) para medir cobertura real do Raio-X (WEGE3, PETR4, ITUB4, VALE3, TAEE11, HGLG11, XPLG11, KNCR11, MXRF11, BCFF11). NÃO acesse produção.

REGRAS DO APP: paleta OBRIGATÓRIA src/constants/brandColors.ts (texto/links #396CAA claro / #6E9DC4 escuro; #0079F2 só não-textual; negativos #D92D20/#F97066), fonte Outfit, dark mode, alvos >= 44px, TABLE_STYLES para tabelas (src/components/ui/table/tableStyles.ts), casca mobile PWA (BottomSheet, useMobileHistoryLayer para voltar fechar sheet), compliance, CSRF via csrfFetch, erros padronizados (withErrorHandler), invalidação React Query. Base visual: docs/analise-ativos/fase1/prototipo.html e docs/analise-ativos/blocoC/prototipo.html (mesma bancada/página).
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fatias: {
      type: 'array',
      description: 'Partes independentes para 3-5 devs em paralelo, SEM arquivos em comum; fatia 0 de contratos (schema, tipos, params, textos) se precisar',
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
    cobertura_raio_x: {
      type: 'array',
      description: 'uma entrada por linha/indicador do Raio-X da spec',
      items: {
        type: 'object',
        properties: {
          classe: { type: 'string' }, bloco: { type: 'string' }, linha: { type: 'string' },
          fonte_no_banco: { type: 'string', description: 'tabela.coluna ou "sem fonte"' },
          cobertura_dev: { type: 'string', description: 'medida no DEV: quantos ativos/anos têm, exemplos' },
          decisao: { type: 'string', description: 'mostra / não mostra / mostra com ressalva' },
        },
        required: ['classe', 'bloco', 'linha', 'fonte_no_banco', 'cobertura_dev', 'decisao'],
      },
    },
    metodos_cenarios: { type: 'string', description: 'fórmulas, padrões de premissas, casos-limite e textos por método' },
    regras_comparador: { type: 'string', description: 'indicadores por classe/subtipo, critério do ★ por indicador (maior/menor/neutro), em conferência/incompleto, limites' },
    plano_producao: { type: 'string', description: 'migration, flags novas (por recurso?), o que ligar e em que ordem' },
    plano_qa: { type: 'string' },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada pergunta COM a recomendação; divergências com o designer explícitas' },
  },
  required: ['resumo', 'fatias', 'apis', 'schema_prisma', 'cobertura_raio_x', 'metodos_cenarios', 'regras_comparador', 'plano_producao', 'plano_qa', 'riscos', 'perguntas_para_wellington'],
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

const archPrompt = (extra) => `Você é o ARQUITETO/TECH LEAD do bloco D da Análise de Ativos. ${CONTEXTO}
Tarefa: leia o código real (leitura da página do ativo, Quadro, regras/flags do Bloco C, tese privada da Fase 1 como modelo de dado por usuário, APIs e padrões de auth/zod/React Query) e produza a ESPECIFICAÇÃO TÉCNICA do bloco D, pronta para 3-5 desenvolvedores em git worktrees separados. Regras:
- Fatias SEM ARQUIVOS EM COMUM (compartilhado vai para a fatia 0 com contrato descrito). Sugestão: 0 contratos · A Raio-X + CSV · B Meus cenários · C Comparador (página + entradas) · D integração na página do ativo/Quadro — ajuste ao que o código pedir.
- MEÇA no banco DEV (read-only) a cobertura de cada linha do Raio-X e preencha cobertura_raio_x; o que não tem fonte não aparece.
- Concreto: modelo Prisma aditivo dos cenários salvos, rotas com contrato JSON e segurança (zod, CSRF, isolamento por usuário, consultor agindo, limites), cálculo dos métodos num módulo puro testável (src/services/analiseAtivos/...), leitura do comparador (batch, cache), CSV (gerado no servidor ou no cliente — decida), flags (por recurso? ANALISE_ATIVOS_COMPARADOR etc.), textos de compliance passando pelo linter de linguagem existente.
- Diga o plano de QA e o de produção (migration, flags, ordem).
- Não escreva código no repo — só leia e especifique. NÃO rode dev server.
${extra}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX do bloco D da Análise de Ativos. ${CONTEXTO}
Tarefa:
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela.
2. Parta de docs/analise-ativos/blocoC/prototipo.html e docs/analise-ativos/fase1/prototipo.html (mesma bancada, mesma página do ativo) e olhe os componentes reais em src/components/analiseAtivos/** para o visual ficar igual ao app.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) com bancada: DESKTOP (1440) e CELULAR (390x844), claro/escuro, "Ver a 320px", seletor de cenários. Telas mínimas: card Fundamentos com Essencial | Raio-X (WEGE3 ação e HGLG11 FII tijolo, KNCR11 FII papel), linhas sem dado e em conferência, Exportar CSV; Valuation › Meus cenários para WEGE3 (com e sem posição na Carteira) e para MXRF11 com Meta de renda, casos-limite (LPA negativo, k ≤ g), salvar/restaurar, estados; Comparador de ações (WEGE3, ITUB4, TAEE11) e de FIIs tijolo (HGLG11, XPLG11) com ★ e mini-gráficos, adicionar/remover ativo, vazio, limite atingido, classe diferente recusada, celular com slots empilhados; entradas "Comparar" no Quadro e na página do ativo. Estados vazio/carregando/erro. Texto pt-BR neutro (sem recomendação, nunca barato/caro/preço justo), números realistas, SÓ cores da paleta My Finance.
4. Especifique medidas, estados, acessibilidade (tabela larga com coluna fixa navegável por teclado, slider acessível, status não só por cor, gráficos com alternativa textual) e dark mode.
${extra}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA, agentType: 'Plan' }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'uma das propostas falhou', arq, ux }

phase('Revisão crítica')
const rev = await agent(`Você é o REVISOR CRÍTICO (produto + dados + segurança + acessibilidade + compliance) do bloco D da Análise de Ativos. ${CONTEXTO}
DERRUBE as propostas abaixo com evidência. Verifique contra o código e o banco DEV reais (read-only) e abra o protótipo em ${ux.prototipo_path} (renderize com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch() padrão; screenshots em ${OUT}/revisao-*.png, desktop e 390px, claro e escuro).
Cheque em especial: cobertura do Raio-X foi MEDIDA e nada sem fonte aparece (refaça ao menos 2 medições); fórmulas dos cenários corretas e casos-limite (LPA ≤ 0, VPA ≤ 0, k ≤ g, DPA 0, dado em conferência); compliance (nenhum "barato/caro/preço justo/alvo/recomendação", cores neutras na coluna vs. cotação, rodapé legal, ★ não vira "melhor"); critério do ★ por indicador faz sentido (ex.: P/L menor, DY maior, dívida menor, vacância menor; e indicadores neutros sem ★); comparador entre subtipos de FII; segurança (isolamento dos cenários por usuário, consultor agindo, CSRF, limites, CSV sem injeção de fórmula — células começando com = + - @); desempenho do comparador (N ativos × M anos); paleta/contraste AA claro/escuro; alvos >= 44px; tabela larga no celular; fatias sem arquivos em comum e realistas.
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
ARQUITETURA: ${JSON.stringify({ resumo: arq.resumo, apis: arq.apis, cobertura_raio_x: arq.cobertura_raio_x, metodos_cenarios: arq.metodos_cenarios, regras_comparador: arq.regras_comparador })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal || arq, design: uxFinal || ux, revisao: rev }
