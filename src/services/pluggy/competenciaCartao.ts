/**
 * Mês do Fluxo de Caixa de uma compra no cartão = mês do VENCIMENTO da fatura em que ela
 * entra (ticket 86e3tjtep, 20/10/2026; antes era o mês da data da compra).
 *
 * Puro (sem Prisma). Ordem de decisão por transação:
 *  1. billId de uma fatura conhecida → mês do dueDate dela;
 *  2. sem billId (fatura ainda aberta, parcelas futuras) → estimado pelo calendário do
 *     cartão: dia de fechamento e prazo até o vencimento tirados das faturas conhecidas
 *     (ou do vencimento da conta, com DIAS_FECHAMENTO_ATE_VENCIMENTO);
 *  3. sem calendário → mês da data (como antes).
 * Parcelas: há banco que manda todas as parcelas com a data da compra. Quando ≥ 2 parcelas
 * da MESMA série têm a mesma data, cada uma anda (n − menor n do grupo) meses a partir da
 * fatura da menor. Banco que já data cada parcela no mês dela não é deslocado.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10" → "out/2026" (rótulo da fatura na Caixa de entrada). */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return `${MESES[mes - 1]}/${ano}`;
}

/** Prazo padrão entre o fechamento e o vencimento quando nenhuma fatura traz o fechamento. */
export const DIAS_FECHAMENTO_ATE_VENCIMENTO = 7;

export interface Competencia {
  ano: number;
  /** 0–11, como CashflowValue.month. */
  mes: number;
}

export interface FaturaCartao {
  providerBillId: string;
  dueDate: Date;
  closingDate: Date | null;
}

export interface TxCartao {
  id: string;
  date: Date;
  billId: string | null;
  description: string;
  amount: number;
  installmentNumber: number | null;
  installmentTotal: number | null;
}

export interface CalendarioCartao {
  diaFechamento: number;
  diasAteVencimento: number;
  /** Faturas com fechamento conhecido, em ordem de fechamento. */
  periodos: FaturaCartao[];
  porId: Map<string, FaturaCartao>;
}

const DIA_MS = 86_400_000;

const inicioDoDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

const competenciaDaData = (d: Date): Competencia => ({
  ano: d.getUTCFullYear(),
  mes: d.getUTCMonth(),
});

