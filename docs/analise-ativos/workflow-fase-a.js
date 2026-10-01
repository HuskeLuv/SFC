export const meta = {
  name: 'analise-ativos-fase-a',
  description: 'Análise de Ativos — Fase A: spike de dados (CVM ações/FIIs, BRAPI, EUA, regras) com QA de dados e relatório consolidado',
  phases: [
    { title: 'Levantamento', detail: '5 papéis: ações CVM, FIIs CVM, BRAPI+preços, EUA, regras da spec' },
    { title: 'QA de dados', detail: 'confere amostras contra fontes públicas independentes' },
    { title: 'Consolidação', detail: 'relatório da Fase A + decisões p/ Fase 0' },
  ],
}

const A = args
const BASE = `Contexto: app My Finance (repo ${A.repo}, Next.js 15 + Prisma). Nova área "Análise de Ativos" (spec do Pedro v1.3 em ${A.repo}/docs/analise-ativos/especificacao-v1.3.txt; protótipo em docs/analise-ativos/prototipo-pedro.html; plano em docs/analise-ativos/plano-execucao-set2026.md — LEIA o plano e as seções da spec relevantes ao seu papel). Estamos na FASE A = spike de dados: provar com dados reais o que dá para montar, com que cobertura e com quais regras de sanidade, ANTES de desenhar tabelas e telas (Fase 0).
Regras duras: NÃO gravar nada em banco (o .env aponta p/ Neon DEV — só leitura via prisma/tsx é permitida); NUNCA acessar produção/Lightsail; NÃO commitar nem criar branch; scripts novos só em scripts/analise-ativos/ (nomes próprios do seu papel, não edite scripts de outro papel); saídas (json/md) em docs/analise-ativos/fase-a/ com prefixo do seu papel. Zips da CVM já baixados em ${A.cvmDir} (DFP 2014-2026, ITR 2025-2026, FCA 2026, FRE 2014-2020, FII mensal/trimestral 2016-2026, FII anual 2025-2026, cad_cia_aberta.csv); pode baixar mais de dados.cvm.gov.br para esse mesmo diretório. Rodar TS com: cd ${A.repo} && NODE_OPTIONS=--max-old-space-size=6144 npx tsx <script>. Se precisar de banco dev: npx tsx --env-file=.env. Escreva em português. Seja empírico: números medidos, não suposições. Na amostraParaVerificar coloque 6-10 valores concretos (ativo, campo, período, valor, unidade) que um QA possa conferir contra fonte pública independente (release de RI, Status Invest, Fundamentus, site do FII, SEC).`

const REL = {
  type: 'object',
  properties: {
    papel: { type: 'string' },
    resumo: { type: 'string', description: '5-10 linhas: veredito do papel' },
    cobertura: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, valor: { type: 'string' }, observacao: { type: 'string' } }, required: ['item', 'valor'] } },
    camposSpecSemFonte: { type: 'array', items: { type: 'string' }, description: 'campos da spec que NÃO dá para obter com a fonte avaliada' },
    regrasSanidade: { type: 'array', items: { type: 'string' } },
    riscos: { type: 'array', items: { type: 'string' } },
    recomendacoesFase0: { type: 'array', items: { type: 'string' }, description: 'modelo de dados, jobs, ordem, fontes' },
    perguntasPedro: { type: 'array', items: { type: 'string' } },
    arquivos: { type: 'array', items: { type: 'string' } },
    amostraParaVerificar: { type: 'array', items: { type: 'object', properties: { ativo: { type: 'string' }, campo: { type: 'string' }, periodo: { type: 'string' }, valor: { type: 'string' }, unidade: { type: 'string' } }, required: ['ativo', 'campo', 'periodo', 'valor'] } },
  },
  required: ['papel', 'resumo', 'cobertura', 'regrasSanidade', 'riscos', 'recomendacoesFase0', 'arquivos', 'amostraParaVerificar'],
}

const QA = {
  type: 'object',
  properties: {
    verificados: { type: 'array', items: { type: 'object', properties: { ativo: { type: 'string' }, campo: { type: 'string' }, periodo: { type: 'string' }, valorSpike: { type: 'string' }, valorFonte: { type: 'string' }, fonte: { type: 'string' }, bate: { type: 'boolean' }, explicacao: { type: 'string' } }, required: ['ativo', 'campo', 'bate'] } },
    problemasMetodo: { type: 'array', items: { type: 'string' }, description: 'erros de método encontrados no script/raciocínio do papel' },
    veredito: { type: 'string' },
  },
  required: ['verificados', 'problemasMetodo', 'veredito'],
}

