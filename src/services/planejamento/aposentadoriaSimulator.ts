export type PerfilInvestidor =
  | 'conservador'
  | 'moderado-conservador'
  | 'moderado'
  | 'moderado-arrojado'
  | 'arrojado'
  | 'personalizado';

export interface PerfilRetornos {
  /** Retorno nominal anual durante a fase de acumulação (em %, ex: 12 = 12% a.a.). */
  retornoAcumulacao: number;
  /** Retorno nominal anual durante a fase de retirada (mais conservador). */
  retornoRetirada: number;
}

export const PERFIS_RETORNO: Record<Exclude<PerfilInvestidor, 'personalizado'>, PerfilRetornos> = {
  conservador: { retornoAcumulacao: 8, retornoRetirada: 6 },
  'moderado-conservador': { retornoAcumulacao: 10, retornoRetirada: 7 },
  moderado: { retornoAcumulacao: 12, retornoRetirada: 8 },
  'moderado-arrojado': { retornoAcumulacao: 14, retornoRetirada: 9 },
  arrojado: { retornoAcumulacao: 16, retornoRetirada: 10 },
};

export const PERFIL_LABELS: Record<PerfilInvestidor, string> = {
  conservador: 'Conservador',
  'moderado-conservador': 'Moderado conservador',
  moderado: 'Moderado',
  'moderado-arrojado': 'Moderado arrojado',
  arrojado: 'Arrojado',
  personalizado: 'Personalizado (carteira)',
};

export interface AposentadoriaInputs {
  idadeAtual: number;
  idadeAposentadoria: number;
  expectativaVida: number;
  patrimonioInicial: number;
  aporteMensal: number;
  /** Renda mensal desejada na aposentadoria, em valor de hoje (poder de compra atual). */
  rendaDesejadaMensal: number;
  perfil: PerfilInvestidor;
  /** % a.a., usado para calcular retorno real. */
  inflacao: number;
  /** Override de retornos (em %, a.a., nominal). Obrigatório se perfil = 'personalizado'. */
  retornoCustomAcumulacao?: number;
  retornoCustomRetirada?: number;
}

export type FaseAno = 'acumulacao' | 'retirada';

export interface AnoSimulado {
  ano: number;
  idade: number;
  fase: FaseAno;
  /** Patrimônio em valor de hoje (real, descontada inflação). */
  patrimonioInicio: number;
  aportes: number;
  juros: number;
  saques: number;
  patrimonioFim: number;
}

export interface AposentadoriaResultado {
  anos: AnoSimulado[];
  /** Patrimônio acumulado no início da aposentadoria, em valor de hoje. */
  patrimonioNaAposentadoria: number;
  /** Capital teórico necessário pra renda desejada perpetuar (renda * 12 / retornoReal). */
  capitalAlvoPerpetuidade: number;
  /** Quanto tempo o patrimônio dura a partir da idade alvo (anos). */
  anosDeRenda: number;
  /** Idade em que o patrimônio se esgota (null se dura até expectativa). */
  idadeEsgotamento: number | null;
  /** Patrimônio máximo atingido durante a simulação. */
  patrimonioMaximo: number;
  /** True se o patrimônio dura até a expectativa de vida sem esgotar. */
  metaAtingida: boolean;
  /** Validação dos inputs — vazio se OK. */
  warnings: string[];
}

const realRate = (nominal: number, inflacao: number): number => {
  // Fórmula de Fisher: (1 + nominal) / (1 + inflação) - 1, com taxas em decimal.
  return (1 + nominal / 100) / (1 + inflacao / 100) - 1;
};

const resolveRetornos = (inputs: AposentadoriaInputs): PerfilRetornos => {
  if (inputs.perfil === 'personalizado') {
    return {
      retornoAcumulacao: inputs.retornoCustomAcumulacao ?? 0,
      retornoRetirada: inputs.retornoCustomRetirada ?? 0,
    };
  }
  return PERFIS_RETORNO[inputs.perfil];
};

const validateInputs = (inputs: AposentadoriaInputs): string[] => {
  const warnings: string[] = [];
  if (inputs.idadeAtual < 0 || inputs.idadeAtual > 120) warnings.push('Idade atual inválida.');
  if (inputs.idadeAposentadoria <= inputs.idadeAtual) {
    warnings.push('A idade alvo de aposentadoria deve ser maior que a idade atual.');
  }
  if (inputs.expectativaVida <= inputs.idadeAposentadoria) {
    warnings.push('A expectativa de vida deve ser maior que a idade de aposentadoria.');
  }
  if (inputs.patrimonioInicial < 0) warnings.push('Patrimônio inicial não pode ser negativo.');
  if (inputs.aporteMensal < 0) warnings.push('Aporte mensal não pode ser negativo.');
  if (inputs.rendaDesejadaMensal <= 0) warnings.push('Informe uma renda desejada maior que zero.');
  return warnings;
};

