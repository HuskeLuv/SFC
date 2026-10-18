/**
 * Respostas de exemplo das APIs /api/analise-ativos/* (tipadas pelos contratos), para testes de
 * hooks e componentes. Números do banco dev de 29/09/2026. As linhas do Quadro saem de linhasDb.ts
 * via paraLinhaQuadroApi (mesma conversão da API). v2.4 (fatia F): sem o indicador antigo (Índice,
 * semáforo, efeito no Índice, ano destacado) — o contratoSemNota.test.ts varre estas respostas.
 */
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  GERADO_EM_FIXTURE,
  LINHA_AURE3,
  LINHA_CEDO4,
  LINHA_HCTR11,
  LINHA_HFOF11,
  LINHA_HGLG11,
  LINHA_ITUB4,
  LINHA_TGMA3,
  LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/linhasDb';
import { CRITERIOS_ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/criterios';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import type {
  AtivoTopoResposta,
  BuscaIndiceResposta,
  ConfigResposta,
  FundamentosResposta,
  LinhaQuadroApi,
  OverlayCarteiraResposta,
  QuadroResposta,
  TeseResposta,
  ValuationResposta,
} from '@/types/analiseAtivosApi';

export const VERSAO_FIXTURE = GERADO_EM_FIXTURE.toISOString();

export const CONFIG_LIBERADA: ConfigResposta = {
  habilitada: true,
  estado: 'liberada',
  acesso: 'beta',
  novoAte: '2026-12-31',
};
export const CONFIG_FORA_DO_BETA: ConfigResposta = {
  ...CONFIG_LIBERADA,
  habilitada: false,
  estado: 'fora_do_beta',
};

export const API_WEGE3: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_WEGE3);
export const API_ITUB4: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_ITUB4);
export const API_TGMA3: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_TGMA3);
export const API_AURE3: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_AURE3);
export const API_HGLG11: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_HGLG11);
export const API_HCTR11: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_HCTR11);
export const API_HFOF11: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_HFOF11);
export const API_CEDO4: LinhaQuadroApi = paraLinhaQuadroApi(LINHA_CEDO4);

export const QUADRO_ACOES: QuadroResposta = {
  classe: 'acao',
  dataRef: '2026-09-29',
  versao: VERSAO_FIXTURE,
  total: 4,
  offset: 0,
  limite: 25,
  contagens: { acao: 4, fii: 3 },
  facetas: { setores: ['Bens Industriais', 'Financeiro', 'Utilidade Pública'], tipos: [] },
  frescorCotacao: { data: '2026-09-29', status: 'em_dia' },
  itens: [API_AURE3, API_ITUB4, API_TGMA3, API_WEGE3],
  janela: 5,
  totalClasse: 4,
  definicoes: definicoesQuadro('acao', CRITERIA_PARAMS_V1),
};

export const QUADRO_FIIS: QuadroResposta = {
  ...QUADRO_ACOES,
  classe: 'fii',
  total: 3,
  facetas: { setores: [], tipos: ['tijolo', 'papel', 'fof'] },
  itens: [API_HCTR11, API_HFOF11, API_HGLG11],
  totalClasse: 3,
  definicoes: definicoesQuadro('fii', CRITERIA_PARAMS_V1),
};

export const BUSCA: BuscaIndiceResposta = {
  versao: VERSAO_FIXTURE,
  itens: [
    API_AURE3,
    API_CEDO4,
    API_HCTR11,
    API_HFOF11,
    API_HGLG11,
    API_ITUB4,
    API_TGMA3,
    API_WEGE3,
  ].map((l) => ({
    t: l.ticker,
    n: l.nome,
    c: l.classe,
    q: l.noQuadro,
    f: l.fiiTipo,
    m: l.foraDoQuadroMotivo,
  })),
};

export const OVERLAY_CARTEIRA: OverlayCarteiraResposta = {
  posicoes: {
    WEGE3: { portfolioId: 'pf-wege3', quantidade: 120, categoria: 'acoes' },
    HGLG11: { portfolioId: 'pf-hglg11', quantidade: 40, categoria: 'fiis' },
  },
  planejados: {
    ITUB4: { watchlistId: 'wl-itub4', categoria: 'acoes', objetivoPct: 5 },
  },
};

