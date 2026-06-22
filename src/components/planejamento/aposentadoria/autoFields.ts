import type { PlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';

/**
 * Campos do plano que podem ser auto-preenchidos a partir do contexto
 * financeiro (carteira + fluxo de caixa). No modelo híbrido com override, um
 * campo é "auto" enquanto não estiver em `fieldLocks`; ao editá-lo, o usuário
 * o trava (vira "manual") e ele para de re-sincronizar.
 */
export const AUTO_FIELDS = ['patrimonio', 'aporteM', 'renda', 'rentNom', 'inflacao'] as const;
export type AutoField = (typeof AUTO_FIELDS)[number];

export interface AutoFieldInfo {
  /** Valor sugerido pelo contexto, ou null se não há dado suficiente. */
  autoValue: number | null;
  /** Procedência curta exibida na UI (ex.: "da sua sobra de caixa"). */
  label: string;
}

export type AutoValues = Record<AutoField, AutoFieldInfo>;

/**
 * Deriva o valor automático de cada campo a partir do contexto. Mantém a
 * procedência (label) junto, para a UI explicar de onde veio o número.
 */
export function deriveAutoValues(ctx: PlanejamentoContexto | null): AutoValues {
  if (!ctx) {
    const empty: AutoFieldInfo = { autoValue: null, label: '' };
    return {
      patrimonio: empty,
      aporteM: empty,
      renda: empty,
      rentNom: empty,
      inflacao: empty,
    };
  }

  const sobra = ctx.cashflow.sobraMensalMedia;
  const aporteReal = ctx.aporteMensalRealizado;
  let aporte: AutoFieldInfo;
  if (sobra > 0) {
    aporte = { autoValue: Math.round(sobra), label: 'da sua sobra de caixa' };
  } else if (aporteReal > 0) {
    aporte = { autoValue: Math.round(aporteReal), label: 'dos seus aportes (12m)' };
  } else {
    aporte = { autoValue: null, label: '' };
  }

  return {
    patrimonio: {
      autoValue: ctx.patrimonio > 0 ? ctx.patrimonio : null,
      label: 'do seu patrimônio',
    },
    aporteM: aporte,
    renda: {
      autoValue:
        ctx.cashflow.despesaMensalMedia > 0 ? Math.round(ctx.cashflow.despesaMensalMedia) : null,
      label: 'das suas despesas mensais',
    },
    rentNom: {
      autoValue: ctx.cdiAnualizado,
      label: 'CDI atual',
    },
    inflacao: {
      autoValue: ctx.inflacao12m ?? ctx.inflacaoFallback,
      label: ctx.inflacao12m != null ? 'IPCA 12m' : 'meta de inflação',
    },
  };
}

/**
 * Patch dos campos auto NÃO travados cujo valor diverge do atual — usado para
 * re-sincronizar com o contexto sem mexer nos campos que o usuário travou.
 */
export function buildAutoSyncPatch(
  params: PlanoUpsertPayload,
  autoValues: AutoValues,
  locks: string[],
): Partial<PlanoUpsertPayload> {
  const patch: Partial<PlanoUpsertPayload> = {};
  const lockSet = new Set(locks);
  for (const field of AUTO_FIELDS) {
    if (lockSet.has(field)) continue;
    const auto = autoValues[field].autoValue;
    if (auto == null) continue;
    if (params[field] !== auto) {
      patch[field] = auto;
    }
  }
  return patch;
}
