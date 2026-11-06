/**
 * Cadeado do protótipo do Pedro (LOCK): KpiLock, sumário da capa e cartão de upgrade.
 */
export function IconeCadeado({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="2.2" fill="none" />
    </svg>
  );
}
