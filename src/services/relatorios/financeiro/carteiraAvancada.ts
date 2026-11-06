/**
 * Seção 4b (Carteira: TWR x índices, proventos) do Relatório financeiro. Plano Advanced.
 * fgc e irRendaVariavel ficam null na v1.
 *
 * STUB da fatia F0: a fatia F2 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type { BlocoCarteiraAvancada } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';

export async function montarCarteiraAvancada(
  _ctx: ContextoMontador,
): Promise<BlocoCarteiraAvancada> {
  return {
    retornoDiario: { datas: [], carteira: [], ibov: [], cdi: [], ipca: [] },
    twr: null,
    cdi: null,
    ipca: null,
    ibov: null,
    proventos: [],
    fgc: null,
    irRendaVariavel: null,
  };
}
