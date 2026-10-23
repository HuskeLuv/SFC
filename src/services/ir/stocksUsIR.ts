/**
 * Apuração mensal de IR sobre ganho de capital em moeda estrangeira (ME).
 *
 * Aplica-se a alienação de bens no exterior — pra nossa aplicação cobre Stocks
 * US e REITs. Regras (Pessoa Física):
 *  - Conversão obrigatória em BRL: custo de aquisição em BRL via PTAX-venda da
 *    data da compra; receita em BRL via PTAX-venda da data da venda. A diferença
 *    entre os dois fxRates já reflete a variação cambial dentro do lucro.
 *  - Isenção de R$ 35.000/mês quando o **total de alienações em ME** no mês,
 *    convertido em BRL, for ≤ R$ 35.000. Aplica-se ao mês inteiro (somando
 *    stocks + REITs).
 *  - Alíquota: 15% sobre o lucro (ignoramos a progressiva acima de R$5MM por
 *    cobrir caso atípico).
 *  - Compensação de prejuízo: NÃO permitida entre meses para ganho de capital
 *    em ME (diferente do swing trade BR). Dentro do mesmo mês, prejuízo de uma
 *    operação compensa lucro de outra (pelo somatório do lucroBruto).
 *
 * Sem I/O. Recebe transactions já carregadas com fxRate por operação; retorna
 * apuração mensal cronológica.
 *
 * Carteira EUA em US$ (out/2026): `montarTransacoesUs` monta a entrada a partir das
 * StockTransactions, filtrando por isAtivoEmDolar e lendo o preço pela UNIDADE gravada
 * (unidadeDaTransacao) — assim `priceUsd × fxRate` é sempre o valor em R$ da operação, sem
 * dupla conversão do stock legado gravado em R$. O regime (isenção mensal de R$ 35 mil)
 * não muda nesta fase; a regra anual da Lei 14.754 e a PTAX ficam para a fase 2.
 */
import { isAtivoEmDolar, unidadeDaTransacao, type AtivoMoedaRef } from '@/lib/ativoEmDolar';
import type { SerieCambio } from '@/services/market/cambioUsdBrl';

export interface UsTransaction {
  date: Date;
  type: 'compra' | 'venda';
  symbol: string;
  /** Quantidade (sempre positiva). */
  quantity: number;
  /** Preço unitário em USD. */
  priceUsd: number;
  /** Taxa de câmbio BRL/USD na data da operação. */
  fxRate: number;
  /** Taxas em BRL (corretagem + IOF de conversão). Default 0. */
  feesBrl?: number;
  /**
   * fxRate veio da série USD-BRL na data (câmbio de mercado, aproximado), não da cotação
   * gravada na operação.
   */
  fxAproximado?: boolean;
}

export interface UsMonthlyResult {
  year: number;
  month: number;
  yearMonth: string;
  vendasTotalBrl: number;
  lucroBrutoBrl: number;
  isento: boolean;
  motivoIsencao: string | null;
  aliquota: number;
  irDevido: number;
  /** Alguma venda do mês usou o câmbio de mercado da data (sem cotação gravada). */
  cambioAproximado: boolean;
}

export interface UsApuracao {
  meses: UsMonthlyResult[];
}

const ISENCAO_ME_VENDAS_MES_BRL = 35000;
const ALIQUOTA_ME = 0.15;

interface SymbolStateBrl {
  qty: number;
  totalCostBrl: number;
}

interface SellWithBasisBrl extends UsTransaction {
  precoMedioBrlAtSell: number;
}

