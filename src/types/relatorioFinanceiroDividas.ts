/**
 * Relatório financeiro, seção 3 (Dívidas): a evolução mês a mês do período (gráficos com n > 1).
 * Só tipos (front e backend).
 */

/** Um mês do período, somando todas as dívidas não quitadas. */
export interface PontoSerieDividas {
  /** 'YYYY-MM'. */
  mes: string;
  /**
   * Saldo devedor no fim do mês, corrigido pelo índice realizado até ali (o do mês corrente é o
   * KPI "Saldo devedor total"). Dívida antes do início (1º vencimento; rotativa: data do saldo)
   * fica fora.
   */
  saldo: number;
  /** Juros da parcela do mês (cronograma; rotativa: saldo × taxa, até o mínimo de 15%). */
  juros: number;
  /** Amortização da parcela do mês (cronograma; rotativa: o que o mínimo de 15% abate). */
  amortizacao: number;
}