export const ATIVO_WEGE3: AtivoTopoResposta = {
  ticker: 'WEGE3',
  classe: 'acao',
  nome: 'WEG S.A.',
  tags: ['Bens Industriais', 'Motores, Compressores e Outros', 'Novo Mercado'],
  noQuadro: true,
  foraDoQuadroMotivo: null,
  assetId: null,
  cotacao: {
    preco: 41.2,
    data: '2026-09-29',
    variacao: 0.3,
    variacaoPct: 0.73,
    baixaLiquidez: false,
  },
  criterios: CRITERIOS_ATIVO_WEGE3,
  kpis: [
    {
      codigo: 'pl',
      rotulo: 'P/L',
      valor: { estado: 'ok', valor: 27.1 },
      formato: 'multiplo',
      sub: 'média 10a: 25,0×',
      selo: null,
    },
    {
      codigo: 'dy12m',
      rotulo: 'DY 12m',
      valor: { estado: 'ok', valor: 3.98 },
      formato: 'pct',
      sub: null,
      selo: 'proventos_em_conferencia',
    },
  ],
  grafico: {
    titulo: 'Lucro por ação × Cotação',
    figcaption: 'Lucro por ação e cotação de fim de ano, base 100.',
    granularidade: 'anual',
    periodos: ['5A', '10A'],
    serieA: {
      rotulo: 'Lucro por ação',
      pontos: [
        { chave: '2023', valor: 1.37 },
        { chave: '2024', valor: 1.44 },
        { chave: '2025', valor: 1.52 },
      ],
    },
    serieB: {
      rotulo: 'Cotação',
      pontos: [
        { chave: '2023', valor: 41 },
        { chave: '2024', valor: 53 },
        { chave: '2025', valor: 44 },
      ],
    },
    ult12m: { a: 1.55, b: 41.2 },
    lacunas: [],
    insuficiente: false,
  },
  dividendos: {
    anos: [
      { ano: 2023, valor: 0.61 },
      { ano: 2024, valor: 0.76 },
      { ano: 2025, valor: 2.45, suspeito: true },
    ],
    ult12m: { valor: 1.64, dataRef: '2026-09-29' },
    cagr5aPct: null,
    cagrAnoInicio: null,
    cagrAnoFim: null,
    cagrMotivo: 'anos em conferência ficam fora do crescimento anual',
    selo: 'proventos_em_conferencia',
    unidade: 'dpa',
  },
  eventos: [
    {
      data: '2026-10-22',
      tipo: 'resultado_estimado',
      titulo: 'Resultado 3T26 (data estimada)',
      descricao: 'Pelo histórico de divulgação da companhia',
      estimado: true,
    },
  ],
  educacao: { titulo: 'Aprenda a analisar ações', href: '/educacao', descricao: null },
  frescor: {
    cotacao: 'cotação B3 de 29/09',
    fundamentos: 'CVM DFP 2025 / ITR 2T26',
    fii: null,
    painelAtrasado: false,
  },
  versao: VERSAO_FIXTURE,
};

/** Bloco C: /config com o relato ligado (ANALISE_ATIVOS_REPORTE_HABILITADO). */
export const CONFIG_RELATO_LIGADO: ConfigResposta = { ...CONFIG_LIBERADA, reporteHabilitado: true };

/**
 * Bloco C (params v2): WEGE3 com o grupo proventos em conferência pela regra (chip com valor) e o
 * frescor por bloco (fundamentos com o ITR 3T26 esperado). Com a v1 a resposta é ATIVO_WEGE3.
 */
export const ATIVO_WEGE3_V2: AtivoTopoResposta = {
  ...ATIVO_WEGE3,
  kpis: ATIVO_WEGE3.kpis.map((k) =>
    k.codigo === 'dy12m' || k.codigo === 'payout' ? { ...k, selo: 'em_conferencia' } : k,
  ),
  dividendos: { ...ATIVO_WEGE3.dividendos, selo: 'em_conferencia' },
  conferencias: [
    {
      grupo: 'proventos',
      campos: [
        'dy12m',
        'payout',
        'rendCota12m',
        'dpa12m',
        'dyMedio5a',
        'proventosAno',
        'historicoDy',
      ],
      exibicao: 'selo',
      motivo: 'Provento recente mais que o dobro do ano anterior.',
      desde: '2026-09-29',
      origem: 'regra',
      caso: null,
    },
  ],
  frescorBlocos: {
    kpis: {
      fonte: 'B3 · cotação · CVM · DFP/ITR',
      referencia: '29/09/2026 · ITR 2T26',
      atualizadoEm: '2026-09-29T12:00:00.000Z',
      status: 'em_dia',
    },
    fundamentos: {
      fonte: 'CVM · DFP/ITR',
      referencia: 'ITR 2T26',
      atualizadoEm: null,
      status: 'em_dia',
    },
    dividendos: {
      fonte: 'B3 · proventos',
      referencia: '29/09/2026',
      atualizadoEm: '2026-09-29T12:00:00.000Z',
      status: 'em_dia',
    },
  },
};