const PAPEIS = [
  {
    key: 'acoes-cvm',
    verifica: true,
    prompt: `${BASE}
PAPEL: dados de AÇÕES via CVM. Já existe o spike scripts/analise-ativos/spike-cvm-acoes.ts (feito pelo orquestrador; pode evoluir) — resultado atual: 340 companhias com ação na B3, 237 com 10 exercícios completos (receita, lucro, PL, ações), 331 com 5+; bancos/seguradoras (30) com molde financeiro (lucro em 3.09 casado por descrição, sem EBIT/dívida). Problemas abertos que VOCÊ deve resolver/medir:
(1) nº de ações: DFP só traz composição do capital a partir de 2020 (antes usamos FRE, desatualizado em anos de split: WEGE3 2019 deu 4197 mi ações vs LPA CVM implicando ~2098); escala em milhares em algumas companhias (VALE3 2024 = 4,269 "mi" com LPA CVM 0 → a checagem lucro/ações/LPA não pegou). Proponha e teste uma regra robusta (ex.: vizinhança entre anos + fator de eventos corporativos do nosso banco dev: tabela AssetCorporateAction, e/ou derivar ações de lucro/LPA) e meça quantos company-years ficam inconsistentes depois.
(2) ajuste por desdobramento para séries por ação (LPA, VPA, DPA) — usar AssetCorporateAction do banco dev (só leitura).
(3) payout: pelo caixa pago (DFC) sai defasado (PETR4 2024 = 275%). Avalie proventos DECLARADOS via DMPL (linhas de dividendos/JCP) e/ou nossa AssetDividendHistory × ações. Recomende a fonte.
(4) TTM: montar últimos 12 meses com ITR 2025/2026 + DFP (receita, lucro) para 10 tickers e checar contra soma trimestral.
(5) setor/segmento: FCA Setor_Atividade é grosso ("Emp. Adm. Part. - ..."); ver se há classificação setorial melhor gratuita (ex.: B3 classificação setorial em planilha pública) e o que usar para "pares do setor".
(6) calendário de resultados: dataset IPE da CVM (dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/) ou datas de entrega de DFP/ITR — dá para montar "próximos eventos"?
Amostra: WEGE3, PETR4, VALE3, ITUB4, BBAS3, TAEE11, EGIE3, MGLU3, ABEV3, BBSE3, RADL3, LREN3 (+ outros se útil). Grave o relatório detalhado em docs/analise-ativos/fase-a/acoes-cvm.md.`,
  },
  {
    key: 'fiis-cvm',
    verifica: true,
    prompt: `${BASE}
PAPEL: dados de FIIs via CVM. Já existe scripts/analise-ativos/spike-cvm-fiis.ts (escrito pelo orquestrador, AINDA NÃO RODADO — rode, corrija bugs, evolua). Ele lê Informe Mensal (geral: ISIN→ticker, Segmento_Atuacao, Mandato; complemento: VP/cota, PL, cotas, cotistas, DY do mês; ativo_passivo: imóveis, CRI, passivo) e Informe Trimestral (imóvel: área, vacância, inadimplência, % receita). Meça para todos os FIIs em bolsa: meses de histórico, cotistas, VP/cota, DY 12m, meses seguidos com rendimento, tipo tijolo/papel/fof/híbrido (regra da spec: híbrido = tijolo se imóveis ≥ 50% do PL), nº imóveis, vacância física ponderada por área, inadimplência, alavancagem (passivo/PL).
Verifique também: (a) ISIN→ticker cobre quantos FIIs do nosso catálogo dev (Asset type='fii'; só leitura) e casos que falham (tickers 12/13, fundos com classes); (b) DY/rendimento da CVM vs nossa AssetDividendHistory para 5 FIIs; (c) vacância FINANCEIRA existe em algum dataset? (d) quais campos da spec (seção 3.2/4.2/5: padrão construtivo AAA/AA/A, nº inquilinos, maior inquilino, contratos atípicos, prazo médio, LTV, nº CRIs, indexador, duration, high yield, cap rate, ABL) saem do Informe Trimestral/Anual estruturado e quais só por PDF (Fase 5). Olhe inf_trimestral (ativo, direito, imovel_renda_acabado_inquilino/contrato, rentabilidade) e inf_anual.
Amostra: HGLG11, KNRI11, XPML11, VISC11, BTLG11, XPLG11, HGRU11, TRXF11, MXRF11, KNCR11, KNIP11, CPTS11, IRDM11, RECR11, HFOF11. Relatório detalhado em docs/analise-ativos/fase-a/fiis-cvm.md.`,
  },
  {
    key: 'brapi-precos',
    verifica: true,
    prompt: `${BASE}
PAPEL: o que já temos + BRAPI paga. (1) BRAPI_API_KEY (plano PAGO; .env) — teste para 5 tickers (WEGE3, PETR4, ITUB4, HGLG11, MXRF11) os módulos balanceSheetHistory, incomeStatementHistory, cashflowHistory, financialData, defaultKeyStatistics e as variantes Quarterly: quantos anos/trimestres voltam, quais campos, bate com a CVM (compare com o que o papel de ações vai medir: ex. WEGE3 lucro 2024 = R$ 6.042,6 mi; PETR4 2024 = R$ 36.606 mi)? Tem algo para FII (VP/cota, vacância)? Faça no máximo ~40 requisições. Veja como src/services/pricing/fundamentalsService.ts e brapiSync.ts chamam a API.
(2) Histórico de preços no banco dev (AssetPriceHistory, só leitura): profundidade (anos) para ações e FIIs do catálogo, % com 10 anos, se os preços são AJUSTADOS por proventos/splits ou brutos (checar em torno de um split conhecido, ex. WEGE3 2021, MGLU3, e fontes BRAPI/COTAHIST/YAHOO), buracos. Isso decide se "cotação no fim do ano fiscal ÷ métrica do ano" (multiples_yearly) é viável e como ajustar.
(3) Volume/liquidez média 30d (usada em "top 100 FIIs por liquidez" e filtros): temos? BRAPI dá? COTAHIST dá?
(4) Catálogo: quantos Asset por type (stock B3, fii, bdr, reit, stock USD) no dev.
Relatório em docs/analise-ativos/fase-a/brapi-precos.md.`,
  },
  {
    key: 'eua',
    verifica: true,
    prompt: `${BASE}
PAPEL: Stocks e REITs dos EUA (vão para a Fase 4, mas precisamos do custo/viabilidade agora). (1) SEC EDGAR companyfacts (https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json; mapa ticker→CIK em https://www.sec.gov/files/company_tickers.json; exige header User-Agent com contato, use "MyFinance suporte@appmyfinance.com.br") para AAPL, MSFT, KO, JNJ, O, PLD, SPG, AMT: anos disponíveis de Revenues, NetIncomeLoss, StockholdersEquity, EPS, dividends/share, shares outstanding, debt; problemas de tags (variação de conceito entre empresas/anos). FFO/AFFO: confirmar que não está no XBRL us-gaap e ver se dá para aproximar (net income + D&A de imóveis − ganhos de venda) e o erro vs FFO reportado.
(2) Preço diário EUA: o app hoje não tem feed (ver src/services/pricing/*; Yahoo só índices/FX). Pesquise preços e limites atuais (2026) de EODHD, Financial Modeling Prep, Polygon/massive, Alpha Vantage, Tiingo e se o Yahoo (já usado no repo) serve para fechamento diário de ~500-1000 tickers. Custo mensal por opção, licença para exibir em app comercial.
(3) Escopo: quantos tickers (S&P 500? REITs do índice MSCI US REIT?) faria sentido no MVP EUA. Relatório em docs/analise-ativos/fase-a/eua.md.`,
  },
  {
    key: 'regras-spec',
    verifica: false,
    prompt: `${BASE}
PAPEL: analista de regras (sem dados externos). Leia a spec inteira (seções 3, 4, 5, 9) e o protótipo (docs/analise-ativos/prototipo-pedro.html: funções checksFor, bayes, renderSim, simResults, rangeBar, renderMult). (1) Recalcule TODOS os 23 casos de teste da seção 4.6 com as fórmulas da seção 4.5 (escreva um script TS pequeno scripts/analise-ativos/spike-regras-valuation.ts que compute e compare) — aponte os que não batem e por quê. (2) Compare as regras da spec (Índice MF 4.1, semáforo 4.2, destaque do comparador 4.3, ranking 4.4) com a implementação do protótipo e liste divergências. (3) Liste ambiguidades/lacunas que travam a implementação (ex.: Índice MF para bancos/seguradoras onde Dív.líq/EBITDA não existe; "lucros seguidos" quando há prejuízo antigo; FII fof; FII papel "meses com rendimento" = idem tijolo?; como tratar P/L negativo; o que é "dado obrigatório ausente" por classe), cada uma com uma proposta de resolução. (4) Revise as strings do protótipo contra a seção 9 (palavras proibidas, adjetivos) e liste ocorrências. (5) Mapeie o modelo de dados da seção 5 para o schema real (prisma/schema.prisma: Asset, Portfolio, AlocacaoConfig, AssetPriceHistory, AssetDividendHistory, AssetFundamentals, Community*) — o que reaproveitar, o que criar, colisões de nome (atenção: /api/analises já existe). Relatório em docs/analise-ativos/fase-a/regras-spec.md. amostraParaVerificar pode ser vazia.`,
  },
]

