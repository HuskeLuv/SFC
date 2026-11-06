/**
 * Seção 2 (Orçamento) do Relatório financeiro.
 *
 * STUB da fatia F0: a fatia F1 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type { BlocoOrcamento } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';

export async function montarOrcamento(_ctx: ContextoMontador): Promise<BlocoOrcamento> {
  return {
    temOrcamento: false,
    meses: [],
    ritmo: null,
    referenciaFechada: { receitaMedia3m: 0, gastoMedio3m: 0, sobraMesAnterior: null },
  };
}
