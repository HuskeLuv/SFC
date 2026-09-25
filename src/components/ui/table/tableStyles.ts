import { MYFINANCE_BRAND, TABLE_HEADER_BG } from '@/constants/brandColors';

/**
 * Padrão visual ÚNICO de tabela do sistema (pedido do Wellington, 15/09/2026).
 *
 * Referência: a tabela do Orçamento (`cashflow/orcamento/OrcamentoTable.tsx`).
 * Toda tabela do app deve usar estas classes em vez de estilizar por conta
 * própria — antes cada tela tinha um visual (bordas pretas estilo Excel,
 * cantos retos, Calibri, totais em cinza #595959/#404040 fora da paleta).
 *
 * Regras:
 * - container arredondado (`rounded-xl`) com borda fina, rolagem horizontal;
 * - cabeçalho no azul `seguranca` da paleta + texto branco em caixa alta;
 * - linhas separadas só por uma borda horizontal sutil — sem bordas verticais;
 * - totais em cinza-claro com fonte média; seções (grupos colapsáveis) no
 *   azul `tranquilidade` com texto branco;
 * - cores sempre de `src/constants/brandColors.ts` (regra permanente da paleta).
 */
export const TABLE_STYLES = {
  /** Div que envolve a <table>: cantos arredondados, borda fina, scroll no eixo X. */
  wrapper: 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800',
  /**
   * A própria <table>. A cor de texto padrão fica AQUI (herança), não no <td>:
   * no Tailwind v4 os utilitários de `color` saem em ordem alfabética, então um
   * `text-gray-700` no td venceria `text-gray-500`/`text-emerald-600` semânticos
   * colocados na mesma célula. Herdando, qualquer cor no td/span vence.
   */
  table: 'w-full text-left text-gray-700 dark:text-gray-200',
  /** <tr> do <thead>. Combinar com `TABLE_HEADER_STYLE` (fundo azul). */
  headRow:
    'border-b border-gray-200 text-xs uppercase tracking-wide text-white dark:border-gray-800',
  /** <th> do cabeçalho (alinhamento vem de fora: text-left/right/center). */
  th: 'px-4 py-3 font-medium whitespace-nowrap',
  /** <tr> de dados. */
  row: 'border-b border-gray-100 last:border-b-0 dark:border-gray-800',
  /** Hover opcional para linhas clicáveis/expansíveis. */
  rowHover: 'transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]',
  /** <td> de dados. */
  td: 'px-4 py-2.5 text-sm',
  /** <tr> de total/subtotal (ex.: "Total", "TOTAL GERAL"). */
  totalRow:
    'border-b border-gray-200 bg-gray-50 font-medium text-gray-800 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-100',
  /** <tr> de cabeçalho de seção/grupo colapsável. Combinar com `TABLE_SECTION_STYLE`. */
  sectionRow: 'border-b border-gray-200 text-sm font-semibold text-white dark:border-gray-800',
  /** Linha "placeholder" (tabela vazia/poucas linhas). */
  placeholderRow:
    'border-b border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]',
  /**
   * <td> de dado numa COLUNA EM DESTAQUE (pedido do Wellington, 16/09/2026):
   * tinta do azul `outside` bem diluída, igual à coluna do mês atual do Fluxo
   * de Caixa. O <th> correspondente leva `TABLE_HIGHLIGHT_HEADER_STYLE`
   * (fundo sólido). Uso: coluna "Objetivo" das abas da carteira. Só nas
   * linhas de item — seções e totais ficam como estão.
   */
  highlightTd: 'bg-[#0079F2]/[0.06] dark:bg-[#0079F2]/[0.16]',
  /** Variante compacta para tabelas densas (muitas colunas): mesmos tokens, menos padding. */
  compact: {
    th: 'px-3 py-2 font-medium whitespace-nowrap',
    td: 'px-3 py-2 text-xs',
  },
} as const;

/** Estilo inline do fundo do cabeçalho (azul `seguranca`). */
export const TABLE_HEADER_STYLE = { backgroundColor: TABLE_HEADER_BG } as const;

/** Estilo inline do <th> de uma coluna em destaque (azul `outside`, sólido). Par de `TABLE_STYLES.highlightTd`. */
export const TABLE_HIGHLIGHT_HEADER_STYLE = { backgroundColor: MYFINANCE_BRAND.outside } as const;

/** Estilo inline do fundo das linhas de seção (azul `tranquilidade`). */
export const TABLE_SECTION_STYLE = { backgroundColor: MYFINANCE_BRAND.tranquilidade } as const;

