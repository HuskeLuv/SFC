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

// ── PWA fase 3 ─────────────────────────────────────────────────────────────────────────────────

/**
 * Rodapé de ações fixo no fim de um modal que vira sheet abaixo de lg (fase 3), com a área segura
 * de baixo. `p6` casa com o padding `p-6` do conteúdo do modal; `p6sm8` com `p-6 sm:p-8`
 * (ConectarBancoModal/AutorizacaoModal). No desktop nada muda (só `max-lg:`). Não usar num cartão
 * inline (padding diferente): lá, uma barra própria com o padding do cartão.
 */
export const MODAL_STICKY_FOOTER = {
  p6: 'max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-6 max-lg:px-6 max-lg:mt-4 max-lg:border-t max-lg:border-gray-200 max-lg:bg-white max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:max-lg:border-gray-800 dark:max-lg:bg-gray-900',
  p6sm8:
    'max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-6 max-lg:px-6 max-lg:mt-4 max-lg:border-t max-lg:border-gray-200 max-lg:bg-white max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:max-lg:border-gray-800 dark:max-lg:bg-gray-900 sm:max-lg:-mx-8 sm:max-lg:px-8',
} as const;

/**
 * De ponta a ponta no celular: anula o padding do `[data-mf-content]` (`p-4 md:p-6`). Par de
 * `EDGE_TO_EDGE_PAD` para o conteúdo interno voltar ao alinhamento.
 */
export const EDGE_TO_EDGE = 'max-lg:-mx-4 md:max-lg:-mx-6';
export const EDGE_TO_EDGE_PAD = 'max-lg:px-4 md:max-lg:px-6';

/** Gruda sob o cabeçalho mobile ao rolar (só abaixo de lg). */
export const STICKY_UNDER_HEADER = 'max-lg:sticky max-lg:top-[var(--mf-header-h,0px)] max-lg:z-20';
