/**
 * Dívidas — cálculo puro de cronogramas de amortização (SAC e Price) e de
 * saldo devedor. Sem I/O: recebe parâmetros primitivos e devolve estruturas
 * prontas pra API/UI. Espelha o estilo de src/services/planejamento/
 * planejamentoSonhos.ts.
 *
 * Convenções:
 *  - Taxas em decimal ao mês (0.01 = 1% a.m.), já normalizadas (ver
 *    src/utils/rateConversion.ts pra conversão a.a. → a.m.).
 *  - Valores monetários arredondados a centavos linha a linha; a ÚLTIMA
 *    parcela absorve o resíduo de arredondamento pra que o saldo feche em
 *    exatamente 0.00 e a soma das amortizações == principal.
 *  - O cronograma é sempre em "moeda constante" (taxa contratual): contratos
 *    indexados (TR/IPCA/CDI) NÃO projetam índice futuro — a correção pelo
 *    índice realizado é aplicada só ao saldo, fora daqui (indexacaoDivida.ts).
 */

import {
  addMonths,
  categoryFromMonths,
  type Category,
} from '@/services/planejamento/planejamentoSonhos';

export type SistemaAmortizacao = 'SAC' | 'PRICE';
export type ModalidadeDivida = 'financiamento' | 'rotativa';
// 'amortizacao_prazo' = amortização extraordinária que QUITA parcelas do fim
// (redução de prazo — o desconto dos juros futuros é do cliente). O campo
// parcelaNumero desse lançamento guarda QUANTAS parcelas do fim foram
// quitadas (calculado pelo servidor), não um nº de parcela.
export type TipoPagamentoDivida = 'pagamento' | 'ajuste' | 'amortizacao_prazo';

export interface ParcelaCronograma {
  numero: number; // 1-based
  mes: string; // YYYY-MM
  parcela: number;
  juros: number;
  amortizacao: number;
  saldoDevedor: number; // após pagar esta parcela
  /** Anotação da rota de cronograma: quitada por amortização de prazo. */
  amortizada?: boolean;
  /**
   * Correção pelo índice realizado até o aniversário desta parcela
   * (indexacaoDivida.ts) — presentes só em contratos indexados.
   */
  fatorIndexacao?: number;
  parcelaCorrigida?: number;
  jurosCorrigido?: number;
  amortizacaoCorrigida?: number;
  saldoDevedorCorrigido?: number;
}

