/**
 * IR sobre renda fixa para pessoa física.
 *
 * Regras cobertas:
 *  - Isenção PF para LCI/LCA/CRI/CRA/LIG (qualquer prazo, qualquer indexador).
 *  - Tabela regressiva sobre rendimento (saldoBruto - valorAplicado) para CDB,
 *    LC, LF, LFS, RDB, RDC, DPGE, debêntures não-incentivadas e Tesouro Direto:
 *      ≤180 dias: 22.5%
 *      181-360:   20.0%
 *      361-720:   17.5%
 *      ≥721:      15.0%
 *  - IR só incide se rendimento > 0 (prejuízo não tributa).
 *
 * IOF dos primeiros 30 dias NÃO é calculado aqui — foco em investidor de
 * longo prazo. Quando necessário, expandir o resultado com `iof` separado.
 *
 * Sem I/O, sem prisma. Recebe o que precisa e devolve o cálculo.
 */

export type FixedIncomeIRCategory = 'isento' | 'tabela_regressiva';

export interface FixedIncomeIRInput {
  /** FixedIncomeType da posição (CDB_PRE, LCI_HIB, etc) ou null para Tesouro/outros. */
  type: string | null;
  /** True quando a posição vem do Tesouro Direto (independente de `type`). */
  isTesouro: boolean;
  /** Data inicial da aplicação. */
  startDate: Date;
  /** Data de referência para cálculo (default = now). */
  asOfDate?: Date;
  /** Valor aplicado nominal (custo). */
  valorAplicado: number;
  /** Valor atualizado (curva ou mercado), após pricer. */
  saldoBruto: number;
}

export interface FixedIncomeIRResult {
  /** True quando a aplicação é isenta de IR para PF. */
  isento: boolean;
  /** Motivo legível da isenção, quando aplicável (ex.: "LCI", "LCA"). */
  motivoIsencao: string | null;
  /** Categoria fiscal aplicada. */
  category: FixedIncomeIRCategory;
  /** Dias corridos entre startDate e asOfDate (truncado). */
  diasDecorridos: number;
  /** Alíquota efetiva (0..1) — 0 quando isento ou rendimento ≤ 0. */
  aliquota: number;
  /** Rendimento bruto = saldoBruto - valorAplicado (pode ser negativo). */
  rendimentoBruto: number;
  /** Imposto devido sobre o rendimento (0 quando isento ou rendimento ≤ 0). */
  ir: number;
  /** saldoBruto - ir. Quando rendimento ≤ 0, igual a saldoBruto. */
  valorLiquido: number;
}

const ISENTOS_PREFIXES = ['LCI', 'LCA', 'CRI', 'CRA', 'LIG'] as const;

function isentoPrefix(type: string | null): string | null {
  if (!type) return null;
  const upper = type.toUpperCase();
  for (const prefix of ISENTOS_PREFIXES) {
    if (upper.startsWith(prefix)) return prefix;
  }
  return null;
}

/**
 * Tabela regressiva de IRRF sobre renda fixa (Lei 11.033/2004).
 * Aplica-se sobre o rendimento, baseada nos dias corridos da aplicação.
 */
export function aliquotaTabelaRegressiva(diasDecorridos: number): number {
  if (diasDecorridos <= 180) return 0.225;
  if (diasDecorridos <= 360) return 0.2;
  if (diasDecorridos <= 720) return 0.175;
  return 0.15;
}

/**
 * Classifica o ativo de renda fixa para fins de IR. Tesouro nunca é isento;
 * outros tipos seguem o prefixo do FixedIncomeType.
 */
export function classifyForIR(
  type: string | null,
  isTesouro: boolean,
): { category: FixedIncomeIRCategory; motivoIsencao: string | null } {
  if (isTesouro) return { category: 'tabela_regressiva', motivoIsencao: null };
  const isencao = isentoPrefix(type);
  if (isencao) return { category: 'isento', motivoIsencao: isencao };
  return { category: 'tabela_regressiva', motivoIsencao: null };
}

function diasEntre(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function calcularIRRendaFixa(input: FixedIncomeIRInput): FixedIncomeIRResult {
  const asOfDate = input.asOfDate ?? new Date();
  const diasDecorridos = diasEntre(input.startDate, asOfDate);
  const rendimentoBruto = input.saldoBruto - input.valorAplicado;
  const { category, motivoIsencao } = classifyForIR(input.type, input.isTesouro);

  if (category === 'isento' || rendimentoBruto <= 0) {
    return {
      isento: category === 'isento',
      motivoIsencao,
      category,
      diasDecorridos,
      aliquota: 0,
      rendimentoBruto: round2(rendimentoBruto),
      ir: 0,
      valorLiquido: round2(input.saldoBruto),
    };
  }

  const aliquota = aliquotaTabelaRegressiva(diasDecorridos);
  const ir = rendimentoBruto * aliquota;
  return {
    isento: false,
    motivoIsencao: null,
    category,
    diasDecorridos,
    aliquota,
    rendimentoBruto: round2(rendimentoBruto),
    ir: round2(ir),
    valorLiquido: round2(input.saldoBruto - ir),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
