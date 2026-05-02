/**
 * MWR (Money-Weighted Return) — TIR no estilo XIRR do Excel.
 *
 * Diferente do TWR (que neutraliza o timing dos aportes pra avaliar o gestor),
 * o MWR mede a rentabilidade efetiva do dinheiro do investidor: aportar tarde
 * em mercado em alta puxa o MWR pra baixo, mesmo que o TWR continue alto.
 * Pra carteira self-directed (cliente decide quando aportar), MWR diz "quanto
 * meu dinheiro rendeu de fato".
 *
 * Convenção interna (XIRR padrão):
 *   - aporte na carteira     => fluxo NEGATIVO (investidor pagou)
 *   - resgate da carteira    => fluxo POSITIVO (investidor recebeu)
 *   - saldo bruto inicial    => aporte virtual no primeiro dia (NEGATIVO)
 *   - saldo bruto terminal   => resgate virtual no último dia (POSITIVO)
 *
 * A entrada `MwrInput.cashFlows` segue a convenção do builder:
 *   amount > 0 = entrada na carteira (aporte), amount < 0 = resgate.
 * Internamente, esses sinais são invertidos pra alimentar o XIRR.
 */

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

export interface CashFlow {
  /** Timestamp em milissegundos (epoch). */
  date: number;
  /**
   * Sinal positivo = entrada na carteira (aporte feito pelo investidor).
   * Sinal negativo = saída da carteira (resgate retirado pelo investidor).
   */
  amount: number;
}

export interface MwrInput {
  /** Saldo bruto da carteira no início da janela. Vira aporte virtual em initialDate. */
  initialValue: number;
  initialDate: number;
  /** Saldo bruto da carteira no fim da janela. Vira resgate virtual em terminalDate. */
  terminalValue: number;
  terminalDate: number;
  /** Aportes/resgates do investidor durante a janela (sem incluir saldo inicial/terminal). */
  cashFlows: CashFlow[];
}

export interface MwrResult {
  /** Effective annual rate em fração (0,1234 = 12,34% a.a.). */
  mwrAnnualized: number;
  /** Retorno acumulado no período em fração: (1 + mwrAnnualized)^anos − 1. */
  mwrPeriod: number;
  /** Anos da janela em base 365. */
  yearsInWindow: number;
  iterations: number;
  converged: boolean;
}

interface PreparedFlow {
  daysFromStart: number;
  amount: number;
}

function npv(rate: number, flows: PreparedFlow[]): number {
  let total = 0;
  for (const f of flows) {
    total += f.amount / Math.pow(1 + rate, f.daysFromStart / DAYS_PER_YEAR);
  }
  return total;
}

function dnpv(rate: number, flows: PreparedFlow[]): number {
  let total = 0;
  for (const f of flows) {
    const t = f.daysFromStart / DAYS_PER_YEAR;
    total += (-t * f.amount) / Math.pow(1 + rate, t + 1);
  }
  return total;
}

function solveIrr(
  flows: PreparedFlow[],
  initialGuess: number,
): { rate: number; iterations: number; converged: boolean } {
  const MAX_ITER = 100;
  const TOL = 1e-7;

  let rate = initialGuess;

  for (let i = 0; i < MAX_ITER; i++) {
    const f = npv(rate, flows);
    if (Math.abs(f) < TOL) {
      return { rate, iterations: i, converged: true };
    }
    const df = dnpv(rate, flows);
    if (Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.999) break;
    if (Math.abs(next - rate) < TOL) {
      return { rate: next, iterations: i + 1, converged: true };
    }
    rate = next;
  }

  let lo = -0.99;
  let hi = 100;
  let fLo = npv(lo, flows);
  let fHi = npv(hi, flows);
  if (Math.sign(fLo) === Math.sign(fHi)) {
    return { rate, iterations: MAX_ITER, converged: false };
  }
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < TOL || (hi - lo) / 2 < TOL) {
      return { rate: mid, iterations: i, converged: true };
    }
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
      fHi = fMid;
    }
  }
  return { rate: (lo + hi) / 2, iterations: MAX_ITER, converged: false };
}

const emptyResult = (yearsInWindow: number): MwrResult => ({
  mwrAnnualized: 0,
  mwrPeriod: 0,
  yearsInWindow,
  iterations: 0,
  converged: false,
});

export function computeMwr(input: MwrInput): MwrResult {
  const { initialValue, initialDate, terminalValue, terminalDate, cashFlows } = input;

  const yearsInWindow = (terminalDate - initialDate) / (MS_PER_DAY * DAYS_PER_YEAR);
  if (yearsInWindow <= 0) return emptyResult(0);

  const flows: PreparedFlow[] = [];

  // Semântica: initialValue é o saldo PRÉ-janela (carry-over de períodos anteriores).
  // Os fluxos no array cashFlows são contabilizados naturalmente — INCLUINDO eventuais
  // fluxos no próprio initialDate ou terminalDate. O caller é responsável por
  // (a) passar initialValue=0 quando a janela inicia no nascimento da carteira, e
  // (b) subtrair os fluxos do dia inicial do saldo bruto antes de passar como
  // initialValue, pra evitar duplicar o aporte do dia 0.
  if (initialValue > 0) {
    flows.push({ daysFromStart: 0, amount: -initialValue });
  }
  for (const cf of cashFlows) {
    if (cf.date < initialDate || cf.date > terminalDate) continue;
    if (cf.amount === 0) continue;
    const days = (cf.date - initialDate) / MS_PER_DAY;
    flows.push({ daysFromStart: days, amount: -cf.amount });
  }
  if (terminalValue > 0) {
    const days = (terminalDate - initialDate) / MS_PER_DAY;
    flows.push({ daysFromStart: days, amount: terminalValue });
  }

  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return emptyResult(yearsInWindow);

  const totalIn = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const totalOut = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const simpleReturn = totalIn > 0 ? totalOut / totalIn - 1 : 0;
  const guessFromSimple =
    yearsInWindow > 0 ? Math.pow(Math.max(0.01, 1 + simpleReturn), 1 / yearsInWindow) - 1 : 0.1;
  const safeGuess =
    Number.isFinite(guessFromSimple) && guessFromSimple > -0.99 ? guessFromSimple : 0.1;

  const solved = solveIrr(flows, safeGuess);
  const mwrAnnualized = solved.rate;
  const mwrPeriod = Math.pow(1 + mwrAnnualized, yearsInWindow) - 1;

  return {
    mwrAnnualized,
    mwrPeriod,
    yearsInWindow,
    iterations: solved.iterations,
    converged: solved.converged,
  };
}

/**
 * Helper pra extrair o saldo bruto numa data de referência a partir do
 * historicoPatrimonio. Faz busca binária pelo último ponto com `data <= refMs`.
 * Devolve null se não há dado disponível (carteira vazia ou ref antes da série).
 */
export function saldoBrutoAt(
  serie: Array<{ data: number; saldoBruto: number }>,
  refMs: number,
): number | null {
  if (serie.length === 0) return null;
  if (refMs < serie[0].data) return null;
  if (refMs >= serie[serie.length - 1].data) return serie[serie.length - 1].saldoBruto;
  let lo = 0;
  let hi = serie.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (serie[mid].data <= refMs) lo = mid;
    else hi = mid - 1;
  }
  return serie[lo].saldoBruto;
}
