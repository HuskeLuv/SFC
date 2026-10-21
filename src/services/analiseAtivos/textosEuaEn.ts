/**
 * Rótulos em INGLÊS de Stocks e REITs (A4.d, docs/analise-ativos/fundamentei-regras/desenho.json).
 * Criado na F0 (contrato); dono depois: F3 (a F4 só consome).
 *
 * Só NOMES de linhas, indicadores e critérios mudam de língua; frases, notas, definições e tooltips
 * seguem em português (textosEua.ts / textosEuaTelas.ts). Tudo atrás de
 * ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO, escolhido na LEITURA (o JSON da criteria_params v5 fica
 * em português; a resposta leva rotulosEn: true). Chave desligada = rótulos PT, como hoje.
 *
 * Lista FECHADA (ROTULOS_EUA_EN): nome novo = entrada aqui, com o teste textosEuaEn.test.
 * Linguagem: nada de avaliação nem chamada à ação também em inglês (cheap, expensive, fair value,
 * buy, sell, undervalued, overvalued, discount, opportunity, best, worst, rating, score…); a
 * varredura do teste usa TERMOS_EN_PROIBIDOS e o linguagemV2 (que a F3 estende aos termos EN).
 */
import type { DefCriterio } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type { IdCriterio, PerfilCriterio } from '@/types/analiseAtivosCriterios';

/** Nomes de linhas e indicadores EUA em inglês (lista fechada do desenho, item A4.d). */
export const ROTULOS_EUA_EN = {
  revenue: 'Revenue',
  ebitda: 'EBITDA',
  ebit: 'EBIT',
  netIncome: 'Net income',
  netMargin: 'Net margin',
  netDebt: 'Net debt',
  netDebtEbitda: 'Net debt/EBITDA',
  fcfCapex: 'FCF/CAPEX',
  roe: 'ROE',
  eps: 'EPS (US$)',
  dividendPerShare: 'Dividend/share (US$)',
  payout: 'Payout',
  operatingCashFlow: 'Operating cash flow',
  ocfPerShare: 'OCF/share (US$)',
  ocfAdjusted: 'OCF adj. (SBC)',
  ocfAdjustedPerShare: 'OCF adj./share (US$)',
  payoutOcfAdjusted: 'Payout (÷ OCF adj.)',
  dividendGrowing: 'Div. growing',
  profitStreak: 'Profit streak',
  pe: 'P/E',
  ps: 'P/S',
  dividendYield: 'Div. yield',
} as const;
export type ChaveRotuloEuaEn = keyof typeof ROTULOS_EUA_EN;

/**
 * Rótulos EN dos critérios EUA por id. Variantes pelo TIPO e pela SÉRIE da definição vigente (a
 * mesma tela pode ler uma avaliação v3/v4 com 'up' ou uma v5 com 'cagr'); {limite} vem da definição.
 */
export const CRITERIOS_EUA_EN = {
  rec: { cagr: 'Revenue: annual growth > 0', up: 'Revenue growing' },
  luc: { cagr: 'Net income: annual growth > 0', up: 'Net income growing' },
  /** o id 'ebitda' fica (?c= e filtros salvos); na v5 a série é 'ebit' */
  ebitda: {
    cagrEbit: 'EBIT: annual growth > 0',
    upEbit: 'EBIT growing',
    cagr: 'EBITDA: annual growth > 0',
    up: 'EBITDA growing',
  },
  mg: { pos: 'Net margin positive' },
  dl: { max: 'Net debt/EBITDA ≤ {limite}×' },
  fcl: { cagr: 'FCF: annual growth > 0', up: 'FCF growing' },
  dpa: { up: 'Dividend/share growing', cagr: 'Dividend/share: annual growth > 0' },
  fco_acao: { upAjustado: 'OCF adj./share growing', up: 'OCF/share growing' },
  pay: { maxAjustado: 'Payout ≤ {limite}% of OCF adj.', max: 'Payout ≤ {limite}% of OCF' },
  ocup: { min: 'Occupancy ≥ {limite}%' },
} as const satisfies Partial<Record<IdCriterio, Record<string, string>>>;

/** Placeholders aceitos (o teste confere). */
export const PLACEHOLDERS_EUA_EN = ['limite'] as const;

/**
 * Termos em inglês que nenhum texto da Análise pode ter (avaliação, preço "justo", chamada à ação,
 * nota). Usado pelo teste desta lista; a F3 leva a mesma lista ao linguagemV2.
 */
export const TERMOS_EN_PROIBIDOS = [
  'cheap',
  'expensive',
  'fair value',
  'buy',
  'sell',
  'undervalued',
  'overvalued',
  'discount',
  'opportunity',
  'best',
  'worst',
  'rating',
  'score',
  'recommend',
  'target price',
  'upside',
] as const;

const PERFIS_EUA_EN: readonly PerfilCriterio[] = ['stock', 'stock_financeira', 'reit'];

const limiteTexto = (v: number | undefined): string =>
  v === undefined ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 1 });

/**
 * Rótulo EN de um critério EUA pela definição vigente (id + tipo + série + limite). null = sem
 * rótulo EN (perfil BR ou combinação fora do mapa): a leitura mantém o rótulo PT da definição.
 * Pura; a leitura (F3, lerCriterios) só chama com ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO.
 */
export function rotuloCriterioEuaEn(
  perfil: PerfilCriterio,
  def: Pick<DefCriterio, 'id' | 'tipo' | 'serie' | 'limite'>,
): string | null {
  if (!PERFIS_EUA_EN.includes(perfil)) return null;
  const mapa = (CRITERIOS_EUA_EN as Partial<Record<IdCriterio, Record<string, string>>>)[def.id];
  if (!mapa) return null;
  let chave: string = def.tipo;
  if (def.id === 'ebitda' && def.serie === 'ebit') chave = `${def.tipo}Ebit`;
  if (def.id === 'fco_acao' && def.serie === 'ocf_adjusted_per_share') chave = 'upAjustado';
  if (def.id === 'pay' && def.serie === 'cash_payout_adjusted_pct') chave = 'maxAjustado';
  const texto = mapa[chave];
  if (!texto) return null;
  return formatarTexto(texto, { limite: limiteTexto(def.limite) });
}
