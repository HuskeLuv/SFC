/**
 * Dados FIXOS da saúde fictícia (seção 7). Nunca usar dado real.
 */
import type { StatusSemaforo } from '@/types/relatorioFinanceiro';

export const SAUDE_FICTICIA = {
  nota: 72,
  status: 'good' as StatusSemaforo,
  frase:
    'Sua saúde financeira está boa: você poupa 22% da renda e tem 6 meses de reserva. O ponto de atenção é o comprometimento da renda.',
  indicadores: [
    ['Índice de poupança', 'quanto da receita sobra', '22,4%', '≥ 20%', 'good'],
    ['Reserva de emergência', 'meses de gastos guardados', '6,2 meses', '≥ 6 meses', 'good'],
    ['Comprometimento da renda', 'parcelas ÷ receita', '31,0%', '≤ 30%', 'warn'],
    ['Endividamento', 'dívidas ÷ bens', '18,5%', '≤ 30%', 'good'],
    ['Independência financeira', 'renda passiva ÷ gastos', '9,8%', '100%', 'warn'],
    ['Uso do rotativo', 'dívida mais cara do mercado', 'Não', 'Não usar', 'good'],
  ] as [string, string, string, string, StatusSemaforo][],
  bens: [
    ['Investimentos', 845_000],
    ['Imóvel (residência)', 640_000],
    ['Veículo', 74_000],
    ['Saldo em contas', 12_600],
  ] as [string, number][],
  dividas: [
    ['Financiamento imobiliário', 248_000],
    ['Financiamento do carro', 29_400],
  ] as [string, number][],
  data: 'em 30/10/2026',
};
