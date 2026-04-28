/**
 * Apuração mensal de IR sobre ganho de capital em criptoativos.
 *
 * Regras (IN RFB 1888/2019 e atualizações, Pessoa Física):
 *  - Cotação direta em BRL (sem conversão cambial; preço já é em reais).
 *  - Isenção de R$ 35.000/mês quando o **total de alienações** de cripto no
 *    mês for ≤ R$ 35.000. Aplica-se ao mês inteiro (todos os ativos cripto
 *    juntos, mesmo critério de alienações em ME).
 *  - Alíquota: 15% sobre o lucro (faixas progressivas para ganhos > R$5MM são
 *    ignoradas — caso atípico).
 *  - Compensação de prejuízo: a Receita não é completamente clara para cripto;
 *    seguimos a mesma regra usada em ganho de capital (ME): compensação intra-
 *    mês (somatório do lucro do mês) + sem carryforward entre meses. Quando
 *    houver orientação definitiva permitindo carryforward, refinar.
 *  - Quantidade aceita decimais (ex.: 0,00125 BTC).
 *
 * Sem I/O. Recebe transactions já carregadas em BRL e devolve apuração mensal.
 */

export interface CriptoTransaction {
  date: Date;
  type: 'compra' | 'venda';
  symbol: string;
  /** Quantidade — pode ser fracional (decimal). */
  quantity: number;
  /** Preço unitário em BRL. */
  price: number;
  /** Taxas em BRL (corretagem da exchange). Default 0. */
  fees?: number;
}

export interface CriptoMonthlyResult {
  year: number;
  month: number;
  yearMonth: string;
  vendasTotal: number;
  lucroBruto: number;
  isento: boolean;
  motivoIsencao: string | null;
  aliquota: number;
  irDevido: number;
}

export interface CriptoApuracao {
  meses: CriptoMonthlyResult[];
}

const ISENCAO_VENDAS_MES = 35000;
const ALIQUOTA = 0.15;

interface SymbolState {
  qty: number;
  totalCost: number;
}

interface SellWithBasis extends CriptoTransaction {
  precoMedioAtSell: number;
}

function buildSellsWithBasis(transactions: CriptoTransaction[]): SellWithBasis[] {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const stateBySymbol = new Map<string, SymbolState>();
  const sells: SellWithBasis[] = [];

  for (const tx of sorted) {
    const state = stateBySymbol.get(tx.symbol) ?? { qty: 0, totalCost: 0 };
    const fees = tx.fees ?? 0;
    if (tx.type === 'compra') {
      state.qty += tx.quantity;
      state.totalCost += tx.quantity * tx.price + fees;
    } else {
      const precoMedio = state.qty > 0 ? state.totalCost / state.qty : 0;
      sells.push({ ...tx, precoMedioAtSell: precoMedio });
      const custoProporcional = precoMedio * tx.quantity;
      state.totalCost -= custoProporcional;
      state.qty -= tx.quantity;
      // Tolerância pra erros de ponto flutuante com qty fracional (ex.: 0.1 + 0.2).
      if (state.qty < 1e-12) state.qty = 0;
      if (state.totalCost < 0.01) state.totalCost = 0;
    }
    stateBySymbol.set(tx.symbol, state);
  }

  return sells;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function apurarCripto(transactions: CriptoTransaction[]): CriptoApuracao {
  const sells = buildSellsWithBasis(transactions);

  const byMonth = new Map<string, SellWithBasis[]>();
  for (const sell of sells) {
    const ym = `${sell.date.getFullYear()}-${String(sell.date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(sell);
  }

  const meses: CriptoMonthlyResult[] = [];
  for (const ym of [...byMonth.keys()].sort()) {
    const [yearStr, monthStr] = ym.split('-');
    const sellsOfMonth = byMonth.get(ym)!;

    const vendasTotal = sellsOfMonth.reduce(
      (s, x) => s + (x.quantity * x.price - (x.fees ?? 0)),
      0,
    );
    const lucroBruto = sellsOfMonth.reduce((s, x) => {
      const receita = x.quantity * x.price - (x.fees ?? 0);
      const custo = x.precoMedioAtSell * x.quantity;
      return s + (receita - custo);
    }, 0);

    const isento = vendasTotal <= ISENCAO_VENDAS_MES && lucroBruto > 0;
    const motivoIsencao = isento
      ? `Vendas de cripto ≤ R$ ${ISENCAO_VENDAS_MES.toLocaleString('pt-BR')}/mês`
      : null;
    const irDevido = !isento && lucroBruto > 0 ? round2(lucroBruto * ALIQUOTA) : 0;
    const aliquotaAplicada = irDevido > 0 ? ALIQUOTA : 0;

    meses.push({
      year: Number(yearStr),
      month: Number(monthStr),
      yearMonth: ym,
      vendasTotal: round2(vendasTotal),
      lucroBruto: round2(lucroBruto),
      isento,
      motivoIsencao,
      aliquota: aliquotaAplicada,
      irDevido,
    });
  }

  return { meses };
}
