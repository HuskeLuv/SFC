/**
 * Apuração mensal de IR sobre operações de renda variável (swing trade).
 *
 * Regras cobertas:
 *  - Preço médio ponderado por símbolo (custo de aquisição inclui taxas; receita
 *    líquida da venda subtrai taxas).
 *  - Isenção de R$ 20.000/mês em **vendas de ações nacionais** (não vale ETF
 *    nem FII). Quando a venda do mês de ações está dentro do limite, o lucro
 *    é isento E o saldo de prejuízo a compensar não é consumido.
 *  - Alíquotas: 15% (ações + ETF) / 20% (FII). Day trade (20% sem isenção)
 *    NÃO é tratado — foco em swing/longo prazo conforme escopo definido.
 *  - Loss carryforward em 2 pools: 'rvComum' (ações + ETF, conforme RFB
 *    trata como mesmo grupo de renda variável comum) e 'fii' (separado, regra
 *    própria). Prejuízo de ETF compensa lucro de ação e vice-versa.
 *  - IRRF retido na fonte (0,005%) NÃO é deduzido — projeção bruta de DARF.
 *
 * Sem I/O. Recebe transactions já categorizadas pelo caller; retorna meses
 * em ordem cronológica + saldo de prejuízo a compensar (atual).
 */

export type RendaVariavelCategory = 'acao_br' | 'fii' | 'etf_br';

export interface RvTransaction {
  date: Date;
  type: 'compra' | 'venda';
  symbol: string;
  category: RendaVariavelCategory;
  /** Quantidade da operação (sempre positiva). */
  quantity: number;
  /** Preço unitário. */
  price: number;
  /** Taxas totais (corretagem + emolumentos). Default 0. */
  fees?: number;
}

export interface MonthlyCategoryResult {
  category: RendaVariavelCategory;
  /** Receita líquida total das vendas no mês = Σ (qty × price - fees). */
  vendasTotal: number;
  /** Lucro/prejuízo bruto antes de compensar prejuízos passados. */
  lucroBruto: number;
  /** Quanto do saldo de prejuízo acumulado foi consumido neste mês. */
  prejuizoCompensado: number;
  /** Base tributável = max(0, lucroBruto - prejuizoCompensado), 0 se isento. */
  lucroTributavel: number;
  /** True se a categoria é isenta neste mês (apenas ações, vendas ≤ R$20k). */
  isento: boolean;
  motivoIsencao: string | null;
  /** Alíquota efetiva aplicada (0,15 ou 0,20; 0 se isento ou prejuízo). */
  aliquota: number;
  /** IR projetado a recolher via DARF. */
  irDevido: number;
  /** Saldo de prejuízo a compensar nesta categoria APÓS o fechamento do mês. */
  saldoPrejuizoFinal: number;
}

export interface MonthlyApuracao {
  year: number;
  month: number;
  yearMonth: string; // 'YYYY-MM'
  porCategoria: Partial<Record<RendaVariavelCategory, MonthlyCategoryResult>>;
  irTotalDevido: number;
}

/**
 * Pool de prejuízo a compensar:
 *  - rvComum: compartilhado entre ações BR e ETF BR.
 *  - fii: separado (compensa só com vendas de FII).
 */
export type LossPoolKey = 'rvComum' | 'fii';

export interface ApuracaoResult {
  meses: MonthlyApuracao[];
  /** Saldo de prejuízo a compensar atual (após o último mês processado). */
  saldosPrejuizoAtual: Record<LossPoolKey, number>;
}

const lossPoolFor = (category: RendaVariavelCategory): LossPoolKey =>
  category === 'fii' ? 'fii' : 'rvComum';

const ISENCAO_ACOES_VENDAS_MES = 20000;

const ALIQUOTAS: Record<RendaVariavelCategory, number> = {
  acao_br: 0.15,
  fii: 0.2,
  etf_br: 0.15,
};

interface SymbolState {
  qty: number;
  totalCost: number; // custo total acumulado (inclui taxas das compras)
}

interface SellWithBasis extends RvTransaction {
  precoMedioAtSell: number;
}

/**
 * Constrói preço médio ponderado por símbolo, aplicado em ordem cronológica.
 * Compra: qty += tx.qty; totalCost += tx.qty × tx.price + fees.
 * Venda: precoMedio = totalCost / qty; reduz proporcionalmente o custo.
 */
