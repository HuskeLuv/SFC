/**
 * Simulação do ajuste anual do IRPF (modelo completo × simplificado) com foco no benefício do
 * PGBL — aba "PGBL" de Carteira › Análise › Imposto de Renda (HTML do Pedro, 03/11/2026).
 *
 * Ferramenta de acompanhamento: NÃO gera DAA. Sem I/O; recebe os números do ano e devolve os
 * dois modelos, o melhor e o efeito do PGBL (diferença de IR com e sem o aporte).
 *
 * Regras do ano-calendário 2026 (DAA 2027):
 *  - Tabela progressiva anual = 12 × a mensal da Lei 15.191/2025 (vigente desde 05/2025 e mantida
 *    em 2026): isento até R$ 29.145,60; 7,5% / 15% / 22,5% / 27,5% com parcelas a deduzir de
 *    R$ 2.185,92 / 4.729,92 / 8.105,88 / 10.904,76.
 *  - Redutor da Lei 15.270/2025 (a partir de 2026), pelos rendimentos tributáveis do ano:
 *    até R$ 60.000 reduz até R$ 2.694,15; de R$ 60.000,01 a R$ 88.200 reduz
 *    R$ 8.429,73 − 0,095575 × rendimentos; acima disso, nada. Nunca deixa o imposto negativo.
 *    Vale nos dois modelos.
 *  - Desconto simplificado: 20% dos rendimentos tributáveis, teto R$ 16.754,34; substitui TODAS
 *    as deduções (inclusive INSS e PGBL) e não admite doações incentivadas.
 *  - Modelo completo: INSS/regime próprio (sem limite), PGBL/FAPI até 12% dos rendimentos
 *    tributáveis — só para quem contribui ao INSS/regime próprio —, dependentes (R$ 2.275,08
 *    cada), saúde (sem limite), educação (R$ 3.561,50 por pessoa), pensão judicial e livro-caixa.
 *  - Doações incentivadas abatem o IMPOSTO (não a base), até 6% do imposto devido; só no completo.
 *
 * Aproximações (declaradas na tela):
 *  - Educação: teto = R$ 3.561,50 × (titular + dependentes), sobre o total informado — o real é
 *    por pessoa.
 *  - Livro-caixa não é limitado aos rendimentos do trabalho não assalariado.
 *  - IRPFM (renda acima de R$ 600 mil, Lei 15.270/2025) não é calculado — só avisado.
 */

export interface FaixaIrpf {
  /** Limite superior da faixa (inclusive); a última é Infinity. */
  ate: number;
  aliquota: number;
  parcelaDeduzir: number;
}

export interface RegrasIrpfAnual {
  anoCalendario: number;
  faixas: FaixaIrpf[];
  descontoSimplificadoPercentual: number;
  descontoSimplificadoTeto: number;
  deducaoPorDependente: number;
  tetoEducacaoPorPessoa: number;
  limitePrevidenciaPercentual: number;
  limiteDoacoesPercentual: number;
  /** Redutor da Lei 15.270/2025; null = não se aplica ao ano. */
  redutor: {
    rendaIsencaoAte: number;
    reducaoMaximaIsencao: number;
    rendaFaixaAte: number;
    constante: number;
    coeficiente: number;
  } | null;
  /** Rendimentos totais a partir dos quais o IRPFM pode incidir (aviso). */
  irpfmRendaAPartirDe: number | null;
}

export const REGRAS_IRPF_2026: RegrasIrpfAnual = {
  anoCalendario: 2026,
  faixas: [
    { ate: 29145.6, aliquota: 0, parcelaDeduzir: 0 },
    { ate: 33919.8, aliquota: 0.075, parcelaDeduzir: 2185.92 },
    { ate: 45012.6, aliquota: 0.15, parcelaDeduzir: 4729.92 },
    { ate: 55976.16, aliquota: 0.225, parcelaDeduzir: 8105.88 },
    { ate: Infinity, aliquota: 0.275, parcelaDeduzir: 10904.76 },
  ],
  descontoSimplificadoPercentual: 0.2,
  descontoSimplificadoTeto: 16754.34,
  deducaoPorDependente: 2275.08,
  tetoEducacaoPorPessoa: 3561.5,
  limitePrevidenciaPercentual: 0.12,
  limiteDoacoesPercentual: 0.06,
  redutor: {
    rendaIsencaoAte: 60000,
    reducaoMaximaIsencao: 2694.15,
    rendaFaixaAte: 88200,
    constante: 8429.73,
    coeficiente: 0.095575,
  },
  irpfmRendaAPartirDe: 600000,
};