phase('Levantamento')
const resultados = await pipeline(
  PAPEIS,
  (p) => agent(p.prompt, { label: `dados:${p.key}`, phase: 'Levantamento', schema: REL }),
  (rel, p) => {
    if (!rel || !p.verifica || !rel.amostraParaVerificar?.length) return { rel, qa: null }
    return agent(
      `${BASE}
PAPEL: QA de dados, cético. Outro agente (papel "${p.key}") produziu o relatório abaixo e os arquivos citados. Sua tarefa: (1) para CADA item da amostra, buscar o valor numa fonte pública INDEPENDENTE da usada pelo agente (release/central de resultados de RI, Status Invest, Fundamentus, Investidor10, relatório gerencial do FII, 10-K na SEC — use WebFetch/WebSearch via ToolSearch) e dizer se bate (tolerância: 1% em valores, 0,5 p.p. em percentuais; diferenças explicáveis por consolidado×controladora, ajuste de split ou data devem ser explicadas); (2) ler o(s) script(s) do papel e apontar erros de método (filtros de versão, exercício, escala, contas erradas, vieses de cobertura). Não altere os scripts do outro papel. Se não achar fonte independente para um item, marque bate=false com explicacao "sem fonte".
RELATÓRIO:
${JSON.stringify(rel, null, 1)}`,
      { label: `qa:${p.key}`, phase: 'QA de dados', schema: QA },
    ).then((qa) => ({ rel, qa }))
  },
)

