/**
 * Saúde Financeira — cálculo puro dos indicadores de diagnóstico.
 *
 * Origem: planilha "Saúde Financeira Após Recomendações" (metodologia de
 * consultoria). O app substitui os inputs manuais da planilha por dados que
 * já possui (fluxo de caixa, carteira, dívidas), então este módulo recebe os
 * agregados prontos e só aplica as fórmulas. Sem I/O — espelha o estilo de
 * src/services/dividas/amortizacao.ts.
 *
 * Convenções:
 *  - Taxas em fração ao ano (0.115 = 11,5% a.a.).
 *  - Valores monetários em BRL, arredondados a centavos na saída.
 *  - Frações/razões (atingido, taxaPoupanca) NÃO são arredondadas — a UI
 *    formata; `null` = incalculável (denominador zero ou insumo ausente).
 */

/** Benchmark de reserva de emergência: N × gasto mensal. */
export const MULT_RESERVA_EMERGENCIA = 3;
/** Benchmark de patrimônio de segurança: N × gasto mensal. */
export const MULT_PATRIMONIO_SEGURANCA = 12;
/** Patrimônio ideal = FATOR × renda anual × idade (regra Millionaire Next Door). */
export const FATOR_PATRIMONIO_IDEAL = 0.1;
/** Cobertura (ativos alta liquidez / gasto) abaixo disso ⇒ status Frágil. */
export const COBERTURA_MINIMA_MESES = 6;
/** Passivo total / ativo total acima disso ⇒ status Endividado. */
export const LIMITE_PASSIVO_SOBRE_ATIVO = 0.5;

export type StatusSaudeCodigo = 'ED' | 'FR' | 'EQ';

export interface SaudeFinanceiraInputs {
  /** Renda mensal média dos meses ativos do fluxo de caixa. */
  rendaMensal: number;
  /** Gasto mensal médio dos meses ativos. */
  gastoMensal: number;
  /** Idade atual (AposentadoriaPlano.idade); null se nunca preenchida. */
  idade: number | null;
  /** TWR 12m da carteira em fração a.a.; null ⇒ proxy CDI. */
  rentabilidadeCarteiraAA: number | null;
  /** CDI anualizado em fração a.a.; null se série indisponível. */
  cdiAA: number | null;
  /** IPCA 12m em fração a.a. (caller já aplicou o fallback). */
  inflacaoAA: number;
  /** Reservas + RF de liquidez diária/venc. ≤ 12m + caixa para investir. */
  ativosAltaLiquidez: number;
  /** RV, fundos, previdência, cripto, RF longa e imóveis/bens. */
  ativosBaixaLiquidez: number;
  /** Só a reserva de emergência (benchmark não soma a de oportunidade). */
  reservaEmergencia: number;
  /** Dívidas com prazo restante ≤ 12 meses + rotativas (saldo corrigido). */
  passivosCurtoPrazo: number;
  /** Dívidas com prazo restante > 12 meses (saldo corrigido). */
  passivosLongoPrazo: number;
}

export interface BenchmarkPatrimonial {
  /** Valor necessário; null quando incalculável (ex.: sem idade). */
  necessario: number | null;
  /** Situação atual. */
  atual: number;
  /** atual/necessario em fração; null se necessário for null ou 0. */
  atingido: number | null;
}