/**
 * Simulador de aposentadoria ano a ano.
 *
 * Trabalha em valores reais (poder de compra de hoje): aporte, renda desejada e
 * patrimônio são todos descontados da inflação via retorno real (Fisher). Isso evita
 * distorções de o usuário pensar "em reais nominais daqui a 30 anos".
 *
 * Cada ano: aplica juros sobre o saldo do início → soma aportes (acumulação) ou
 * subtrai saques (retirada) → produz saldo de fim, que vira o início do ano seguinte.
 * Para no esgotamento ou na expectativa de vida.
 */
export const simulateAposentadoria = (inputs: AposentadoriaInputs): AposentadoriaResultado => {
  const warnings = validateInputs(inputs);
  if (warnings.length > 0) {
    return {
      anos: [],
      patrimonioNaAposentadoria: 0,
      capitalAlvoPerpetuidade: 0,
      anosDeRenda: 0,
      idadeEsgotamento: null,
      patrimonioMaximo: 0,
      metaAtingida: false,
      warnings,
    };
  }

  const { retornoAcumulacao, retornoRetirada } = resolveRetornos(inputs);
  const realAcum = realRate(retornoAcumulacao, inputs.inflacao);
  const realRet = realRate(retornoRetirada, inputs.inflacao);

  const aporteAnual = inputs.aporteMensal * 12;
  const saqueAnual = inputs.rendaDesejadaMensal * 12;

  const anos: AnoSimulado[] = [];
  let patrimonio = inputs.patrimonioInicial;
  let patrimonioMaximo = patrimonio;
  let patrimonioNaAposentadoria = 0;
  let idadeEsgotamento: number | null = null;
  let anosDeRenda = 0;

  const anoAtualReal = new Date().getFullYear();

  for (let idade = inputs.idadeAtual; idade < inputs.expectativaVida; idade++) {
    const fase: FaseAno = idade < inputs.idadeAposentadoria ? 'acumulacao' : 'retirada';
    const taxa = fase === 'acumulacao' ? realAcum : realRet;
    const patrimonioInicio = patrimonio;
    const juros = patrimonioInicio * taxa;
    let aportes = 0;
    let saques = 0;
    let patrimonioFim: number;

    if (fase === 'acumulacao') {
      aportes = aporteAnual;
      patrimonioFim = patrimonioInicio + juros + aportes;
    } else {
      saques = saqueAnual;
      patrimonioFim = patrimonioInicio + juros - saques;
      if (patrimonioFim < 0) {
        // Saque parcial no último ano: só consome o que tem
        saques = patrimonioInicio + juros;
        patrimonioFim = 0;
      }
      anosDeRenda += 1;
    }

    anos.push({
      ano: anoAtualReal + (idade - inputs.idadeAtual),
      idade,
      fase,
      patrimonioInicio,
      aportes,
      juros,
      saques,
      patrimonioFim,
    });

    if (patrimonioFim > patrimonioMaximo) patrimonioMaximo = patrimonioFim;
    if (idade + 1 === inputs.idadeAposentadoria) patrimonioNaAposentadoria = patrimonioFim;
    if (fase === 'retirada' && patrimonioFim === 0 && idadeEsgotamento === null) {
      idadeEsgotamento = idade + 1;
      patrimonio = 0;
      break;
    }

    patrimonio = patrimonioFim;
  }

  // Caso especial: idadeAtual === idadeAposentadoria (já entra em retirada)
  if (inputs.idadeAtual === inputs.idadeAposentadoria) {
    patrimonioNaAposentadoria = inputs.patrimonioInicial;
  }

  const metaAtingida = idadeEsgotamento === null;
  const capitalAlvoPerpetuidade = realRet > 0 ? saqueAnual / realRet : Infinity;

  return {
    anos,
    patrimonioNaAposentadoria,
    capitalAlvoPerpetuidade,
    anosDeRenda,
    idadeEsgotamento,
    patrimonioMaximo,
    metaAtingida,
    warnings: [],
  };
};
