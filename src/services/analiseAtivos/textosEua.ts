/**
 * Textos da feature Stocks e REITs (EUA) na Análise de Ativos. Dono: fatia 0 (texto novo = PR na
 * 0). As fatias A–D usam estes textos sem arquivo em comum; os rótulos e definições dos critérios
 * vêm da criteria_params v3, as frases factuais do motor de textosCriterios.ts e os literais
 * jurídicos de textosLiterais.ts (rodape-quadro-eua, aviso-legal-eua, instrucao-comparador-*).
 *
 * Linguagem v2 (linguagemV2Global): nada de nota, ranking, recomendação, melhor/pior, destaque. E
 * NENHUM nome de índice de mercado (licença): o universo é descrito pela regra (bolsa + 10-K + free
 * float de capa). Rótulos em português; os termos EUA (10-K, FY, US GAAP, FFO/AFFO) aparecem nos
 * tooltips e nas observações. Placeholders {chave} via formatarTexto.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type { BolsaEua, ColunaPendenteEua, SegmentoReit } from '@/types/analiseAtivosEua';
import type { ClasseEua } from '@/types/analiseAtivosApi';

export { formatarTexto };

export const TEXTOS_EUA = {
  /**
   * Regra do universo (QuadroResposta.universoDescricao e rodapé do Quadro EUA). {corte} =
   * textoCorteFloat(universoEuaDe(params)[classe].floatEntradaUsd) — hoje 'US$ 2 bi'.
   */
  universo: {
    stock:
      'Universo: empresas listadas na NYSE ou na Nasdaq que entregam o relatório anual 10-K à SEC, com free float a partir de {corte} na capa do último 10-K.',
    reit: 'Universo: REITs de patrimônio listados na NYSE ou na Nasdaq que entregam o relatório anual 10-K à SEC, com free float a partir de {corte} na capa do último 10-K.',
    dataFloat: 'Free float da capa do 10-K de {data}.',
    corteBi: 'US$ {valor} bi',
  } satisfies Record<ClasseEua | 'dataFloat' | 'corteBi', string>,

  /** Cotação (decisão do Wellington de 17/10: sem preço até a licença de exibição). */
  cotacao: {
    indisponivel: 'Cotação EUA indisponível nesta versão',
    indisponivelDetalhe:
      'Os dados desta página vêm dos relatórios anuais 10-K. Preço, P/L e dividend yield entram numa próxima versão.',
    registrarSemPreco: 'Informe o preço pago em US$',
    moeda: 'US$',
    cambio: 'Cotação do dólar (US$ → R$)',
  },

  /** Fonte e documentos. */
  fonte: {
    curta: '10-K na SEC',
    card: 'Fonte: relatório anual 10-K (SEC).',
    linkDocumentos: 'Ver os 10-K na SEC',
    unidade: 'Valores em US$ mi · ano fiscal (FY) · fonte: 10-K na SEC',
    unidadeBi: 'Valores em US$ bi · ano fiscal (FY) · fonte: 10-K na SEC',
    anoFiscal:
      'FY = ano fiscal do relatório, rotulado pelo ano em que termina (exercício que termina em janeiro ou fevereiro conta como o ano anterior).',
  },

  /** Tag do exercício ('FY termina em set'). */
  exercicio: {
    tag: 'FY termina em {mes}',
    meses: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  },

  bolsas: { NYSE: 'NYSE', Nasdaq: 'Nasdaq' } satisfies Record<BolsaEua, string>,

  /** Rótulos PT dos segmentos REIT curados (SecCompany.segmento = chave). */
  segmentosReit: {
    varejo: 'Varejo',
    industrial: 'Industrial e logística',
    residencial: 'Residencial',
    escritorios: 'Escritórios',
    saude: 'Saúde',
    data_center: 'Data centers',
    torres: 'Torres de telecomunicação',
    self_storage: 'Self storage',
    net_lease: 'Net lease',
    hotelaria: 'Hotelaria',
    diversificado: 'Diversificado',
    especial: 'Especiais',
    florestal: 'Florestal',
  } satisfies Record<SegmentoReit, string>,

  /** Divisões SIC → setor PT (setorDoSic). Faixas inclusivas. */
  setoresSic: [
    { de: 100, ate: 999, rotulo: 'Agropecuária' },
    { de: 1000, ate: 1499, rotulo: 'Mineração, petróleo e gás' },
    { de: 1500, ate: 1799, rotulo: 'Construção' },
    { de: 2000, ate: 3999, rotulo: 'Indústria' },
    { de: 4000, ate: 4999, rotulo: 'Transporte, telecomunicações e utilidades' },
    { de: 5000, ate: 5199, rotulo: 'Atacado' },
    { de: 5200, ate: 5999, rotulo: 'Varejo' },
    { de: 6000, ate: 6799, rotulo: 'Finanças, seguros e imóveis' },
    { de: 7000, ate: 8999, rotulo: 'Serviços' },
    { de: 9100, ate: 9729, rotulo: 'Administração pública' },
  ],
  setorNaoClassificado: 'Não classificado',

  /** EBITDA calculado (não é item padrão do US GAAP) — selo de origem por degrau. */
  ebitda: {
    calculado: 'EBITDA calculado a partir do 10-K (não é um item padrão do US GAAP)',
    degrauPreIr:
      'sem lucro operacional no relatório: lucro antes do IR + juros + depreciação e amortização em {anos}',
    degrauLucro:
      'sem lucro operacional nem lucro antes do IR: lucro líquido + IR + juros + depreciação e amortização em {anos}',
    ebitdaReDifere: 'O EBITDAre informado no relatório do REIT pode diferir deste cálculo.',
  },

  /** Dívida líquida (definição única). */
  dividaLiquida: 'Dívida líquida = dívida bruta − caixa − aplicações de curto prazo.',

  /** Critérios substitutos dos REITs (tooltips; os rótulos vêm da criteria_params v3). */
  reit: {
    faixa:
      'FFO e AFFO não estão nos dados estruturados da SEC: o caixa operacional por ação entra no lugar deles. A ocupação fica sem dado e conta como não atendida. O caixa operacional oscila com o capital de giro, então pode cair num ano em que o FFO do relatório sobe.',
    fcoDifereFfo:
      'Caixa operacional ÷ média de ações diluídas. Difere do FFO/ação do relatório: o caixa operacional inclui a variação do capital de giro.',
    payoutBase:
      'Dividendos pagos ÷ caixa operacional. O payout sobre o AFFO do relatório entra com a leitura do 10-K.',
    ocupacaoSemFonte:
      'A ocupação não existe nos dados estruturados da SEC (está só no texto do 10-K). O critério conta como não atendido até a leitura do relatório.',
  },

  /** Dividendo por ação. */
  dpa: {
    seloCalculado: 'calculado',
    tooltipCalculado:
      'Sem o dividendo por ação no relatório: dividendos pagos ÷ média de ações diluídas do ano.',
    tooltipDeclarado: 'Dividendo por ação declarado no ano (o relatório não traz o valor pago).',
  },

  /** Financeiras (perfil stock_financeira: n de 6, sem dado onde o balanço não separa). */
  financeira: {
    semDado:
      'instituição financeira: o balanço não separa a dívida de financiamento nem o CAPEX, então dívida líquida e FCL podem ficar sem dado',
  },

  /** Essencial EUA: colunas sem fonte no XBRL (escondidas). */
  colunasPendentes: {
    observacao: 'FFO, AFFO, ocupação e número de imóveis entram com a leitura do relatório 10-K.',
    rotulos: {
      ffo: 'FFO',
      affo: 'AFFO',
      ocupacao: 'Ocupação',
      imoveis: 'Imóveis',
    } satisfies Record<ColunaPendenteEua, string>,
  },

  /** Comparador: só a mesma classe. */
  comparador: {
    mistoBloqueado:
      'Stocks e REITs seguem critérios diferentes e não entram na mesma comparação. Compare stocks com stocks e REITs com REITs.',
    abrirReits: 'Comparar REITs',
    abrirStocks: 'Comparar stocks',
  },

  /** Carteira (Na sua carteira / Registrar). */
  carteira: {
    mesmoValor: 'Mesmo valor da aba {aba} da Carteira.',
    semPrecoRegistrar:
      'A cotação EUA não é exibida nesta versão: informe o preço pago em US$ e a cotação do dólar.',
  },

  /** Busca. */
  busca: {
    placeholderComEua: 'Buscar ação, FII, stock ou REIT por ticker ou nome',
    semResultadoComEua: 'A busca cobre ações e FIIs da B3 e stocks e REITs da NYSE e da Nasdaq',
  },
} as const;

