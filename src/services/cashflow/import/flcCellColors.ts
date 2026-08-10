import { CASHFLOW_COLOR_LEGEND } from '@/utils/cashflowColorLegend';

/**
 * Extração da COR DE FONTE das células do .xlsx (report 10/08, item 4).
 *
 * A planilha FLC usa cor de texto como legenda de status (Recebido/Pago/
 * Lançamento Futuro/Cartão) — o mesmo sistema do fluxo de caixa do app
 * (CashflowValue.color). O SheetJS CE não expõe estilos de .xlsx, mas com
 * `bookFiles: true` ele entrega os XMLs crus do zip; aqui resolvemos a
 * cadeia célula → índice de estilo (cellXfs) → fonte → cor (rgb direto,
 * indexed legado ou theme+tint) e devolvemos um mapa ref ("F12") → "#RRGGBB".
 *
 * Tudo puro e tolerante a falha: qualquer parte ausente/má-formada devolve
 * mapa vazio — cor é enriquecimento, nunca pode derrubar o import.
 */

export interface FlcZipFiles {
  [name: string]: { content?: unknown } | undefined;
}

const lerXml = (files: FlcZipFiles, name: string): string | null => {
  const content = files[name]?.content;
  if (!content) return null;
  try {
    return Buffer.from(content as Uint8Array).toString('utf8');
  } catch {
    return null;
  }
};

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/** 'FF76933C' | '76933C' → '#76933C' */
const hexFromArgb = (argb: string): string | null => {
  const clean = argb.trim().toUpperCase();
  if (/^[0-9A-F]{8}$/.test(clean)) return `#${clean.slice(2)}`;
  if (/^[0-9A-F]{6}$/.test(clean)) return `#${clean}`;
  return null;
};

/**
 * Paleta indexed legada (índices 8–63 do BIFF; 64/65 são cores de sistema).
 * Necessária para planilhas que atravessaram o formato antigo.
 */
const INDEXED_PALETTE: Record<number, string> = {
  8: '#000000',
  9: '#FFFFFF',
  10: '#FF0000',
  11: '#00FF00',
  12: '#0000FF',
  13: '#FFFF00',
  14: '#FF00FF',
  15: '#00FFFF',
  16: '#800000',
  17: '#008000',
  18: '#000080',
  19: '#808000',
  20: '#800080',
  21: '#008080',
  22: '#C0C0C0',
  23: '#808080',
  24: '#9999FF',
  25: '#993366',
  26: '#FFFFCC',
  27: '#CCFFFF',
  28: '#660066',
  29: '#FF8080',
  30: '#0066CC',
  31: '#CCCCFF',
  32: '#000080',
  33: '#FF00FF',
  34: '#FFFF00',
  35: '#00FFFF',
  36: '#800080',
  37: '#800000',
  38: '#008080',
  39: '#0000FF',
  40: '#00CCFF',
  41: '#CCFFFF',
  42: '#CCFFCC',
  43: '#FFFF99',
  44: '#99CCFF',
  45: '#FF99CC',
  46: '#CC99FF',
  47: '#FFCC99',
  48: '#3366FF',
  49: '#33CCCC',
  50: '#99CC00',
  51: '#FFCC00',
  52: '#FF9900',
  53: '#FF6600',
  54: '#666699',
  55: '#969696',
  56: '#003366',
  57: '#339966',
  58: '#003300',
  59: '#333300',
  60: '#993300',
  61: '#993366',
  62: '#333399',
  63: '#333333',
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const hexOf = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/**
 * Tint do Excel aplicado sobre a luminância (aproximação do algoritmo MS:
 * tint > 0 clareia rumo ao branco, tint < 0 escurece rumo ao preto).
 */
export const applyTint = (hex: string, tint: number): string => {
  if (!tint) return hex;
  const [r, g, b] = rgbOf(hex);
  const ajusta = (v: number) => {
    const l = v / 255;
    const l2 = tint > 0 ? l + (1 - l) * clamp01(tint) : l * (1 + Math.max(-1, tint));
    return l2 * 255;
  };
  return hexOf(ajusta(r), ajusta(g), ajusta(b));
};

/**
 * Cores do tema (xl/theme/theme1.xml) na ordem de ÍNDICE usada pelos estilos.
 * Quirk documentado do formato: o XML declara dk1,lt1,dk2,lt2,… mas o índice
 * `theme="n"` troca os pares (0=lt1, 1=dk1, 2=lt2, 3=dk2, 4..9=accent1-6).
 */
export const parseThemeColors = (themeXml: string): string[] => {
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(themeXml)?.[0];
  if (!scheme) return [];
  const nomes = [
    'dk1',
    'lt1',
    'dk2',
    'lt2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink',
  ];
  const porNome = new Map<string, string>();
  for (const nome of nomes) {
    const bloco = new RegExp(`<a:${nome}>([\\s\\S]*?)</a:${nome}>`).exec(scheme)?.[1];
    if (!bloco) continue;
    const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(bloco)?.[1];
    const sys = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(bloco)?.[1];
    const hex = srgb ?? sys;
    if (hex) porNome.set(nome, `#${hex.toUpperCase()}`);
  }
  const ordemIndice = [
    'lt1',
    'dk1',
    'lt2',
    'dk2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink',
  ];
  return ordemIndice.map((n) => porNome.get(n) ?? '#000000');
};

const parseColorTag = (fontBlock: string, themeColors: string[]): string | null => {
  const colorTag = /<color\b[^>]*\/?>/.exec(fontBlock)?.[0];
  if (!colorTag) return null;
  if (attr(colorTag, 'auto') === '1') return null;

  const rgb = attr(colorTag, 'rgb');
  if (rgb) return hexFromArgb(rgb);

  const indexed = attr(colorTag, 'indexed');
  if (indexed !== null) return INDEXED_PALETTE[Number(indexed)] ?? null;

  const theme = attr(colorTag, 'theme');
  if (theme !== null) {
    const base = themeColors[Number(theme)];
    if (!base) return null;
    const tint = attr(colorTag, 'tint');
    return tint !== null ? applyTint(base, Number(tint)) : base;
  }
  return null;
};

/**
 * Cor de fonte por índice de cellXf (o `s="n"` das células). null = fonte
 * sem cor explícita (texto padrão).
 */
export const parseFontColorsByXf = (
  stylesXml: string,
  themeColors: string[],
): (string | null)[] => {
  const fontsBlock = /<fonts\b[\s\S]*?<\/fonts>/.exec(stylesXml)?.[0] ?? '';
  const fontColors: (string | null)[] = [];
  const fontRe = /<font\b(?:\/>|>[\s\S]*?<\/font>)/g;
  let m: RegExpExecArray | null;
  while ((m = fontRe.exec(fontsBlock))) {
    fontColors.push(parseColorTag(m[0], themeColors));
  }

  const xfsBlock = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(stylesXml)?.[0] ?? '';
  const cores: (string | null)[] = [];
  const xfRe = /<xf\b[^>]*\/?>/g;
  while ((m = xfRe.exec(xfsBlock))) {
    const fontId = Number(attr(m[0], 'fontId') ?? '0');
    cores.push(fontColors[fontId] ?? null);
  }
  return cores;
};

/** Varre o XML da aba: ref da célula ("F12") → cor de fonte resolvida. */
export const extractSheetFontColors = (
  sheetXml: string,
  colorsByXf: (string | null)[],
): Map<string, string> => {
  const out = new Map<string, string>();
  const cellRe = /<c\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml))) {
    const ref = attr(m[0], 'r');
    const s = attr(m[0], 's');
    if (!ref || s === null) continue;
    const cor = colorsByXf[Number(s)];
    if (cor) out.set(ref, cor);
  }
  return out;
};

