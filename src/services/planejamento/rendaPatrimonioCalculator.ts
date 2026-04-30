export type EstrategiaRenda = 'perpetua' | 'programado' | 'regra-4-pct';

export interface RendaPatrimonioInputs {
  /** Patrimônio acumulado hoje (R$). */
  patrimonio: number;
  /** Retorno nominal anual esperado (% a.a.). */
  retornoNominalAnual: number;
  /** Inflação anual esperada (% a.a.). */
  inflacaoAnual: number;
  /** Horizonte de simulação (anos). Usado pela estratégia 'programado' como prazo de esgotamento. */
  horizonteAnos: number;
  /** Override da regra dos 4% (% a.a., default 4). */
  taxaSaqueAnualPct?: number;
}

export interface EstrategiaResultado {
  estrategia: EstrategiaRenda;
  label: string;
  /** Renda mensal inicial em valores de hoje (R$). */
  rendaMensal: number;
  duracao: 'perpetua' | { anos: number };
  observacao: string;
}

export interface AnoTrajetoria {
  ano: number;
  saldoInicio: number;
  saques: number;
  juros: number;
  saldoFim: number;
}

export interface RendaPatrimonioResultado {
  estrategias: EstrategiaResultado[];
  trajetorias: Record<EstrategiaRenda, AnoTrajetoria[]>;
  warnings: string[];
}

const DEFAULT_TAXA_SAQUE = 4;

const realRate = (nominal: number, inflacao: number): number => {
  return (1 + nominal / 100) / (1 + inflacao / 100) - 1;
};

const validateInputs = (inputs: RendaPatrimonioInputs): string[] => {
  const warnings: string[] = [];
  if (!Number.isFinite(inputs.patrimonio) || inputs.patrimonio <= 0) {
    warnings.push('Informe um patrimônio maior que zero.');
  }
  if (!Number.isFinite(inputs.horizonteAnos) || inputs.horizonteAnos <= 0) {
    warnings.push('Horizonte deve ser maior que zero.');
  }
  return warnings;
};

const emptyResult = (warnings: string[]): RendaPatrimonioResultado => ({
  estrategias: [],
  trajetorias: { perpetua: [], programado: [], 'regra-4-pct': [] },
  warnings,
});

const buildPerpetua = (
  patrimonio: number,
  realAnual: number,
  horizonteAnos: number,
): { resultado: EstrategiaResultado; trajetoria: AnoTrajetoria[]; warnings: string[] } => {
  const warnings: string[] = [];
  const rendaMensal = realAnual > 0 ? (patrimonio * realAnual) / 12 : 0;
  if (realAnual <= 0) {
    warnings.push(
      'Rentabilidade real não positiva: estratégia perpétua não é viável (renda zerada).',
    );
  }
  const trajetoria: AnoTrajetoria[] = [];
  for (let ano = 1; ano <= horizonteAnos; ano++) {
    const saldoInicio = patrimonio;
    const juros = patrimonio * realAnual;
    const saques = realAnual > 0 ? juros : 0;
    const saldoFim = saldoInicio + juros - saques;
    trajetoria.push({ ano, saldoInicio, saques, juros, saldoFim });
  }
  const resultado: EstrategiaResultado = {
    estrategia: 'perpetua',
    label: 'Perpétua',
    rendaMensal,
    duracao: 'perpetua',
    observacao:
      'Saca apenas o rendimento real; o patrimônio nunca esgota, mas a renda inicial é menor.',
  };
  return { resultado, trajetoria, warnings };
};

