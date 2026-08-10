/**
 * Legenda de cores do fluxo de caixa — fonte única de verdade.
 * A cor é DO TEXTO da célula (CashflowValue.color, CSS hex) e carrega
 * significado de status, espelhando a legenda da planilha FLC do Pedro
 * (#76933C e #9E8A58 são cores clássicas da paleta do Excel).
 *
 * Consumida pelo ColorPickerButton/useGroupEditMode (pintura manual) e pelo
 * importador da planilha (snap da cor de fonte lida do .xlsx).
 */

export type CashflowColorValue = 'black' | 'green' | 'red' | 'blue' | 'yellow';

export interface CashflowColorLegendEntry {
  value: CashflowColorValue;
  label: string;
  cssColor: string;
}

export const CASHFLOW_COLOR_LEGEND: readonly CashflowColorLegendEntry[] = [
  { value: 'black', label: 'Pagar/Receber', cssColor: '#000000' },
  { value: 'green', label: 'Recebido', cssColor: '#76933C' },
  { value: 'red', label: 'Pago', cssColor: '#FF0000' },
  { value: 'blue', label: 'Lançamento Futuro', cssColor: '#0000FF' },
  { value: 'yellow', label: 'Cartão crédito', cssColor: '#9E8A58' },
] as const;

export const cashflowColorCss = (value: CashflowColorValue): string =>
  CASHFLOW_COLOR_LEGEND.find((c) => c.value === value)?.cssColor ?? '#000000';
