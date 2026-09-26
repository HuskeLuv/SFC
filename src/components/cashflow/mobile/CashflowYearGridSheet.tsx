'use client';

/**
 * "Ano inteiro" do Fluxo de caixa no celular (PWA fase 2) — CONTRATO. Stub da fatia 0: a visão do
 * mês (fatia A) já monta o componente e a fatia D substitui a implementação mantendo estes tipos.
 *
 * Decisão do Wellington (26/09/2026): SÓ LEITURA em tela cheia; tocar no nome do mês chama
 * `onPickMonth` (fecha e abre aquele mês na visão do mês). `onPickCell` fica no contrato, sem uso.
 */

export interface CashflowYearGridSheetProps {
  isOpen: boolean;
  onClose(): void;
  year: number;
  /** Mês em foco na visão do mês (0 = Jan … 11 = Dez). */
  month: number;
  onPickMonth(m: number): void;
  onPickCell?(itemId: string, groupId: string, m: number): void;
}

export default function CashflowYearGridSheet(_props: CashflowYearGridSheetProps) {
  return null;
}

export { CashflowYearGridSheet };
