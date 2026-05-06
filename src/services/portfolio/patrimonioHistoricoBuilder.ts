import { getAssetHistory } from '@/services/pricing/assetPriceService';
import { isHolidayB3, nextBusinessDayB3 } from '@/utils/feriadosB3';
import type { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export type FixedIncomeAssetWithAsset = {
  id: string;
  userId: string;
  assetId: string;
  type: string;
  description: string;
  startDate: Date;
  maturityDate: Date;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  liquidityType: string | null;
  taxExempt: boolean;
  tesouroBondType?: string | null;
  tesouroMaturity?: Date | null;
  /**
   * Quantidade da posição (cotas para Tesouro). Quando presente, o pricer
   * usa `investedAmount / qty` como preço efetivo de aquisição em vez do PU
   * oficial — alinha com o comportamento do Kinvo (1 cota × R$ pago).
   */
  qty?: number;
  asset: { symbol: string; name: string; type?: string | null } | null;
};

export type InvestmentCashflowItem = {
  name: string | null;
  values?: Array<{ year: number; month: number; value: number }>;
};

export type PortfolioWithRelations = Prisma.PortfolioGetPayload<{
  include: { stock: true; asset: true };
}>;

export type StockTransactionWithRelations = Prisma.StockTransactionGetPayload<{
  include: { stock: true; asset: true };
}>;

export const normalizeDateStart = (date: Date) => {
  // Datas calendário (YYYY-MM-DD) são armazenadas no DB como UTC midnight via
  // `new Date('YYYY-MM-DD')`. Normalizar via setHours/getDay locais shifta o
  // calendar day em fusos negativos (em BRT, BACEN-segunda → key local-domingo,
  // que é filtrada como fim-de-semana → ~1 dia de CDI perdido por semana →
  // CDB 100% CDI rende ~10% abaixo do CDI real em 3 anos). Ancorar em UTC
  // mantém o alinhamento entre timeline e map de índices independente do fuso.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

/**
 * Mapeia uma data de transação para o dia útil em que ela passa a "valer" no
 * timeline. Transações em fim de semana ou feriado nacional (B3 fechada) são
 * empurradas para o próximo dia útil; do contrário ficariam órfãs —
 * `buildDailyTimeline` filtra ambos, então `appliedDeltasByDay.get(day)` para
 * um sábado/feriado nunca é consultado e o aporte some silenciosamente da série.
 *
 * Convenção D+next ANBIMA: cashflows em D não-útil contam em D+next BD.
 */
export const shiftToBusinessDay = (ts: number): number => nextBusinessDayB3(ts);

export const buildDailyTimeline = (startDate: Date, endDate: Date) => {
  const start = normalizeDateStart(startDate).getTime();
  const end = normalizeDateStart(endDate).getTime();
  const timeline: number[] = [];

  for (let day = start; day <= end; day += DAY_MS) {
    const d = new Date(day);
    const dow = d.getUTCDay();
    // Pula fim-de-semana E feriados nacionais B3/BACEN. Feriados são críticos pra
    // FI pré-fixada/IPCA-híbrida: sem o filtro, `dailyPreFactor` compõe ~10-13×/ano
    // a mais, inflando saldo bruto em ~3% em 6 anos vs Kinvo/ANBIMA. Para CDI puro
    // o filtro é redundante (BACEN não publica em feriado, get(day) já é undefined).
    if (dow === 0 || dow === 6) continue;
    if (isHolidayB3(d)) continue;
    timeline.push(day);
  }

  return timeline;
};

export const getTransactionValue = (transaction: {
  total: number;
  quantity: number;
  price: number;
}) => {
  const total = Number(transaction.total);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }

  const fallback = Number(transaction.quantity) * Number(transaction.price);
  return Number.isFinite(fallback) ? fallback : 0;
};

export const buildDailyPriceMap = (
  history: Array<{ date: number; value: number }>,
  timeline: number[],
  initialPrice?: number,
) => {
  const sorted = [...history]
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => a.date - b.date);
  const map = new Map<number, number>();

  let lastPrice =
    Number.isFinite(initialPrice) && initialPrice && initialPrice > 0 ? initialPrice : undefined;
  let historyIndex = 0;

  for (const day of timeline) {
    while (historyIndex < sorted.length) {
      const historyDate = normalizeDateStart(new Date(sorted[historyIndex].date)).getTime();
      if (historyDate > day) break;
      lastPrice = sorted[historyIndex].value;
      historyIndex += 1;
    }

    if (Number.isFinite(lastPrice) && lastPrice && lastPrice > 0) {
      map.set(day, lastPrice);
    }
  }

  return map;
};

export const calculateFixedIncomeValue = (
  fixedIncome: FixedIncomeAssetWithAsset,
  referenceDate: Date,
) => {
  const start = normalizeDateStart(new Date(fixedIncome.startDate));
  const maturity = normalizeDateStart(new Date(fixedIncome.maturityDate));
  const current = normalizeDateStart(referenceDate);
  const endDate = current.getTime() > maturity.getTime() ? maturity : current;
  if (endDate.getTime() <= start.getTime()) {
    return fixedIncome.investedAmount;
  }
  const days = Math.floor((endDate.getTime() - start.getTime()) / DAY_MS);
  const rate = fixedIncome.annualRate / 100;
  const valorAtual = fixedIncome.investedAmount * Math.pow(1 + rate, days / 365);
  return Math.round(valorAtual * 100) / 100;
};

