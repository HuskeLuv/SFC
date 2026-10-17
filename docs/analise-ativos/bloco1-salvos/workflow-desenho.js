export const meta = {
  name: 'analise-salvos-desenho',
  description: 'Desenho do bloco 1 da Análise: Salvos (listas, Salvar, filtros salvos), Salvar comparação + PDF, alertas',
  phases: [
    { title: 'Propostas', detail: 'arquiteto e designer UI/UX em paralelo' },
    { title: 'Revisão crítica', detail: 'revisor tenta derrubar as duas propostas' },
    { title: 'Revisão final', detail: 'arquiteto e designer incorporam as críticas' },
  ],
}

const OUT = args.outDir
const CONTEXTO = `
PROJETO: My Finance — /home/huske/dev/front (Next.js 15 App Router, React 19, Tailwind v4, TS, Prisma 6, React Query), branch main (c806abf1).
ÁREA: "Análise de Ativos" (/analise-ativos), EM PRODUÇÃO atrás de ANALISE_ATIVOS_HABILITADA + beta (feature_beta_users; hoje 1 usuário + admin). Já existe: Quadro com Filtros de Fundamentos (Ações e FIIs; 6 critérios, janela 3/5/10, "n de 6"), página do ativo (cabeçalho com Comparar/Planejar/Ver na Carteira/Registrar operação, Critérios, Essencial/Raio-X, Valuation/Meus cenários, Minha tese privada = AnaliseTese), Comparador (até 4, "Copiar link", NÃO grava — rec. 7), reporte de dado (bloco C). Flags em src/lib/analiseAtivosConfig.ts; /api/analise-ativos/config devolve recursos.*.

BLOCO 1 A DESENHAR (o dono, Wellington, mandou construir tudo que está no HTML do Pedro e falta; este é o 1º bloco):
 a) SALVOS: pill "Salvos" no topo da área (hoje pílulas Quadro | Comparador; Ranking virá no bloco 3 — deixar a casca pronta para 4 pílulas na ordem da spec: Quadro, Comparador, Ranking, Salvos), botão navy "Criar lista" no cabeçalho da área (spec §3), listas NOMEADAS (criar, renomear, apagar, reordenar?), botão "Salvar" no cabeçalho do ativo que alterna (vira "Salvo ✓" + toast; spec §3.2 "Salvar alterna o ativo em watchlist_items"), salvar a partir da linha do Quadro, página Salvos com tabs por classe (Ações · FIIs; Stocks/REITs virão no bloco 4 — modelo de dados já preparado para as 4 classes) e tabela com as colunas do Quadro (critérios n de 6, preço, DY...) + remover.
 b) FILTROS SALVOS no Quadro (spec §"Quadro": "filtros salvos, tabelas personalizadas"): salvar a combinação janela + critérios + setor + "na minha carteira" com nome, reaplicar. Avaliar se "tabelas personalizadas" (escolher colunas) cabe aqui ou fica fora — recomendar.
 c) COMPARADOR: "Salvar comparação" (spec: grava em comparisons; reabrir) e "Exportar PDF" (spec "exportar PDF real"). Decidir: PDF no servidor ou print-CSS do navegador; funcionar no PWA iOS/Android.
 d) ALERTAS das listas (spec Entrega 5: "listas nomeadas, ativos salvos, alertas"): propor o conjunto mínimo NEUTRO (sem recomendação): ex. cotação cruza um valor definido pelo usuário, mudança na contagem "n de 6" após o job diário de critérios (10:30 UTC), provento anunciado/pago, nova demonstração publicada. Entrega via Notification in-app + push do PWA (já ligado em prod; procure o serviço de push/Notification existente) com preferência por alerta; job diário (crons no servidor Lightsail em /etc/cron.d/myfinance via scripts/myfinance-job.sh — veja como os jobs da área são registrados) sem chamar terceiros na renderização; limites anti-spam.
 IMPORTANTE: já existe o modelo Watchlist (Carteira — ativos planejados/objetivo). NÃO confundir nem reaproveitar; nomes novos sem colisão (ex.: AnaliseLista/AnaliseListaItem/AnaliseFiltroSalvo/AnaliseComparacao/AnaliseAlerta, @@map analise_*).
LEIA: docs/analise-ativos/spec-v2-pedro-out2026/especificacao-v2.txt (§3 casca, §3.1 Quadro, §3.2 cabeçalho, §3.3 Comparador, §3.5 Salvos, §9 linguagem), docs/analise-ativos/spec-v2-pedro-out2026/prototipo-pedro-v2.html (HTML do Pedro — estrutura/textos/comportamento = D1; cores = paleta My Finance), docs/analise-ativos/v2-filtros/decisoes.md (D5 tirou Salvos; AGORA revertido pelo dono), docs/analise-ativos/v2-filtros/prototipo.html (visual atual aprovado — base visual), docs/analise-ativos/blocoD/ATIVACAO.md (Comparador/Cenários). Código: src/app/(admin)/analise-ativos/** (localize), src/components/analiseAtivos/**, src/app/api/analise-ativos/**, src/services/analiseAtivos/** (textos*.ts, textosLiterais.ts, regras/comum/linguagem*), src/lib/analiseAtivosConfig.ts, prisma/schema.prisma (AnaliseTese, AnaliseCenario como molde de tabela por usuário), export LGPD (/api/profile/export) e exclusão de conta.
REGRAS DO APP: paleta OBRIGATÓRIA src/constants/brandColors.ts; fonte do app; dark mode; alvos >= 44px; TABLE_STYLES; casca mobile PWA (BottomSheet, useMobileHistoryLayer); compliance (nada de recomendação; varredura linguagemV2 — palavras proibidas como compre, barato, caro, oportunidade, faltam); CSRF via csrfFetch; zod; withErrorHandler; requireAuthWithActing (consultor agindo por cliente — decidir o que pode); invalidação React Query; migrations SÓ ADITIVAS; nova flag ANALISE_ATIVOS_SALVOS_HABILITADO (e talvez ALERTAS separada) desligada por padrão; LGPD (export + cascade na exclusão); rate limit. Banco DEV (Neon) pelo .env local pode ser consultado read-only. NÃO acesse produção.
`

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    modelos_prisma: { type: 'string', description: 'modelos novos completos (campos, índices, unique, cascade, limites por usuário)' },
    apis: { type: 'array', items: { type: 'object', properties: { metodo: { type: 'string' }, rota: { type: 'string' }, descricao: { type: 'string' } }, required: ['metodo', 'rota', 'descricao'] } },
    alertas: { type: 'string', description: 'tipos, job, frequência, dedupe, entrega in-app/push, preferências, anti-spam, cron' },
    pdf: { type: 'string' },
    flags_e_ativacao: { type: 'string' },
    fatias: {
      type: 'array',
      description: '3-5 fatias para devs em paralelo em worktrees SEM arquivos em comum; fatia 0 de contratos bloqueante se precisar',
      items: { type: 'object', properties: {
        id: { type: 'string' }, titulo: { type: 'string' }, objetivo: { type: 'string' },
        arquivos_novos: { type: 'array', items: { type: 'string' } }, arquivos_alterados: { type: 'array', items: { type: 'string' } },
        depende_de: { type: 'array', items: { type: 'string' } }, detalhes: { type: 'string' }, testes: { type: 'string' },
        criterios_aceite: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'titulo', 'objetivo', 'arquivos_novos', 'arquivos_alterados', 'depende_de', 'detalhes', 'testes', 'criterios_aceite'] },
    },
    riscos: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'máx. 5 decisões de produto genuínas, cada uma COM recomendação' },
  },
  required: ['resumo', 'modelos_prisma', 'apis', 'alertas', 'pdf', 'flags_e_ativacao', 'fatias', 'riscos', 'perguntas_para_wellington'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    prototipo_path: { type: 'string' },
    telas: { type: 'array', items: { type: 'string' } },
    especificacao_visual: { type: 'string', description: 'componentes, estados, textos literais, comportamento mobile' },
    acessibilidade: { type: 'string' },
    decisoes: { type: 'array', items: { type: 'string' } },
    perguntas_para_wellington: { type: 'array', items: { type: 'string' }, description: 'cada uma COM recomendação' },
  },
  required: ['resumo', 'prototipo_path', 'telas', 'especificacao_visual', 'acessibilidade', 'decisoes', 'perguntas_para_wellington'],
}

