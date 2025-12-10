// Constantes para as 4 primeiras colunas fixas
// Larguras fixas para evitar encolhimento durante scroll horizontal
export const FIXED_COLUMN_WIDTHS = {
  ITEMS: '240px',
  SIGNIFICADO: '240px',
  RANK: '80px',
  PERCENTAGE: '120px',
} as const;

// Offsets left acumulados para position sticky
export const FIXED_COLUMN_LEFT = {
  COL1: 0,
  COL2: '240px',
  COL3: '480px', // 240 + 240
  COL4: '560px', // 240 + 240 + 80
} as const;

// Z-index progressivo para evitar sobreposição
export const FIXED_COLUMN_Z_INDEX = {
  COL1: 30,
  COL2: 20,
  COL3: 10,
  COL4: 10,
} as const;

// Estilos para as 4 primeiras colunas fixas (header)
export const FIXED_COLUMN_HEADER_STYLES = [
  {
    left: FIXED_COLUMN_LEFT.COL1,
    zIndex: 430, // 400 (header base) + 30
    width: FIXED_COLUMN_WIDTHS.ITEMS,
    minWidth: FIXED_COLUMN_WIDTHS.ITEMS,
    maxWidth: FIXED_COLUMN_WIDTHS.ITEMS,
  },
  {
    left: FIXED_COLUMN_LEFT.COL2,
    zIndex: 420, // 400 (header base) + 20
    width: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
    minWidth: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
    maxWidth: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
  },
  {
    left: FIXED_COLUMN_LEFT.COL3,
    zIndex: 410, // 400 (header base) + 10
    width: FIXED_COLUMN_WIDTHS.RANK,
    minWidth: FIXED_COLUMN_WIDTHS.RANK,
    maxWidth: FIXED_COLUMN_WIDTHS.RANK,
  },
  {
    left: FIXED_COLUMN_LEFT.COL4,
    zIndex: 410, // 400 (header base) + 10
    width: FIXED_COLUMN_WIDTHS.PERCENTAGE,
    minWidth: FIXED_COLUMN_WIDTHS.PERCENTAGE,
    maxWidth: FIXED_COLUMN_WIDTHS.PERCENTAGE,
  },
];

// Estilos para as 4 primeiras colunas fixas (body rows)
export const FIXED_COLUMN_BODY_STYLES = [
  {
    left: FIXED_COLUMN_LEFT.COL1,
    zIndex: FIXED_COLUMN_Z_INDEX.COL1,
    width: FIXED_COLUMN_WIDTHS.ITEMS,
    minWidth: FIXED_COLUMN_WIDTHS.ITEMS,
    maxWidth: FIXED_COLUMN_WIDTHS.ITEMS,
  },
  {
    left: FIXED_COLUMN_LEFT.COL2,
    zIndex: FIXED_COLUMN_Z_INDEX.COL2,
    width: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
    minWidth: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
    maxWidth: FIXED_COLUMN_WIDTHS.SIGNIFICADO,
  },
  {
    left: FIXED_COLUMN_LEFT.COL3,
    zIndex: FIXED_COLUMN_Z_INDEX.COL3,
    width: FIXED_COLUMN_WIDTHS.RANK,
    minWidth: FIXED_COLUMN_WIDTHS.RANK,
    maxWidth: FIXED_COLUMN_WIDTHS.RANK,
  },
  {
    left: FIXED_COLUMN_LEFT.COL4,
    zIndex: FIXED_COLUMN_Z_INDEX.COL4,
    width: FIXED_COLUMN_WIDTHS.PERCENTAGE,
    minWidth: FIXED_COLUMN_WIDTHS.PERCENTAGE,
    maxWidth: FIXED_COLUMN_WIDTHS.PERCENTAGE,
  },
];