export const getDayKey = (ts: number): number => {
  // Mesmo invariante de normalizeDateStart: ancorar em UTC. setHours local em
  // BRT (UTC-3) shifta UTC-midnight pro dia anterior, desalinhando dayKey
  // entre tx.date (UTC) e timeline iterator. Foi a causa do "ativo cai no
  // dia anterior" em séries de patrimônio/MWR no fuso brasileiro.
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Taxa diária do CDI (fração decimal, ex.: 0.000521 para ~13.65% a.a.) indexada por dayKey. */
export type CdiDaily = Map<number, number>;

/** Taxa mensal do IPCA (fração decimal, ex.: 0.005 para 0.5% no mês) indexada por 'YYYY-MM'. */
export type IpcaMonthly = Map<string, number>;

/** Preço Unitário (PU) diário de um título do Tesouro Direto indexado por dayKey. */
export type TesouroPU = Map<number, number>;

export interface FixedIncomeFactorContext {
  cdi?: CdiDaily;
  ipca?: IpcaMonthly;
  tesouroPU?: TesouroPU;
  /** PU do Tesouro na data de aplicação (ou o primeiro PU disponível após ela). */
  tesouroPUAtStart?: number;
}

const BUSINESS_DAYS_PER_YEAR = 252;

const monthKeyOf = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Distância em meses entre 'YYYY-MM' a (mais antigo) e b (mais recente). >= 0. */
const monthDistance = (a: string, b: string): number => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

/**
 * Constrói a série diária de fatores de rentabilidade acumulados para um ativo de renda fixa.
 *
 * Retorna um `Map<dayKey, factor>` em que `factor` é o multiplicador do principal na data:
 * `saldoBruto(day) = investedAmount * factor(day)`.
 *
 * O `timeline` deve ser composto por dias úteis (o helper `buildDailyTimeline` já filtra
 * fim de semana). Para correção do TWR ao longo do período exibido, passe um timeline que
 * comece na `fi.startDate` real; o chamador pode então "fatiar" para exibição.
 *
 * Regras de acréscimo (aplicadas a cada dia útil após a data de aplicação e até o vencimento):
 * - **PRE**: `factor *= (1 + annualRate)^(1/252)`
 * - **CDI**: `factor *= 1 + cdi_dia * indexerPercent` (carrega o último CDI conhecido em gaps)
 * - **IPCA**: `factor *= (1 + annualRate)^(1/252)` (spread) + aplica IPCA do mês ao cruzar
 *   para o mês seguinte
 * - **Tesouro Direto** (`tesouroBondType` preenchido e PU disponível): `factor = pu_dia / pu_start`
 *   (carrega o último PU conhecido em gaps). Se nunca houve PU, cai no `indexer` do registro.
 *
 * Após a data de vencimento, o fator é congelado no valor apurado no vencimento.
 */
export const buildFixedIncomeFactorSeries = (
  fi: FixedIncomeAssetWithAsset,
  timeline: number[],
  ctx: FixedIncomeFactorContext = {},
): Map<number, number> => {
  const result = new Map<number, number>();
  if (timeline.length === 0) return result;

  const startTs = normalizeDateStart(new Date(fi.startDate)).getTime();
  const maturityTs = normalizeDateStart(new Date(fi.maturityDate)).getTime();

  const annualRate = Number(fi.annualRate) / 100;
  const indexerPercent = fi.indexerPercent != null ? Number(fi.indexerPercent) / 100 : 1;
  const indexer = (fi.indexer || 'PRE').toUpperCase();
  const isHibrido = String(fi.type || '')
    .toUpperCase()
    .endsWith('_HIB');
  const hasTesouroPU =
    Boolean(fi.tesouroBondType) &&
    Boolean(ctx.tesouroPU) &&
    typeof ctx.tesouroPUAtStart === 'number' &&
    ctx.tesouroPUAtStart > 0;

  const dailyPreFactor =
    1 + annualRate > 0 ? Math.pow(1 + annualRate, 1 / BUSINESS_DAYS_PER_YEAR) : 1;

  // Quando o timeline pedido começa DEPOIS da data de aplicação (ex.: maxHistoricoMonths
  // trunca um CDB iniciado em 2020 para um timeline que começa em 2023), precisamos
  // primeiro acumular o factor sobre o gap pré-timeline. Sem isso o factor reseta em 1
  // no início do timeline e perde anos de rentabilidade — defasagem que era "consertada"
  // pelo patch live no último dia, gerando spike artificial no TWR.
  const requestedStart = timeline[0];
  const requestedEnd = timeline[timeline.length - 1];
  const requested = new Set(timeline);
  const fullStart = startTs < requestedStart ? new Date(startTs) : new Date(requestedStart);
  const fullTimeline =
    startTs < requestedStart ? buildDailyTimeline(fullStart, new Date(requestedEnd)) : timeline;

  let factor = 1;
  let lastCdi = 0;
  let lastTesouroPU = ctx.tesouroPUAtStart ?? 0;
  // Pre-popula lastTesouroPU com o PU mais recente publicado (<= startTs).
  // Sem isso, posições compradas em dias sem publicação de PU (D+1 do BACEN
  // ainda em atraso, fim de semana, feriado) usariam o `tesouroPUAtStart`
  // como factor — ignorando o PU oficial mais recente. Especialmente
  // importante quando `tesouroPUAtStart` é o preço pago (qty=1) em vez do
  // PU oficial (qty fracional), caso em que lastTesouroPU = preço pago dá
  // factor=1 sem refletir o ganho de mercado.
  if (hasTesouroPU && ctx.tesouroPU) {
    const sortedKeys = Array.from(ctx.tesouroPU.keys())
      .filter((k) => k <= startTs)
      .sort();
    const latest = sortedKeys[sortedKeys.length - 1];
    const pu = latest !== undefined ? ctx.tesouroPU.get(latest) : undefined;
    if (pu && pu > 0) lastTesouroPU = pu;
  }
  // Inicia no mês da aplicação para que o IPCA do mês em curso não seja aplicado
  // quando cruzarmos para o próximo mês (seria cobrar IPCA retroativo da fração pré-aplicação).
  let lastMonthApplied = monthKeyOf(startTs);
  // Fila de meses esperando IPCA: cobre 2 cenários:
  //  (a) BACEN publica IPCA ~10 dias após fechar o mês — durante a janela
  //      de espera, mês fica pendente e é aplicado retroativamente quando taxa chega.
  //  (b) Mês permanentemente sem IPCA (gap histórico no economic_index) — fica
  //      pendente até `IPCA_MAX_PENDING_MONTHS`, depois é descartado pra não
  //      bloquear meses subsequentes (bug histórico: lastMonthApplied travava em "2020-05"
  //      e nenhum IPCA pós-2021 era aplicado).
  const pendingIpcaMonths: string[] = [];
  const IPCA_MAX_PENDING_MONTHS = 3; // descarta após 3 meses sem publicação

  const tryApplyPendingIpca = (currentMonth: string): number => {
    if (!ctx.ipca || pendingIpcaMonths.length === 0) return 1;
    let mult = 1;
    const remaining: string[] = [];
    for (const month of pendingIpcaMonths) {
      const rate = ctx.ipca.get(month);
      if (rate != null && Number.isFinite(rate)) {
        mult *= 1 + rate;
      } else {
        // Não publicou ainda — calcula idade do pendente vs currentMonth.
        // Se exceder janela, descarta (sem multiplicar). Senão mantém pra retry.
        const ageMonths = monthDistance(month, currentMonth);
        if (ageMonths < IPCA_MAX_PENDING_MONTHS) {
          remaining.push(month);
        }
      }
    }
    pendingIpcaMonths.length = 0;
    pendingIpcaMonths.push(...remaining);
    return mult;
  };

  for (const day of fullTimeline) {
    if (day < startTs) {
      if (requested.has(day)) result.set(day, 1);
      continue;
    }

    if (day > maturityTs) {
      // Fator congelado no valor apurado até o vencimento
      if (requested.has(day)) result.set(day, factor);
      continue;
    }

    if (hasTesouroPU) {
      const pu = ctx.tesouroPU!.get(day);
      if (pu && pu > 0) {
        lastTesouroPU = pu;
      }
      if (lastTesouroPU > 0 && ctx.tesouroPUAtStart! > 0) {
        factor = lastTesouroPU / ctx.tesouroPUAtStart!;
      }
    } else if (indexer === 'CDI' && day >= startTs) {
      // CDI compõe a partir do próprio dia da aplicação (D+0) — alinha com
      // Kinvo e outras plataformas. Convenção D+1 (`day > startTs`) criava
      // gap visual de 2 dias entre compra e primeiro rendimento (1 dia da
      // regra + 1 dia de defasagem da publicação BACEN).
      // Só compõe em dias em que o BACEN realmente publicou taxa — sem
      // carry-forward em feriados (que gerava ~10 compoundings extras/ano).
      const cdiRate = ctx.cdi?.get(day);
      if (cdiRate != null && Number.isFinite(cdiRate)) {
        lastCdi = cdiRate;
        factor *= 1 + lastCdi * indexerPercent;
        // Para híbrido (CDI + X%), o spread (annualRate) é aplicado diariamente.
        // Em pós-fixada o annualRate é overload do "% do indexador" no wizard, então
        // aplicar dailyPreFactor lá causaria dupla contagem. Restringe-se a _HIB.
        if (isHibrido && annualRate > 0) {
          factor *= dailyPreFactor;
        }
      }
    } else if (day > startTs) {
      // IPCA: ao cruzar pra novo mês, enfileira o mês recém-fechado pra aplicação.
      // Tenta drenar a fila imediatamente (BACEN pode ter publicado a taxa via cron).
      // `lastMonthApplied` AGORA SEMPRE avança — meses sem IPCA ficam na fila
      // (até IPCA_MAX_PENDING_MONTHS) e depois são descartados, evitando bloqueio
      // permanente quando há gap histórico no economic_index (bug pré-fix).
      if (indexer === 'IPCA') {
        const currentMonth = monthKeyOf(day);
        if (currentMonth !== lastMonthApplied) {
          pendingIpcaMonths.push(lastMonthApplied);
          lastMonthApplied = currentMonth;
        }
        factor *= tryApplyPendingIpca(currentMonth);
        // Spread do híbrido (IPCA + X%) compõe diariamente.
        factor *= dailyPreFactor;
      } else {
        // PRE (default) — segue D+1 (rendimento começa no dia útil seguinte).
        factor *= dailyPreFactor;
      }
    }

    if (requested.has(day)) result.set(day, factor);
  }

  return result;
};

export const calculateHistoricoTWR = (
  patrimonioSeries: Array<{ data: number; saldoBruto: number }>,
  cashFlowsByDay: Map<number, number>,
): Array<{ data: number; value: number }> => {
  if (patrimonioSeries.length === 0) return [];

  const result: Array<{ data: number; value: number }> = [];
  let cumulative = 1;

  for (let i = 0; i < patrimonioSeries.length; i++) {
    const valorFinal = patrimonioSeries[i].saldoBruto;
    const dayKey = getDayKey(patrimonioSeries[i].data);
    const fluxo = cashFlowsByDay.get(dayKey) ?? cashFlowsByDay.get(patrimonioSeries[i].data) ?? 0;

    let retornoDia = 0;
    if (i === 0) {
      // Primeiro ponto: usa o cashflow do dia (aporte) como base, capturando
      // o ganho instantâneo entre o preço pago e o preço de mercado naquele
      // dia. Sem isso, o TWR forçava 0 no início e descartava a diferença —
      // padrão Kinvo/B3 inclui esse ganho na rentabilidade do período.
      if (fluxo > 0) {
        retornoDia = (valorFinal - fluxo) / fluxo;
        // Clamp mais largo no primeiro ponto: ganho instantâneo de até ±100%
        // pode acontecer quando o preço pago foge muito do preço de mercado
        // (CSVs de teste, doações, herança, retomada de posição antiga sem PU).
        if (!Number.isFinite(retornoDia) || retornoDia > 1 || retornoDia < -1) {
          retornoDia = 0;
        }
      }
    } else {
      const valorInicial = patrimonioSeries[i - 1].saldoBruto;
      if (valorInicial > 0) {
        retornoDia = (valorFinal - valorInicial - fluxo) / valorInicial;
        if (!Number.isFinite(retornoDia) || retornoDia > 0.5 || retornoDia < -0.5) {
          retornoDia = 0;
        }
      } else if (valorFinal > 0 && fluxo > 0) {
        retornoDia = 0;
      }
    }

    cumulative *= 1 + retornoDia;
    result.push({
      data: patrimonioSeries[i].data,
      value: Math.round((cumulative - 1) * 10000) / 100,
    });
  }

  return result;
};

const fetchAssetHistoryFromDb = async (
  symbol: string,
  startDate?: Date,
): Promise<Array<{ date: number; value: number }>> => {
  const start = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : new Date(Date.now() - 365 * DAY_MS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return getAssetHistory(symbol, start, end, { useBrapiFallback: true });
};

export type BuildPatrimonioHistoricoParams = {
  portfolio: PortfolioWithRelations[];
  fixedIncomeAssets: FixedIncomeAssetWithAsset[];
  stockTransactions: StockTransactionWithRelations[];
  investmentsExclReservas: InvestmentCashflowItem[];
  saldoBrutoAtual: number;
  valorAplicadoAtual: number;
  twrStartDate?: number;
  /** null/undefined = sem limite (snapshots / backfill) */
  maxHistoricoMonths?: number | null;
  /** Se true, último ponto da série usa saldoBrutoAtual/valorAplicadoAtual (comportamento da API). */
  patchLastDayWithLiveTotals: boolean;
  /**
   * Builder opcional que devolve a série diária de valor (`investedAmount * fator`) para um FI,
   * usando marcação na curva (CDI/IPCA/Tesouro PU). Sem ele, o histórico aplica apenas o
   * `annualRate` simples — CDB 100% CDI fica estagnado no histórico. Use o `createFixedIncomePricer`
   * para criar e passe o `buildValueSeriesForAsset`.
   */
  fixedIncomeValueSeriesBuilder?: (
    fi: FixedIncomeAssetWithAsset,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  /**
   * Builder opcional que devolve a série diária de valor para uma posição que rende
   * CDI implícito (reservas de emergência/oportunidade, previdência/seguros) — para
   * que essas posições não fiquem estagnadas no histórico. Default: 100% do CDI.
   */
  implicitCdiValueSeriesBuilder?: (
    startDate: Date,
    investedAmount: number,
    indexerPercent: number,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  /** Fim da linha do tempo (ex.: ontem no job diário). Default: hoje. */
  timelineEndDate?: Date;
};

export type BuildPatrimonioHistoricoResult = {
  historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }>;
  historicoTWR: Array<{ data: number; value: number }>;
  historicoTWRPeriodo: Array<{ data: number; value: number }>;
  /** Fluxo de caixa por dia para TWR (aportes/resgates + cashflow manual); útil com snapshots pré-carregados. */
  cashFlowsByDay: Map<number, number>;
};

// Re-export do util leve para preservar back-compat de consumers que importam
// daqui. Novas rotas devem importar diretamente de `@/utils/cashflowFilters`
// (não puxa as ~1k linhas deste arquivo).
export { filterInvestmentsExclReservas } from '@/utils/cashflowFilters';

export const buildPatrimonioHistorico = async (
  params: BuildPatrimonioHistoricoParams,
): Promise<BuildPatrimonioHistoricoResult> => {
  const {
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas,
    saldoBrutoAtual,
    valorAplicadoAtual,
    twrStartDate,
    maxHistoricoMonths = 24,
    fixedIncomeValueSeriesBuilder,
    implicitCdiValueSeriesBuilder,
    patchLastDayWithLiveTotals,
    timelineEndDate,
  } = params;

  const historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }> =
    [];
  const historicoTWR: Array<{ data: number; value: number }> = [];
  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];

  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fi) => {
    fixedIncomeByAssetId.set(fi.assetId, fi);
  });

  const hasHistoricoData =
    stockTransactions.length > 0 || investmentsExclReservas.length > 0 || portfolio.length > 0;

  if (!hasHistoricoData) {
    return { historicoPatrimonio, historicoTWR, historicoTWRPeriodo, cashFlowsByDay: new Map() };
  }

  const hoje = normalizeDateStart(timelineEndDate ?? new Date());

  const portfolioBySymbol = new Map<
    string,
    { quantity: number; avgPrice: number; isManual: boolean }
  >();
  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (!symbol) return;

    const isFixedIncome = item.assetId ? fixedIncomeByAssetId.has(item.assetId) : false;
    const isManual =
      item.asset?.type === 'emergency' ||
      item.asset?.type === 'opportunity' ||
      item.asset?.type === 'personalizado' ||
      item.asset?.type === 'imovel' ||
      symbol.startsWith('RESERVA-EMERG') ||
      symbol.startsWith('RESERVA-OPORT') ||
      symbol.startsWith('PERSONALIZADO') ||
      isFixedIncome;

    portfolioBySymbol.set(symbol, {
      quantity: item.quantity,
      avgPrice: item.avgPrice,
      isManual,
    });
  });

  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = shiftToBusinessDay(
        normalizeDateStart(new Date(value.year, value.month, 1)).getTime(),
      );
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const transactionsBySymbol = new Map<string, Map<number, number>>();
  const cashDeltasByDay = new Map<number, number>();
  const appliedDeltasByDay = new Map<number, number>();
  const aportesByDay = new Map<number, number>();
  const pricePointsBySymbol = new Map<string, Array<{ date: number; value: number }>>();
  const firstTransactionBySymbol = new Map<string, number>();

  stockTransactions.forEach((transaction) => {
    const symbol = transaction.stock?.ticker || transaction.asset?.symbol;
    if (!symbol) return;

    const day = shiftToBusinessDay(normalizeDateStart(transaction.date).getTime());
    const qtyDelta = transaction.type === 'compra' ? transaction.quantity : -transaction.quantity;

    if (!transactionsBySymbol.has(symbol)) {
      transactionsBySymbol.set(symbol, new Map());
    }
    const symbolDeltas = transactionsBySymbol.get(symbol)!;
    symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + qtyDelta);

    const totalValue = getTransactionValue(transaction);
    const cashDelta = transaction.type === 'compra' ? -totalValue : totalValue;
    const appliedDelta = transaction.type === 'compra' ? totalValue : -totalValue;
    if (transaction.type === 'compra') {
      aportesByDay.set(day, (aportesByDay.get(day) || 0) + totalValue);
    }
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
    appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);

    const priceValue =
      transaction.price > 0
        ? transaction.price
        : transaction.quantity > 0
          ? totalValue / transaction.quantity
          : 0;
    if (priceValue > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: day, value: priceValue });
    }

    if (!firstTransactionBySymbol.has(symbol)) {
      firstTransactionBySymbol.set(symbol, day);
    }
  });

  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (!symbol) return;
    if (transactionsBySymbol.has(symbol)) return;

    const day = shiftToBusinessDay(normalizeDateStart(item.lastUpdate || new Date()).getTime());
    if (!transactionsBySymbol.has(symbol)) {
      transactionsBySymbol.set(symbol, new Map());
    }
    const symbolDeltas = transactionsBySymbol.get(symbol)!;
    symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + item.quantity);

    const investedValue =
      item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    const cashDelta = -investedValue;
    const appliedDelta = investedValue;
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
    appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);
    aportesByDay.set(day, (aportesByDay.get(day) || 0) + investedValue);

    if (item.avgPrice > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: day, value: item.avgPrice });
    }

    if (!firstTransactionBySymbol.has(symbol)) {
      firstTransactionBySymbol.set(symbol, day);
    }
  });

  const allSymbols = new Set<string>([
    ...Array.from(transactionsBySymbol.keys()),
    ...Array.from(portfolioBySymbol.keys()),
  ]);

  const timelineStartCandidates: number[] = [];
  if (stockTransactions.length > 0) {
    timelineStartCandidates.push(normalizeDateStart(stockTransactions[0].date).getTime());
  }
  if (manualValuesByDay.size > 0) {
    timelineStartCandidates.push(Math.min(...Array.from(manualValuesByDay.keys())));
  }
  if (portfolio.length > 0) {
    const earliestPortfolioDate = Math.min(
      ...portfolio
        .map((item) => normalizeDateStart(item.lastUpdate || new Date()).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestPortfolioDate)) {
      timelineStartCandidates.push(earliestPortfolioDate);
    }
  }
  if (fixedIncomeAssets.length > 0) {
    const earliestFixedIncomeDate = Math.min(
      ...fixedIncomeAssets
        .map((item) => normalizeDateStart(new Date(item.startDate)).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestFixedIncomeDate)) {
      timelineStartCandidates.push(earliestFixedIncomeDate);
    }
  }
  const rawTimelineStart =
    timelineStartCandidates.length > 0
      ? new Date(Math.min(...timelineStartCandidates))
      : new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);

  let timelineStart = rawTimelineStart;
  if (maxHistoricoMonths != null && Number.isFinite(maxHistoricoMonths)) {
    const minStart = new Date(hoje.getFullYear(), hoje.getMonth() - maxHistoricoMonths, 1);
    timelineStart = rawTimelineStart.getTime() < minStart.getTime() ? minStart : rawTimelineStart;
  }

  const timeline = buildDailyTimeline(timelineStart, hoje);

  // Cada FI symbol tem uma série de VALOR TOTAL DA POSIÇÃO por dia (investedAmount × factor),
  // não preço unitário. Mantemos isolado de pricesBySymbol pra evitar que o builder
  // multiplique por qty (qty>1 quando o usuário cadastrou cotas como qty num fundo
  // erroneamente classificado como FI, inflando o saldo em quantity vezes).
  const fixedIncomeValuesBySymbol = new Map<string, Map<number, number>>();
  fixedIncomeAssets.forEach((fixedIncome) => {
    const symbol = fixedIncome.asset?.symbol;
    if (!symbol) return;
    // Quando disponível, usa marcação na curva (CDI/IPCA/Tesouro PU) — caso contrário, cai
    // no fallback simples baseado em annualRate (estagnado para CDBs 100% CDI).
    const points = fixedIncomeValueSeriesBuilder
      ? fixedIncomeValueSeriesBuilder(fixedIncome, timeline)
      : timeline.map((day) => ({
          date: day,
          value: calculateFixedIncomeValue(fixedIncome, new Date(day)),
        }));
    const valueByDay = new Map<number, number>();
    points.forEach((p) => valueByDay.set(p.date, p.value));
    fixedIncomeValuesBySymbol.set(symbol, valueByDay);
  });

  // Curva CDI 100% implícita para Reservas (emergência/oportunidade) e Previdência/Seguros:
  // não temos um FixedIncomeAsset registrado pra elas, mas o usuário espera que rendam.
  // Default 100% do CDI até cadastro explícito do indexador no asset.
  if (implicitCdiValueSeriesBuilder) {
    portfolio.forEach((item) => {
      const symbol = item.asset?.symbol || item.stock?.ticker;
      if (!symbol) return;
      // Skip se já temos curva FI explícita (ex.: reserva alocada num CDB cadastrado).
      if (fixedIncomeValuesBySymbol.has(symbol)) return;
      const isReserva =
        item.asset?.type === 'emergency' ||
        item.asset?.type === 'opportunity' ||
        symbol.startsWith('RESERVA-EMERG') ||
        symbol.startsWith('RESERVA-OPORT');
      const isPrevidenciaSeguro = item.asset?.type === 'previdencia';
      if (!isReserva && !isPrevidenciaSeguro) return;
      const investedAmount =
        item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
      if (investedAmount <= 0) return;
      const firstTxTs = firstTransactionBySymbol.get(symbol);
      const startDate = firstTxTs
        ? new Date(firstTxTs)
        : item.lastUpdate
          ? new Date(item.lastUpdate)
          : new Date(timelineStart);
      const points = implicitCdiValueSeriesBuilder(startDate, investedAmount, 100, timeline);
      const valueByDay = new Map<number, number>();
      points.forEach((p) => valueByDay.set(p.date, p.value));
      fixedIncomeValuesBySymbol.set(symbol, valueByDay);
    });
  }

  const pricesBySymbol = new Map<string, Map<number, number>>();
  const fallbackPriceBySymbol = new Map<string, number>();

  const symbolsToFetch = [...allSymbols].filter(
    (s) => !(portfolioBySymbol.get(s)?.isManual ?? false),
  );
  const fetchedHistories = await Promise.all(
    symbolsToFetch.map((symbol) => fetchAssetHistoryFromDb(symbol, timelineStart)),
  );
  const historyBySymbol = new Map(symbolsToFetch.map((s, i) => [s, fetchedHistories[i] ?? []]));

  for (const symbol of allSymbols) {
    // Símbolos com curva FI são contabilizados via valor total da posição
    // (fixedIncomeValuesBySymbol) — não popular pricesBySymbol pra eles, senão o
    // valor total entraria como "preço unitário" e seria multiplicado por qty.
    if (fixedIncomeValuesBySymbol.has(symbol)) continue;

    const portfolioInfo = portfolioBySymbol.get(symbol);
    const isManual = portfolioInfo?.isManual ?? false;
    const pricePoints = pricePointsBySymbol.get(symbol) || [];

    let history: Array<{ date: number; value: number }> = [];
    if (!isManual) {
      // Preço de mercado (brapi/AssetPriceHistory) tem prioridade sobre o
      // preço pago no tx. Sem isso, comprar 30 ações ITUB4 a R$33 num dia em
      // que o mercado fecha em R$44 sobrescrevia o priceMap pra R$33 — o
      // saldo "perdia" R$11 × posição_total nesse dia, distorcendo o TWR.
      // Pricepoints só preenchem dias em que a brapi não publicou cotação.
      const brapi = historyBySymbol.get(symbol) ?? [];
      const brapiDays = new Set(brapi.map((h) => normalizeDateStart(new Date(h.date)).getTime()));
      const supplemental = pricePoints.filter((p) => !brapiDays.has(p.date));
      history = [...brapi, ...supplemental];
    } else {
      history = [...pricePoints];
    }

    const initialPrice = pricePoints.length > 0 ? pricePoints[0]?.value : portfolioInfo?.avgPrice;

    if (isManual && portfolioInfo?.avgPrice && portfolioInfo.avgPrice > 0) {
      // Reservas/personalizados/imóveis sem curva: linha plana no avgPrice.
      history = [
        { date: timelineStart.getTime(), value: portfolioInfo.avgPrice },
        { date: hoje.getTime(), value: portfolioInfo.avgPrice },
      ];
    } else if (history.length === 0 && initialPrice && initialPrice > 0) {
      history.push({ date: timelineStart.getTime(), value: initialPrice });
    }

    if (initialPrice && initialPrice > 0) {
      fallbackPriceBySymbol.set(symbol, initialPrice);
    }

    pricesBySymbol.set(symbol, buildDailyPriceMap(history, timeline, initialPrice));
  }

  const quantitiesBySymbol = new Map<string, number>();
  const timelineStartTs = timeline.length > 0 ? timeline[0] : hoje.getTime();
  allSymbols.forEach((symbol) => {
    const portfolioInfo = portfolioBySymbol.get(symbol);
    const firstTx = firstTransactionBySymbol.get(symbol);
    // Use portfolio quantity when there are no transactions, OR when all
    // transactions are before the timeline start (e.g. maxHistoricoMonths
    // truncated the timeline past the purchase date).
    const allTxBeforeTimeline = firstTx !== undefined && firstTx < timelineStartTs;
    const hasNoTransactionsInTimeline =
      !firstTransactionBySymbol.has(symbol) || allTxBeforeTimeline;

    if (portfolioInfo && hasNoTransactionsInTimeline) {
      quantitiesBySymbol.set(symbol, portfolioInfo.quantity);
    } else {
      quantitiesBySymbol.set(symbol, 0);
    }
  });

  const rendimentosByDay = new Map<number, number>();
  let cashBalance = 0;
  let rendimentosAcumulados = 0;
  let manualInvestmentsValue = 0;
  let valorAplicadoDia = 0;
  const patrimonioSeries: Array<{ data: number; valorAplicado: number; saldoBruto: number }> = [];

  // Pre-seed valorAplicado and cashBalance from transactions before the timeline.
  // Without this, assets bought years ago but with maxHistoricoMonths truncation
  // would show as having zero invested capital, distorting TWR.
  for (const [day, delta] of appliedDeltasByDay) {
    if (day < timelineStartTs) valorAplicadoDia += delta;
  }
  for (const [day, delta] of aportesByDay) {
    if (day < timelineStartTs) cashBalance += delta;
  }
  for (const [day, delta] of cashDeltasByDay) {
    if (day < timelineStartTs) cashBalance += delta;
  }

  for (const day of timeline) {
    if (manualValuesByDay.has(day)) {
      manualInvestmentsValue = manualValuesByDay.get(day) || 0;
    }

    if (aportesByDay.has(day)) {
      cashBalance += aportesByDay.get(day) || 0;
    }

    if (cashDeltasByDay.has(day)) {
      cashBalance += cashDeltasByDay.get(day) || 0;
    }

    if (rendimentosByDay.has(day)) {
      const rendimento = rendimentosByDay.get(day) || 0;
      cashBalance += rendimento;
      rendimentosAcumulados += rendimento;
    }

    if (appliedDeltasByDay.has(day)) {
      valorAplicadoDia += appliedDeltasByDay.get(day) || 0;
    }

    transactionsBySymbol.forEach((deltas, symbol) => {
      const qtyDelta = deltas.get(day);
      if (!qtyDelta) return;
      quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + qtyDelta);
    });

    let valorMercadoAtivos = 0;
    allSymbols.forEach((symbol) => {
      // FI: valor total da posição já vem do pricer (investedAmount × factor).
      // Não multiplicar por qty aqui — ignora o quantity arbitrário do portfolio
      // (qty=1 pra FI normal, qty=N quando o user cadastrou cotas indevidamente).
      const fiValues = fixedIncomeValuesBySymbol.get(symbol);
      if (fiValues) {
        const v = fiValues.get(day);
        if (v && Number.isFinite(v) && v > 0) valorMercadoAtivos += v;
        return;
      }

      const quantity = quantitiesBySymbol.get(symbol) || 0;
      if (!quantity) return;

      const priceMap = pricesBySymbol.get(symbol);
      const price = priceMap?.get(day) ?? fallbackPriceBySymbol.get(symbol);
      if (!price || !Number.isFinite(price) || price <= 0) return;
      valorMercadoAtivos += quantity * price;
    });

    const saldoBrutoDia =
      valorMercadoAtivos + manualInvestmentsValue + cashBalance + rendimentosAcumulados;

    patrimonioSeries.push({
      data: day,
      valorAplicado: Math.round(valorAplicadoDia * 100) / 100,
      saldoBruto: Math.round(saldoBrutoDia * 100) / 100,
    });
  }

  // Backfill: se todos os saldoBruto são 0 mas o valor atual é > 0 (sem histórico de preços no DB),
  // preenche a série com o valor atual para evitar linha invisível no gráfico
  const allSaldoZero =
    patrimonioSeries.length > 0 && patrimonioSeries.every((p) => p.saldoBruto === 0);
  if (allSaldoZero && saldoBrutoAtual > 0) {
    const rounded = Math.round(saldoBrutoAtual * 100) / 100;
    patrimonioSeries.forEach((p) => {
      p.saldoBruto = rounded;
    });
  }

  const saldoBrutoRounded =
    Math.round((saldoBrutoAtual > 0 ? saldoBrutoAtual : valorAplicadoAtual) * 100) / 100;
  const valorAplicadoRounded = Math.round(valorAplicadoAtual * 100) / 100;
  if (patrimonioSeries.length > 0) {
    if (patchLastDayWithLiveTotals) {
      patrimonioSeries[patrimonioSeries.length - 1].saldoBruto = saldoBrutoRounded;
      patrimonioSeries[patrimonioSeries.length - 1].valorAplicado = valorAplicadoRounded;
    }
  } else {
    patrimonioSeries.push({
      data: hoje.getTime(),
      valorAplicado: valorAplicadoRounded,
      saldoBruto: saldoBrutoRounded,
    });
  }

  historicoPatrimonio.push(...patrimonioSeries);

  const cashFlowsByDay = new Map<number, number>();
  timeline.forEach((day) => {
    const cashDelta = cashDeltasByDay.get(day) ?? 0;
    const manualVal = manualValuesByDay.get(day) ?? 0;
    cashFlowsByDay.set(day, -cashDelta + manualVal);
  });

  historicoTWR.push(...calculateHistoricoTWR(patrimonioSeries, cashFlowsByDay));

  if (typeof twrStartDate === 'number' && Number.isFinite(twrStartDate) && twrStartDate > 0) {
    const periodStart = normalizeDateStart(new Date(twrStartDate)).getTime();
    const periodEnd = hoje.getTime();
    if (periodStart <= periodEnd) {
      const beforePeriod = patrimonioSeries.filter((p) => p.data < periodStart);
      const patrimonyAtStart =
        beforePeriod.length > 0
          ? beforePeriod[beforePeriod.length - 1].saldoBruto
          : (patrimonioSeries[0]?.saldoBruto ?? 0);
      const periodPatrimonio = patrimonioSeries.filter((p) => p.data >= periodStart);
      if (periodPatrimonio.length > 0) {
        const periodPatrimonioSeries = [
          { data: periodStart, valorAplicado: 0, saldoBruto: patrimonyAtStart },
          ...periodPatrimonio,
        ];
        const periodCashFlows = new Map<number, number>();
        periodPatrimonioSeries.forEach((p) => {
          const cf = cashFlowsByDay.get(p.data);
          if (cf !== undefined && cf !== 0) periodCashFlows.set(p.data, cf);
        });
        historicoTWRPeriodo = calculateHistoricoTWR(periodPatrimonioSeries, periodCashFlows);
      }
    }
  }

  return { historicoPatrimonio, historicoTWR, historicoTWRPeriodo, cashFlowsByDay };
};