/** Setor PT pela divisão SIC (sem SIC ou fora das faixas = 'Não classificado'). */
export function setorDoSic(sic: number | null | undefined): string {
  if (typeof sic !== 'number') return TEXTOS_EUA.setorNaoClassificado;
  const faixa = TEXTOS_EUA.setoresSic.find((f) => sic >= f.de && sic <= f.ate);
  return faixa ? faixa.rotulo : TEXTOS_EUA.setorNaoClassificado;
}

/** 'FY termina em set' a partir do MMDD do fim do exercício ('0927'); inválido = null. */
export function textoExercicio(mmdd: string | null | undefined): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null;
  const mes = Number(mmdd.slice(0, 2));
  if (mes < 1 || mes > 12) return null;
  return formatarTexto(TEXTOS_EUA.exercicio.tag, { mes: TEXTOS_EUA.exercicio.meses[mes - 1] });
}

/** 'US$ 2 bi' a partir do corte em US$ (2e9). */
export function textoCorteFloat(usd: number): string {
  const bi = usd / 1e9;
  const valor = bi.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return formatarTexto(TEXTOS_EUA.universo.corteBi, { valor });
}

/** Regra do universo da classe com o corte vigente (QuadroResposta.universoDescricao). */
export function textoUniverso(classe: ClasseEua, floatEntradaUsd: number): string {
  return formatarTexto(TEXTOS_EUA.universo[classe], { corte: textoCorteFloat(floatEntradaUsd) });
}

/** Placeholders aceitos nos textos deste módulo (o teste confere). */
export const PLACEHOLDERS_EUA = ['data', 'mes', 'anos', 'aba', 'corte', 'valor'] as const;
