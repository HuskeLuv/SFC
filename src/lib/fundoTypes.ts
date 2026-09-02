/**
 * Tipos de Asset.type que representam fundos de investimento — emitidos por
 * inferFundType() em src/services/pricing/cvmFundSync.ts. Antes da migração
 * pra RCVM 175 só existiam 'fund' e 'funds' (catch-alls).
 *
 * Use FUNDO_TYPES_ALL para queries abrangentes (busca, IR, mapeamento de
 * operação) e FUNDO_TYPES_AGRUPADOS para a aba "Fundos" da carteira (exclui
 * 'previdencia' que tem aba própria e 'etf-cvm' que se aproxima de ETF).
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

/** Fundos exibidos na aba "Fundos" (antiga FIM/FIA). */
export const FUNDO_TYPES_AGRUPADOS = [
  'fund',
  'funds',
  'fia',
  'multimercado',
  'fund-rf',
  'fund-cambial',
  'fip',
  'fip-infra',
  'fidc',
  'fiagro',
] as const;

export const FUNDO_TYPES_ESTRUTURADOS = ['fip', 'fip-infra', 'fidc', 'fiagro', 'etf-cvm'] as const;

/**
 * Asset.type catch-all (fundo manual ou CVM sem classificação clara). Pra estes
 * o subtipo informado no wizard (notes.tipoFundo) vale mais que o mapa abaixo.
 */
export const FUNDO_TYPES_CATCH_ALL = ['fund', 'funds'] as const;

export function isFundoCatchAllType(type: string | null | undefined): boolean {
  return type != null && (FUNDO_TYPES_CATCH_ALL as readonly string[]).includes(type);
}

/**
 * Map Asset.type → identificador de seção/subtipo na aba "Fundos".
 * Os tipos 'fund'/'funds' caem em 'fim' (multimercado é o default histórico).
 * Ticket 02/09/2026: fundos de renda fixa e cambiais (classificação CVM) ganham
 * seção própria — antes caíam em FIM junto com os multimercado.
 */
export const ASSET_TYPE_TO_FUNDO_SUBTIPO: Record<string, FundoSubtipo> = {
  fund: 'fim',
  funds: 'fim',
  multimercado: 'fim',
  fia: 'fia',
  'fund-rf': 'rf',
  'fund-cambial': 'cambial',
  fip: 'fip',
  'fip-infra': 'fip-infra',
  fidc: 'fidc',
  fiagro: 'fiagro',
};

export type FundoSubtipo =
  | 'fim'
  | 'fia'
  | 'rf'
  | 'cambial'
  | 'fip'
  | 'fip-infra'
  | 'fidc'
  | 'fiagro';

export const FUNDO_SUBTIPO_ORDER: FundoSubtipo[] = [
  'fim',
  'fia',
  'rf',
  'cambial',
  'fip',
  'fip-infra',
  'fidc',
  'fiagro',
];

export const FUNDO_SUBTIPO_LABEL: Record<FundoSubtipo, string> = {
  fim: 'FIM',
  fia: 'FIA',
  rf: 'Renda Fixa',
  cambial: 'Cambial',
  fip: 'FIP',
  'fip-infra': 'FIP Infraestrutura',
  fidc: 'FIDC',
  fiagro: 'Fiagro',
};

export function isFundoSubtipo(value: unknown): value is FundoSubtipo {
  return typeof value === 'string' && (FUNDO_SUBTIPO_ORDER as string[]).includes(value);
}

export function isFundoType(type: string | null | undefined): boolean {
  return type != null && (FUNDO_TYPES_ALL as readonly string[]).includes(type);
}

export function isFundoEstruturado(type: string | null | undefined): boolean {
  return type != null && (FUNDO_TYPES_ESTRUTURADOS as readonly string[]).includes(type);
}

/** Resolve subtipo da aba "Fundos" a partir do Asset.type. */
export function fundoSubtipoFromAssetType(type: string | null | undefined): FundoSubtipo | null {
  if (!type) return null;
  return ASSET_TYPE_TO_FUNDO_SUBTIPO[type] ?? null;
}