/** Resolve o caminho do XML da aba pelo nome (workbook.xml + rels). */
export const resolveSheetPath = (
  workbookXml: string,
  relsXml: string,
  sheetName: string,
): string | null => {
  const sheetRe = /<sheet\b[^>]*\/?>/g;
  let rid: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = sheetRe.exec(workbookXml))) {
    if (attr(m[0], 'name')?.trim() === sheetName) {
      rid = attr(m[0], 'r:id');
      break;
    }
  }
  if (!rid) return null;
  const relRe = /<Relationship\b[^>]*\/?>/g;
  while ((m = relRe.exec(relsXml))) {
    if (attr(m[0], 'Id') === rid) {
      const target = attr(m[0], 'Target');
      if (!target) return null;
      return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    }
  }
  return null;
};

/**
 * Mapa completo ref → cor de fonte da aba pedida. Falha em qualquer etapa
 * (arquivo ausente, XML estranho) devolve mapa vazio.
 */
export const readFlcFontColors = (files: FlcZipFiles, sheetName: string): Map<string, string> => {
  try {
    const workbookXml = lerXml(files, 'xl/workbook.xml');
    const relsXml = lerXml(files, 'xl/_rels/workbook.xml.rels');
    const stylesXml = lerXml(files, 'xl/styles.xml');
    if (!workbookXml || !relsXml || !stylesXml) return new Map();

    const sheetPath = resolveSheetPath(workbookXml, relsXml, sheetName);
    if (!sheetPath) return new Map();
    const sheetXml = lerXml(files, sheetPath);
    if (!sheetXml) return new Map();

    const themeXml = lerXml(files, 'xl/theme/theme1.xml');
    const themeColors = themeXml ? parseThemeColors(themeXml) : [];
    const colorsByXf = parseFontColorsByXf(stylesXml, themeColors);
    return extractSheetFontColors(sheetXml, colorsByXf);
  } catch {
    return new Map();
  }
};

// ---------------------------------------------------------------------------
// snap para a legenda do app
// ---------------------------------------------------------------------------

const luminancia = (hex: string): number => {
  const [r, g, b] = rgbOf(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/**
 * Encaixa uma cor de fonte da planilha na legenda do fluxo de caixa
 * (decisão 10/08: sempre a mais próxima — verde levemente diferente continua
 * significando "Recebido"). Distância euclidiana em RGB. Quase-branco
 * (texto invisível/decorativo) é descartado.
 */
export const snapParaLegenda = (hex: string): string | null => {
  const clean = hex.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(clean)) return null;
  if (luminancia(clean) > 0.9) return null;

  const [r, g, b] = rgbOf(clean);
  let melhor: string | null = null;
  let melhorDist = Infinity;
  for (const { cssColor } of CASHFLOW_COLOR_LEGEND) {
    const [lr, lg, lb] = rgbOf(cssColor);
    const dist = (r - lr) ** 2 + (g - lg) ** 2 + (b - lb) ** 2;
    if (dist < melhorDist) {
      melhorDist = dist;
      melhor = cssColor;
    }
  }
  return melhor;
};
