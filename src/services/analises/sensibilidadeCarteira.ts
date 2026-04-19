/**
 * Matemática pura para "Sensibilidade da Carteira".
 *
 * Mede (a) a correlação entre os retornos mensais de cada ativo e os retornos
 * mensais da carteira e (b) a contribuição marginal ao risco (MRC). É distinto
 * de beta (que mede sensibilidade ao mercado/Ibovespa).
 *
 * Puro: sem I/O, sem Prisma, sem fetch. Recebe séries alinhadas e pesos.
 */

import type {
  SensibilidadeBucket,
  SensibilidadeCarteiraExcluido,
  SensibilidadeCarteiraItem,
  SensibilidadeCarteiraResponse,
} from '@/types/analises';

/** Mínimo de meses em comum entre ativo e carteira para cálculo considerado válido. */
const MIN_MONTHS_FOR_CORRELATION = 12;

/** Chave "YYYY-MM" para indexar meses — UTC para evitar drift de fuso. */
export const monthKey = (date: Date | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Dado um histórico diário `{date, value}`, retorna o fechamento do último dia
 * de cada mês (UTC). Meses sem nenhum ponto são omitidos.
 */
export function extractMonthlyCloses(
  daily: Array<{ date: number; value: number }>,
): Map<string, number> {
  const byMonth = new Map<string, { day: number; value: number }>();
  for (const { date, value } of daily) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const d = new Date(date);
    const key = monthKey(d);
    const day = d.getTime();
    const existing = byMonth.get(key);
    if (!existing || day > existing.day) {
      byMonth.set(key, { day, value });
    }
  }
  const closes = new Map<string, number>();
  for (const [key, { value }] of byMonth) closes.set(key, value);
  return closes;
}

/**
 * Retornos mensais a partir dos fechamentos: R[M] = close[M]/close[M-1] - 1.
 * Só emite retornos para meses cujo anterior exista na série.
 */
export function monthlyReturnsFromCloses(closes: Map<string, number>): Map<string, number> {
  const sortedKeys = Array.from(closes.keys()).sort();
  const returns = new Map<string, number>();
  for (let i = 1; i < sortedKeys.length; i++) {
    const prev = closes.get(sortedKeys[i - 1])!;
    const curr = closes.get(sortedKeys[i])!;
    if (prev > 0) returns.set(sortedKeys[i], curr / prev - 1);
  }
  return returns;
}

/**
 * Interseção de meses entre duas séries. Retorna duas arrays paralelas na ordem
 * cronológica das chaves comuns.
 */
export function alignSeries(
  a: Map<string, number>,
  b: Map<string, number>,
): { keys: string[]; a: number[]; b: number[] } {
  const common = Array.from(a.keys())
    .filter((k) => b.has(k))
    .sort();
  return {
    keys: common,
    a: common.map((k) => a.get(k)!),
    b: common.map((k) => b.get(k)!),
  };
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length;

/** Variância amostral (n-1). Retorna 0 se n < 2. */
const variance = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
};

const stddev = (xs: number[]): number => Math.sqrt(variance(xs));

/** Covariância amostral de duas séries de mesmo tamanho. Retorna 0 se n < 2. */
export function covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  let acc = 0;
  for (let i = 0; i < x.length; i++) acc += (x[i] - mx) * (y[i] - my);
  return acc / (x.length - 1);
}

/**
 * Correlação de Pearson. Retorna 0 (não NaN) quando algum desvio-padrão é zero
 * ou quando há menos de 2 pontos.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const sx = stddev(x);
  const sy = stddev(y);
  if (sx === 0 || sy === 0) return 0;
  return covariance(x, y) / (sx * sy);
}

/**
 * Contribuição marginal ao risco (aproximada): w_i × cov(R_i, R_p) / var(R_p).
 *
 * Para carteiras reais, a soma das MRCs sobre os ativos incluídos fica ≈ 1
 * (pois R_p já reflete Σ w_j × R_j). Útil para ranquear "quem move a carteira".
 */
export function marginalRiskContribution(
  weight: number,
  assetReturns: number[],
  portfolioReturns: number[],
): number {
  const varP = variance(portfolioReturns);
  if (varP === 0) return 0;
  return (weight * covariance(assetReturns, portfolioReturns)) / varP;
}

/** Volatilidade anualizada em %: σ_mensal × √12 × 100. */
export function annualizedVolatility(monthlyReturns: number[]): number {
  return stddev(monthlyReturns) * Math.sqrt(12) * 100;
}