function somarMeses(c: Competencia, n: number): Competencia {
  const total = c.ano * 12 + c.mes + n;
  return { ano: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}

function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

/**
 * Calendário do cartão a partir das faturas conhecidas e do vencimento atual da conta.
 * Null quando não há nenhuma data de vencimento (a compra fica no mês da data).
 */
export function montarCalendario(
  faturas: FaturaCartao[],
  vencimentoConta: Date | null,
): CalendarioCartao | null {
  const porId = new Map(faturas.map((f) => [f.providerBillId, f]));
  const periodos = faturas
    .filter((f): f is FaturaCartao & { closingDate: Date } => f.closingDate !== null)
    .sort((a, b) => a.closingDate.getTime() - b.closingDate.getTime());

  if (periodos.length > 0) {
    const ultimo = periodos[periodos.length - 1];
    const prazos = periodos
      .map((f) => Math.round((inicioDoDia(f.dueDate) - inicioDoDia(f.closingDate)) / DIA_MS))
      .filter((d) => d >= 0 && d <= 31);
    return {
      diaFechamento: ultimo.closingDate.getUTCDate(),
      diasAteVencimento: prazos.length ? mediana(prazos) : DIAS_FECHAMENTO_ATE_VENCIMENTO,
      periodos,
      porId,
    };
  }

  const vencimentos = faturas.map((f) => f.dueDate);
  if (vencimentoConta) vencimentos.push(vencimentoConta);
  if (vencimentos.length === 0) return null;
  const ref = vencimentos.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
  const fechamento = new Date(inicioDoDia(ref) - DIAS_FECHAMENTO_ATE_VENCIMENTO * DIA_MS);
  return {
    diaFechamento: fechamento.getUTCDate(),
    diasAteVencimento: DIAS_FECHAMENTO_ATE_VENCIMENTO,
    periodos: [],
    porId,
  };
}

/** Competência de uma data de compra pelo calendário (sem billId). */
export function competenciaEstimada(data: Date, cal: CalendarioCartao): Competencia {
  const dia = inicioDoDia(data);

  // Dentro do período de uma fatura conhecida: (fechamento anterior, fechamento].
  for (let i = 0; i < cal.periodos.length; i++) {
    const f = cal.periodos[i];
    const fecha = inicioDoDia(f.closingDate!);
    const anterior = i > 0 ? inicioDoDia(cal.periodos[i - 1].closingDate!) : fecha - 31 * DIA_MS;
    if (dia > anterior && dia <= fecha) return competenciaDaData(f.dueDate);
  }

  // Pela regra: fecha no diaFechamento; compra depois dele vai para a fatura seguinte.
  let ano = data.getUTCFullYear();
  let mes = data.getUTCMonth();
  if (data.getUTCDate() > Math.min(cal.diaFechamento, diasNoMes(ano, mes))) {
    ({ ano, mes } = somarMeses({ ano, mes }, 1));
  }
  const fechamento = Date.UTC(ano, mes, Math.min(cal.diaFechamento, diasNoMes(ano, mes)));
  return competenciaDaData(new Date(fechamento + cal.diasAteVencimento * DIA_MS));
}

function competenciaBase(tx: TxCartao, cal: CalendarioCartao | null): Competencia {
  if (!cal) return competenciaDaData(tx.date);
  const fatura = tx.billId ? cal.porId.get(tx.billId) : undefined;
  if (fatura) return competenciaDaData(fatura.dueDate);
  return competenciaEstimada(tx.date, cal);
}

/** Descrição sem o "01/03" que alguns bancos colam no fim. */
const descricaoDaSerie = (s: string) =>
  s
    .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Deslocamento (meses) de cada parcela que veio com a mesma data das irmãs.
 * Série = mesma descrição (sem "n/N"), valor e total de parcelas.
 */
export function deslocamentosDeParcela(
  txs: TxCartao[],
): Map<string, { base: string; meses: number }> {
  const grupos = new Map<string, TxCartao[]>();
  for (const t of txs) {
    if (!t.installmentNumber || !t.installmentTotal || t.installmentTotal < 2) continue;
    const chave = [
      descricaoDaSerie(t.description),
      Math.abs(t.amount).toFixed(2),
      t.installmentTotal,
      inicioDoDia(t.date),
    ].join('|');
    const g = grupos.get(chave);
    if (g) g.push(t);
    else grupos.set(chave, [t]);
  }
  const out = new Map<string, { base: string; meses: number }>();
  for (const g of grupos.values()) {
    const numeros = new Set(g.map((t) => t.installmentNumber));
    if (numeros.size < 2) continue;
    const base = g.reduce((a, b) => (b.installmentNumber! < a.installmentNumber! ? b : a));
    for (const t of g) {
      out.set(t.id, { base: base.id, meses: t.installmentNumber! - base.installmentNumber! });
    }
  }
  return out;
}

/** Competência de cada transação de UM cartão. */
export function competenciasDoCartao(
  txs: TxCartao[],
  faturas: FaturaCartao[],
  vencimentoConta: Date | null,
): Map<string, Competencia> {
  const cal = montarCalendario(faturas, vencimentoConta);
  const porId = new Map(txs.map((t) => [t.id, t]));
  const parcelas = deslocamentosDeParcela(txs);
  const out = new Map<string, Competencia>();
  for (const t of txs) {
    const p = parcelas.get(t.id);
    out.set(
      t.id,
      p ? somarMeses(competenciaBase(porId.get(p.base)!, cal), p.meses) : competenciaBase(t, cal),
    );
  }
  return out;
}
