/**
 * Série "Evolução do Patrimônio" do fluxo de caixa (regra Pedro Haddad).
 *
 * Módulo PURO e isomórfico — usado pela planilha (client) e pelo cron de
 * snapshot (server). Não importa prisma nem APIs de browser.
 *
 * Semântica: a evolução considera apenas APORTES NOMINAIS (aplicação inicial
 * + aportes) e o fluxo de caixa livre — nunca a valorização de mercado dos
 * ativos. Objetivo: o cliente monta cenários lineares ("se eu cortar X, onde
 * chego em dezembro?") sem a volatilidade de renda variável poluir a projeção.
 * A valorização real fica no dashboard consolidado da carteira.
 */

const MONTHS = 12;

export interface FluxoLivreInputs {
  /** Entradas por mês (sem proventos automáticos). */
  entradasByMonth: number[];
  /** Despesas por mês (sem grupo de investimentos). */
  despesasByMonth: number[];
  /** Bloco Conta Corrente (manual) por mês. */
  contaCorrenteByMonth: number[];
  /** Conta Corrente de dezembro do ano anterior (carry-over cross-year). */
  saldoDezembroAnterior: number;
  /** Aportes (+) / resgates (−) por mês, derivados da carteira. */
  aportesByMonth: number[];
}

/**
 * "Saldo Conta Corrente Mês Anterior": janeiro puxa dezembro do ano anterior;
 * os demais meses puxam o bloco Conta Corrente do mês anterior.
 */
export function buildSaldoContaCorrenteAnterior(
  contaCorrenteByMonth: number[],
  saldoDezembroAnterior: number,
): number[] {
  return Array.from({ length: MONTHS }, (_, index) =>
    index === 0 ? saldoDezembroAnterior : contaCorrenteByMonth[index - 1] || 0,
  );
}

/**
 * Fluxo de Caixa livre = saldo do mês + saldo conta corrente do mês anterior
 * − aportes/resgates. Não é acumulado: a sobra que fica na conta reaparece no
 * mês seguinte via bloco Conta Corrente preenchido pelo cliente.
 */
export function buildFluxoLivreByMonth(inputs: FluxoLivreInputs): number[] {
  const saldoAnterior = buildSaldoContaCorrenteAnterior(
    inputs.contaCorrenteByMonth,
    inputs.saldoDezembroAnterior,
  );
  return Array.from({ length: MONTHS }, (_, index) => {
    const saldoMes = (inputs.entradasByMonth[index] || 0) - (inputs.despesasByMonth[index] || 0);
    return saldoMes + saldoAnterior[index] - (inputs.aportesByMonth[index] || 0);
  });
}

export interface EvolucaoSeriesInputs {
  /** Total nominal aplicado até 31/dez do ano anterior (Σ compras − vendas). */
  baseAplicada: number;
  aportesByMonth: number[];
  fluxoLivreByMonth: number[];
  /** Valores travados pelo cron mensal; têm precedência sobre o cálculo. */
  snapshotByMonth: Partial<Record<number, number>>;
  /**
   * Último mês (0-11) com dados reais: ano passado → 11; ano corrente → mês
   * atual; ano futuro → -1 (tudo projeção encadeada a partir da base).
   */
  realUpTo: number;
}

/**
 * Série mensal da Evolução do Patrimônio:
 * - mês travado (snapshot): usa o valor congelado no último dia útil;
 * - mês com dados reais: base + aportes acumulados + fluxo livre do mês
 *   (a Conta Corrente manual carrega as sobras entre meses);
 * - mês futuro: mês anterior + fluxo livre projetado (simulação linear).
 */
export function computeEvolucaoSeries(inputs: EvolucaoSeriesInputs): number[] {
  const { baseAplicada, aportesByMonth, fluxoLivreByMonth, snapshotByMonth, realUpTo } = inputs;
  const series: number[] = [];
  let aportesAcumulados = 0;
  let previous = baseAplicada;

  for (let month = 0; month < MONTHS; month++) {
    aportesAcumulados += aportesByMonth[month] || 0;
    const snapshot = snapshotByMonth[month];
    let value: number;
    if (snapshot !== undefined) {
      value = snapshot;
    } else if (month <= realUpTo) {
      value = baseAplicada + aportesAcumulados + (fluxoLivreByMonth[month] || 0);
    } else {
      value = previous + (fluxoLivreByMonth[month] || 0);
    }
    series.push(value);
    previous = value;
  }

  return series;
}

/** Último mês com dados reais para o ano exibido (ver EvolucaoSeriesInputs). */
export function resolveRealUpTo(displayYear: number, now: Date = new Date()): number {
  const currentYear = now.getFullYear();
  if (displayYear < currentYear) return 11;
  if (displayYear > currentYear) return -1;
  return now.getMonth();
}