export const FUNDAMENTOS_WEGE3: FundamentosResposta = {
  nivel: 'essencial',
  unidade: 'R$ mi',
  fonte: 'CVM',
  padraoContabil: 'IFRS',
  escopo: 'con',
  variante: 'acao',
  colunas: [
    { codigo: 'receita', rotulo: 'Receita', formato: 'moedaMi', fonteCvmAviso: false },
    { codigo: 'lucro', rotulo: 'Lucro líquido', formato: 'moedaMi', fonteCvmAviso: false },
  ],
  linhas: [
    {
      rotulo: '2025',
      ano: 2025,
      ultimoAno: true,
      valores: {
        receita: { estado: 'ok', valor: 40000 },
        lucro: { estado: 'ok', valor: 6400 },
      },
      selos: ['proventos_em_conferencia'],
    },
  ],
  observacoes: ['Valores em R$ mi · ano fiscal · fonte: CVM'],
};

export const VALUATION_WEGE3: ValuationResposta = {
  grupos: [
    {
      codigo: 'preco',
      rotulo: 'Preço',
      resumo: '1 de 1 múltiplos acima da média de 10 anos',
      explicacao: null,
      itens: [
        {
          codigo: 'pl',
          rotulo: 'P/L',
          atual: { estado: 'ok', valor: 27.1 },
          formato: 'multiplo',
          leitura: 'Preço da ação dividido pelo lucro por ação dos últimos 12 meses.',
          referencia: { valor: 18.2, rotulo: 'mediana de 4 pares' },
          barra: {
            visivel: true,
            min: 22,
            media: 25,
            max: 40,
            nPontos: 10,
            statusTexto: '+8% vs. média 10a',
            extremo: null,
          },
          historico: [
            { ano: 2024, valor: 36.8 },
            { ano: 2025, valor: 29.0 },
          ],
        },
      ],
    },
  ],
  historicos: [
    {
      codigo: 'pl',
      rotulo: 'P/L',
      formato: 'multiplo',
      media: 25,
      pontos: [
        { ano: 2024, valor: 36.8 },
        { ano: 2025, valor: 29.0 },
      ],
    },
  ],
  pares: { criterio: 'mesmo segmento B3 (completado pelo subsetor)', itens: [API_WEGE3] },
  observacao: 'Referência = mediana dos pares; barra = posição nos últimos 10 anos.',
};

export const TESE_VAZIA: TeseResposta = { corpo: '', atualizadoEm: null, visibilidade: 'privada' };
export const TESE_SALVA: TeseResposta = {
  corpo: 'Acompanho margem e crescimento de receita no exterior.',
  atualizadoEm: '2026-09-28T17:32:00.000Z',
  visibilidade: 'privada',
};

// ---------------------------------------------------------------------------
// Stocks e REITs (fatia 0 EUA): config com a chave EUA e uma linha stock/reit SEM cotação (decisão
// do Wellington de 17/10). As fatias C/D acrescentam as respostas completas das telas.
// ---------------------------------------------------------------------------

const RECURSOS_DESLIGADOS = {
  raioX: false,
  cenarios: false,
  comparador: false,
  salvos: false,
  alertas: false,
  pdfComparador: false,
  eua: false,
  euaPreco: false,
};

export const CONFIG_EUA_LIGADA: ConfigResposta = {
  ...CONFIG_LIBERADA,
  recursos: { ...RECURSOS_DESLIGADOS, eua: true },
};

const SEM_COTACAO = {
  estado: 'ausente',
  motivo: 'licenca',
  texto: TEXTOS_EUA.cotacao.indisponivel,
} as const;

/** Linha stock do Quadro EUA (valores em US$; sem preço/P/L/DY sem a chave de preço). */
export const API_AAPL: LinhaQuadroApi = {
  ...API_WEGE3,
  ticker: 'AAPL',
  classe: 'stock',
  nome: 'Apple Inc.',
  setor: 'Indústria',
  subsetor: null,
  segmento: null,
  listagem: null,
  preco: SEM_COTACAO,
  precoData: null,
  variacaoDiaPct: null,
  liquidezMedia21: null,
  pl: SEM_COTACAO,
  pvp: { estado: 'nao_se_aplica', motivo: 'eua', texto: TEXTOS_CRITERIOS.estados.nao_se_aplica },
  dy12m: SEM_COTACAO,
  criterios: null,
  pares: [],
  assetId: null,
  moeda: 'USD',
  bolsa: 'Nasdaq',
  dpa: 1.02,
  fcoPorAcao: null,
  dividendosFcoPct: null,
};

/** Linha REIT do Quadro EUA (Caixa op./ação, Div./caixa op., Div./ação). */
export const API_O: LinhaQuadroApi = {
  ...API_AAPL,
  ticker: 'O',
  classe: 'reit',
  nome: 'Realty Income Corp',
  setor: 'Finanças, seguros e imóveis',
  segmento: 'Net lease',
  bolsa: 'NYSE',
  dpa: 3.17,
  fcoPorAcao: 4.4,
  dividendosFcoPct: 73,
};
