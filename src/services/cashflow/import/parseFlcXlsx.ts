import * as XLSX from 'xlsx';
import { readFlcFontColors, type FlcZipFiles } from './flcCellColors';

/**
 * Parser puro da aba "Fluxo de Caixa" da planilha FLC (modelo do Pedro).
 * Buffer → representação intermediária (IR), sem tocar em Prisma.
 *
 * Contrato de layout (verificado na planilha real):
 * - col. B = rótulo; C = "O SEU PORQUÊ" (significado); D = nível de prioridade
 *   (rank); F..Q = Jan..Dez.
 * - Âncoras de seção são linhas de FÓRMULA; itens são linhas de VALOR literal
 *   (zero-preenchidas por padrão). O critério fórmula-vs-literal desempata
 *   rótulos homônimos (ex.: "Despesas Financeiras" é seção E item de Despesas
 *   Empresa).
 * - Cada cliente tem uma cópia personalizada: rótulos de ITEM variam livremente;
 *   rótulos de SEÇÃO precisam casar (normalizados) com a lista conhecida —
 *   seção renomeada gera aviso, não erro.
 */

export const FLC_SHEET_NAME = 'Fluxo de Caixa';

export type FlcSecaoChave =
  | 'entradas-fixas'
  | 'sem-tributacao'
  | 'receita-investimentos'
  | 'com-tributacao'
  | 'habitacao'
  | 'transporte'
  | 'saude'
  | 'despesas-pessoais'
  | 'lazer'
  | 'educacao'
  | 'animais-estimacao'
  | 'despesas-financeiras'
  | 'impostos'
  | 'despesas-dependentes'
  | 'despesas-empresa'
  | 'despesas-temporarias'
  | 'conta-corrente';

export interface FlcItem {
  linha: number;
  label: string;
  significado: string | null;
  rank: number | null;
  /** índice 0 = jan; null = célula vazia, zero ou não numérica */
  valores: (number | null)[];
  /** comentários de célula (notas/threads do Excel), índice 0 = jan */
  comentarios: (string | null)[];
  /** cor de FONTE crua da célula ("#RRGGBB"), índice 0 = jan; null = padrão */
  cores: (string | null)[];
}

export interface FlcSecao {
  chave: FlcSecaoChave;
  /** rótulo original da âncora na planilha do cliente */
  nome: string;
  linha: number;
  itens: FlcItem[];
}

export interface FlcIgnorado {
  linha: number;
  label: string;
  motivo: string;
  /** valores capturados para o relatório do preview, quando existirem */
  valores?: (number | null)[];
}

export interface FlcParseResult {
  secoes: FlcSecao[];
  ignorados: FlcIgnorado[];
  avisos: string[];
}

export class FlcParseError extends Error {}

/** casefold + remove acentos/pontuação — critério de match de rótulos */
export const normalizeLabel = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SECOES_IMPORTAVEIS: Record<string, FlcSecaoChave> = {
  'entradas fixas': 'entradas-fixas',
  'sem tributacao': 'sem-tributacao',
  'receita investimentos': 'receita-investimentos',
  'com tributacao': 'com-tributacao',
  habitacao: 'habitacao',
  transporte: 'transporte',
  saude: 'saude',
  'despesas pessoais': 'despesas-pessoais',
  lazer: 'lazer',
  educacao: 'educacao',
  'animais de estimacao': 'animais-estimacao',
  'despesas financeiras': 'despesas-financeiras',
  impostos: 'impostos',
  'despesas com dependentes': 'despesas-dependentes',
  'despesas empresa': 'despesas-empresa',
  'despesas temporarias variaveis': 'despesas-temporarias',
  'conta corrente': 'conta-corrente',
};

const SECOES_IGNORADAS: Record<string, string> = {
  'aporte resgate investimentos': 'Aporte/Resgate é automático no app (vem da carteira)',
  'planejamento financeiro': 'linhas de objetivo são espelho dos sonhos no app (fora do v1)',
};