export interface SaudeFinanceiraIndicadores {
  economia: {
    cdiAA: number | null;
    rentabilidadeAA: number | null;
    /** De onde veio a rentabilidade usada no ganho real. */
    rentabilidadeFonte: 'carteira' | 'cdi' | null;
    inflacaoAA: number;
    /** (1+rent)/(1+inflação) − 1; null sem rentabilidade nem CDI. */
    ganhoRealAA: number | null;
  };
  fluxo: {
    rendaMensal: number;
    gastoMensal: number;
    poupancaMensal: number;
    /** poupança/renda em fração; null se renda 0. */
    taxaPoupanca: number | null;
  };
  benchmarks: {
    reservaEmergencia: BenchmarkPatrimonial;
    patrimonioSeguranca: BenchmarkPatrimonial;
    patrimonioIdeal: BenchmarkPatrimonial;
    independencia: BenchmarkPatrimonial;
  };
  balanco: {
    ativosAltaLiquidez: number;
    ativosBaixaLiquidez: number;
    ativosTotal: number;
    passivosCurtoPrazo: number;
    passivosLongoPrazo: number;
    passivosTotal: number;
    patrimonioLiquido: number;
  };
  metricas: {
    /** Ativos alta liquidez / gasto mensal; null se gasto 0. */
    mesesCobertura: number | null;
    /** Passivo CP / ativos alta liquidez; null se ativos 0. */
    endividamentoCurtoPrazo: number | null;
    /** Passivo total / ativo total; null se ativo 0. */
    passivoSobreAtivo: number | null;
    /** PL / patrimônio p/ independência; null se benchmark incalculável. */
    grauIndependencia: number | null;
  };
  status: {
    codigo: StatusSaudeCodigo;
    /** Motivos legíveis que sustentam a classificação (vazio para EQ). */
    motivos: string[];
  };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Ganho real anual: desconta a inflação da rentabilidade nominal (Fisher). */
export function ganhoRealAA(rentabilidadeAA: number, inflacaoAA: number): number {
  return (1 + rentabilidadeAA) / (1 + inflacaoAA) - 1;
}

const razao = (numerador: number, denominador: number): number | null =>
  denominador > 0 ? numerador / denominador : null;

const benchmark = (necessario: number | null, atual: number): BenchmarkPatrimonial => ({
  necessario: necessario != null ? round2(necessario) : null,
  atual: round2(atual),
  atingido: necessario != null && necessario > 0 ? atual / necessario : null,
});

/**
 * Diagnóstico completo a partir dos agregados. Fórmulas da planilha:
 *  - Reserva emergência necessária   = 3 × gasto mensal
 *  - Patrimônio de segurança         = 12 × gasto mensal
 *  - Patrimônio ideal                = 10% × renda anual × idade
 *  - Patrimônio p/ independência     = gasto anual / ganho real (perpetuidade)
 *
 * Status (regra aprovada — a planilha deixava a critério do consultor):
 *  - ED: passivo CP > ativos de alta liquidez, OU passivo total > 50% do
 *    ativo total, OU poupança mensal negativa.
 *  - FR: cobertura < 6 meses de gasto, OU reserva de emergência abaixo do
 *    benchmark de 3× gasto.
 *  - EQ: o resto.
 */
export function computeSaudeFinanceira(inputs: SaudeFinanceiraInputs): SaudeFinanceiraIndicadores {
  const {
    rendaMensal,
    gastoMensal,
    idade,
    rentabilidadeCarteiraAA,
    cdiAA,
    inflacaoAA,
    ativosAltaLiquidez,
    ativosBaixaLiquidez,
    reservaEmergencia,
    passivosCurtoPrazo,
    passivosLongoPrazo,
  } = inputs;

  // Economia — ganho real ancora o benchmark de independência.
  const rentabilidadeFonte: 'carteira' | 'cdi' | null =
    rentabilidadeCarteiraAA != null ? 'carteira' : cdiAA != null ? 'cdi' : null;
  const rentabilidadeAA = rentabilidadeCarteiraAA ?? cdiAA;
  const ganhoReal = rentabilidadeAA != null ? ganhoRealAA(rentabilidadeAA, inflacaoAA) : null;

  // Fluxo de caixa
  const poupancaMensal = rendaMensal - gastoMensal;
  const taxaPoupanca = razao(poupancaMensal, rendaMensal);

  // Balanço
  const ativosTotal = ativosAltaLiquidez + ativosBaixaLiquidez;
  const passivosTotal = passivosCurtoPrazo + passivosLongoPrazo;
  const patrimonioLiquido = ativosTotal - passivosTotal;

  // Benchmarks patrimoniais
  const gastoAnual = gastoMensal * 12;
  const necessarioIndependencia =
    ganhoReal != null && ganhoReal > 0 && gastoAnual > 0 ? gastoAnual / ganhoReal : null;
  const benchmarks = {
    reservaEmergencia: benchmark(
      gastoMensal > 0 ? gastoMensal * MULT_RESERVA_EMERGENCIA : null,
      reservaEmergencia,
    ),
    patrimonioSeguranca: benchmark(
      gastoMensal > 0 ? gastoMensal * MULT_PATRIMONIO_SEGURANCA : null,
      ativosAltaLiquidez,
    ),
    patrimonioIdeal: benchmark(
      idade != null && idade > 0 && rendaMensal > 0
        ? FATOR_PATRIMONIO_IDEAL * rendaMensal * 12 * idade
        : null,
      patrimonioLiquido,
    ),
    independencia: benchmark(necessarioIndependencia, patrimonioLiquido),
  };

  // Métricas de saúde
  const mesesCobertura = razao(ativosAltaLiquidez, gastoMensal);
  const endividamentoCurtoPrazo = razao(passivosCurtoPrazo, ativosAltaLiquidez);
  const passivoSobreAtivo = razao(passivosTotal, ativosTotal);
  const grauIndependencia = benchmarks.independencia.atingido;

  // Classificação
  const motivosED: string[] = [];
  if (passivosCurtoPrazo > ativosAltaLiquidez) {
    motivosED.push('Dívidas de curto prazo maiores que os ativos de alta liquidez');
  }
  if (passivoSobreAtivo != null && passivoSobreAtivo > LIMITE_PASSIVO_SOBRE_ATIVO) {
    motivosED.push('Dívidas somam mais da metade do patrimônio total');
  }
  if (poupancaMensal < 0) {
    motivosED.push('Gastos mensais acima da renda');
  }

  const motivosFR: string[] = [];
  if (mesesCobertura != null && mesesCobertura < COBERTURA_MINIMA_MESES) {
    motivosFR.push(`Ativos líquidos cobrem menos de ${COBERTURA_MINIMA_MESES} meses de gastos`);
  }
  const { necessario: reservaNecessaria } = benchmarks.reservaEmergencia;
  if (reservaNecessaria != null && reservaEmergencia < reservaNecessaria) {
    motivosFR.push('Reserva de emergência abaixo do necessário');
  }

  const status: SaudeFinanceiraIndicadores['status'] =
    motivosED.length > 0
      ? { codigo: 'ED', motivos: motivosED }
      : motivosFR.length > 0
        ? { codigo: 'FR', motivos: motivosFR }
        : { codigo: 'EQ', motivos: [] };

  return {
    economia: { cdiAA, rentabilidadeAA, rentabilidadeFonte, inflacaoAA, ganhoRealAA: ganhoReal },
    fluxo: {
      rendaMensal: round2(rendaMensal),
      gastoMensal: round2(gastoMensal),
      poupancaMensal: round2(poupancaMensal),
      taxaPoupanca,
    },
    benchmarks,
    balanco: {
      ativosAltaLiquidez: round2(ativosAltaLiquidez),
      ativosBaixaLiquidez: round2(ativosBaixaLiquidez),
      ativosTotal: round2(ativosTotal),
      passivosCurtoPrazo: round2(passivosCurtoPrazo),
      passivosLongoPrazo: round2(passivosLongoPrazo),
      passivosTotal: round2(passivosTotal),
      patrimonioLiquido: round2(patrimonioLiquido),
    },
    metricas: { mesesCobertura, endividamentoCurtoPrazo, passivoSobreAtivo, grauIndependencia },
    status,
  };
}