const ok = resultados.filter(Boolean)
log(`${ok.length}/${PAPEIS.length} papéis concluídos`)

phase('Consolidação')
const sintese = await agent(
  `${BASE}
PAPEL: consolidador. Abaixo estão os relatórios dos papéis da Fase A e os pareceres do QA de dados. Escreva docs/analise-ativos/fase-a/RELATORIO-FASE-A.md (português, para o Wellington — dono do app, lê bem mas não quer jargão desnecessário; e servirá de insumo técnico para o workflow da Fase 0). Estrutura:
1. Veredito em 5 linhas (dá para fazer? com quais fontes? custo?).
2. Tabela de cobertura por classe (Ações, FIIs, Stocks, REITs): o que sai de fonte gratuita estruturada, o que precisa de provedor pago, o que só por PDF/curadoria — campo a campo dos que a spec usa no Índice MF, semáforo, Quadro e Página do ativo.
3. Números conferidos pelo QA (bate/não bate) e o que isso diz da confiabilidade.
4. Regras de sanidade obrigatórias para a Fase 0.
5. Proposta de modelo de dados e jobs para a Fase 0 (nomes Prisma no padrão do repo, reaproveitando o que existe; crons no padrão /api/cron/* + /etc/cron.d do Lightsail; ordem de backfill) — concreta o bastante para o workflow de construção.
6. Ajustes necessários na spec (divergências/ambiguidades do analista de regras + os de dados), cada um com proposta.
7. Perguntas para o Pedro (com recomendação em cada).
8. Custos mensais estimados (MVP B3 e, separado, EUA).
Seja fiel aos dados: não invente números; onde o QA divergiu, diga. Retorne como texto um resumo de 15 linhas do relatório.

RELATÓRIOS:
${JSON.stringify(ok, null, 1)}`,
  { label: 'consolidador', phase: 'Consolidação' },
)

return { sintese, papeis: ok.map((r) => ({ papel: r.rel?.papel, qa: r.qa?.veredito ?? null, divergencias: (r.qa?.verificados ?? []).filter((v) => !v.bate).length })) }
