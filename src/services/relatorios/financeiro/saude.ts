/**
 * Seção 7 (Saúde financeira) do Relatório financeiro. Plano Advanced.
 *
 * Fase 2 do orquestrador (pura): roda depois da fase 1, com os blocos já montados.
 *
 * STUB da fatia F0: a fatia F2 preenche o corpo. A assinatura é o contrato com montarRelatorio.
 */
import type {
  BlocoCarteiraAvancada,
  BlocoDividas,
  BlocoOrcamento,
  BlocoSaude,
} from '@/types/relatorioFinanceiro';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type { ContextoMontador } from './insumos';

export interface EntradaSaude {
  ctx: ContextoMontador;
  /** insumos.saudeBase() já resolvido. */
  saudeBase: SaudeFinanceiraPayload;
  orcamento: BlocoOrcamento;
  dividas: BlocoDividas;
  /** Proventos para o indicador de independência (montado no Advanced, que é quem vê a saúde). */
  carteiraAvancada: BlocoCarteiraAvancada | null;
}

export function montarSaude(entrada: EntradaSaude): BlocoSaude {
  return {
    nota: null,
    status: null,
    frase: '',
    indicadores: [],
    bens: [],
    dividas: [],
    asOf: entrada.saudeBase.asOf.slice(0, 10),
    historicoNota: [],
  };
}