const archPrompt = (extra) => `Você é o ARQUITETO de software. Leia a spec, o HTML do Pedro e o CÓDIGO REAL, e desenhe o bloco 1 abaixo de ponta a ponta (dados, APIs, job de alertas, PDF, flags, LGPD, consultor, testes). Concreto: arquivos reais, nomes de modelos, rotas. Não escreva código de produção; só leia (pode consultar o banco DEV read-only).${extra}\n${CONTEXTO}`

const uxPrompt = (extra) => `Você é o DESIGNER UI/UX.
1. Invoque a skill "artifact-design" (ferramenta Skill) ANTES de escrever o HTML e siga o contrato dela (mas NÃO publique artifact — só escreva o arquivo).
2. Parta de docs/analise-ativos/v2-filtros/prototipo.html (visual aprovado atual) e do HTML do Pedro (estrutura/textos), e olhe os componentes reais em src/components/analiseAtivos para o visual ficar igual ao app.
3. Escreva UM protótipo HTML navegável em ${OUT}/prototipo.html (crie a pasta) com bancada: DESKTOP (1440) e CELULAR (390x844), claro/escuro, "Ver a 320px", seletor de cenários. Telas mínimas: casca da área com pílulas (Quadro | Comparador | Salvos; espaço para Ranking) e "Criar lista"; modal/sheet de criar e renomear lista; cabeçalho do ativo com "Salvar" ↔ "Salvo ✓" e a escolha de lista (popover no desktop, BottomSheet no celular); salvar pela linha do Quadro; página Salvos (vazia, com listas, tabs Ações · FIIs, tabela/cartões no celular, remover, apagar lista com confirmação); filtros salvos no Quadro (salvar, aplicar, apagar); Comparador com "Salvar comparação", lista de comparações salvas e "Exportar PDF" (mostre a prévia do PDF); alertas (configurar por ativo/lista, lista de alertas, como chegam: notificação in-app + push; preferências; estados vazio/limite). Estados vazio/carregando/erro. pt-BR neutro (sem recomendação), números realistas, SÓ cores da paleta My Finance.${extra}\n${CONTEXTO}`

