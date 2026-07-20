import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  buildPatrimonioCashFlowsByDayOnly,
  calculateHistoricoTWR,
  normalizeDateStart,
} from './patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from './carteiraHistoricoDataLoader';

export type SnapshotCoverageReason = 'ok' | 'no-rows' | 'tail-gap' | 'history-gap';

export type SnapshotHistoricoBundle = {
  historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }>;
  historicoTWR: Array<{ data: number; value: number }>;
  historicoTWRPeriodo: Array<{ data: number; value: number }>;
  /** Proventos acumulados por dia (totalEarnings dos snapshots) — p/ MWR de retorno total. */
  proventosAcumuladosByDay: Map<number, number>;
  coverageOk: boolean;
  coverageReason: SnapshotCoverageReason;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Gap tolerado entre a primeira atividade real do usuário (transação/FI/cashflow)
// e o snapshot mais antigo. Acima disso assumimos que o backfill histórico nunca
// rodou para essa conta (ex.: usuário criado com histórico antigo) e devolvemos
// coverageOk=false para que o caller possa cair no rebuild + disparar backfill.
const HISTORY_GAP_TOLERANCE_DAYS = 7;

/**
 * Lê snapshots + performance entre datas. O ponto "hoje" com totais ao vivo
 * NÃO é mais injetado: a precificação live divergia da engine usada nos dias
 * anteriores (assetPriceHistory) e produzia drop artificial em TWR/MWR no
 * último ponto do gráfico de rentabilidade. O chart termina no último snapshot
 * do cron; cards de Saldo Bruto/Rentabilidade no topo do dashboard continuam
 * live por virem de um caminho independente.
 *
 * `liveSaldoBruto`/`liveValorAplicado` continuam no shape pra compatibilidade
 * com os callers existentes — apenas são ignorados.
 */