/**
 * Apenas mapa de fluxos de caixa (sem preços / série de patrimônio). Para TWR em cima de snapshots.
 */
export const buildPatrimonioCashFlowsByDayOnly = (
  portfolio: PortfolioWithRelations[],
  _fixedIncomeAssets: FixedIncomeAssetWithAsset[],
  stockTransactions: StockTransactionWithRelations[],
  investmentsExclReservas: InvestmentCashflowItem[],
  timeline: number[],
): Map<number, number> => {
  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = shiftToBusinessDay(
        normalizeDateStart(new Date(value.year, value.month, 1)).getTime(),
      );
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const cashDeltasByDay = new Map<number, number>();

  stockTransactions.forEach((transaction) => {
    const symbol = transaction.stock?.ticker || transaction.asset?.symbol;
    if (!symbol) return;

    const day = shiftToBusinessDay(normalizeDateStart(transaction.date).getTime());
    const totalValue = getTransactionValue(transaction);
    const cashDelta = transaction.type === 'compra' ? -totalValue : totalValue;
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
  });

  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (!symbol) return;

    const hasTx = stockTransactions.some((t) => (t.stock?.ticker || t.asset?.symbol) === symbol);
    if (hasTx) return;

    const day = shiftToBusinessDay(normalizeDateStart(item.lastUpdate || new Date()).getTime());
    const investedValue =
      item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    const cashDelta = -investedValue;
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
  });

  const cashFlowsByDay = new Map<number, number>();
  timeline.forEach((day) => {
    const cashDelta = cashDeltasByDay.get(day) ?? 0;
    const manualVal = manualValuesByDay.get(day) ?? 0;
    cashFlowsByDay.set(day, -cashDelta + manualVal);
  });

  return cashFlowsByDay;
};

