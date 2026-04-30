export interface AportesMensaisInputs {
  /** Patrimônio inicial em R$ de hoje. */
  patrimonioInicial: number;
  /** Meta de patrimônio em R$ de hoje. */
  metaPatrimonio: number;
  /** Prazo até atingir a meta, em anos. */
  prazoAnos: number;
  /** Retorno nominal anual esperado (% a.a., ex: 12 = 12%). */
  retornoNominalAnual: number;
  /** Inflação anual esperada (% a.a.). */
  inflacaoAnual: number;
}

export type LabelCenario = 'Pessimista' | 'Base' | 'Otimista';

export interface CenarioAporte {
  label: LabelCenario;
  /** Retorno nominal usado neste cenário (% a.a.). */
  retornoNominal: number;
  /** Retorno real correspondente (decimal, já com Fisher). */
  retornoReal: number;
  /** Aporte mensal em R$ de hoje (0 se meta já atingida). */
  aporteMensal: number;
  /** True se patrimônio inicial já cobre a meta no prazo. */
  metaJaAtingida: boolean;
}

export interface AnoProjecao {
  /** Ano calendário (ex: 2026). */
  ano: number;
  /** Anos a partir de hoje (1..prazoAnos). */
  idadeOuPrazo: number;
  patrimonioInicio: number;
  aportesAno: number;
  juros: number;
  patrimonioFim: number;
}

export interface AportesMensaisResultado {
  /** Sempre na ordem [Pessimista, Base, Otimista]. */
  cenarios: CenarioAporte[];
  /** Trajetória ano a ano usando o cenário base. */
  projecaoBase: AnoProjecao[];
  warnings: string[];
}

const realRate = (nominalPct: number, inflacaoPct: number): number => {
  return (1 + nominalPct / 100) / (1 + inflacaoPct / 100) - 1;
};

const validateInputs = (inputs: AportesMensaisInputs): string[] => {
  const warnings: string[] = [];
  if (!Number.isFinite(inputs.prazoAnos) || inputs.prazoAnos <= 0) {
    warnings.push('O prazo em anos deve ser maior que zero.');
  }
  if (!Number.isFinite(inputs.metaPatrimonio) || inputs.metaPatrimonio <= 0) {
    warnings.push('Informe uma meta de patrimônio maior que zero.');
  }
  if (!Number.isFinite(inputs.patrimonioInicial) || inputs.patrimonioInicial < 0) {
    warnings.push('Patrimônio inicial não pode ser negativo.');
  }
  if (!Number.isFinite(inputs.retornoNominalAnual)) {
    warnings.push('Informe um retorno anual válido.');
  }
  if (!Number.isFinite(inputs.inflacaoAnual) || inputs.inflacaoAnual < 0) {
    warnings.push('Informe uma inflação anual válida (maior ou igual a zero).');
  }
  if (
    Number.isFinite(inputs.retornoNominalAnual) &&
    Number.isFinite(inputs.inflacaoAnual) &&
    inputs.retornoNominalAnual <= inputs.inflacaoAnual
  ) {
    warnings.push(
      'O retorno nominal informado é menor ou igual à inflação — sua taxa real ficará zero ou negativa.',
    );
  }
  return warnings;
};

/**
 * Calcula o aporte mensal necessário (PMT) para sair de PV até FV em N meses,
 * com taxa real mensal equivalente à anual via composição.
 *
 * Fórmula (ordinary annuity, aportes ao final do mês):
 *   PMT = (FV - PV*(1+i)^n) * i / ((1+i)^n - 1)
 *
 * Se PV*(1+i)^n >= FV, a meta já está coberta; retornamos aporteMensal=0 e flag.
 */