/**
 * Beta clássico: β = cov(R_ativo, R_mercado) / var(R_mercado).
 * Recebe históricos diários do ativo e do índice de mercado (ex.: ^BVSP).
 * Retorna `null` se não houver pelo menos 12 meses em comum ou se var_m == 0.
 */
export function computeBeta(
  assetDaily: Array<{ date: number; value: number }>,
  marketDaily: Array<{ date: number; value: number }>,
): number | null {
  const assetReturns = monthlyReturnsFromCloses(extractMonthlyCloses(assetDaily));
  const marketReturns = monthlyReturnsFromCloses(extractMonthlyCloses(marketDaily));
  const aligned = alignSeries(assetReturns, marketReturns);
  if (aligned.keys.length < MIN_MONTHS_FOR_CORRELATION) return null;
  const varM = variance(aligned.b);
  if (varM === 0) return null;
  return covariance(aligned.a, aligned.b) / varM;
}

/** Classificação por correlação (faixas inspiradas na UI do Kinvo). */
export function classifyCorrelation(correl: number): SensibilidadeBucket {
  if (correl > 0.7) return 'alta';
  if (correl > 0.3) return 'media';
  if (correl >= -0.3) return 'baixa';
  return 'negativa';
}

export interface AssetInput {
  ticker: string;
  nome: string;
  rawWeight: number; // peso bruto pré-renormalização (quantidade × preço / total)
  dailyPrices: Array<{ date: number; value: number }>;
}

export interface BuildSensibilidadeInput {
  portfolioMonthlyReturns: Map<string, number>;
  assets: AssetInput[];
  windowMonths: number;
  calculadoEm?: Date;
}

/**
 * Orquestra o cálculo completo: extrai retornos mensais por ativo, alinha à
 * série da carteira, calcula correlação + MRC, classifica, e renormaliza pesos
 * sobre os incluídos. Ativos com < 12 meses em comum vão para `excluidos`.
 */
export function buildSensibilidadeCarteira(
  input: BuildSensibilidadeInput,
): SensibilidadeCarteiraResponse {
  const { portfolioMonthlyReturns, assets, windowMonths } = input;
  const calculadoEm = (input.calculadoEm ?? new Date()).toISOString();

  const included: Array<{
    input: AssetInput;
    assetReturns: number[];
    portfolioReturnsAligned: number[];
    months: number;
  }> = [];
  const excluidos: SensibilidadeCarteiraExcluido[] = [];

  for (const asset of assets) {
    const closes = extractMonthlyCloses(asset.dailyPrices);
    const assetReturns = monthlyReturnsFromCloses(closes);
    const aligned = alignSeries(assetReturns, portfolioMonthlyReturns);
    if (aligned.keys.length < MIN_MONTHS_FOR_CORRELATION) {
      excluidos.push({
        ticker: asset.ticker,
        nome: asset.nome,
        motivo: aligned.keys.length === 0 ? 'sem-preco' : 'insuficiente-historico',
        mesesDisponiveis: aligned.keys.length,
      });
      continue;
    }
    included.push({
      input: asset,
      assetReturns: aligned.a,
      portfolioReturnsAligned: aligned.b,
      months: aligned.keys.length,
    });
  }

  const totalWeight = included.reduce((s, x) => s + x.input.rawWeight, 0);

  const ativos: SensibilidadeCarteiraItem[] = included.map((x) => {
    const peso = totalWeight > 0 ? x.input.rawWeight / totalWeight : 0;
    const correlacao = pearsonCorrelation(x.assetReturns, x.portfolioReturnsAligned);
    const contribuicaoRisco = marginalRiskContribution(
      peso,
      x.assetReturns,
      x.portfolioReturnsAligned,
    );
    return {
      ticker: x.input.ticker,
      nome: x.input.nome,
      peso,
      correlacao,
      contribuicaoRisco,
      bucket: classifyCorrelation(correlacao),
      mesesUsados: x.months,
    };
  });

  ativos.sort((a, b) => b.contribuicaoRisco - a.contribuicaoRisco);

  const portfolioReturnsAll = Array.from(portfolioMonthlyReturns.values());

  return {
    windowMonths,
    mesesUtilizados: portfolioMonthlyReturns.size,
    calculadoEm,
    carteira: {
      volatilidadeAnual: annualizedVolatility(portfolioReturnsAll),
    },
    ativos,
    excluidos,
  };
}
