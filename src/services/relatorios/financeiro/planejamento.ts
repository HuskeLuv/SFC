/**
 * Seção 5 (Planejamento financeiro) do Relatório financeiro. Plano Pro.
 *
 * STUB da fatia F0: a fatia F2 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type { BlocoPlanejamento } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';

export async function montarPlanejamento(_ctx: ContextoMontador): Promise<BlocoPlanejamento> {
  return {
    temPlano: false,
    patrimonioRealizado: 0,
    patrimonioPlanejadoHoje: null,
    metaIndependencia: null,
    metaMensal: null,
    serie: [],
  };
}
