import type { CSSProperties } from 'react';

/**
 * Fonte ÚNICA dos estilos da planilha de Fluxo de Caixa (grade tipo Excel:
 * 4 colunas fixas + 12 meses + espaçador + Total Anual).
 *
 * Antes cada linha (ItemRow, EditableItemRow, NewItemRow, AddRowForm,
 * GroupHeader, SummaryRow, TableHeader) repetia as mesmas classes/inline
 * styles — sete cópias. Mudar o visual da planilha agora é mudar AQUI.
 *
 * Regra do app: cores de `src/constants/brandColors.ts`; nunca inventar tom.
 */
export const GRID = {
  /** <tr> de qualquer linha da grade. */
  row: 'h-6',
  /** Fonte da grade (herdada por todas as células da linha). */
  rowStyle: { fontFamily: 'Calibri, sans-serif', fontSize: '12px' } as CSSProperties,

  /** Base de qualquer célula (altura/linha/fonte). */
  cell: 'h-6 leading-6 text-xs',
  /** Célula das 4 colunas fixas (Itens, O seu porquê, Nível, % Receita). */
  fixed: 'px-2 whitespace-nowrap',

  /** Célula de mês/anual de linha de ITEM: fundo cinza da área de dados. */
  dataCell:
    'bg-[#F2F2F2] dark:bg-gray-800 border-t border-b border-l border-r border-white dark:border-gray-900',
  /** Texto padrão das células de valor de item. */
  dataText: 'font-normal text-gray-800 dark:text-gray-400 text-right',
  /** Total Anual de item (negrito leve). */
  annualText: 'font-semibold text-gray-800 dark:text-white text-right',

  /** Célula de mês de linha de GRUPO/RESUMO (negrito, bordas cinza). */
  boldMonth: 'px-1 font-bold text-right border-t border-b border-gray-200 border-r border-gray-200',
  /** 1ª coluna de mês não repete a borda esquerda (encosta na coluna fixa). */
  boldMonthFirst: 'border-l-0',
  boldMonthOther: 'border-l border-gray-200',
  /** Total Anual de linha de GRUPO/RESUMO. */
  boldAnnual: 'px-2 font-bold text-right border-t border-b border-gray-200 border border-gray-200',

  /** Coluna vazia de 10px entre Dez e Total Anual. */
  spacer: 'px-0 w-[10px] h-6 leading-6 bg-white dark:bg-gray-900',

  monthStyle: { minWidth: '3rem' } as CSSProperties,
  annualStyle: { minWidth: '4rem' } as CSSProperties,

  /** Fundo das linhas em edição/nova (bg-blue-50) — inline porque a célula sticky precisa de cor opaca. */
  editingBg: 'rgb(239 246 255)',
} as const;

/** Classes do frame (bordas) das colunas fixas em linhas de grupo/resumo. */
export const FIXED_FRAME_CLASS = [
  'border-t border-b border-l border-gray-200',
  'border-t border-b border-gray-200',
  'border-t border-b border-gray-200',
  'border-t border-b border-gray-200 border-r border-gray-300',
] as const;

/** Inline que anula as bordas laterais internas entre as 4 colunas fixas. */
export const FIXED_FRAME_STYLE: CSSProperties[] = [
  { borderRight: 'none' },
  { borderLeft: 'none', borderRight: 'none' },
  { borderLeft: 'none', borderRight: 'none' },
  { borderLeft: 'none' },
];
