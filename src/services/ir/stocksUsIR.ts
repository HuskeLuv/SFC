/**
 * Apuração mensal de IR sobre ganho de capital em moeda estrangeira (ME).
 *
 * Aplica-se a alienação de bens no exterior — pra nossa aplicação cobre Stocks,
 * REITs e ETFs EUA (ETF americano etf/USD desde nov/2026). Regras (Pessoa Física):
 *  - Conversão obrigatória em BRL: custo de aquisição em BRL via PTAX-venda da
 *    data da compra; receita em BRL via PTAX-venda da data da venda. A diferença
 *    entre os dois fxRates já reflete a variação cambial dentro do lucro.
 *  - Isenção de R$ 35.000/mês quando o **total de alienações em ME** no mês,
 *    convertido em BRL, for ≤ R$ 35.000. Aplica-se ao mês inteiro (somando
 *    stocks + REITs + ETFs EUA).
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
 * dupla conversão do stock legado gravado em R$.
 *
 * Lei 14.754/2023 (a partir de 01/01/2024): ações, REITs e ETFs no exterior passam a ser
 * "aplicações financeiras no exterior". Os meses de 2024 em diante continuam listados (ganho e
 * vendas de cada mês), mas sem isenção nem DARF mensal: o imposto sai na apuração ANUAL
 * (`apurarAnualLei14754`), no ajuste da declaração. Até 2023 vale a regra mensal acima.
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
  /**
   * 'mensal' = regra antiga (até 2023: isenção de R$ 35 mil e DARF no mês);
   * 'anual' = Lei 14.754 (2024 em diante: o mês só informa, o IR sai no ajuste anual).
   */
  regime: 'mensal' | 'anual';
}

export interface UsApuracao {
  meses: UsMonthlyResult[];
}

const ISENCAO_ME_VENDAS_MES_BRL = 35000;
const ALIQUOTA_ME = 0.15;
/** Primeiro ano-calendário da apuração anual da Lei 14.754/2023. */
export const ANO_INICIO_LEI_14754 = 2024;
/** Alíquota única da Lei 14.754 sobre os rendimentos de aplicações no exterior. */
export const ALIQUOTA_LEI_14754 = 0.15;
/**
 * Retenção padrão dos EUA sobre dividendos de residente no Brasil (sem tratado: 30%), usada
 * quando o provento não traz o imposto retido.
 */
export const RETENCAO_EUA_PADRAO = 0.3;

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

    const regime = Number(yearStr) >= ANO_INICIO_LEI_14754 ? 'anual' : 'mensal';
    const isento =
      regime === 'mensal' && vendasTotalBrl <= ISENCAO_ME_VENDAS_MES_BRL && lucroBrutoBrl > 0;
    const motivoIsencao = isento
      ? `Alienações em ME ≤ R$ ${ISENCAO_ME_VENDAS_MES_BRL.toLocaleString('pt-BR')}/mês`
      : null;
    const irDevido =
      regime === 'mensal' && !isento && lucroBrutoBrl > 0 ? round2(lucroBrutoBrl * ALIQUOTA_ME) : 0;
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
      regime,
    });
  }

  return { meses };
}

/** Provento de ativo no exterior já em R$ (dividendo de stock/REIT/ETF EUA). */
export interface DividendoExterior {
  /** Data de pagamento. */
  date: Date;
  /** Valor bruto em R$ (antes da retenção nos EUA). */
  brutoBrl: number;
  /** Imposto retido no exterior, em R$. */
  retidoBrl: number;
  /** A retenção foi estimada pelos 30% padrão (o provento não trazia o valor retido). */
  retidoEstimado: boolean;
}

export interface UsAnualResult {
  year: number;
  /** Lucro − prejuízo das vendas do ano (soma dos meses). */
  ganhoLiquidoBrl: number;
  /** Dividendos brutos recebidos no ano. */
  dividendosBrl: number;
  /** Prejuízo de anos anteriores (2024+) disponível no início do ano. */
  prejuizoAnteriorBrl: number;
  /** Quanto desse prejuízo foi usado neste ano. */
  prejuizoCompensadoBrl: number;
  /** Base tributável (ganho + dividendos − prejuízo compensado, nunca negativa). */
  baseBrl: number;
  /** 15% da base. */
  irBrutoBrl: number;
  /** Imposto pago nos EUA abatido (limitado aos 15% dos dividendos e ao IR bruto). */
  creditoExteriorBrl: number;
  /** IR a pagar no ajuste anual (DAA do ano seguinte). */
  irDevido: number;
  /** Prejuízo que sobra para os anos seguintes. */
  prejuizoAcumuladoBrl: number;
  /** Algum dividendo do ano teve a retenção estimada em 30%. */
  retidoEstimado: boolean;
}

/**
 * Apuração anual da Lei 14.754/2023 (a partir de 2024), pessoa física:
 *  - Base do ano = ganho líquido das vendas (lucros − prejuízos, convertidos pelo câmbio de
 *    cada operação) + dividendos brutos, ambos em R$.
 *  - Prejuízo: compensa dentro do ano e, o que sobrar, nos anos seguintes (só prejuízos de 2024
 *    em diante; o regime mensal antigo não deixava saldo).
 *  - IR = 15% da base, sem isenção. O imposto retido nos EUA vira crédito, limitado ao IR
 *    brasileiro sobre o próprio dividendo (15% dele) e ao IR do ano.
 *  - Pago no ajuste anual (DAA), não por DARF mensal.
 *
 * Devolve um item por ano de `ANO_INICIO_LEI_14754` até o último ano com venda ou dividendo
 * (ou `ateAno`, se maior), para o saldo de prejuízo andar mesmo em ano sem operação.
 */