/** âncoras computadas/contêiner: encerram a seção corrente sem abrir outra */
const ANCORAS_ESTRUTURAIS = new Set([
  'itens',
  'total de entradas',
  'entradas variaveis',
  'despesas fixas e variaveis',
  'despesas fixas',
  'saldo do mes',
  'indice de poupanca mensal',
  'fluxo de caixa livre',
  'indice paz financeira',
]);

/** linhas avulsas conhecidas que não importam, onde quer que apareçam */
const LINHAS_IGNORADAS: Record<string, string> = {
  'saldo conta corrente mes anterior': 'calculado automaticamente no app (carry-over)',
  'inflacao pessoal': 'calculada automaticamente no app a partir das despesas',
  'evolucao do patrimonio': 'calculado automaticamente no app',
  'rendimentos recebidos': 'automático no app (proventos da carteira)',
};

/**
 * Linha de resumo de orçamento das cópias personalizadas ("Orçado - Real =
 * Saldo para consumo", fórmula =$C$<âncora>-<mês> ao fim de cada seção de
 * despesa). É aritmética simples (não SUM), então caía na regra de "fórmula
 * importada pelo resultado" e entrava como item NEGATIVO que anulava a seção
 * inteira (report 27/08/2026 — planilha "FLC Lima D."). Prefixo cobre
 * variações de sufixo entre cópias de clientes.
 */
const motivoLinhaIgnorada = (norm: string): string | undefined =>
  LINHAS_IGNORADAS[norm] ??
  (norm.startsWith('orcado real saldo')
    ? 'resumo Orçado × Real da planilha — o orçamento é acompanhado no app em Orçado vs Real'
    : undefined);

const MESES_COLS = Array.from({ length: 12 }, (_, i) => 5 + i); // F..Q
const MAX_LINHAS = 2000;

/** mesmo limite do comentário manual (cashflowCommentSchema) */
const MAX_COMENTARIO = 1000;

/**
 * O parser de threaded comments do SheetJS 0.18.5 decodifica o XML como
 * latin1, então texto UTF-8 chega com mojibake ("lanÃ§amentos"). Reverte o
 * double-decode quando a sequência é inequívoca; notas legadas chegam certas
 * e passam intactas.
 */
export const repararMojibake = (s: string): string => {
  // first-byte UTF-8 (0xC2-0xF4) seguido de continuation byte (0x80-0xBF),
  // ambos lidos como latin1 - nao ocorre em texto latino legitimo
  if (!/[\u00C2-\u00F4][\u0080-\u00BF]/.test(s)) return s;
  const decodificado = Buffer.from(s, 'latin1').toString('utf8');
  return decodificado.includes('�') ? s : decodificado;
};

