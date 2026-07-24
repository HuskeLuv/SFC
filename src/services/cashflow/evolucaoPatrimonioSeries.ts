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
  /**
   * Série "Saldo Conta Corrente Mês Anterior" (jan = dez do ano anterior;
   * demais = bloco Conta Corrente do mês anterior). Descontada do fluxo livre
   * de fev em diante: a sobra que ela representa já está dentro do valor
   * encadeado do mês anterior — mantê-la contaria o mesmo dinheiro duas vezes.
   */
  saldoAnteriorByMonth: number[];
  /** Valores travados pelo cron mensal; têm precedência sobre o cálculo. */
  snapshotByMonth: Partial<Record<number, number>>;
}

/**
 * Série mensal da Evolução do Patrimônio — modelo ENCADEADO (decisão do Pedro,
 * 24/07/2026: substituiu a re-ancoragem mensal em Σ aportes acumulados):
 * - mês travado (snapshot): usa o valor congelado no último dia útil;
 * - janeiro: base aplicada + aportes do mês + fluxo livre do mês (o carry de
 *   dez do ano anterior fica DENTRO do fluxo livre de jan — o caixa parado na
 *   virada do ano é patrimônio da âncora anual);
 * - fev em diante (real ou projeção, mesma recorrência): mês anterior +
 *   aportes do mês + fluxo livre do mês SEM o carry da Conta Corrente. A sobra
 *   de meses anteriores permanece no encadeamento mesmo que o cliente não a
 *   registre na Conta Corrente; quando registra, o desconto do carry evita a
 *   dupla contagem. Meses futuros têm aportes 0 e viram a projeção linear.
 */
export function computeEvolucaoSeries(inputs: EvolucaoSeriesInputs): number[] {
  const { baseAplicada, aportesByMonth, fluxoLivreByMonth, saldoAnteriorByMonth, snapshotByMonth } =
    inputs;
  const series: number[] = [];
  let previous = baseAplicada;

  for (let month = 0; month < MONTHS; month++) {
    const snapshot = snapshotByMonth[month];
    const aporte = aportesByMonth[month] || 0;
    const fluxoLivre = fluxoLivreByMonth[month] || 0;
    let value: number;
    if (snapshot !== undefined) {
      value = snapshot;
    } else if (month === 0) {
      value = baseAplicada + aporte + fluxoLivre;
    } else {
      value = previous + aporte + (fluxoLivre - (saldoAnteriorByMonth[month] || 0));
    }
    series.push(value);
    previous = value;
  }

  return series;
}