/**
 * Tabela → cartões abaixo de lg (PWA fase 0). NÃO altera `TABLE_STYLES`: é o par mobile usado
 * pelo `ResponsiveTable` (e, nas fases 1 a 3, pelas tabelas migradas). Cores só da paleta
 * My Finance + cinzas; negativos no vermelho semântico do "Quanto falta".
 */
export const TABLE_MOBILE_STYLES = {
  /** <ul> que empilha os cartões. */
  list: 'flex flex-col gap-3',
  /** Cartão de uma linha. */
  card: 'rounded-2xl border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.03]',
  /** Acrescentar quando a linha é clicável (alvo de toque ≥ 72px). */
  cardClickable: 'min-h-[72px] cursor-pointer active:bg-gray-100 dark:active:bg-white/[0.05]',
  /** Linha de cima: coluna `primary` à esquerda, `value` à direita. */
  cardHeader: 'flex items-start justify-between gap-3',
  cardTitle: 'text-sm font-semibold text-gray-800 dark:text-white/90',
  cardSubtitle: 'text-xs text-gray-500 dark:text-gray-400',
  /** Grade de até 3 colunas `field`. */
  cardGrid: 'mt-2 grid grid-cols-3 gap-2',
  dt: 'text-[11px] font-medium uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400',
  dd: 'text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200',
  valuePrimary: 'text-sm font-semibold tabular-nums text-right text-gray-800 dark:text-white/90',
  positive: 'text-mf-patrimonio dark:text-mf-tranquilidade',
  negative: 'text-[#D92D20] dark:text-[#F97066]',
  /** Faixa de grupo (par da `sectionRow`, azul `tranquilidade`). */
  groupBand:
    'flex items-center justify-between rounded-lg bg-mf-tranquilidade px-3 py-2 text-sm font-semibold text-white',
  /** Cartão de total (par da `totalRow`). */
  totalCard:
    'rounded-2xl bg-gray-50 px-4 py-3.5 font-medium text-gray-800 dark:bg-white/[0.02] dark:text-gray-100',
  /**
   * Chip de 36px visíveis com 44px de toque (o `before:` estende a área 4px para cima e para baixo).
   * Par de `chipActive` (combinar com twMerge). Sem `max-lg:`: quem usa já está no ramo mobile.
   */
  chip: 'relative inline-flex h-9 shrink-0 snap-start items-center whitespace-nowrap rounded-full border border-gray-200 px-3 text-sm text-gray-700 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""] dark:border-gray-700 dark:text-gray-300',
  /** Chip ativo. No escuro a borda `tranquilidade` garante ≥ 3:1 para o estado. */
  chipActive:
    'border-mf-seguranca bg-mf-seguranca text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade/25 dark:text-white',

  // ── PWA fase 1 (Carteira) ──────────────────────────────────────────────────────────────────
  /** <ul> dos cartões expansíveis (`ResponsiveCardList`): 8px entre cartões. */
  cardList: 'flex flex-col gap-2',
  /** Grade do cartão aberto: 3 colunas (2 abaixo de 360px). */
  cardDetailGrid: 'grid grid-cols-3 gap-x-3 gap-y-2 max-[359px]:grid-cols-2',
  cardDetailLabel: 'text-[11px] text-gray-500 dark:text-gray-400',
  cardDetailValue: 'text-[13.5px] font-medium tabular-nums text-gray-800 dark:text-gray-100',
  /**
   * Faixa de seção recolhível (`CardSectionBand`): tint `tranquilidade` + texto `seguranca`
   * (claro) / `escolha` (escuro) — AA. Substitui a `groupBand` (branco sobre #6E9DC4, 2,88:1),
   * que continua exportada para a fase 0.
   */
  sectionBandButton:
    'flex w-full min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm bg-mf-tranquilidade/[0.18] text-mf-seguranca dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha font-semibold',
  /** Trilho horizontal de chips (o <nav> leva `data-mf-scroll-x`). */
  chipRail:
    'flex gap-2 overflow-x-auto snap-x -mx-4 px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)]',
  /** Botão "Editar" dentro do cartão (44px de altura). */
  editButton:
    'relative inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-mf-patrimonio dark:text-mf-tranquilidade',
  /** Bloco "Necessidade de aporte". */
  needBlock: 'rounded-2xl bg-mf-escolha px-4 py-3.5 text-mf-potencia',
  /** Bloco "Caixa para investir". */
  caixaBlock:
    'rounded-2xl bg-mf-patrimonio/[0.12] px-4 py-3.5 text-mf-seguranca dark:text-mf-escolha',
} as const;
