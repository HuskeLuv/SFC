/**
 * Contratos da casca mobile (PWA fase 0).
 *
 * As classes ficam como strings literais para o JIT do Tailwind enxergá-las. O par CSS destes
 * nomes vive no fim de src/app/globals.css ("PWA fase 0 — casca mobile").
 */

/** Largura (px) a partir da qual vale o layout desktop (breakpoint `lg`). */
export const MOBILE_BREAKPOINT_PX = 1024;

/** Media query de "abaixo de lg" — o mesmo corte de `@media (width < 64rem)`. */
export const MOBILE_MEDIA_QUERY = '(max-width: 1023.98px)';

/** Alvo de toque mínimo (44×44). */
export const TOUCH_TARGET = 'min-h-11 min-w-11';

/** Padding das áreas seguras (notch, barra de gestos). */
export const SAFE_AREA = {
  top: 'pt-[env(safe-area-inset-top)]',
  bottom: 'pb-[env(safe-area-inset-bottom)]',
  x: 'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
} as const;

/** Altura cheia respeitando a barra dinâmica do navegador mobile. */
export const FULL_HEIGHT = 'min-h-dvh';

/** Espaço no fim do conteúdo para não ficar sob a barra de abas (0 no desktop). */
export const BOTTOM_NAV_PADDING = 'pb-[calc(var(--mf-bottom-nav-h,0px)+1rem)]';

/** Posição de elementos fixos acima da barra de abas (0 + 1rem no desktop). */
export const BOTTOM_NAV_OFFSET = 'bottom-[calc(var(--mf-bottom-nav-h,0px)+1rem)]';

/** Altura da barra de abas mobile, sem a área segura. */
export const TAB_BAR_HEIGHT_REM = 4;

/** Altura do cabeçalho mobile, sem a área segura. */
export const MOBILE_HEADER_HEIGHT_REM = 3.5;

/** Atributos de contrato lidos pelo CSS da casca. */
export const MF_ATTR = {
  tabbar: 'data-mf-tabbar',
  header: 'data-mf-mobile-header',
  overlay: 'data-mf-overlay',
  fab: 'data-mf-fab',
  sheet: 'data-mf-sheet',
} as const;

/**
 * Z-index de referência — só documentação; as classes usam `z-[n]` literal.
 */
export const Z = {
  header: 9980,
  tabbar: 9990,
  assistente: 9997,
  banner: 9999,
  sheetOverlay: 99990,
  sheet: 99991,
  modal: 99999,
} as const;
