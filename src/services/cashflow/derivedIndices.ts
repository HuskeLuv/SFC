/**
 * Índices calculados da planilha de fluxo de caixa (puros e isomórficos). Movidos das linhas de
 * desktop (SavingsIndexRow, FinancialPeaceIndexRow, InflationPedroRow) para a visão do mês do
 * celular usar a MESMA conta (PWA fase 2). Resultado em pontos percentuais; `null` = sem cálculo.
 */

/** Índice de poupança = (saldo do mês / entradas do mês) × 100. */
export const savingsIndex = (saldo: number, entradas: number): number | null =>
  entradas === 0 ? null : (saldo / entradas) * 100;

/**
 * Índice paz financeira = (proventos recebidos / despesas FIXAS) × 100.
 * Denominador exclui despesas variáveis por definição.
 */
export const peaceIndex = (proventos: number, despesasFixas: number): number | null =>
  despesasFixas === 0 ? null : (proventos / despesasFixas) * 100;

/**
 * Inflação pessoal ("Inflação Pedro") por mês = ((despesas do mês / despesas do mês anterior) − 1)
 * × 100. Janeiro é sempre 0%; mês anterior zerado não permite cálculo (`null`).
 */
export const inflacaoPessoalPorMes = (despesasByMonth: number[]): Array<number | null> =>
  despesasByMonth.map((despesasAtual, index) => {
    if (index === 0) return 0;
    const despesasAnterior = despesasByMonth[index - 1];
    if (despesasAnterior === 0) return null;
    return (despesasAtual / despesasAnterior - 1) * 100;
  });

/** Inflação pessoal do ano = média simples dos meses com cálculo (`null` se nenhum). */
export const inflacaoPessoalAnual = (porMes: Array<number | null>): number | null => {
  const validas = porMes.filter((inf): inf is number => inf !== null);
  return validas.length > 0 ? validas.reduce((sum, inf) => sum + inf, 0) / validas.length : null;
};
