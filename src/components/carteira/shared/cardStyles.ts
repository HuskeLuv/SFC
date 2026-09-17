/**
 * Estilo único dos cards de métrica da carteira (MetricCard e
 * CaixaParaInvestirCard). Ficam lado a lado na mesma grade, então altura,
 * padding e cores vivem num lugar só — card novo desse estilo usa estas
 * constantes.
 *
 * Paleta My Finance PARTE 2 (ticket 21/08/2026): família de azuis da marca —
 * outside (#0079F2), patrimonio (#396CAA) e escolha (#EAEAEA) como tints;
 * texto no azul segurança (#314666). 'error' continua vermelho (semântico,
 * ex.: Patrimônio Líquido negativo).
 */
export const CARD_COLOR_CLASSES = {
  primary: 'bg-[#0079F2]/10 text-[#314666] dark:bg-[#0079F2]/20 dark:text-blue-100',
  success: 'bg-[#396CAA]/15 text-[#314666] dark:bg-[#396CAA]/25 dark:text-blue-100',
  warning: 'bg-[#EAEAEA] text-[#2D2D2D] dark:bg-white/10 dark:text-gray-100',
  error: 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100',
} as const;

export type CardColor = keyof typeof CARD_COLOR_CLASSES;

/**
 * Base do card: `h-full` faz todos da linha terminarem na mesma altura (a
 * grade já estica) e `min-h` mantém o tamanho igual entre linhas e telas.
 */
export const CARD_BASE_CLASS = 'flex h-full min-h-[5.5rem] flex-col rounded-lg p-3 sm:p-4';

/** Linha do topo: título à esquerda, ações (ex.: Editar) à direita. */
export const CARD_HEADER_CLASS = 'mb-1 flex min-h-[1.5rem] items-center justify-between gap-2';

export const CARD_TITLE_CLASS = 'truncate text-xs font-medium opacity-80';

export const CARD_VALUE_CLASS = 'text-xl font-semibold';

/** Botão discreto do topo do card (Editar/Salvar/Cancelar). */
export const CARD_ACTION_CLASS =
  'shrink-0 rounded-md border border-gray-300 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 sm:px-2 sm:text-[11px] dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800';

export const CARD_ACTION_PRIMARY_CLASS =
  'shrink-0 rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60 sm:px-2 sm:text-[11px]';

/**
 * Confirmar/cancelar em edição: ícone só, como a barra de edição do Fluxo de
 * Caixa. Texto ("Salvar"/"Cancelar") não cabe ao lado do título na largura do
 * card e truncava o título.
 */
export const CARD_ICON_ACTION_CLASS =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold leading-none transition-colors disabled:opacity-60';