export const calcularAporteMensal = (params: {
  patrimonioInicial: number;
  metaPatrimonio: number;
  prazoAnos: number;
  retornoRealAnual: number;
}): { aporteMensal: number; metaJaAtingida: boolean } => {
  const { patrimonioInicial, metaPatrimonio, prazoAnos, retornoRealAnual } = params;
  const n = prazoAnos * 12;
  const i = Math.pow(1 + retornoRealAnual, 1 / 12) - 1;

  const fvPv = patrimonioInicial * Math.pow(1 + i, n);
  if (fvPv >= metaPatrimonio) {
    return { aporteMensal: 0, metaJaAtingida: true };
  }

  if (i === 0) {
    const pmt = (metaPatrimonio - patrimonioInicial) / n;
    return { aporteMensal: pmt, metaJaAtingida: false };
  }

  const numerator = (metaPatrimonio - fvPv) * i;
  const denominator = Math.pow(1 + i, n) - 1;
  const pmt = numerator / denominator;
  return { aporteMensal: pmt, metaJaAtingida: false };
};

const buildProjecao = (params: {
  patrimonioInicial: number;
  aporteMensal: number;
  retornoRealAnual: number;
  prazoAnos: number;
}): AnoProjecao[] => {
  const { patrimonioInicial, aporteMensal, retornoRealAnual, prazoAnos } = params;
  const i = Math.pow(1 + retornoRealAnual, 1 / 12) - 1;
  const anoBase = new Date().getFullYear();
  const projecao: AnoProjecao[] = [];

  let saldo = patrimonioInicial;
  for (let ano = 1; ano <= prazoAnos; ano++) {
    const patrimonioInicio = saldo;
    let aportesAno = 0;
    for (let mes = 0; mes < 12; mes++) {
      const jurosMes = saldo * i;
      saldo = saldo + jurosMes + aporteMensal;
      aportesAno += aporteMensal;
    }
    const patrimonioFim = saldo;
    const juros = patrimonioFim - patrimonioInicio - aportesAno;
    projecao.push({
      ano: anoBase + ano,
      idadeOuPrazo: ano,
      patrimonioInicio,
      aportesAno,
      juros,
      patrimonioFim,
    });
  }

  return projecao;
};

/**
 * Simulador de aportes mensais.
 *
 * Resolve "quanto preciso aportar por mês para chegar à meta em N anos", em valores
 * de hoje (taxa real via Fisher). Roda 3 cenários — Pessimista (-2pp), Base (informado)
 * e Otimista (+2pp) — para dar uma faixa de incerteza ao usuário, e gera projeção ano
 * a ano só pro cenário base (que é o gráfico/tabela principal).
 */
export const simulateAportes = (inputs: AportesMensaisInputs): AportesMensaisResultado => {
  const warnings = validateInputs(inputs);
  if (warnings.length > 0) {
    return { cenarios: [], projecaoBase: [], warnings };
  }

  const cenariosConfig: Array<{ label: LabelCenario; delta: number }> = [
    { label: 'Pessimista', delta: -2 },
    { label: 'Base', delta: 0 },
    { label: 'Otimista', delta: 2 },
  ];

  const cenarios: CenarioAporte[] = cenariosConfig.map(({ label, delta }) => {
    const retornoNominal = inputs.retornoNominalAnual + delta;
    const retornoReal = realRate(retornoNominal, inputs.inflacaoAnual);
    const { aporteMensal, metaJaAtingida } = calcularAporteMensal({
      patrimonioInicial: inputs.patrimonioInicial,
      metaPatrimonio: inputs.metaPatrimonio,
      prazoAnos: inputs.prazoAnos,
      retornoRealAnual: retornoReal,
    });
    return { label, retornoNominal, retornoReal, aporteMensal, metaJaAtingida };
  });

  const cenarioBase = cenarios.find((c) => c.label === 'Base');
  const projecaoBase = cenarioBase
    ? buildProjecao({
        patrimonioInicial: inputs.patrimonioInicial,
        aporteMensal: cenarioBase.aporteMensal,
        retornoRealAnual: cenarioBase.retornoReal,
        prazoAnos: inputs.prazoAnos,
      })
    : [];

  return { cenarios, projecaoBase, warnings: [] };
};
