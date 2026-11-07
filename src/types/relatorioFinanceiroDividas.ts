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
  /**
   * Juros pagos no mês, só pelos pagamentos registrados (linhas do cronograma das parcelas
   * registradas; rotativa: saldo do início do mês × taxa, até o valor pago). Sem pagamento, 0.
   */
  juros: number;
  /** Amortização paga no mês (idem; + pagamento avulso e amortização de prazo). Sem pagamento, 0. */
  amortizacao: number;
}