export interface PagamentoDividaInput {
  valor: number; // sempre positivo
  parcelaNumero: number | null;
  tipo: TipoPagamentoDivida | string;
  month: string; // YYYY-MM
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * PMT do sistema Price: parcela fixa que quita `principal` em `prazoMeses`
 * meses à taxa `taxaAm`. PMT = PV·i / (1 − (1+i)^−n); com taxa ≈ 0 degenera
 * em principal/prazo. (Mesma família de anuidade do pmt() do planejamento,
 * que resolve FV de poupança; aqui é o PV do empréstimo.)
 */
export function pmtPrice(principal: number, taxaAm: number, prazoMeses: number): number {
  if (prazoMeses <= 0) return 0;
  if (Math.abs(taxaAm) < 1e-10) return principal / prazoMeses;
  return (principal * taxaAm) / (1 - Math.pow(1 + taxaAm, -prazoMeses));
}

/**
 * Cronograma SAC: amortização constante (principal/n), juros decrescentes
 * sobre o saldo, parcela decrescente.
 */
export function gerarCronogramaSAC(
  principal: number,
  taxaAm: number,
  prazoMeses: number,
  primeiroVencimento: string,
): ParcelaCronograma[] {
  if (principal <= 0 || prazoMeses <= 0) return [];
  const amortBase = principal / prazoMeses;
  const rows: ParcelaCronograma[] = [];
  let saldo = round2(principal);
  for (let k = 1; k <= prazoMeses; k++) {
    const juros = round2(saldo * taxaAm);
    const amortizacao = k < prazoMeses ? round2(amortBase) : saldo;
    saldo = round2(saldo - amortizacao);
    rows.push({
      numero: k,
      mes: addMonths(primeiroVencimento, k - 1),
      parcela: round2(amortizacao + juros),
      juros,
      amortizacao,
      saldoDevedor: saldo,
    });
  }
  return rows;
}

/**
 * Cronograma Price: parcela constante (PMT), juros decrescentes e
 * amortização crescente.
 */
export function gerarCronogramaPrice(
  principal: number,
  taxaAm: number,
  prazoMeses: number,
  primeiroVencimento: string,
): ParcelaCronograma[] {
  if (principal <= 0 || prazoMeses <= 0) return [];
  const pmtVal = pmtPrice(principal, taxaAm, prazoMeses);
  const rows: ParcelaCronograma[] = [];
  let saldo = round2(principal);
  for (let k = 1; k <= prazoMeses; k++) {
    const juros = round2(saldo * taxaAm);
    const amortizacao = k < prazoMeses ? round2(pmtVal - juros) : saldo;
    saldo = round2(saldo - amortizacao);
    rows.push({
      numero: k,
      mes: addMonths(primeiroVencimento, k - 1),
      parcela: round2(amortizacao + juros),
      juros,
      amortizacao,
      saldoDevedor: saldo,
    });
  }
  return rows;
}

/**
 * Aplica a cada linha do cronograma o fator do índice realizado até o
 * aniversário do mês dela (`fatores` = monthlyIndexFactors). Mês sem entrada
 * repete o último fator visto (meses futuros ficam na correção realizada até
 * hoje — sem projeção). Puro: recebe os fatores prontos, não faz I/O.
 */
export function corrigirCronograma(
  cronograma: ParcelaCronograma[],
  fatores: Record<string, number>,
): ParcelaCronograma[] {
  let last = 1;
  return cronograma.map((r) => {
    const fator = fatores[r.mes] ?? last;
    last = fator;
    return {
      ...r,
      fatorIndexacao: fator,
      parcelaCorrigida: round2(r.parcela * fator),
      jurosCorrigido: round2(r.juros * fator),
      amortizacaoCorrigida: round2(r.amortizacao * fator),
      saldoDevedorCorrigido: round2(r.saldoDevedor * fator),
    };
  });
}

export interface FinanciamentoParams {
  principal: number;
  taxaAm: number;
  prazoMeses: number;
  primeiroVencimento: string; // YYYY-MM
  sistema: SistemaAmortizacao | string;
}

/** Dispatch por sistema. Sistema desconhecido → cronograma vazio. */
export function gerarCronograma(p: FinanciamentoParams): ParcelaCronograma[] {
  if (p.sistema === 'SAC') {
    return gerarCronogramaSAC(p.principal, p.taxaAm, p.prazoMeses, p.primeiroVencimento);
  }
  if (p.sistema === 'PRICE') {
    return gerarCronogramaPrice(p.principal, p.taxaAm, p.prazoMeses, p.primeiroVencimento);
  }
  return [];
}

export interface SaldoFinanciamentoResult {
  saldoDevedor: number;
  parcelasPagas: number;
  proximaParcela: ParcelaCronograma | null;
}

/**
 * Saldo devedor de um financiamento a partir do cronograma + pagamentos.
 *
 * Modelo (aproximação documentada — simulador de quitação fora do escopo):
 *  - Parcelas pagas = COUNT de pagamentos com parcelaNumero preenchido (não
 *    max): pagar a nº 7 sem a 6 avança o saldo teórico em 1 parcela.
 *  - Saldo teórico = saldoDevedor do cronograma após a última parcela paga.
 *  - Pagamentos extras (parcelaNumero null) subtraem direto do saldo teórico,
 *    sem recalcular prazo/parcela; ajustes somam.
 */
/** Total de parcelas do FIM já quitadas por amortizações com redução de prazo. */
export function parcelasCortadasDe(pagamentos: PagamentoDividaInput[]): number {
  return pagamentos.reduce(
    (s, p) => s + (p.tipo === 'amortizacao_prazo' ? (p.parcelaNumero ?? 0) : 0),
    0,
  );
}

/** Meses entre dois YYYY-MM (positivo quando `to` é depois de `from`). */
const monthsBetween = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/**
 * Custo de HOJE (valor presente) de quitar antecipadamente uma parcela
 * futura: o valor dela descontado à taxa contratual pelos meses entre
 * `mesRef` e o vencimento — os juros embutidos na parcela são o desconto do
 * cliente. Parcela já vencida (mes ≤ mesRef) custa o valor cheio.
 *
 * Em contratos indexados, quando o cronograma veio de corrigirCronograma(),
 * usa a parcela CORRIGIDA pelo índice realizado — o pagamento é em dinheiro
 * de hoje, então o custo também precisa ser. Cronograma sem correção (base)
 * degrada pra moeda constante.
 */
export function custoQuitacaoParcela(
  parcela: ParcelaCronograma,
  taxaAm: number,
  mesRef: string,
): number {
  const meses = Math.max(0, monthsBetween(mesRef, parcela.mes));
  const valor = parcela.parcelaCorrigida ?? parcela.parcela;
  return round2(valor / Math.pow(1 + taxaAm, meses));
}

/**
 * Quantas parcelas do fim um valor de amortização quita (greedy do fim para
 * o começo, sobre o cronograma ainda EFETIVO). O custo de quitar cada parcela
 * é o VALOR PRESENTE dela em `mesRef` (custoQuitacaoParcela) — equivale a
 * recalcular o prazo mantendo o valor das parcelas restantes, como o banco
 * faz na amortização com redução de prazo.
 * `valorTeorico` = soma dos custos de hoje das parcelas cortadas (≤ valor pago).
 */
export function calcularCorteAmortizacao(
  cronograma: ParcelaCronograma[],
  jaCortadas: number,
  valor: number,
  taxaAm: number,
  mesRef: string,
): { parcelas: number; valorTeorico: number } {
  let parcelas = 0;
  let valorTeorico = 0;
  for (let i = cronograma.length - 1 - jaCortadas; i >= 0; i--) {
    const custo = custoQuitacaoParcela(cronograma[i], taxaAm, mesRef);
    if (valorTeorico + custo > valor + 0.005) break;
    valorTeorico = round2(valorTeorico + custo);
    parcelas += 1;
  }
  return { parcelas, valorTeorico };
}

export function saldoFinanciamento(
  principal: number,
  cronograma: ParcelaCronograma[],
  pagamentos: PagamentoDividaInput[],
  taxaAm = 0,
): SaldoFinanciamentoResult {
  const parcelasPagas = pagamentos.filter(
    (p) => p.tipo === 'pagamento' && p.parcelaNumero != null,
  ).length;
  // Amortização com redução de prazo tira parcelas do FIM do cronograma:
  // a "última parcela pagável" recua.
  const cortadas = parcelasCortadasDe(pagamentos);
  const efetivas = Math.max(0, cronograma.length - cortadas);
  const idx = Math.min(parcelasPagas, efetivas);

  let saldoTeorico: number;
  if (cortadas <= 0) {
    saldoTeorico = idx <= 0 ? principal : cronograma[idx - 1].saldoDevedor;
  } else {
    // Com parcelas do fim cortadas, o replay do cronograma superestima o
    // saldo (ainda inclui as cortadas). O saldo é o VALOR PRESENTE das
    // parcelas mantidas e ainda não pagas, descontadas à taxa contratual a
    // partir da posição atual — sem corte, isso coincide com o saldoDevedor
    // do cronograma; com corte, zera exatamente após a última efetiva.
    let pv = 0;
    for (let k = idx; k < efetivas; k++) {
      pv += cronograma[k].parcela / Math.pow(1 + taxaAm, k + 1 - idx);
    }
    saldoTeorico = round2(pv);
  }

  let extras = 0;
  let ajustes = 0;
  // O abate da amortização com redução de prazo já está refletido na remoção
  // das parcelas do fim (fora do PV acima). Só o TROCO — o que o valor pago
  // excedeu o custo de hoje das parcelas cortadas — abate o saldo direto.
  // (Lançamentos antigos, gravados quando o custo era a amortização nominal,
  // degradam bem: o troco grande compensa o corte pequeno.) Em contratos
  // indexados o troco fica mais preciso quando o caller passa o cronograma
  // corrigido (rota de cronograma); com cronograma base (resumoDivida) sai em
  // moeda constante — divergência limitada à fração indexada de <1 parcela.
  let cumCortadas = 0;
  const amortizacoes = pagamentos
    .filter((p) => p.tipo === 'amortizacao_prazo')
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  for (const p of amortizacoes) {
    const n = p.parcelaNumero ?? 0;
    let custo = 0;
    for (let j = 0; j < n; j++) {
      const row = cronograma[cronograma.length - 1 - cumCortadas - j];
      if (row) custo += custoQuitacaoParcela(row, taxaAm, p.month);
    }
    extras += Math.max(0, p.valor - round2(custo));
    cumCortadas += n;
  }
  for (const p of pagamentos) {
    if (p.tipo === 'pagamento' && p.parcelaNumero == null) extras += p.valor;
    else if (p.tipo === 'ajuste') ajustes += p.valor;
  }

  return {
    saldoDevedor: round2(Math.max(0, saldoTeorico - extras + ajustes)),
    parcelasPagas,
    proximaParcela: idx < efetivas ? (cronograma[idx] ?? null) : null,
  };
}

/**
 * Saldo de dívida rotativa: saldoInicial − Σ pagamentos + Σ ajustes,
 * considerando só lançamentos a partir da âncora `dataSaldoInicial`.
 */
export function saldoRotativa(
  saldoInicial: number,
  dataSaldoInicial: string,
  pagamentos: PagamentoDividaInput[],
): number {
  let saldo = saldoInicial;
  for (const p of pagamentos) {
    if (p.month < dataSaldoInicial) continue;
    if (p.tipo === 'ajuste') saldo += p.valor;
    else saldo -= p.valor;
  }
  return round2(Math.max(0, saldo));
}

export interface DividaCalcInput {
  modalidade: ModalidadeDivida | string;
  principal?: number | null;
  taxaAm?: number | null;
  prazoMeses?: number | null;
  sistema?: string | null;
  primeiroVencimento?: string | null;
  saldoInicial?: number | null;
  dataSaldoInicial?: string | null;
}

export interface ResumoDivida {
  saldoDevedor: number; // sem correção de índice (ver indexacaoDivida.ts)
  parcelasPagas: number | null; // null p/ rotativa
  totalParcelas: number | null;
  proximaParcela: ParcelaCronograma | null;
  prazoRestanteMeses: number | null;
  categoria: Category; // 'c' | 'm' | 'l' — rotativa é sempre curto prazo
  /** Correção pelo índice realizado — preenchidos pela rota em contratos indexados. */
  fatorIndexacao?: number;
  saldoCorrigido?: number;
  proximaParcelaCorrigida?: number;
}

/**
 * Resumo computado de uma dívida (qualquer modalidade) — o que a listagem e
 * os cards precisam sem carregar o cronograma completo no payload.
 */
export function resumoDivida(d: DividaCalcInput, pagamentos: PagamentoDividaInput[]): ResumoDivida {
  if (
    d.modalidade === 'financiamento' &&
    d.principal != null &&
    d.taxaAm != null &&
    d.prazoMeses != null &&
    d.sistema &&
    d.primeiroVencimento
  ) {
    const cronograma = gerarCronograma({
      principal: d.principal,
      taxaAm: d.taxaAm,
      prazoMeses: d.prazoMeses,
      primeiroVencimento: d.primeiroVencimento,
      sistema: d.sistema,
    });
    const s = saldoFinanciamento(d.principal, cronograma, pagamentos, d.taxaAm);
    // Prazo efetivo desconta as parcelas do fim quitadas por amortização —
    // o financiamento termina antes (é o objetivo da redução de prazo).
    const totalParcelas = Math.max(0, d.prazoMeses - parcelasCortadasDe(pagamentos));
    const prazoRestante = Math.max(0, totalParcelas - s.parcelasPagas);
    return {
      saldoDevedor: s.saldoDevedor,
      parcelasPagas: s.parcelasPagas,
      totalParcelas,
      proximaParcela: s.proximaParcela,
      prazoRestanteMeses: prazoRestante,
      categoria: categoryFromMonths(Math.max(1, prazoRestante)),
    };
  }

  const saldo =
    d.saldoInicial != null && d.dataSaldoInicial
      ? saldoRotativa(d.saldoInicial, d.dataSaldoInicial, pagamentos)
      : 0;
  return {
    saldoDevedor: saldo,
    parcelasPagas: null,
    totalParcelas: null,
    proximaParcela: null,
    prazoRestanteMeses: null,
    categoria: 'c',
  };
}
