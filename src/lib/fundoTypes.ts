/**
 * Tipos de Asset.type que representam fundos de investimento — emitidos por
 * inferFundType() em src/services/pricing/cvmFundSync.ts. Antes da migração
 * pra RCVM 175 só existiam 'fund' e 'funds' (catch-alls).
 *
 * Use FUNDO_TYPES_ALL para queries abrangentes (busca, IR, mapeamento de
 * operação) e FUNDO_TYPES_FIM_FIA quando a UI precisa só dos fundos que vão
 * pra aba FIM/FIA — estruturados (FIDC/FIP/Fiagro/FIP-Infra/etf-cvm) têm UI
 * própria e não devem aparecer lá.
 *
 * 'fii' não está na lista — FII tem aba e fluxo dedicado e nunca é tratado
 * como fundo genérico no app.
 */

export const FUNDO_TYPES_ALL = [
  'fund',
  'funds',
  'fip',
  'fip-infra',
  'fidc',
  'fiagro',
  'etf-cvm',
  'previdencia',
  'fia',
  'multimercado',
  'fund-rf',
  'fund-cambial',
] as const;

export const FUNDO_TYPES_FIM_FIA = ['fund', 'funds', 'fia', 'multimercado'] as const;

export const FUNDO_TYPES_ESTRUTURADOS = ['fip', 'fip-infra', 'fidc', 'fiagro', 'etf-cvm'] as const;

export function isFundoType(type: string | null | undefined): boolean {
  return type != null && (FUNDO_TYPES_ALL as readonly string[]).includes(type);
}

export function isFundoEstruturado(type: string | null | undefined): boolean {
  return type != null && (FUNDO_TYPES_ESTRUTURADOS as readonly string[]).includes(type);
}