/** Anos com regra cadastrada. Outros anos: a tela não simula (tabela diferente). */
export function regrasIrpfDoAno(anoCalendario: number): RegrasIrpfAnual | null {
  return anoCalendario === 2026 ? REGRAS_IRPF_2026 : null;
}

export interface EntradaIrpfAnual {
  /** Rendimentos tributáveis do ano (salário bruto, pró-labore, aluguéis…). */
  rendaTributavel: number;
  /** Contribuição ao INSS / regime próprio no ano. > 0 também libera a dedução do PGBL. */
  inss: number;
  /** Aportes em PGBL/FAPI/previdência fechada no ano (antes do limite de 12%). */
  aportesPgbl: number;
  dependentes: number;
  saude: number;
  educacao: number;
  pensaoJudicial: number;
  livroCaixa: number;
  /** Doações incentivadas feitas no ano (abatem o imposto). */
  doacoesIncentivadas: number;
  /** IR retido na fonte + carnê-leão pago no ano. */
  irRetido: number;
}

export interface ResultadoModelo {
  deducoes: number;
  baseCalculo: number;
  impostoTabela: number;
  redutor: number;
  doacoes: number;
  irDevido: number;
  aliquotaMarginal: number;
  /** IR devido / rendimentos tributáveis. */
  aliquotaEfetiva: number;
}

export interface DeducoesCompleto {
  inss: number;
  pgbl: number;
  dependentes: number;
  saude: number;
  educacao: number;
  pensaoJudicial: number;
  livroCaixa: number;
  total: number;
}

export interface ResultadoIrpfAnual {
  completo: ResultadoModelo;
  simplificado: ResultadoModelo;
  deducoesCompleto: DeducoesCompleto;
  descontoSimplificado: number;
  melhorModelo: 'completo' | 'simplificado';
  irDevido: number;
  /** IR simplificado − IR completo (> 0: completo economiza). */
  economiaCompletoVsSimplificado: number;
  /** irRetido − irDevido: > 0 restituição, < 0 imposto a pagar. */
  saldoAjuste: number;
  pgbl: {
    limiteDedutivel: number;
    aporteDedutivel: number;
    /** Aporte que passou do limite (não deduz). */
    excedente: number;
    espacoRestante: number;
    percentualUsado: number;
    /** Exige contribuição ao INSS/regime próprio. */
    elegivel: boolean;
    /** IR do melhor modelo sem o PGBL − com o PGBL. */
    economiaAtual: number;
    /** O mesmo, se o aporte chegasse ao limite de 12%. */
    economiaPotencial: number;
    /** Quanto a mais o aporte do espaço restante economizaria. */
    economiaAdicional: number;
  };
  limiteDoacoes: number;
  avisos: {
    redutorAplicado: boolean;
    irpfmPossivel: boolean;
  };
}

const arred = (v: number) => Math.round(v * 100) / 100;
const naoNeg = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function faixaDaBase(base: number, regras: RegrasIrpfAnual): FaixaIrpf {
  return regras.faixas.find((f) => base <= f.ate) ?? regras.faixas[regras.faixas.length - 1];
}

export function impostoPelaTabela(base: number, regras: RegrasIrpfAnual): number {
  const f = faixaDaBase(naoNeg(base), regras);
  return arred(naoNeg(naoNeg(base) * f.aliquota - f.parcelaDeduzir));
}

/** Redução da Lei 15.270/2025 (limitada ao imposto). */
export function redutorAnual(
  rendaTributavel: number,
  impostoTabela: number,
  regras: RegrasIrpfAnual,
): number {
  const r = regras.redutor;
  if (!r || impostoTabela <= 0) return 0;
  let reducao = 0;
  if (rendaTributavel <= r.rendaIsencaoAte) reducao = r.reducaoMaximaIsencao;
  else if (rendaTributavel <= r.rendaFaixaAte)
    reducao = naoNeg(r.constante - r.coeficiente * rendaTributavel);
  return arred(Math.min(impostoTabela, reducao));
}

function calcularModelo(
  renda: number,
  deducoes: number,
  doacoesInformadas: number,
  regras: RegrasIrpfAnual,
): ResultadoModelo {
  const baseCalculo = arred(naoNeg(renda - deducoes));
  const impostoTabela = impostoPelaTabela(baseCalculo, regras);
  const redutor = redutorAnual(renda, impostoTabela, regras);
  const aposRedutor = arred(impostoTabela - redutor);
  const doacoes = arred(Math.min(doacoesInformadas, aposRedutor * regras.limiteDoacoesPercentual));
  const irDevido = arred(naoNeg(aposRedutor - doacoes));
  return {
    deducoes: arred(deducoes),
    baseCalculo,
    impostoTabela,
    redutor,
    doacoes,
    irDevido,
    aliquotaMarginal: faixaDaBase(baseCalculo, regras).aliquota,
    aliquotaEfetiva: renda > 0 ? irDevido / renda : 0,
  };
}