const lerComentario = (cell: XLSX.CellObject | undefined): string | null => {
  if (!cell?.c?.length) return null;
  const texto = cell.c
    .map((entrada) => repararMojibake(entrada.t ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
  if (!texto) return null;
  return texto.length > MAX_COMENTARIO ? `${texto.slice(0, MAX_COMENTARIO - 1)}…` : texto;
};

interface CelulasMes {
  valores: (number | null)[];
  comentarios: (string | null)[];
  cores: (string | null)[];
  temLiteral: boolean;
  temFormula: boolean;
  /** Célula com fórmula de TOTALIZAÇÃO (SUM/intervalo) — nunca importável. */
  temFormulaAgregada: boolean;
  /** Célula com fórmula aritmética cujo resultado cacheado foi importado. */
  temFormulaValor: boolean;
  temCelula: boolean;
}

/**
 * Fórmula de totalização: SUM/SOMA/SUBTOTAL ou referência a intervalo (:).
 * O restante (aritmética como "=2980/12", referências simples) é VALOR do
 * usuário expresso por fórmula — o report de ago/2026 mostrou linhas
 * legítimas do modelo (Conta de energia, IPVA, Seguro Carro) escritas como
 * "=anual/12" sendo descartadas em bloco.
 */
const FORMULA_AGREGACAO = /(?:\bSUM\b|\bSOMA\b|\bSUBTOTAL\b)\s*\(|:/i;

const lerMeses = (
  ws: XLSX.WorkSheet,
  linha: number,
  coresPorCelula: Map<string, string>,
): CelulasMes => {
  const valores: (number | null)[] = [];
  const comentarios: (string | null)[] = [];
  const cores: (string | null)[] = [];
  let temLiteral = false;
  let temFormula = false;
  let temFormulaAgregada = false;
  let temFormulaValor = false;
  let temCelula = false;
  for (const c of MESES_COLS) {
    const ref = XLSX.utils.encode_cell({ r: linha - 1, c });
    const cell: XLSX.CellObject | undefined = ws[ref];
    comentarios.push(lerComentario(cell));
    cores.push(coresPorCelula.get(ref) ?? null);
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') {
      valores.push(null);
      continue;
    }
    temCelula = true;
    if (cell.f) {
      temFormula = true;
      if (FORMULA_AGREGACAO.test(cell.f)) {
        temFormulaAgregada = true;
        valores.push(null);
        continue;
      }
      // Fórmula aritmética: importa o RESULTADO cacheado pelo Excel — não
      // recalculamos, mas todo .xlsx salvo carrega o valor computado.
      if (typeof cell.v === 'number') {
        temFormulaValor = true;
        valores.push(cell.v !== 0 ? cell.v : null);
      } else {
        valores.push(null);
      }
      continue;
    }
    if (typeof cell.v === 'number') {
      temLiteral = true;
      valores.push(cell.v !== 0 ? cell.v : null);
    } else {
      valores.push(null);
    }
  }
  return {
    valores,
    comentarios,
    cores,
    temLiteral,
    temFormula,
    temFormulaAgregada,
    temFormulaValor,
    temCelula,
  };
};

const lerTexto = (ws: XLSX.WorkSheet, addr: string): string | null => {
  const cell: XLSX.CellObject | undefined = ws[addr];
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const s = String(cell.v).trim();
  return s === '' ? null : s;
};

const lerNumero = (ws: XLSX.WorkSheet, addr: string): number | null => {
  const cell: XLSX.CellObject | undefined = ws[addr];
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const n = typeof cell.v === 'number' ? cell.v : Number(String(cell.v).trim());
  return Number.isFinite(n) ? n : null;
};

export const parseFlcXlsx = (buffer: Buffer | Uint8Array): FlcParseResult => {
  let wb: XLSX.WorkBook;
  try {
    // bookFiles: true expõe os XMLs crus do zip (styles/theme/sheets) — é por
    // eles que a cor de fonte das células é resolvida (SheetJS CE não parseia
    // estilos de .xlsx).
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, bookFiles: true });
  } catch {
    throw new FlcParseError('Arquivo inválido: não foi possível ler como planilha .xlsx');
  }

  const sheetName = wb.SheetNames.find((n) => n.trim() === FLC_SHEET_NAME);
  if (!sheetName) {
    throw new FlcParseError(
      `Aba "${FLC_SHEET_NAME}" não encontrada na planilha (abas: ${wb.SheetNames.join(', ')})`,
    );
  }
  const ws = wb.Sheets[sheetName];
  const zipFiles = (wb as unknown as { files?: FlcZipFiles }).files ?? {};
  const coresPorCelula = readFlcFontColors(zipFiles, sheetName);

  const secoes: FlcSecao[] = [];
  const ignorados: FlcIgnorado[] = [];
  const avisos: string[] = [];

  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  const ultimaLinha = Math.min(range ? range.e.r + 1 : 0, MAX_LINHAS);

  type Contexto =
    | { tipo: 'nenhum' }
    | { tipo: 'secao'; secao: FlcSecao }
    | { tipo: 'ignorada'; nome: string; motivo: string };
  let ctx: Contexto = { tipo: 'nenhum' };

  // Seções ignoradas que carregam VALORES viram aviso agregado: o preview não
  // exibe mais a lista de ignorados (PR #59) e um aporte digitado na planilha
  // sumia sem explicação nenhuma (report 10/08: "aporte de jan/2025 não entrou
  // na evolução do patrimônio" — a linha é ignorada por design, aporte vem da
  // carteira, mas o usuário precisa SABER disso na prévia).
  const secoesIgnoradasComValor = new Map<string, { motivo: string; linhas: number }>();

  for (let r = 1; r <= ultimaLinha; r++) {
    const label = lerTexto(ws, `B${r}`);
    if (!label) continue;
    const norm = normalizeLabel(label);
    const meses = lerMeses(ws, r, coresPorCelula);

    const motivoIgnorada = motivoLinhaIgnorada(norm);
    if (motivoIgnorada) {
      ignorados.push({ linha: r, label, motivo: motivoIgnorada, valores: meses.valores });
      continue;
    }

    // âncoras: linha sem valor literal (fórmulas ou vazia) com rótulo de seção conhecido
    const podeSerAncora = !meses.temLiteral;
    if (podeSerAncora && ANCORAS_ESTRUTURAIS.has(norm)) {
      ctx = { tipo: 'nenhum' };
      continue;
    }
    if (podeSerAncora && SECOES_IMPORTAVEIS[norm]) {
      const secao: FlcSecao = { chave: SECOES_IMPORTAVEIS[norm], nome: label, linha: r, itens: [] };
      secoes.push(secao);
      ctx = { tipo: 'secao', secao };
      continue;
    }
    if (podeSerAncora && SECOES_IGNORADAS[norm]) {
      ctx = { tipo: 'ignorada', nome: label, motivo: SECOES_IGNORADAS[norm] };
      continue;
    }

    // linha de item (ou linha desconhecida)
    if (ctx.tipo === 'secao') {
      // Só linha 100% de TOTALIZAÇÃO (SUM/intervalo, sem literal nem valor
      // aritmético) é computada — antes QUALQUER linha toda-fórmula era
      // descartada e "=anual/12" legítimo sumia (report ago/2026).
      if (meses.temFormulaAgregada && !meses.temLiteral && !meses.temFormulaValor) {
        ignorados.push({
          linha: r,
          label,
          motivo: `linha computada (fórmula de totalização) dentro de "${ctx.secao.nome}"`,
        });
        continue;
      }
      if (meses.temFormulaAgregada) {
        avisos.push(`linha ${r} ("${label}"): células de totalização (SUM) foram ignoradas`);
      }
      if (meses.temFormulaValor) {
        avisos.push(
          `linha ${r} ("${label}"): valores calculados por fórmula importados pelo resultado`,
        );
      }
      ctx.secao.itens.push({
        linha: r,
        label,
        significado: lerTexto(ws, `C${r}`),
        rank: lerNumero(ws, `D${r}`),
        valores: meses.valores,
        comentarios: meses.comentarios,
        cores: meses.cores,
      });
      continue;
    }
    if (ctx.tipo === 'ignorada') {
      ignorados.push({
        linha: r,
        label,
        motivo: `seção "${ctx.nome}" ignorada: ${ctx.motivo}`,
        valores: meses.valores,
      });
      if (meses.valores.some((v) => v !== null)) {
        const atual = secoesIgnoradasComValor.get(ctx.nome) ?? { motivo: ctx.motivo, linhas: 0 };
        atual.linhas += 1;
        secoesIgnoradasComValor.set(ctx.nome, atual);
      }
      continue;
    }
    // fora de qualquer seção
    if (meses.temFormula) {
      avisos.push(
        `linha ${r} ("${label}"): linha com fórmula não reconhecida — seção renomeada na cópia do cliente?`,
      );
    } else if (meses.valores.some((v) => v !== null)) {
      avisos.push(`linha ${r} ("${label}"): valores fora de qualquer seção conhecida — ignorados`);
    }
  }

  secoesIgnoradasComValor.forEach(({ motivo, linhas }, nome) => {
    avisos.push(`seção "${nome}": ${linhas} linha(s) com valores NÃO importada(s) — ${motivo}`);
  });

  if (secoes.length === 0) {
    avisos.push('nenhuma seção conhecida encontrada — a aba tem o layout esperado?');
  }

  return { secoes, ignorados, avisos };
};
