import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getTtlCache } from '@/lib/simpleTtlCache';
import {
  buildDailyTimeline,
  buildFixedIncomeFactorSeries,
  getTransactionValue,
  normalizeDateStart,
  type CdiDaily,
  type FixedIncomeAssetWithAsset,
  type IpcaMonthly,
  type PortfolioWithRelations,
  type TesouroPU,
} from './patrimonioHistoricoBuilder';
import { isCorporateActionAuditTx } from './corporateActions';

// Caches globais para as séries de taxa/PU. Não dependem de userId — todos os
// usuários veem os mesmos dados, e o cron de ingestão (BACEN/Tesouro) atualiza
// no máximo 1×/dia, então TTL de 1h é folgado. Hit rate atravessa rotas e
// usuários, multiplicando o ganho a cada rota que precificar renda fixa.
const RATE_SERIES_TTL_MS = 60 * 60 * 1000; // 1h

type EconomicIndexRow = { date: Date; value: unknown };
type TesouroPriceRow = {
  bondType: string;
  maturityDate: Date;
  baseDate: Date;
  basePU: unknown;
  sellPU: unknown;
  buyPU: unknown;
};

const cdiCache = getTtlCache<EconomicIndexRow[]>('fiPricer:cdi');
const ipcaCache = getTtlCache<EconomicIndexRow[]>('fiPricer:ipca');
const tesouroCache = getTtlCache<TesouroPriceRow[]>('fiPricer:tesouro');

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Anexa `qty` (do Portfolio) a cada FixedIncomeAsset por assetId. Permite ao
 * pricer calcular o preço efetivo de aquisição (`investedAmount / qty`) — usado
 * principalmente em Tesouro Direto pra alinhar com o comportamento do Kinvo,
 * onde a posição é 1 cota × R$ pago em vez de qty fracional × PU oficial.
 */
export const enrichFixedIncomeWithQty = (
  fixedIncomeAssets: FixedIncomeAssetWithAsset[],
  portfolio: PortfolioWithRelations[],
): FixedIncomeAssetWithAsset[] => {
  const qtyByAssetId = new Map<string, number>();
  for (const item of portfolio) {
    if (item.assetId && item.quantity > 0) {
      qtyByAssetId.set(item.assetId, item.quantity);
    }
  }
  return fixedIncomeAssets.map((fi) => ({ ...fi, qty: qtyByAssetId.get(fi.assetId) }));
};

