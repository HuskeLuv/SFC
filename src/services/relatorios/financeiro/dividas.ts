/**
 * Seção 3 (Dívidas) do Relatório financeiro.
 *
 * STUB da fatia F0: a fatia F1 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type { BlocoDividas } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';

export async function montarDividas(_ctx: ContextoMontador): Promise<BlocoDividas> {
  return {
    itens: [],
    semDividasForaImovel: { mes: null, motivo: 'sem_dividas' },
    avisos: { semCet: 0, parcelasVencidasSemPagamento: 0 },
  };
}
