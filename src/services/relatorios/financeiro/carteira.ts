/**
 * Seção 4a (Carteira: patrimônio, classes, histórico) do Relatório financeiro. Plano Pro.
 *
 * STUB da fatia F0: a fatia F2 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type { BlocoCarteira } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';

export async function montarCarteira(_ctx: ContextoMontador): Promise<BlocoCarteira> {
  return {
    asOf: null,
    patrimonio: 0,
    classes: [],
    nAtivos: 0,
    nClasses: 0,
    historico: [],
    variacaoPeriodo: null,
    aportesPeriodo: 0,
    aportes: [],
    historicoStatus: 'processando',
  };
}
