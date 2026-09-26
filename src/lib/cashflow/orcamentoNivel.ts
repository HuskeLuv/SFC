import { formatBRL } from '@/utils/format';

/**
 * Nível de consumo do orçamento (isomórfico): fonte ÚNICA dos cortes usados pelos alertas do sino
 * (`services/cashflow/orcamentoAlertas`) e pelo Orçamento no celular (PWA fase 2).
 *
 * Cortes (os do alerta): abaixo de 80% = dentro da meta; a partir de 80% = atenção; 100% = meta
 * atingida; acima de 100% = estourou. A linha Investimentos tem semântica invertida (atingir 100%
 * da meta de aporte é bom).
 *
 * A tabela de desktop (`OrcamentoTable`) ainda usa ≤ 80 como OK — alinhar é PR separado
 * (decisão 9 do Wellington, 26/09/2026).
 */

/** Tolerância para comparações com valores já arredondados a 2 casas. */
const EPS = 0.005;

/** Rank do nível de consumo (0 = sem alerta; 1 = atenção; 2 = atingido; 3 = estourado). */
export const rankDoConsumo = (real: number, meta: number): number => {
  if (!(meta > 0)) return 0;
  if (real - meta > EPS) return 3;
  if (real >= meta - EPS) return 2;
  if (real >= meta * 0.8 - EPS) return 1;
  return 0;
};

export type OrcamentoNivelStatus = 'sem-meta' | 'dentro' | 'atencao' | 'atingido' | 'estourou';

export interface OrcamentoNivel {
  /** Consumo em % da meta, arredondado (null sem meta). */
  pct: number | null;
  status: OrcamentoNivelStatus;
  /** Texto do selo (o nível nunca depende só da cor). */
  texto: string;
}

/**
 * Nível de uma linha do orçamento na janela exibida (mês ou acumulado).
 * - `meta` null ou ≤ 0 → 'sem-meta'.
 * - Categoria: 'Dentro da meta' / 'Atenção: {pct}% usado' / 'Meta atingida' / 'Estourou {R$ X}'.
 * - Investimentos: ≥ 100% → 'Meta de aporte atingida'; abaixo → atenção com quanto falta.
 */
export function nivelOrcamento(
  real: number,
  meta: number | null,
  isInvestimentos = false,
): OrcamentoNivel {
  if (meta === null || !(meta > 0)) {
    return { pct: null, status: 'sem-meta', texto: 'Sem meta' };
  }
  const pct = Math.round((real / meta) * 100);

  if (isInvestimentos) {
    if (real >= meta - EPS) {
      return { pct, status: 'atingido', texto: 'Meta de aporte atingida' };
    }
    return { pct, status: 'atencao', texto: `Faltam ${formatBRL(meta - real)}` };
  }

  switch (rankDoConsumo(real, meta)) {
    case 3:
      return { pct, status: 'estourou', texto: `Estourou ${formatBRL(real - meta)}` };
    case 2:
      return { pct, status: 'atingido', texto: 'Meta atingida' };
    case 1:
      return { pct, status: 'atencao', texto: `Atenção: ${pct}% usado` };
    default:
      return { pct, status: 'dentro', texto: 'Dentro da meta' };
  }
}
