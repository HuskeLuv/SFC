import type { TipoPlanoPrevidencia } from '@/services/ir/irpfAnual';

/**
 * Tipo efetivo de um plano de previdência da carteira (PGBL × VGBL). Puro: usado pela aba PGBL e
 * pelo Resumo Anual do IR (via re-export de components/analises/ir/pgblMarcacoes.ts) e pela
 * seção 8 do Relatório financeiro (servidor).
 */

export type TipoPlanoMarcado = 'pgbl' | 'vgbl';

/** O mínimo de um plano para decidir o tipo (IRPlanoPrevidencia e PlanoPrevidenciaIR servem). */
export interface PlanoComTipoSugerido {
  assetId: string;
  tipoSugerido: TipoPlanoPrevidencia;
}

/** Tipo efetivo: a marcação do usuário, senão o palpite pelo nome (null = não sabemos). */
export function tipoDoPlano(
  plano: PlanoComTipoSugerido,
  marcas: Record<string, TipoPlanoMarcado>,
): TipoPlanoMarcado | null {
  return marcas[plano.assetId] ?? plano.tipoSugerido;
}