export function apurarAnualLei14754(
  meses: ReadonlyArray<UsMonthlyResult>,
  dividendos: ReadonlyArray<DividendoExterior>,
  ateAno?: number,
): UsAnualResult[] {
  const ganhoPorAno = new Map<number, number>();
  for (const m of meses) {
    if (m.year < ANO_INICIO_LEI_14754) continue;
    ganhoPorAno.set(m.year, (ganhoPorAno.get(m.year) ?? 0) + m.lucroBrutoBrl);
  }
  const divPorAno = new Map<number, { bruto: number; retido: number; estimado: boolean }>();
  for (const d of dividendos) {
    const ano = d.date.getFullYear();
    if (ano < ANO_INICIO_LEI_14754) continue;
    const acc = divPorAno.get(ano) ?? { bruto: 0, retido: 0, estimado: false };
    acc.bruto += d.brutoBrl;
    acc.retido += d.retidoBrl;
    acc.estimado = acc.estimado || d.retidoEstimado;
    divPorAno.set(ano, acc);
  }

  const anosComDado = [...ganhoPorAno.keys(), ...divPorAno.keys()];
  if (anosComDado.length === 0) return [];
  const ultimo = Math.max(...anosComDado, ateAno ?? 0);

  const anos: UsAnualResult[] = [];
  let prejuizo = 0;
  for (let year = ANO_INICIO_LEI_14754; year <= ultimo; year++) {
    const ganho = ganhoPorAno.get(year) ?? 0;
    const div = divPorAno.get(year) ?? { bruto: 0, retido: 0, estimado: false };
    const bruta = ganho + div.bruto;
    const prejuizoAnterior = prejuizo;
    let compensado = 0;
    let base = 0;
    if (bruta >= 0) {
      compensado = Math.min(prejuizo, bruta);
      base = bruta - compensado;
      prejuizo -= compensado;
    } else {
      prejuizo += -bruta;
    }
    const irBruto = base * ALIQUOTA_LEI_14754;
    const credito = Math.min(div.retido, div.bruto * ALIQUOTA_LEI_14754, irBruto);
    anos.push({
      year,
      ganhoLiquidoBrl: round2(ganho),
      dividendosBrl: round2(div.bruto),
      prejuizoAnteriorBrl: round2(prejuizoAnterior),
      prejuizoCompensadoBrl: round2(compensado),
      baseBrl: round2(base),
      irBrutoBrl: round2(irBruto),
      creditoExteriorBrl: round2(credito),
      irDevido: round2(irBruto - credito),
      prejuizoAcumuladoBrl: round2(prejuizo),
      retidoEstimado: div.estimado,
    });
  }
  return anos;
}

/**
 * IR de Stocks/REITs/ETFs EUA de um ano: até 2023, soma dos DARFs mensais; de 2024 em diante, o
 * ajuste anual da Lei 14.754.
 */
export function irExteriorDoAno(
  year: number,
  meses: ReadonlyArray<UsMonthlyResult>,
  anos: ReadonlyArray<UsAnualResult>,
): number {
  if (year >= ANO_INICIO_LEI_14754) return anos.find((a) => a.year === year)?.irDevido ?? 0;
  return round2(meses.filter((m) => m.year === year).reduce((s, m) => s + m.irDevido, 0));
}

/** Recorte do provento resolvido (resolveProventoEvents) que a conversão precisa. */
export interface ProventoExteriorRow {
  moeda: string;
  paymentDay: number;
  gross: number;
  net: number;
}

/**
 * Converte os proventos em US$ já pagos para R$ pela série de câmbio da data de pagamento.
 * Retido = bruto − líquido quando o provento traz o imposto; senão, os 30% padrão dos EUA.
 * Sem câmbio na data, o provento fica de fora e é contado em `semCambio`.
 */
export function montarDividendosExterior(
  proventos: ReadonlyArray<ProventoExteriorRow>,
  serie: SerieCambio | null,
  agoraMs: number = Date.now(),
): { dividendos: DividendoExterior[]; semCambio: number } {
  const dividendos: DividendoExterior[] = [];
  let semCambio = 0;
  for (const p of proventos) {
    if (p.moeda !== 'USD' || p.paymentDay > agoraMs || !(p.gross > 0)) continue;
    const date = new Date(p.paymentDay);
    const taxa = serie?.(date) ?? null;
    if (taxa === null) {
      semCambio += 1;
      continue;
    }
    const retidoInformado = p.net < p.gross ? p.gross - p.net : 0;
    const retidoEstimado = retidoInformado === 0;
    const retidoUsd = retidoEstimado ? p.gross * RETENCAO_EUA_PADRAO : retidoInformado;
    dividendos.push({
      date,
      brutoBrl: p.gross * taxa,
      retidoBrl: retidoUsd * taxa,
      retidoEstimado,
    });
  }
  return { dividendos, semCambio };
}

/** Rótulo do câmbio quando a operação não tem cotação gravada. */
export const ROTULO_CAMBIO_APROXIMADO = 'câmbio de mercado (aproximado)';

/** Aviso fixo da tela do IR EUA (regra da Lei 14.754 e as aproximações). */
export const AVISO_REGRA_LEI_14754 =
  'Desde 2024 (Lei 14.754), ações, REITs e ETFs no exterior pagam 15% sobre o ganho líquido e os dividendos do ano, no ajuste anual da declaração, sem a isenção de R$ 35 mil por mês. Prejuízo compensa no ano e nos seguintes, e o imposto retido nos EUA abate o IR dos dividendos. Até 2023 vale a regra mensal antiga. Estimativa: confira com seu contador.';

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
 *  - Só stock/REIT/ETF com currency 'USD' (isAtivoEmDolar): PETR4 nunca entra, mesmo com
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