const buildProgramado = (
  patrimonio: number,
  realAnual: number,
  horizonteAnos: number,
): { resultado: EstrategiaResultado; trajetoria: AnoTrajetoria[] } => {
  const meses = horizonteAnos * 12;
  const i = Math.pow(1 + realAnual, 1 / 12) - 1;
  let rendaMensal: number;
  if (Math.abs(i) < 1e-10) {
    rendaMensal = patrimonio / meses;
  } else {
    rendaMensal = (patrimonio * i) / (1 - Math.pow(1 + i, -meses));
  }
  const saqueAnual = rendaMensal * 12;

  const trajetoria: AnoTrajetoria[] = [];
  let saldo = patrimonio;
  for (let ano = 1; ano <= horizonteAnos; ano++) {
    const saldoInicio = saldo;
    const juros = saldoInicio * realAnual;
    let saques = saqueAnual;
    let saldoFim = saldoInicio + juros - saques;
    if (ano === horizonteAnos || saldoFim < 0) {
      // No último ano força fechamento em zero pra absorver erros de arredondamento.
      if (ano === horizonteAnos) {
        saques = saldoInicio + juros;
        saldoFim = 0;
      } else {
        saques = saldoInicio + juros;
        saldoFim = 0;
      }
    }
    trajetoria.push({ ano, saldoInicio, saques, juros, saldoFim });
    saldo = saldoFim;
  }

  const resultado: EstrategiaResultado = {
    estrategia: 'programado',
    label: 'Esgotamento programado',
    rendaMensal,
    duracao: { anos: horizonteAnos },
    observacao: `Consome o capital ao longo de ${horizonteAnos} anos via PMT mensal; renda maior, mas zera no fim do período.`,
  };
  return { resultado, trajetoria };
};

const buildRegra4Pct = (
  patrimonio: number,
  realAnual: number,
  horizonteAnos: number,
  taxaSaqueAnualPct: number,
): { resultado: EstrategiaResultado; trajetoria: AnoTrajetoria[]; warnings: string[] } => {
  const warnings: string[] = [];
  const rendaMensal = (patrimonio * (taxaSaqueAnualPct / 100)) / 12;
  const saqueAnual = rendaMensal * 12;

  const trajetoria: AnoTrajetoria[] = [];
  let saldo = patrimonio;
  let esgotouEm: number | null = null;
  for (let ano = 1; ano <= horizonteAnos; ano++) {
    const saldoInicio = saldo;
    const juros = saldoInicio * realAnual;
    let saques = saqueAnual;
    let saldoFim = saldoInicio + juros - saques;
    if (saldoFim < 0) {
      saques = saldoInicio + juros;
      saldoFim = 0;
      esgotouEm = ano;
    }
    trajetoria.push({ ano, saldoInicio, saques, juros, saldoFim });
    saldo = saldoFim;
    if (esgotouEm !== null) break;
  }

  if (esgotouEm !== null) {
    warnings.push(
      `Regra dos ${taxaSaqueAnualPct}%: esgotaria em ${esgotouEm} anos com este retorno e horizonte (${horizonteAnos} anos).`,
    );
  }

  const resultado: EstrategiaResultado = {
    estrategia: 'regra-4-pct',
    label: `Regra dos ${taxaSaqueAnualPct}%`,
    rendaMensal,
    duracao: { anos: horizonteAnos },
    observacao:
      'Saque inicial fixo corrigido pela inflação; heurística histórica (FIRE) com alta taxa de sucesso, mas sem garantia.',
  };
  return { resultado, trajetoria, warnings };
};

/**
 * Calcula a renda mensal sustentável a partir de um patrimônio acumulado, em
 * 3 estratégias (perpétua, esgotamento programado, regra dos 4%).
 *
 * Trabalha em valores reais (Fisher) — todos os saques são em poder de compra de hoje.
 */
export const calcularRendaPatrimonio = (
  inputs: RendaPatrimonioInputs,
): RendaPatrimonioResultado => {
  const baseWarnings = validateInputs(inputs);
  if (baseWarnings.length > 0) return emptyResult(baseWarnings);

  const taxaSaqueAnualPct = inputs.taxaSaqueAnualPct ?? DEFAULT_TAXA_SAQUE;
  const realAnual = realRate(inputs.retornoNominalAnual, inputs.inflacaoAnual);
  const horizonteAnos = Math.floor(inputs.horizonteAnos);
  const patrimonio = inputs.patrimonio;

  const perpetua = buildPerpetua(patrimonio, realAnual, horizonteAnos);
  const programado = buildProgramado(patrimonio, realAnual, horizonteAnos);
  const regra4 = buildRegra4Pct(patrimonio, realAnual, horizonteAnos, taxaSaqueAnualPct);

  return {
    estrategias: [perpetua.resultado, programado.resultado, regra4.resultado],
    trajetorias: {
      perpetua: perpetua.trajetoria,
      programado: programado.trajetoria,
      'regra-4-pct': regra4.trajetoria,
    },
    warnings: [...perpetua.warnings, ...regra4.warnings],
  };
};

export const ESTRATEGIA_ORDEM: EstrategiaRenda[] = ['perpetua', 'programado', 'regra-4-pct'];