export const loadHistoricoFromSnapshots = async (
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  options?: {
    liveSaldoBruto?: number;
    liveValorAplicado?: number;
    twrStartDate?: number;
    // Data da primeira atividade real do usuário (mais antiga entre stock txs,
    // FI startDates e cashflow investments). Quando informada, o reader checa
    // se o snapshot mais antigo cobre esse início — gap > HISTORY_GAP_TOLERANCE_DAYS
    // sinaliza que o backfill nunca rodou pra essa conta.
    firstActivityDate?: Date;
  },
): Promise<SnapshotHistoricoBundle> => {
  const start = normalizeDateStart(rangeStart);
  const end = normalizeDateStart(rangeEnd);

  const [rows, perfRows] = await Promise.all([
    prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true, totalInvested: true, totalEarnings: true },
    }),
    prisma.portfolioPerformance.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { date: true, cumulativeReturn: true },
    }),
  ]);

  const historicoPatrimonio = rows.map((r) => ({
    data: normalizeDateStart(r.date).getTime(),
    valorAplicado: Number(r.totalInvested),
    saldoBruto: Number(r.totalValue),
  }));

  // totalEarnings = proventos acumulados até o dia (gravado pelo cron desde o
  // fix que tirou proventos da série exibida). Snapshots antigos têm 0 — o
  // deploy exige invalidate-all-snapshots pra não misturar convenções.
  const proventosAcumuladosByDay = new Map<number, number>();
  rows.forEach((r) => {
    proventosAcumuladosByDay.set(normalizeDateStart(r.date).getTime(), Number(r.totalEarnings));
  });

  const perfByDay = new Map<number, number>();
  perfRows.forEach((p) => {
    perfByDay.set(normalizeDateStart(p.date).getTime(), Number(p.cumulativeReturn));
  });

  const historicoTWR = historicoPatrimonio.map((p) => ({
    data: p.data,
    value: perfByDay.get(p.data) ?? 0,
  }));

  const lastSnap =
    rows.length > 0 ? normalizeDateStart(rows[rows.length - 1].date).getTime() : null;
  const firstSnap = rows.length > 0 ? normalizeDateStart(rows[0].date).getTime() : null;
  const gapDays = lastSnap != null ? (end.getTime() - lastSnap) / MS_PER_DAY : 999;
  const historyGapDays =
    firstSnap != null && options?.firstActivityDate
      ? (firstSnap - normalizeDateStart(options.firstActivityDate).getTime()) / MS_PER_DAY
      : 0;

  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];
  const twrStart = options?.twrStartDate;
  if (
    typeof twrStart === 'number' &&
    Number.isFinite(twrStart) &&
    twrStart > 0 &&
    historicoPatrimonio.length > 0
  ) {
    const periodStart = normalizeDateStart(new Date(twrStart)).getTime();
    const periodEnd = end.getTime();
    if (periodStart <= periodEnd) {
      const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
        await loadCarteiraHistoricoData(userId);
      const timeline = historicoPatrimonio.map((p) => p.data);
      const cashFlowsByDay = buildPatrimonioCashFlowsByDayOnly(
        portfolio,
        fixedIncomeAssets,
        stockTransactions,
        investmentsExclReservas,
        timeline,
      );

      // TWR de período com provento como RENDA do dia (mesma metodologia do
      // builder): a renda diária vem do delta de totalEarnings (acumulado)
      // entre snapshots consecutivos. O acumulado NÃO entra na base.
      const incomeByDay = new Map<number, number>();
      for (let i = 1; i < historicoPatrimonio.length; i++) {
        const prev = proventosAcumuladosByDay.get(historicoPatrimonio[i - 1]!.data) ?? 0;
        const curr = proventosAcumuladosByDay.get(historicoPatrimonio[i]!.data) ?? 0;
        const delta = curr - prev;
        if (delta > 0) incomeByDay.set(historicoPatrimonio[i]!.data, delta);
      }
      const beforePeriod = historicoPatrimonio.filter((p) => p.data < periodStart);
      const patrimonyAtStart =
        beforePeriod.length > 0
          ? beforePeriod[beforePeriod.length - 1]!.saldoBruto
          : historicoPatrimonio[0]!.saldoBruto;
      const periodPatrimonio = historicoPatrimonio.filter((p) => p.data >= periodStart);
      if (periodPatrimonio.length > 0) {
        const periodPatrimonioSeries = [
          { data: periodStart, valorAplicado: 0, saldoBruto: patrimonyAtStart },
          ...periodPatrimonio,
        ];
        const periodCashFlows = new Map<number, number>();
        periodPatrimonioSeries.forEach((p) => {
          const cfv = cashFlowsByDay.get(p.data);
          if (cfv !== undefined && cfv !== 0) periodCashFlows.set(p.data, cfv);
        });
        historicoTWRPeriodo = calculateHistoricoTWR(
          periodPatrimonioSeries,
          periodCashFlows,
          incomeByDay,
        );
      }
    }
  }

  let coverageReason: SnapshotCoverageReason = 'ok';
  if (rows.length === 0) {
    coverageReason = 'no-rows';
  } else if (gapDays > 4) {
    coverageReason = 'tail-gap';
  } else if (historyGapDays > HISTORY_GAP_TOLERANCE_DAYS) {
    // Snapshot mais antigo está bem depois da primeira atividade — backfill faltando.
    coverageReason = 'history-gap';
  }
  const coverageOk = coverageReason === 'ok';

  if (!coverageOk) {
    logger.warn(
      `[portfolioSnapshotReader] coverageOk=false userId=${userId} reason=${coverageReason} rows=${rows.length} tailGapDays=${gapDays.toFixed(1)} historyGapDays=${historyGapDays.toFixed(1)}`,
    );
  }

  return {
    historicoPatrimonio,
    historicoTWR,
    historicoTWRPeriodo,
    proventosAcumuladosByDay,
    coverageOk,
    coverageReason,
  };
};
