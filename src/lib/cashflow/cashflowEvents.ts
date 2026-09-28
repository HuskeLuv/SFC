/**
 * Barramento de eventos do Fluxo de caixa no `window` (PWA fase 2) — sem estado global de React.
 *
 * - `mf:cashflow-flash`: o lançamento rápido (fatia C) avisa que gravou numa célula; a visão do
 *   mês (fatia A) muda para o mês, abre o grupo, rola até a linha e pisca.
 * - `mf:open-lancamento`: a visão do mês (estado vazio) pede para abrir o lançamento rápido.
 */

export const CASHFLOW_FLASH_EVENT = 'mf:cashflow-flash';
export const OPEN_LANCAMENTO_EVENT = 'mf:open-lancamento';

export interface CashflowFlashDetail {
  itemId: string;
  year: number;
  /** 0 = Jan … 11 = Dez. */
  month: number;
}

export function emitCashflowFlash(detail: CashflowFlashDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CashflowFlashDetail>(CASHFLOW_FLASH_EVENT, { detail }));
}

/** Ouve os flashes; devolve a função que para de ouvir. */
export function onCashflowFlash(cb: (detail: CashflowFlashDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CashflowFlashDetail>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(CASHFLOW_FLASH_EVENT, handler);
  return () => window.removeEventListener(CASHFLOW_FLASH_EVENT, handler);
}

export function emitOpenLancamento(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_LANCAMENTO_EVENT));
}

/** Ouve os pedidos de abrir o lançamento rápido; devolve a função que para de ouvir. */
export function onOpenLancamento(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(OPEN_LANCAMENTO_EVENT, handler);
  return () => window.removeEventListener(OPEN_LANCAMENTO_EVENT, handler);
}
