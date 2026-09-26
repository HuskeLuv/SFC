'use client';

import type { CashflowGroup } from '@/types/cashflow';

/**
 * Sheets de edição do Fluxo de caixa no celular (PWA fase 2) — CONTRATO. Este arquivo é um stub
 * da fatia 0: a visão do mês (fatia A) já monta o componente e a fatia B substitui a implementação
 * mantendo exatamente estes tipos.
 *
 * O alvo leva só ids: a cada render o sheet re-resolve item/grupo contra `groups`; se o id sumiu
 * (refetch, personalização trocou o id), o sheet fecha.
 */

export type CashflowEditTarget =
  | {
      kind: 'cell';
      itemId: string;
      groupId: string;
      /** 0 = Jan … 11 = Dez. */
      month: number;
      view?: 'valor' | 'comentario' | 'linha' | 'mover' | 'excluir';
    }
  | { kind: 'group'; groupId: string; month: number }
  | { kind: 'add-item'; groupId: string; month: number };

export interface CashflowEditSheetsProps {
  year: number;
  groups: CashflowGroup[];
  /** Totais por mês de cada item (processedData.itemTotals), por id. */
  itemTotals: Record<string, number[]>;
  target: CashflowEditTarget | null;
  onTargetChange(t: CashflowEditTarget | null): void;
  /** Aviso "Salvo" (sem Desfazer) e, se houver, a linha/mês para piscar. */
  onSaved(message: string, opts?: { itemId?: string; month?: number }): void;
  /** Entra no modo "Reordenar linhas" do grupo (setas). */
  onStartReorder(groupId: string): void;
}

export default function CashflowEditSheets(_props: CashflowEditSheetsProps) {
  return null;
}

export { CashflowEditSheets };
