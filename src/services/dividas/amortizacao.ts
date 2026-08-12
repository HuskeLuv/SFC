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
export type TipoPagamentoDivida = 'pagamento' | 'ajuste';

export interface ParcelaCronograma {
  numero: number; // 1-based
  mes: string; // YYYY-MM
  parcela: number;
  juros: number;
  amortizacao: number;
  saldoDevedor: number; // após pagar esta parcela
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
export function saldoFinanciamento(
  principal: number,
  cronograma: ParcelaCronograma[],
  pagamentos: PagamentoDividaInput[],
): SaldoFinanciamentoResult {
  const parcelasPagas = pagamentos.filter(
    (p) => p.tipo === 'pagamento' && p.parcelaNumero != null,
  ).length;
  const idx = Math.min(parcelasPagas, cronograma.length);
  const saldoTeorico = idx <= 0 ? principal : cronograma[idx - 1].saldoDevedor;

  let extras = 0;
  let ajustes = 0;
  for (const p of pagamentos) {
    if (p.tipo === 'pagamento' && p.parcelaNumero == null) extras += p.valor;
    else if (p.tipo === 'ajuste') ajustes += p.valor;
  }

  return {
    saldoDevedor: round2(Math.max(0, saldoTeorico - extras + ajustes)),
    parcelasPagas,
    proximaParcela: cronograma[idx] ?? null,
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
    const s = saldoFinanciamento(d.principal, cronograma, pagamentos);
    const prazoRestante = Math.max(0, d.prazoMeses - s.parcelasPagas);
    return {
      saldoDevedor: s.saldoDevedor,
      parcelasPagas: s.parcelasPagas,
      totalParcelas: d.prazoMeses,
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