/**
 * Início bruto da linha do tempo (sem cap de meses). Usado para leitura de snapshots.
 */
export const getRawPatrimonioTimelineStart = (
  stockTransactions: StockTransactionWithRelations[],
  portfolio: PortfolioWithRelations[],
  investmentsExclReservas: InvestmentCashflowItem[],
  fixedIncomeAssets: FixedIncomeAssetWithAsset[],
  fallbackWhenEmpty: Date,
): Date => {
  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = normalizeDateStart(new Date(value.year, value.month, 1)).getTime();
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const timelineStartCandidates: number[] = [];
  if (stockTransactions.length > 0) {
    timelineStartCandidates.push(normalizeDateStart(stockTransactions[0].date).getTime());
  }
  if (manualValuesByDay.size > 0) {
    timelineStartCandidates.push(Math.min(...Array.from(manualValuesByDay.keys())));
  }
  if (portfolio.length > 0) {
    const earliestPortfolioDate = Math.min(
      ...portfolio
        .map((item) => normalizeDateStart(item.lastUpdate || new Date()).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestPortfolioDate)) {
      timelineStartCandidates.push(earliestPortfolioDate);
    }
  }
  if (fixedIncomeAssets.length > 0) {
    const earliestFixedIncomeDate = Math.min(
      ...fixedIncomeAssets
        .map((item) => normalizeDateStart(new Date(item.startDate)).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestFixedIncomeDate)) {
      timelineStartCandidates.push(earliestFixedIncomeDate);
    }
  }
  if (timelineStartCandidates.length === 0) {
    return fallbackWhenEmpty;
  }
  return new Date(Math.min(...timelineStartCandidates));
};