interface Nucleo {
  completo: ResultadoModelo;
  simplificado: ResultadoModelo;
  deducoesCompleto: DeducoesCompleto;
  descontoSimplificado: number;
  melhorModelo: 'completo' | 'simplificado';
  irDevido: number;
}

function nucleo(e: EntradaIrpfAnual, aportesPgbl: number, regras: RegrasIrpfAnual): Nucleo {
  const renda = naoNeg(e.rendaTributavel);
  const inss = naoNeg(e.inss);
  const dependentes = Math.max(0, Math.floor(naoNeg(e.dependentes)));
  const limitePgbl = renda * regras.limitePrevidenciaPercentual;
  const pgbl = inss > 0 ? Math.min(naoNeg(aportesPgbl), limitePgbl) : 0;
  const deducoesCompleto: DeducoesCompleto = {
    inss: arred(inss),
    pgbl: arred(pgbl),
    dependentes: arred(dependentes * regras.deducaoPorDependente),
    saude: arred(naoNeg(e.saude)),
    educacao: arred(Math.min(naoNeg(e.educacao), (1 + dependentes) * regras.tetoEducacaoPorPessoa)),
    pensaoJudicial: arred(naoNeg(e.pensaoJudicial)),
    livroCaixa: arred(naoNeg(e.livroCaixa)),
    total: 0,
  };
  deducoesCompleto.total = arred(
    deducoesCompleto.inss +
      deducoesCompleto.pgbl +
      deducoesCompleto.dependentes +
      deducoesCompleto.saude +
      deducoesCompleto.educacao +
      deducoesCompleto.pensaoJudicial +
      deducoesCompleto.livroCaixa,
  );
  const descontoSimplificado = arred(
    Math.min(renda * regras.descontoSimplificadoPercentual, regras.descontoSimplificadoTeto),
  );
  const completo = calcularModelo(
    renda,
    deducoesCompleto.total,
    naoNeg(e.doacoesIncentivadas),
    regras,
  );
  const simplificado = calcularModelo(renda, descontoSimplificado, 0, regras);
  // Empate: simplificado (menos comprovação).
  const melhorModelo = completo.irDevido < simplificado.irDevido ? 'completo' : 'simplificado';
  return {
    completo,
    simplificado,
    deducoesCompleto,
    descontoSimplificado,
    melhorModelo,
    irDevido: melhorModelo === 'completo' ? completo.irDevido : simplificado.irDevido,
  };
}

export function simularIrpfAnual(
  entrada: EntradaIrpfAnual,
  regras: RegrasIrpfAnual = REGRAS_IRPF_2026,
): ResultadoIrpfAnual {
  const renda = naoNeg(entrada.rendaTributavel);
  const aportes = naoNeg(entrada.aportesPgbl);
  const atual = nucleo(entrada, aportes, regras);
  const semPgbl = nucleo(entrada, 0, regras);
  const limiteDedutivel = arred(renda * regras.limitePrevidenciaPercentual);
  const noLimite = nucleo(entrada, Math.max(aportes, limiteDedutivel), regras);
  const elegivel = naoNeg(entrada.inss) > 0;
  const economiaAtual = arred(naoNeg(semPgbl.irDevido - atual.irDevido));
  const economiaPotencial = arred(naoNeg(semPgbl.irDevido - noLimite.irDevido));
  const aporteDedutivel = atual.deducoesCompleto.pgbl;

  return {
    ...atual,
    economiaCompletoVsSimplificado: arred(atual.simplificado.irDevido - atual.completo.irDevido),
    saldoAjuste: arred(naoNeg(entrada.irRetido) - atual.irDevido),
    pgbl: {
      limiteDedutivel,
      aporteDedutivel,
      excedente: arred(naoNeg(aportes - limiteDedutivel)),
      espacoRestante: arred(naoNeg(limiteDedutivel - aportes)),
      percentualUsado: limiteDedutivel > 0 ? Math.min(1, aportes / limiteDedutivel) : 0,
      elegivel,
      economiaAtual,
      economiaPotencial,
      economiaAdicional: arred(naoNeg(economiaPotencial - economiaAtual)),
    },
    limiteDoacoes: arred(
      (atual.completo.impostoTabela - atual.completo.redutor) * regras.limiteDoacoesPercentual,
    ),
    avisos: {
      redutorAplicado: atual.completo.redutor > 0 || atual.simplificado.redutor > 0,
      irpfmPossivel: regras.irpfmRendaAPartirDe !== null && renda >= regras.irpfmRendaAPartirDe,
    },
  };
}
