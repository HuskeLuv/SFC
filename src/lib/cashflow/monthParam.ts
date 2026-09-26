/**
 * Mês da visão do Fluxo de caixa na URL (`?mes=1..12`), compartilhado entre Planilha e Orçamento
 * no celular (PWA fase 2). Escrita via history.replaceState — sem navegação do Next, mesmo padrão
 * do `?modo=` da página e do `?ano=` do CashflowYearContext.
 */

const PARAM = 'mes';

/** `?mes=1..12` → índice 0..11; ausente ou inválido → null. Seguro no servidor (null). */
export function readMesParam(search?: string): number | null {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const raw = new URLSearchParams(query).get(PARAM);
  if (raw === null || !/^\d{1,2}$/.test(raw.trim())) return null;
  const mes = Number(raw.trim());
  return mes >= 1 && mes <= 12 ? mes - 1 : null;
}

/** Grava o mês (índice 0..11) em `?mes=` (1..12); `null` remove o parâmetro. */
export function writeMesParam(month: number | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (month === null || !Number.isInteger(month) || month < 0 || month > 11) {
    url.searchParams.delete(PARAM);
  } else {
    url.searchParams.set(PARAM, String(month + 1));
  }
  if (url.toString() === window.location.href) return;
  // Estado `null` (como o `?ano=` e o `?modo=`): o Next copia o estado interno e sincroniza a URL
  // canônica do router. Passar o `history.state` atual (com __NA) pulava essa sincronização, e um
  // ACTION_RESTORE em andamento (ex.: o `?ano=` da virada Jan→Dez) regravava o `?mes=` antigo.
  window.history.replaceState(null, '', url.toString());
}
