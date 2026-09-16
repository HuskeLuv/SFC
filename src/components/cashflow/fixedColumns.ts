// Constantes das colunas fixas da planilha (4 à esquerda + Total Anual à direita).
// Larguras fixas para evitar encolhimento durante scroll horizontal.
export const FIXED_COLUMN_WIDTHS = {
  // 260px: cabe "Saldo Conta Corrente Mês Anterior" sem cortar (era 240 → "Anterio").
  ITEMS: '260px',
  SIGNIFICADO: '150px',
  RANK: '80px',
  PERCENTAGE: '80px',
} as const;

/** Soma das 4 colunas fixas em px (usada pelo ajuste de scroll inicial e pelas setas de mês). */
export const FIXED_COLUMNS_TOTAL_WIDTH = 260 + 150 + 80 + 80;

/** Largura somada das colunas 1-3 (O seu porquê + Nível + % Receita): barra de edição do grupo. */
export const FIXED_COLUMNS_1_TO_3_WIDTH = 150 + 80 + 80;

/** Coluna "Total Anual", fixa à direita. */
export const ANNUAL_COLUMN_WIDTH = 112;

// Offsets left acumulados para position sticky
export const FIXED_COLUMN_LEFT = {
  COL1: 0,
  COL2: '260px',
  COL3: '410px', // 260 + 150
  COL4: '490px', // 260 + 150 + 80
} as const;

// Z-index progressivo para evitar sobreposição
export const FIXED_COLUMN_Z_INDEX = {
  COL1: 30,
  COL2: 20,
  COL3: 10,
  COL4: 10,
} as const;

const widthOf = (w: string) => ({ width: w, minWidth: w, maxWidth: w });

// Estilos para as 4 primeiras colunas fixas (header)
export const FIXED_COLUMN_HEADER_STYLES = [
  { left: FIXED_COLUMN_LEFT.COL1, zIndex: 430, ...widthOf(FIXED_COLUMN_WIDTHS.ITEMS) }, // 400 (header base) + 30
  { left: FIXED_COLUMN_LEFT.COL2, zIndex: 420, ...widthOf(FIXED_COLUMN_WIDTHS.SIGNIFICADO) },
  { left: FIXED_COLUMN_LEFT.COL3, zIndex: 410, ...widthOf(FIXED_COLUMN_WIDTHS.RANK) },
  { left: FIXED_COLUMN_LEFT.COL4, zIndex: 410, ...widthOf(FIXED_COLUMN_WIDTHS.PERCENTAGE) },
];

// Estilos para as 4 primeiras colunas fixas (body rows)
export const FIXED_COLUMN_BODY_STYLES = [
  {
    left: FIXED_COLUMN_LEFT.COL1,
    zIndex: FIXED_COLUMN_Z_INDEX.COL1,
    ...widthOf(FIXED_COLUMN_WIDTHS.ITEMS),
  },
  {
    left: FIXED_COLUMN_LEFT.COL2,
    zIndex: FIXED_COLUMN_Z_INDEX.COL2,
    ...widthOf(FIXED_COLUMN_WIDTHS.SIGNIFICADO),
  },
  {
    left: FIXED_COLUMN_LEFT.COL3,
    zIndex: FIXED_COLUMN_Z_INDEX.COL3,
    ...widthOf(FIXED_COLUMN_WIDTHS.RANK),
  },
  {
    left: FIXED_COLUMN_LEFT.COL4,
    zIndex: FIXED_COLUMN_Z_INDEX.COL4,
    ...widthOf(FIXED_COLUMN_WIDTHS.PERCENTAGE),
  },
];

/** Total Anual: sticky à direita (body). */
export const ANNUAL_COLUMN_BODY_STYLE = {
  right: 0,
  zIndex: FIXED_COLUMN_Z_INDEX.COL1,
  ...widthOf(`${ANNUAL_COLUMN_WIDTH}px`),
};

/** Total Anual: sticky à direita (header). */
export const ANNUAL_COLUMN_HEADER_STYLE = { ...ANNUAL_COLUMN_BODY_STYLE, zIndex: 430 };
