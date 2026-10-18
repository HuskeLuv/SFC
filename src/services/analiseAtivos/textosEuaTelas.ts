/**
 * Textos das TELAS de Stocks e REITs (fatia C: Quadro, página do ativo, Comparador e busca). Os
 * textos de contrato da feature (universo, cotação, fonte, segmentos, critérios substitutos,
 * Comparador misto) continuam em textosEua.ts (fatia 0); aqui ficam só os rótulos e frases de tela
 * que a fatia C acrescenta, para não editar o arquivo da fatia 0.
 *
 * Linguagem v2 (textosEuaTelas.test + linguagemV2): nada de nota, ranking, recomendação, melhor/pior
 * ou nome de índice de mercado. Rótulos em português; os termos EUA (10-K, FY, FCO) ficam nos
 * tooltips. Placeholders {chave} via formatarTexto.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';

export { formatarTexto };

export const TEXTOS_EUA_TELAS = {
  /** Quadro EUA */
  quadro: {
    /** faixa sobre a tabela sem a chave de preço */
    faixaCotacaoTitulo: 'Cotações das bolsas dos EUA ainda não aparecem nesta área.',
    faixaCotacaoTexto:
      'Preço, P/L, dividend yield e Meus cenários ficam ocultos. Os critérios usam só os relatórios anuais (10-K) e não dependem da cotação.',
    semPosicao: {
      stock: 'Você ainda não tem stocks na Carteira',
      reit: 'Você ainda não tem REITs na Carteira',
    },
    /** dicas dos cabeçalhos das colunas EUA */
    dicas: {
      dpaUsd: 'Dividendo por ação do último ano fiscal (FY), em US$, pelo relatório 10-K.',
      fcoAcao:
        'Caixa operacional ÷ média de ações diluídas do último ano fiscal (US$). Difere do FFO/ação do relatório: inclui a variação do capital de giro.',
      divFco: 'Dividendos pagos ÷ caixa operacional do último ano fiscal.',
      anosDividendo: 'Anos seguidos em que o dividendo por ação foi maior que o do ano anterior.',
      tipo: 'Segmento do REIT de patrimônio.',
    } as Record<string, string>,
    ocupacaoIndisponivel: 'filtro indisponível',
  },

  /** Página do ativo EUA */
  ativo: {
    naoEncontradoTexto:
      'A área cobre ações e FIIs da B3 e stocks e REITs da NYSE e da Nasdaq. Confira o ticker.',
    tagReit: 'REIT de patrimônio',
    cotacaoTitulo: 'Cotação não exibida',
    seloSemCotacao: 'Sem cotação dos EUA',
    ultimo10k: '10-K mais recente: FY{ano}',
    floatData: 'free float da capa do 10-K de {data}',
    valuationTitulo: 'Valuation · preço vs. fundamentos',
    valuationOculto:
      'Múltiplos e Meus cenários usam a cotação e ficam ocultos enquanto as cotações dos EUA não aparecem nesta área.',
    kpis: {
      rotulos: {
        roe: 'ROE',
        margemLiquida: 'Margem líq.',
        divLiqEbitda: 'Dív. líq./EBITDA',
        lpa: 'LPA (US$)',
        dpa: 'Div./ação (US$)',
        payout: 'Payout',
        lucrosSeguidos: 'Lucros seguidos',
        fcoAcao: 'Caixa op./ação (US$)',
        divFco: 'Div./caixa op.',
        receita: 'Receita (US$ bi)',
        lucro: 'Lucro líquido (US$ bi)',
        anosDividendo: 'Div. crescendo',
      },
      subs: {
        fy: 'FY{ano}',
        roe: 'lucro ÷ patrimônio · FY{ano}',
        margem: 'lucro ÷ receita · FY{ano}',
        dividaLiquida: 'dívida líq. US$ {valor} bi',
        caixaLiquido: 'caixa líquido',
        ebitdaCalculado: 'EBITDA calculado',
        lpa: 'lucro por ação diluído · FY{ano}',
        dpa: 'pago no FY{ano}',
        dpaCalculado: 'dividendos pagos ÷ ações · FY{ano}',
        payout: 'dividendos ÷ lucro · FY{ano}',
        lucrosSeguidos: 'lucro líquido positivo',
        fcoAcao: 'caixa operacional ÷ média de ações',
        divFco: 'dividendos pagos ÷ caixa operacional',
        lucroReit: 'inclui a depreciação dos imóveis',
        anosDividendo: 'dividendo/ação maior que no ano anterior',
      },
      anos: '{n} anos',
      anosMais: '10+ anos',
    },
    grafico: {
      tituloStock: 'LPA por ano',
      tituloReit: 'Caixa operacional por ação por ano',
      serieStock: 'Lucro por ação diluído (US$)',
      serieReit: 'Caixa operacional ÷ média de ações diluídas (US$)',
      figcaptionStock:
        'Lucro por ação diluído de cada ano fiscal (FY), em US$, pelo relatório anual 10-K.',
      figcaptionReit:
        'Caixa operacional dividido pela média de ações diluídas de cada ano fiscal (FY), em US$, pelo relatório anual 10-K.',
      barraTitulo: 'FY{ano}: US$ {valor}',
      semPonto: 'FY{ano}: sem dado',
      prejuizo: 'FY{ano}: US$ {valor} (negativo)',
    },
    dividendos: {
      titulo: 'Dividendo por ação por ano',
      figcaption: 'Dividendo por ação de cada ano fiscal (FY), em US$, pelo relatório anual 10-K.',
      cagr: '{valor} a.a. de FY{ano}',
      calculado: 'Ano com selo "calculado": dividendos pagos ÷ média de ações diluídas.',
    },
  },

  /** Fundamentos · Essencial EUA */
  essencial: {
    colunas: {
      receita: 'Receita',
      ebitda: 'EBITDA',
      lucro: 'Lucro líquido',
      margem: 'Margem líq.',
      dividaLiquida: 'Dívida líq.',
      divLiqEbitda: 'Dív. líq./EBITDA',
      fclCapex: 'FCL/CAPEX',
      roe: 'ROE',
      lpa: 'LPA (US$)',
      dpa: 'Div./ação (US$)',
      payout: 'Payout',
      fco: 'Caixa operacional',
      fcoAcao: 'Caixa op./ação (US$)',
      divFco: 'Div./caixa op.',
    },
    ano: 'FY',
    unidade: 'US$ bi, exceto por ação e % · ano fiscal (FY) termina em {mes}',
    unidadeSemMes: 'US$ bi, exceto por ação e % · ano fiscal (FY)',
    /** exercício que termina em jan/fev: o rótulo daqui fica um ano atrás do 10-K da empresa */
    anoFiscalAnterior:
      'FY{ano} = exercício encerrado em {mes}/{anoSeguinte}; no 10-K da empresa ele aparece como Fiscal {anoSeguinte}.',
    notaStock:
      'Essencial: o que basta para ver se receita, lucro, caixa e dividendos crescem ano a ano. Lucro líquido: a SEC não publica o lucro sem itens não recorrentes; a coluna usa o lucro dos acionistas.',
    notaReit:
      'Essencial: o que basta para ver se receita, lucro, caixa e dividendos crescem ano a ano. Payout sobre o lucro contábil não vale para REITs: a depreciação dos imóveis reduz o lucro sem sair do caixa. Por isso a coluna usa o caixa operacional.',
    ebitdaDegrau: 'EBITDA de FY{anos}: {texto}.',
    tooltips: {
      ebitda: 'EBITDA calculado a partir do 10-K (lucro operacional + depreciação e amortização).',
      dividaLiquida: 'Dívida bruta − caixa − aplicações de curto prazo.',
      fclCapex: 'Fluxo de caixa livre (caixa operacional − CAPEX) dividido pelo CAPEX.',
      fcoAcao: 'Caixa operacional ÷ média de ações diluídas.',
    } as Record<string, string>,
    caption: 'Fundamentos essenciais de {ticker} por ano fiscal, em US$',
    vazio: 'Ainda não há relatórios anuais 10-K lidos para este ativo.',
  },

  /** Comparador EUA */
  comparador: {
    grupos: {
      geracaoCaixa: 'Geração de caixa',
      qualidade: 'Qualidade',
      endividamento: 'Endividamento',
      dividendos: 'Dividendos',
      crescimento: 'Crescimento',
      rentabilidade: 'Rentabilidade',
    },
    vazio: {
      stock:
        'Adicione de 2 a 4 stocks. A tabela mostra os critérios de fundamentos e os indicadores de cada um, lado a lado.',
      reit: 'Adicione de 2 a 4 REITs. A tabela mostra os critérios de fundamentos e os indicadores de cada um, lado a lado.',
    },
    /** linhas EUA do Comparador (rótulo + linha de apoio) */
    linhas: {
      lucrosSeguidosEua: { rotulo: 'Lucros seguidos', sub: 'anos fiscais (FY)' },
      roeEua: { rotulo: 'ROE', sub: 'último FY' },
      margemEua: { rotulo: 'Margem líquida', sub: 'último FY' },
      divLiqEbitdaEua: { rotulo: 'Dív. líq./EBITDA', sub: 'EBITDA calculado · último FY' },
      payoutEua: { rotulo: 'Payout', sub: 'dividendos ÷ lucro · último FY' },
      dpaEua: { rotulo: 'Div./ação (US$)', sub: 'último FY' },
      fcoAcaoEua: { rotulo: 'Caixa op./ação (US$)', sub: 'caixa operacional ÷ média de ações' },
      divFcoEua: { rotulo: 'Div./caixa op.', sub: 'dividendos pagos ÷ caixa operacional' },
      anosDividendoEua: { rotulo: 'Div. crescendo', sub: 'anos seguidos' },
    },
  },
} as const;

/** 'FY{ano}' etc. com o formato pt-BR. */
export function textoEuaTela(modelo: string, valores: Record<string, string | number>): string {
  return formatarTexto(modelo, valores);
}