function buildSellsWithBasis(transactions: UsTransaction[]): SellWithBasisBrl[] {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const stateBySymbol = new Map<string, SymbolStateBrl>();
  const sells: SellWithBasisBrl[] = [];

  for (const tx of sorted) {
    const state = stateBySymbol.get(tx.symbol) ?? { qty: 0, totalCostBrl: 0 };
    const fees = tx.feesBrl ?? 0;
    const valorBrl = tx.quantity * tx.priceUsd * tx.fxRate;
    if (tx.type === 'compra') {
      state.qty += tx.quantity;
      state.totalCostBrl += valorBrl + fees;
    } else {
      const precoMedioBrl = state.qty > 0 ? state.totalCostBrl / state.qty : 0;
      sells.push({ ...tx, precoMedioBrlAtSell: precoMedioBrl });
      const custoProporcional = precoMedioBrl * tx.quantity;
      state.totalCostBrl -= custoProporcional;
      state.qty -= tx.quantity;
      if (state.qty < 0) state.qty = 0;
      if (state.totalCostBrl < 0) state.totalCostBrl = 0;
    }
    stateBySymbol.set(tx.symbol, state);
  }

  return sells;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function apurarStocksUs(transactions: UsTransaction[]): UsApuracao {
  const sells = buildSellsWithBasis(transactions);

  const byMonth = new Map<string, SellWithBasisBrl[]>();
  for (const sell of sells) {
    const ym = `${sell.date.getFullYear()}-${String(sell.date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(sell);
  }

  const meses: UsMonthlyResult[] = [];
  for (const ym of [...byMonth.keys()].sort()) {
    const [yearStr, monthStr] = ym.split('-');
    const sellsOfMonth = byMonth.get(ym)!;

    const vendasTotalBrl = sellsOfMonth.reduce(
      (s, x) => s + (x.quantity * x.priceUsd * x.fxRate - (x.feesBrl ?? 0)),
      0,
    );
    const lucroBrutoBrl = sellsOfMonth.reduce((s, x) => {
      const receitaBrl = x.quantity * x.priceUsd * x.fxRate - (x.feesBrl ?? 0);
      const custoBrl = x.precoMedioBrlAtSell * x.quantity;
      return s + (receitaBrl - custoBrl);
    }, 0);

    const isento = vendasTotalBrl <= ISENCAO_ME_VENDAS_MES_BRL && lucroBrutoBrl > 0;
    const motivoIsencao = isento
      ? `Alienações em ME ≤ R$ ${ISENCAO_ME_VENDAS_MES_BRL.toLocaleString('pt-BR')}/mês`
      : null;
    const irDevido = !isento && lucroBrutoBrl > 0 ? round2(lucroBrutoBrl * ALIQUOTA_ME) : 0;
    const aliquotaAplicada = irDevido > 0 ? ALIQUOTA_ME : 0;

    meses.push({
      year: Number(yearStr),
      month: Number(monthStr),
      yearMonth: ym,
      vendasTotalBrl: round2(vendasTotalBrl),
      lucroBrutoBrl: round2(lucroBrutoBrl),
      isento,
      motivoIsencao,
      aliquota: aliquotaAplicada,
      irDevido,
      cambioAproximado: sellsOfMonth.some((x) => x.fxAproximado === true),
    });
  }

  return { meses };
}

/** Rótulo do câmbio quando a operação não tem cotação gravada. */
export const ROTULO_CAMBIO_APROXIMADO = 'câmbio de mercado (aproximado)';

/** Aviso fixo da tela do IR EUA enquanto o regime anual não entra (fase 2). */
export const AVISO_REGRA_LEI_14754 =
  'Regra anual da Lei 14.754 em revisão; confira com seu contador.';

/** Recorte da StockTransaction (com o Asset) que a montagem precisa. */
export interface UsTransactionRow {
  date: Date;
  type: string;
  quantity: number;
  price: number;
  fees: number | null;
  notes: string | null;
  asset: (AtivoMoedaRef & { symbol?: string | null }) | null;
}

export interface MontagemTransacoesUs {
  transactions: UsTransaction[];
  /** Compras/vendas de ativo em dólar descartadas por falta de câmbio (nem gravado nem série). */
  semCambio: number;
  /** Operações que usaram o câmbio de mercado da data (fallback). */
  comCambioAproximado: number;
}

/**
 * Monta a entrada de `apurarStocksUs` a partir das StockTransactions do usuário.
 *  - Só stock/REIT com currency 'USD' (isAtivoEmDolar): PETR4 nunca entra, mesmo com
 *    cotacaoMoeda nas notes.
 *  - fx = cotação gravada na operação; sem ela, a série USD-BRL na data (aproximado).
 *  - priceUsd = price se a unidade é US$; price ÷ fx se é o stock legado em R$ — o produto
 *    priceUsd × fx devolve exatamente o R$ gravado.
 * `cotacaoGravada` é injetada (cotacaoMoedaDasNotes) para o módulo continuar sem I/O.
 */
export function montarTransacoesUs(
  rows: ReadonlyArray<UsTransactionRow>,
  deps: { cotacaoGravada: (notes: unknown) => number | null; serie: SerieCambio | null },
): MontagemTransacoesUs {
  const transactions: UsTransaction[] = [];
  let semCambio = 0;
  let comCambioAproximado = 0;

  for (const tx of rows) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    if (!isAtivoEmDolar(tx.asset)) continue;

    const gravado = deps.cotacaoGravada(tx.notes);
    const fxRate = gravado ?? deps.serie?.(tx.date) ?? null;
    if (fxRate === null) {
      semCambio += 1;
      continue;
    }
    const fxAproximado = gravado === null;
    if (fxAproximado) comCambioAproximado += 1;

    const price = Number(tx.price);
    const priceUsd = unidadeDaTransacao(tx, tx.asset) === 'USD' ? price : price / fxRate;

    transactions.push({
      date: tx.date,
      type: tx.type,
      symbol: tx.asset?.symbol || 'UNKNOWN',
      quantity: tx.quantity,
      priceUsd,
      fxRate,
      feesBrl: tx.fees ? Number(tx.fees) : 0,
      fxAproximado,
    });
  }

  return { transactions, semCambio, comCambioAproximado };
}
