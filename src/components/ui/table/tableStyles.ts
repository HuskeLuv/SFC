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
   * (fundo sólido). Usos: "% Target" na Alocação de Ativos e "% da Aba" nas
   * abas da carteira. Só nas linhas de item — seções e totais ficam como estão.
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
