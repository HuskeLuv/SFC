import type { CSSProperties } from 'react';
import { TABLE_HEADER_BG, MYFINANCE_BRAND } from '@/constants/brandColors';

/**
 * Fonte ÚNICA dos estilos da planilha de Fluxo de Caixa (grade tipo Excel:
 * 4 colunas fixas + 12 meses + Total Anual fixo à direita).
 *
 * Segue o padrão visual único de tabela do app (`ui/table/tableStyles.ts`,
 * pedido do Wellington 15/09/2026): cabeçalho no azul `seguranca` com texto
 * branco em caixa alta, linhas separadas só por uma borda horizontal sutil,
 * sem bordas verticais, fonte do app (sem Calibri). Cores exclusivamente de
 * `src/constants/brandColors.ts` — os tons "sólidos" da planilha do Pedro
 * (vinho, laranja, ouro, âmbar...) saíram; o que é SEMÂNTICO ficou: verde/
 * vermelho de aporte/resgate, azul/vermelho de saldo positivo/negativo e as
 * faixas do % Receita.
 *
 * Gotcha Tailwind v4: utilitários de `color` saem em ordem alfabética no CSS,
 * então a cor de texto padrão fica na <table> (herança) e as células só
 * definem cor quando ela é semântica.
 */

const HEX = MYFINANCE_BRAND;

export const GRID = {
  /** Classes da <table> (cor de texto por herança). */
  // Sem w-full: com table-layout fixed a largura vem das colunas (max-content).
  table: 'text-left text-gray-700 dark:text-gray-200 table-fixed',
  tableStyle: {
    minWidth: 'max-content',
    borderCollapse: 'separate',
    borderSpacing: 0,
  } as CSSProperties,

  /** <tr> de qualquer linha da grade. */
  row: 'h-7',
  /** Base de qualquer célula: altura, fonte e a única borda (horizontal). */
  cell: 'h-7 leading-7 text-xs border-b border-gray-100 dark:border-gray-800',
  /** Célula das 4 colunas fixas (Itens, O seu porquê, Nível, % Receita). */
  fixed: 'px-3 whitespace-nowrap',
  /** Última coluna fixa: separador vertical discreto antes dos meses. */
  fixedDivider: 'border-r border-r-gray-200 dark:border-r-gray-800',
  /** Célula de mês. */
  month: 'px-2 text-right tabular-nums',
  /** Largura da coluna de mês (table-layout fixed lê a do cabeçalho). */
  monthStyle: { width: '6rem', minWidth: '6rem' } as CSSProperties,
  /** Total Anual (fixo à direita): separador vertical + destaque leve. */
  annual:
    'px-3 text-right tabular-nums font-semibold border-l border-l-gray-200 dark:border-l-gray-800',

  /** Fundo opaco padrão das células fixas de linha de item (sticky exige opaco). */
  rowBg: 'bg-white dark:bg-gray-900',
  /** Hover de linha de item (só nas células de mês; as fixas ficam opacas). */
  rowHover: 'hover:bg-gray-50 dark:hover:bg-white/[0.03]',

  /**
   * Coluna do mês atual (só quando a planilha é do ano corrente): tinta do
   * azul `outside` bem diluída nas células de item; no cabeçalho, sólida.
   */
  currentMonth: 'bg-[#0079F2]/[0.06] dark:bg-[#0079F2]/[0.16]',
  currentMonthHeader: { backgroundColor: HEX.outside } as CSSProperties,

  /** Linha em edição / linha nova: derivado claríssimo do azul `outside`. */
  editingBg: 'bg-[#F2F8FE] dark:bg-[#1C2A40]',

  /** <thead>: fundo `seguranca`, texto branco em caixa alta. */
  head: 'text-[11px] uppercase tracking-wide text-white font-medium',
  headStyle: { backgroundColor: TABLE_HEADER_BG } as CSSProperties,

  /** Input de texto dentro da grade (nome, porquê, nível). */
  input:
    'w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:border-[#0079F2] focus:outline-none focus:ring-1 focus:ring-[#0079F2] dark:border-gray-600 dark:bg-gray-800 dark:text-white h-6 leading-6',
} as const;

/**
 * Cabeçalhos de seção (grupos), por nível — escada de azuis da paleta: quanto
 * mais alto o nível, mais escuro. Classes estáticas (o Tailwind precisa vê-las
 * no fonte), opacas nos dois temas porque as células fixas são sticky.
 */
export const SECTION_CLASS = {
  /** Total de Entradas, Despesas Fixas e Variáveis, Conta Corrente — `patrimonio`. */
  1: 'bg-[#396CAA] text-white',
  /** Entradas/Despesas Fixas e Variáveis, Despesas Empresa, Planejamento — `tranquilidade`. */
  2: 'bg-[#6E9DC4] text-white',
  /** Habitação, Transporte, Sem/Com Tributação... — `escolha` (texto `potencia`). */
  3: 'bg-[#EAEAEA] text-[#2D2D2D] dark:bg-gray-700 dark:text-gray-100',
  /** Aporte/Resgate (automático da carteira) — `transparencia`, texto escuro. */
  aporte: 'bg-[#CCCCCC] text-[#2D2D2D] dark:bg-gray-600 dark:text-gray-100',
} as const;

/** Linhas de resumo/indicador (Saldo do mês, índices, Evolução...). */
export const SUMMARY_CLASS = {
  /** Padrão `totalRow` do app: cinza-claro, fonte média. */
  total: 'bg-gray-50 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  /** Linhas-chave (Saldo do mês, Fluxo livre, Evolução): azul claro derivado (#C7D9EA). */
  highlight: 'bg-[#C7D9EA] text-[#2D2D2D] dark:bg-[#1C2A40] dark:text-gray-100',
} as const;

/** Convenção Excel dos valores de resumo: positivo azul `outside`, negativo vermelho. */
export const VALUE_POSITIVE_CLASS = 'text-[#0079F2] dark:text-[#80BCF8]';
export const VALUE_NEGATIVE_CLASS = 'text-red-600 dark:text-red-400';

/** Índice (0-11) do mês atual quando `year` é o ano corrente; -1 caso contrário. */
export function currentMonthIndex(year: number, now: Date = new Date()): number {
  return year === now.getFullYear() ? now.getMonth() : -1;
}