export type FixedIncomePricer = {
  getCurrentValue: (fi: FixedIncomeAssetWithAsset) => number;
  /**
   * Constrói a série diária de valores (`investedAmount * fator`) para o FI ao longo do
   * timeline informado. Útil para alimentar o histórico de patrimônio com marcação na curva
   * (CDI/IPCA/Tesouro PU) — caso contrário, CDBs 100% CDI ficariam estagnados no histórico.
   */
  buildValueSeriesForAsset: (
    fi: FixedIncomeAssetWithAsset,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  /**
   * Curva CDI implícita para posições sem FI registrado mas que rendem CDI (reservas
   * de emergência/oportunidade, previdência/seguros). Recebe data de início, valor
   * aplicado e % do CDI; retorna a série diária `investedAmount × factor` ao longo do
   * timeline. Antes de `startDate`, value=0.
   */
  buildImplicitCdiValueSeries: (
    startDate: Date,
    investedAmount: number,
    indexerPercent: number,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  fixedIncomeByAssetId: Map<string, FixedIncomeAssetWithAsset>;
  fixedIncomeAssets: FixedIncomeAssetWithAsset[];
};

const toFiHelper = (fi: FixedIncomeAssetWithAsset): FixedIncomeAssetWithAsset => ({
  id: fi.id,
  userId: fi.userId,
  assetId: fi.assetId,
  type: String(fi.type),
  description: fi.description,
  startDate: fi.startDate,
  maturityDate: fi.maturityDate,
  investedAmount: fi.investedAmount,
  annualRate: fi.annualRate,
  indexer: fi.indexer,
  indexerPercent: fi.indexerPercent,
  liquidityType: fi.liquidityType as string | null,
  taxExempt: fi.taxExempt,
  tesouroBondType: fi.tesouroBondType,
  tesouroMaturity: fi.tesouroMaturity,
  qty: fi.qty,
  asset: fi.asset ?? null,
});

/**
 * Carrega séries CDI/IPCA/Tesouro PU necessárias para precificar todos os ativos de renda fixa
 * do usuário e devolve uma função que computa o valor atual de cada um aplicando o fator
 * acumulado correto. Reutiliza a mesma lógica usada pela aba Renda Fixa, garantindo que
 * CDBs/LCIs/LCAs/Tesouros sejam precificados consistentemente em qualquer aba.
 */
export const createFixedIncomePricer = async (
  userId: string,
  options?: {
    asOfDate?: Date;
    preloadedAssets?: FixedIncomeAssetWithAsset[];
    /**
     * Data de início do timeline do portfolio. Se passada, força carregamento do CDI a
     * partir dela (necessário para a curva implícita de reservas/previdência mesmo
     * quando o usuário não tem FI vinculado a CDI).
     */
    portfolioStartDate?: Date;
  },
): Promise<FixedIncomePricer> => {
  const today = options?.asOfDate ?? new Date();

  let fixedIncomeAssets: FixedIncomeAssetWithAsset[] = options?.preloadedAssets ?? [];
  if (!options?.preloadedAssets) {
    try {
      fixedIncomeAssets = (await prisma.fixedIncomeAsset.findMany({
        where: { userId },
        include: { asset: true },
      })) as FixedIncomeAssetWithAsset[];
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code !== 'P2021') throw error;
      fixedIncomeAssets = [];
    }
  }

  // Enriquece cada FI com `qty` do Portfolio. O pricer (Tesouro Direto) usa
  // `investedAmount / qty` como preço efetivo de aquisição quando qty está
  // presente — alinha o ganho com o que o user pagou, não com o PU oficial
  // na data da compra.
  if (fixedIncomeAssets.length > 0 && fixedIncomeAssets.some((fi) => fi.qty == null)) {
    try {
      const portfolioQtys = await prisma.portfolio.findMany({
        where: { userId, assetId: { in: fixedIncomeAssets.map((fi) => fi.assetId) } },
        select: { assetId: true, quantity: true },
      });
      const qtyMap = new Map(portfolioQtys.map((p) => [p.assetId, p.quantity]));
      fixedIncomeAssets = fixedIncomeAssets.map((fi) => ({
        ...fi,
        qty: fi.qty ?? qtyMap.get(fi.assetId),
      }));
    } catch (error) {
      // P2021 ou outros erros não-fatais aqui só significam que `qty` não vai ser
      // populado — caímos no caminho original (PU oficial como base de aquisição).
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code !== 'P2021') throw error;
    }
  }

  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fi) => fixedIncomeByAssetId.set(fi.assetId, fi));

  // Default 24 meses atrás quando o caller não informou. Garante que a curva CDI
  // implícita (reservas/previdência) tenha taxas carregadas mesmo sem FI registrado
  // — caso contrário o factor builder cai em factor=1 (sem rendimento).
  const portfolioStartDate = options?.portfolioStartDate
    ? normalizeDateStart(options.portfolioStartDate)
    : normalizeDateStart(new Date(today.getTime() - 24 * 30 * 24 * 60 * 60 * 1000));
  const earliestFiStart = fixedIncomeAssets.reduce<Date | null>((min, fi) => {
    const start = normalizeDateStart(new Date(fi.startDate));
    if (!min || start.getTime() < min.getTime()) return start;
    return min;
  }, null);
  const earliestStart =
    earliestFiStart && earliestFiStart.getTime() < portfolioStartDate.getTime()
      ? earliestFiStart
      : portfolioStartDate;

  // Sempre carrega CDI: a curva implícita pra reservas/previdência precisa da
  // taxa diária mesmo quando nenhum FI vincula ao CDI.
  const hasCdiLinked = true;
  const hasIpcaLinked = fixedIncomeAssets.some(
    (fi) => fi.indexer === 'IPCA' || Boolean(fi.tesouroBondType),
  );
  const tesouroAssets = fixedIncomeAssets.filter((fi) => fi.tesouroBondType && fi.tesouroMaturity);

  // Resiliente a P2021 (tabela ausente em ambientes parciais) — sem isso uma falha em
  // economicIndex/tesouroDiretoPrice quebra qualquer rota que usa o pricer.
  const safeFindMany = async <T>(promiseFactory: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await promiseFactory();
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code === 'P2021') return [];
      throw error;
    }
  };

  // Tranches por assetId: replay das movimentações reais (aporte/resgate) do
  // ativo. Com múltiplos lançamentos, cada parcela precisa render a partir do
  // SEU dia — não do startDate do registro. Sem isso a série histórica valia
  // `investedAmount TOTAL × fator` desde o início: nenhum salto no dia do
  // aporte, e o TWR interpretava cada aporte como perda de −F/(V+F) (ticket
  // 28/08/2026: CDB com 6 aportes exibia TWR −81% em degraus). Com um único
  // lançamento o caminho legado (investedAmount × fator) é idêntico e
  // permanece — respeita edições manuais de investedAmount sem transação.
  const tranchesByAssetId = new Map<string, Array<{ ts: number; amount: number }>>();
  if (fixedIncomeAssets.length > 0) {
    const txRows = await safeFindMany(() =>
      prisma.stockTransaction.findMany({
        where: { userId, assetId: { in: fixedIncomeAssets.map((fi) => fi.assetId) } },
        orderBy: { date: 'asc' },
        select: {
          assetId: true,
          type: true,
          quantity: true,
          price: true,
          total: true,
          date: true,
          notes: true,
        },
      }),
    );
    for (const tx of txRows) {
      if (!tx.assetId) continue;
      if (tx.type !== 'compra' && tx.type !== 'venda') continue;
      // Linhas de auditoria de evento corporativo são display-only.
      if (isCorporateActionAuditTx(tx.notes)) continue;
      const amount = getTransactionValue({
        total: Number(tx.total),
        quantity: Number(tx.quantity),
        price: Number(tx.price),
      });
      if (!(amount > 0)) continue;
      const list = tranchesByAssetId.get(tx.assetId) ?? [];
      list.push({
        ts: normalizeDateStart(tx.date).getTime(),
        amount: tx.type === 'venda' ? -amount : amount,
      });
      tranchesByAssetId.set(tx.assetId, list);
    }
  }

  const getTranches = (
    fi: FixedIncomeAssetWithAsset,
  ): Array<{ ts: number; amount: number }> | null => {
    const list = tranchesByAssetId.get(fi.assetId);
    return list && list.length >= 2 ? list : null;
  };

  // Helpers que consultam cache global antes de bater no DB. Chave inclui o intervalo
  // de datas (start..end) em granularidade de dia — duas requisições no mesmo dia com
  // o mesmo earliestStart compartilham o resultado. Tesouro também inclui os bondType
  // pedidos para que carteiras com bonds diferentes não polluam umas às outras.
  const fetchCdiRows = async (start: Date, end: Date): Promise<EconomicIndexRow[]> => {
    const key = `${dayKey(start)}|${dayKey(end)}`;
    const cached = cdiCache.get(key);
    if (cached) return cached;
    const rows = await safeFindMany(() =>
      prisma.economicIndex.findMany({
        where: { indexType: 'CDI', date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
    );
    cdiCache.set(key, rows, RATE_SERIES_TTL_MS);
    return rows;
  };

  const fetchIpcaRows = async (start: Date, end: Date): Promise<EconomicIndexRow[]> => {
    const key = `${dayKey(start)}|${dayKey(end)}`;
    const cached = ipcaCache.get(key);
    if (cached) return cached;
    const rows = await safeFindMany(() =>
      prisma.economicIndex.findMany({
        where: { indexType: 'IPCA', date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
    );
    ipcaCache.set(key, rows, RATE_SERIES_TTL_MS);
    return rows;
  };

  const fetchTesouroRows = async (
    bonds: Array<{ bondType: string; maturity: Date }>,
    start: Date,
    end: Date,
  ): Promise<TesouroPriceRow[]> => {
    const bondsKey = bonds
      .map((b) => `${b.bondType}@${b.maturity.toISOString()}`)
      .sort()
      .join(',');
    const key = `${bondsKey}|${dayKey(start)}|${dayKey(end)}`;
    const cached = tesouroCache.get(key);
    if (cached) return cached;
    const rows = await safeFindMany(() =>
      prisma.tesouroDiretoPrice.findMany({
        where: {
          OR: bonds.map((b) => ({ bondType: b.bondType, maturityDate: b.maturity })),
          baseDate: { gte: start, lte: end },
        },
        orderBy: { baseDate: 'asc' },
      }),
    );
    tesouroCache.set(key, rows, RATE_SERIES_TTL_MS);
    return rows;
  };

  // IPCA é mensal e datado no dia 1º do mês de referência. Buscar com
  // `gte: earliestStart` exclui a linha do mês da aplicação sempre que o FI
  // começa depois do dia 1º (ex.: aplicação em 02/02 nunca via o IPCA datado
  // 01/02) — o mês ficava na fila de pendentes sem taxa e era descartado em
  // silêncio, perdendo o primeiro mês de inflação de todo IPCA+. Ancora a
  // busca no dia 1º do mês da aplicação.
  const ipcaFetchStart = new Date(
    Date.UTC(earliestStart.getUTCFullYear(), earliestStart.getUTCMonth(), 1),
  );

  const [cdiRows, ipcaRows, tesouroRows] = earliestStart
    ? await Promise.all([
        hasCdiLinked
          ? fetchCdiRows(earliestStart, today)
          : Promise.resolve([] as EconomicIndexRow[]),
        hasIpcaLinked
          ? fetchIpcaRows(ipcaFetchStart, today)
          : Promise.resolve([] as EconomicIndexRow[]),
        tesouroAssets.length > 0
          ? fetchTesouroRows(
              tesouroAssets.map((fi) => ({
                bondType: fi.tesouroBondType!,
                maturity: fi.tesouroMaturity!,
              })),
              earliestStart,
              today,
            )
          : Promise.resolve([] as TesouroPriceRow[]),
      ])
    : [[], [], []];

  const cdiGlobal: CdiDaily = new Map();
  cdiRows.forEach((row) => {
    const val = Number(row.value);
    if (Number.isFinite(val)) cdiGlobal.set(normalizeDateStart(row.date).getTime(), val);
  });

  const ipcaGlobal: IpcaMonthly = new Map();
  ipcaRows.forEach((row) => {
    const val = Number(row.value);
    if (!Number.isFinite(val)) return;
    const d = new Date(row.date);
    // UTC para casar com `monthKeyOf` no patrimonioHistoricoBuilder. Em host BRT,
    // local accessors mapeavam IPCA do dia "2021-05-01T00:00:00Z" para "2021-04",
    // desalinhando do consumidor (que monta key UTC).
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    ipcaGlobal.set(key, val);
  });

  const tesouroPUByBond = new Map<string, TesouroPU>();
  tesouroRows.forEach((row) => {
    const pu = Number(row.basePU ?? 0) || Number(row.sellPU ?? 0) || Number(row.buyPU ?? 0);
    if (!Number.isFinite(pu) || pu <= 0) return;
    const key = `${row.bondType}|${row.maturityDate.toISOString()}`;
    let m = tesouroPUByBond.get(key);
    if (!m) {
      m = new Map();
      tesouroPUByBond.set(key, m);
    }
    m.set(normalizeDateStart(row.baseDate).getTime(), pu);
  });

  const getTesouroContext = (fi: FixedIncomeAssetWithAsset) => {
    if (!fi.tesouroBondType || !fi.tesouroMaturity)
      return { tesouroPU: undefined, tesouroPUAtStart: 0 };
    const key = `${fi.tesouroBondType}|${fi.tesouroMaturity.toISOString()}`;
    const tesouroPU = tesouroPUByBond.get(key);
    if (!tesouroPU) return { tesouroPU: undefined, tesouroPUAtStart: 0 };

    // PU oficial mais próximo do início da posição — âncora padrão e
    // sanity-check do caminho por qty.
    const startKey = normalizeDateStart(new Date(fi.startDate)).getTime();
    const sortedKeys = Array.from(tesouroPU.keys()).sort((a, b) => a - b);
    const atOrBefore = [...sortedKeys].reverse().find((k) => k <= startKey);
    const firstAfter = sortedKeys.find((k) => k >= startKey);
    const chosen = atOrBefore ?? firstAfter;
    const oficialAtStart = chosen !== undefined ? (tesouroPU.get(chosen) ?? 0) : 0;

    // Quando temos qty na posição, o "PU efetivo de aquisição" é o que o user
    // realmente pagou por cota: investedAmount / qty. Isso captura o ganho real
    // mesmo quando o user cadastra 1 cota × R$ pago (estilo Kinvo) em vez de
    // qty fracional × PU oficial. Em compras alinhadas com PU oficial os dois
    // caminhos convergem (qty = investedAmount / pu_oficial → razão = 1).
    //
    // Report 10/08 (Tesouro Prefixado por valor): aplicação POR VALOR sem PU
    // na data da compra caía no fallback qty=1 — o "PU implícito" vira o
    // próprio VALOR APLICADO (não um preço por cota) e o fator
    // PU_dia/implícito colapsa o valor da posição no PU do título. Se o PU
    // oficial do início existe e o implícito desvia demais dele (>20%; desvio
    // legítimo de spread/estilo Kinvo fica em poucos %), o qty não representa
    // cotas: ancora no PU oficial — o valor aplicado passa a ser marcado pela
    // variação do título, que é a semântica da entrada por valor.
    if (fi.qty && fi.qty > 0 && fi.investedAmount > 0) {
      const impliedPU = fi.investedAmount / fi.qty;
      const desvio = oficialAtStart > 0 ? Math.abs(impliedPU / oficialAtStart - 1) : 0;
      if (oficialAtStart <= 0 || desvio <= 0.2) {
        return { tesouroPU, tesouroPUAtStart: impliedPU };
      }
    }
    return { tesouroPU, tesouroPUAtStart: oficialAtStart };
  };

  const buildFactorSeries = (fi: FixedIncomeAssetWithAsset, timeline: number[]) => {
    const ctx = getTesouroContext(fi);
    return buildFixedIncomeFactorSeries(toFiHelper(fi), timeline, {
      cdi: cdiGlobal,
      ipca: ipcaGlobal,
      tesouroPU: ctx.tesouroPU,
      tesouroPUAtStart: ctx.tesouroPUAtStart,
    });
  };

  /**
   * Série de valor por tranches: value(day) = Σ amount_i × factor(day)/factor(anchor_i),
   * onde anchor_i é o primeiro dia útil do timeline >= data da transação (mesma
   * convenção shiftToBusinessDay do builder de séries). No dia do aporte o valor
   * "salta" exatamente o valor aportado — no TWR o salto e o fluxo se cancelam e
   * sobra só o rendimento. Resgate remove o valor resgatado corrigido do dia.
   * O timeline é estendido até a tranche mais antiga quando o recorte pedido
   * começa depois dela, para não perder o rendimento acumulado pré-recorte.
   */
  const buildTrancheValueSeries = (
    fi: FixedIncomeAssetWithAsset,
    tranches: Array<{ ts: number; amount: number }>,
    requestedTimeline: number[],
  ): Map<number, number> => {
    const requestedStart = requestedTimeline[0];
    const requestedEnd = requestedTimeline[requestedTimeline.length - 1];
    const startTs = normalizeDateStart(new Date(fi.startDate)).getTime();
    const fullStartTs = Math.min(startTs, tranches[0].ts, requestedStart);
    const timeline =
      fullStartTs < requestedStart
        ? buildDailyTimeline(new Date(fullStartTs), new Date(requestedEnd))
        : requestedTimeline;
    const factors = buildFactorSeries(fi, timeline);
    const requested = new Set(requestedTimeline);
    const out = new Map<number, number>();
    let baseSum = 0;
    let trancheIdx = 0;
    // Âncora no fator do dia útil ANTERIOR ao lançamento: a tranche compõe já
    // no próprio dia (D+0, mesma convenção do factor builder) — com um único
    // lançamento no startDate isso degenera exatamente no caminho legado.
    let prevFactor = 1;
    for (const day of timeline) {
      const factor = factors.get(day) ?? 1;
      while (trancheIdx < tranches.length && tranches[trancheIdx].ts <= day) {
        baseSum += tranches[trancheIdx].amount / (prevFactor > 0 ? prevFactor : 1);
        trancheIdx++;
      }
      if (requested.has(day)) out.set(day, Math.max(0, baseSum * factor));
      prevFactor = factor;
    }
    return out;
  };

  const getCurrentValue = (fixedIncome: FixedIncomeAssetWithAsset): number => {
    const start = normalizeDateStart(new Date(fixedIncome.startDate));
    const todayNorm = normalizeDateStart(today);
    if (todayNorm.getTime() <= start.getTime()) {
      return fixedIncome.investedAmount;
    }
    const timeline = buildDailyTimeline(start, todayNorm);
    if (timeline.length === 0) return fixedIncome.investedAmount;

    const tranches = getTranches(fixedIncome);
    if (tranches) {
      const series = buildTrancheValueSeries(fixedIncome, tranches, timeline);
      const last = series.get(timeline[timeline.length - 1]);
      if (last != null) return Math.round(last * 100) / 100;
    }

    const factors = buildFactorSeries(fixedIncome, timeline);
    const lastDay = timeline[timeline.length - 1];
    const finalFactor = factors.get(lastDay) ?? 1;
    const valorAtual = fixedIncome.investedAmount * finalFactor;
    return Math.round(valorAtual * 100) / 100;
  };

  const buildValueSeriesForAsset = (fi: FixedIncomeAssetWithAsset, timeline: number[]) => {
    if (timeline.length === 0) return [] as Array<{ date: number; value: number }>;
    const tranches = getTranches(fi);
    if (tranches) {
      const series = buildTrancheValueSeries(fi, tranches, timeline);
      // Antes da primeira movimentação a posição não existia — value = 0.
      return timeline.map((day) => ({ date: day, value: series.get(day) ?? 0 }));
    }
    const factors = buildFactorSeries(fi, timeline);
    const startTs = normalizeDateStart(new Date(fi.startDate)).getTime();
    return timeline.map((day) => ({
      date: day,
      // Antes da data de aplicação, a posição não existia — value = 0 evita
      // inflar o saldoBruto histórico com FI ainda não aplicado.
      value: day < startTs ? 0 : fi.investedAmount * (factors.get(day) ?? 1),
    }));
  };

  const buildImplicitCdiValueSeries = (
    startDate: Date,
    investedAmount: number,
    indexerPercent: number,
    timeline: number[],
  ): Array<{ date: number; value: number }> => {
    if (timeline.length === 0 || investedAmount <= 0) return [];
    // FI sintético com vencimento em futuro distante. Mantém o mesmo motor de
    // cálculo (buildFactorSeries) — qualquer ajuste de regra CDI vale aqui também.
    const fakeFi: FixedIncomeAssetWithAsset = {
      id: '__implicit_cdi__',
      userId,
      assetId: '__implicit_cdi__',
      type: 'CDB_PRE',
      description: 'Reserva/Previdência (CDI implícito)',
      startDate,
      maturityDate: new Date(2099, 0, 1),
      investedAmount,
      annualRate: 0,
      indexer: 'CDI',
      indexerPercent,
      liquidityType: null,
      taxExempt: false,
      tesouroBondType: null,
      tesouroMaturity: null,
      asset: null,
    };
    const factors = buildFactorSeries(fakeFi, timeline);
    const startTs = normalizeDateStart(startDate).getTime();
    return timeline.map((day) => ({
      date: day,
      value: day < startTs ? 0 : investedAmount * (factors.get(day) ?? 1),
    }));
  };

  return {
    getCurrentValue,
    buildValueSeriesForAsset,
    buildImplicitCdiValueSeries,
    fixedIncomeByAssetId,
    fixedIncomeAssets,
  };
};