function buildSellsWithBasis(transactions: RvTransaction[]): SellWithBasis[] {
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
      // Reduz custo proporcionalmente ao % vendido.
      const custoProporcional = precoMedio * tx.quantity;
      state.totalCost -= custoProporcional;
      state.qty -= tx.quantity;
      if (state.qty < 0) state.qty = 0; // proteção contra venda > posição
      if (state.totalCost < 0) state.totalCost = 0;
    }
    stateBySymbol.set(tx.symbol, state);
  }

  return sells;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function apurarRendaVariavel(transactions: RvTransaction[]): ApuracaoResult {
  const sellsWithBasis = buildSellsWithBasis(transactions);

  // Group sells by year-month-category.
  const byMonth = new Map<string, Map<RendaVariavelCategory, SellWithBasis[]>>();
  for (const sell of sellsWithBasis) {
    const ym = `${sell.date.getFullYear()}-${String(sell.date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(ym)) byMonth.set(ym, new Map());
    const cats = byMonth.get(ym)!;
    if (!cats.has(sell.category)) cats.set(sell.category, []);
    cats.get(sell.category)!.push(sell);
  }

  // Process months chronologically; loss carryforward em 2 pools (rvComum + fii).
  const saldoPrejuizo: Record<LossPoolKey, number> = {
    rvComum: 0,
    fii: 0,
  };
  const meses: MonthlyApuracao[] = [];
  const sortedYMs = [...byMonth.keys()].sort();

  for (const ym of sortedYMs) {
    const [yearStr, monthStr] = ym.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthly: MonthlyApuracao = {
      year,
      month,
      yearMonth: ym,
      porCategoria: {},
      irTotalDevido: 0,
    };

    const cats = byMonth.get(ym)!;
    // Order categories deterministically para output estável em testes.
    const orderedCategories: RendaVariavelCategory[] = ['acao_br', 'etf_br', 'fii'];
    for (const category of orderedCategories) {
      const sells = cats.get(category);
      if (!sells) continue;

      const vendasTotal = sells.reduce((s, x) => s + (x.quantity * x.price - (x.fees ?? 0)), 0);
      const lucroBruto = sells.reduce(
        (s, x) => s + ((x.price - x.precoMedioAtSell) * x.quantity - (x.fees ?? 0)),
        0,
      );

      const isento =
        category === 'acao_br' && vendasTotal <= ISENCAO_ACOES_VENDAS_MES && lucroBruto > 0;
      const motivoIsencao = isento
        ? `Vendas de ações ≤ R$ ${ISENCAO_ACOES_VENDAS_MES.toLocaleString('pt-BR')}/mês`
        : null;
      const aliquotaCategoria = ALIQUOTAS[category];

      let prejuizoCompensado = 0;
      let lucroTributavel = 0;
      let irDevido = 0;
      let aliquotaAplicada = 0;

      const pool = lossPoolFor(category);
      if (isento) {
        // Lucro isento — não consome saldo de prejuízo, não gera IR.
      } else if (lucroBruto > 0) {
        prejuizoCompensado = Math.min(saldoPrejuizo[pool], lucroBruto);
        lucroTributavel = lucroBruto - prejuizoCompensado;
        saldoPrejuizo[pool] -= prejuizoCompensado;
        if (lucroTributavel > 0) {
          irDevido = lucroTributavel * aliquotaCategoria;
          aliquotaAplicada = aliquotaCategoria;
        }
      } else if (lucroBruto < 0) {
        // Prejuízo: acumula no pool correspondente para compensar meses futuros.
        saldoPrejuizo[pool] += Math.abs(lucroBruto);
      }

      monthly.porCategoria[category] = {
        category,
        vendasTotal: round2(vendasTotal),
        lucroBruto: round2(lucroBruto),
        prejuizoCompensado: round2(prejuizoCompensado),
        lucroTributavel: round2(lucroTributavel),
        isento,
        motivoIsencao,
        aliquota: aliquotaAplicada,
        irDevido: round2(irDevido),
        saldoPrejuizoFinal: round2(saldoPrejuizo[pool]),
      };
      monthly.irTotalDevido += irDevido;
    }

    monthly.irTotalDevido = round2(monthly.irTotalDevido);
    meses.push(monthly);
  }

  return {
    meses,
    saldosPrejuizoAtual: {
      rvComum: round2(saldoPrejuizo.rvComum),
      fii: round2(saldoPrejuizo.fii),
    },
  };
}