phase('Propostas')
const [arq, ux] = await parallel([
  () => agent(archPrompt(''), { label: 'arquiteto', phase: 'Propostas', schema: ARCH_SCHEMA }),
  () => agent(uxPrompt(''), { label: 'designer-ui-ux', phase: 'Propostas', schema: UX_SCHEMA }),
])
if (!arq || !ux) return { erro: 'proposta faltando', arq, ux }

phase('Revisão crítica')
const critica = await agent(`Você é o REVISOR CRÍTICO adversarial. DERRUBE as propostas abaixo com evidência. Verifique contra a spec do Pedro, o código e o banco DEV reais (read-only) e abra o protótipo em ${ux.prototipo_path} (renderize com Playwright: import de /home/huske/dev/front/node_modules/playwright/index.mjs, chromium.launch({executablePath: '/home/huske/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'}); screenshots em ${OUT}/revisao-*.png, desktop e 390px, claro e escuro). Procure: desvios da spec/HTML do Pedro sem motivo; colisão com Watchlist da Carteira; migrations não aditivas; fatias com arquivos em comum; LGPD (export/exclusão) esquecida; consultor; rate limit/limites por usuário; alertas que soem como recomendação ou gerem spam; PDF que não funcione no PWA iOS; textos proibidos; paleta fora de brandColors; acessibilidade/alvos; telas/estados faltando; coerência arquiteto × designer. Liste achados com severidade alta/média/baixa e correção.\n${CONTEXTO}\n\nARQUITETURA:\n${JSON.stringify(arq)}\n\nDESIGN:\n${JSON.stringify(ux)}`,
  { label: 'revisor', phase: 'Revisão crítica', schema: { type: 'object', properties: { achados: { type: 'array', items: { type: 'object', properties: { alvo: { type: 'string', description: 'arquitetura|design|ambos' }, severidade: { type: 'string' }, achado: { type: 'string' }, correcao: { type: 'string' } }, required: ['alvo', 'severidade', 'achado', 'correcao'] } } }, required: ['achados'] } })

phase('Revisão final')
const [arqFinal, uxFinal] = await parallel([
  () => agent(archPrompt(`\nREVISÃO: produza a VERSÃO FINAL incorporando cada crítica válida (rejeitadas em "riscos" com o porquê), coerente com o protótipo. Divergências com o designer EXPLÍCITAS em perguntas_para_wellington (com recomendação; máx. 5 no total).\nSUA PROPOSTA:\n${JSON.stringify(arq)}\nCRÍTICAS:\n${JSON.stringify(critica)}\nDESIGN (resumo):\n${JSON.stringify({ resumo: ux.resumo, telas: ux.telas, decisoes: ux.decisoes })}`), { label: 'arquiteto-final', phase: 'Revisão final', schema: ARCH_SCHEMA }),
  () => agent(uxPrompt(`\nREVISÃO: ATUALIZE o mesmo arquivo ${ux.prototipo_path} corrigindo cada crítica de design válida (rejeitadas: justifique em "decisoes"). Coerência com a arquitetura (resumo abaixo). Divergências com o arquiteto EXPLÍCITAS em perguntas_para_wellington (com recomendação).\nSUA PROPOSTA:\n${JSON.stringify(ux)}\nCRÍTICAS:\n${JSON.stringify(critica)}\nARQUITETURA:\n${JSON.stringify({ resumo: arq.resumo, apis: arq.apis, alertas: arq.alertas, pdf: arq.pdf })}`), { label: 'designer-final', phase: 'Revisão final', schema: UX_SCHEMA }),
])

return { arquitetura: arqFinal, design: uxFinal, criticas: critica }
