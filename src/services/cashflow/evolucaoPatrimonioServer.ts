import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isNonBusinessDayB3 } from '@/utils/feriadosB3';
import { getMergedCashflowGroups } from './getCashflowTree';
import { aggregateCashflow } from './cashflowAggregation';
import {
  buildFluxoLivreByMonth,
  buildSaldoContaCorrenteAnterior,
  computeEvolucaoSeries,
} from './evolucaoPatrimonioSeries';
import { computeInvestimentosPorMes, totalBRLTransacao } from './investimentosPorMes';
import type { CashflowGroup } from '@/types/cashflow';

/**
 * Lado server da Evolução do Patrimônio: coleta de insumos (base aplicada,
 * aportes por mês, conta corrente) e job de snapshot mensal que trava o valor
 * no último dia útil de cada mês (regra Pedro Haddad).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Total nominal aplicado até 31/dez do ano anterior: Σ (total + fees) das
 * compras − Σ (total + fees) das vendas, em BRL. É a "aplicação inicial" da
 * planilha — sem marcação a mercado.
 *
 * Por transação (não groupBy): totais de REIT são gravados em USD e precisam
 * do câmbio de notes.cotacaoMoeda (`totalBRLTransacao`).
 */
export async function getBaseAplicadaAnterior(userId: string, year: number): Promise<number> {
  const transacoes = await prisma.stockTransaction.findMany({
    where: {
      userId,
      type: { in: ['compra', 'venda'] },
      date: { lt: new Date(Date.UTC(year, 0, 1)) },
    },
    select: {
      type: true,
      total: true,
      fees: true,
      notes: true,
      assetId: true,
      asset: { select: { type: true, currency: true } },
    },
    orderBy: { date: 'asc' },
  });

  let base = 0;
  const lastRateByAsset = new Map<string, number>();
  for (const transacao of transacoes) {
    const valor = totalBRLTransacao(transacao, lastRateByAsset);
    base += transacao.type === 'venda' ? -valor : valor;
  }
  return Math.round(base * 100) / 100;
}

/**
 * Aportes (+) / resgates (−) por mês do ano, excluindo reinvestimentos de
 * proventos — MESMA agregação da linha Aporte/Resgate da planilha
 * (`services/cashflow/investimentosPorMes`).
 *
 * Duas séries: `totaisPorMes` (ex-planejamento — usada na subtração do Fluxo
 * de Caixa Livre, pois os aportes de sonho já descem como despesa da
 * linha-espelho) e `aportesFullPorMes` (série CHEIA — usada na Evolução do
 * Patrimônio, onde todo aporte nominal conta, vinculado ou não).
 */
export async function getAportesPorMes(
  userId: string,
  year: number,
): Promise<{ totaisPorMes: number[]; aportesFullPorMes: number[] }> {
  const { totaisPorMes, planejamentoPorMes } = await computeInvestimentosPorMes(userId, year);
  const aportesFullPorMes = totaisPorMes.map(
    (v, i) => Math.round((v + (planejamentoPorMes[i] || 0)) * 100) / 100,
  );
  return { totaisPorMes, aportesFullPorMes };
}

/** Saldo do bloco Conta Corrente (type='saldo') em dezembro de `year`. */
export async function getSaldoContaCorrenteDezembro(userId: string, year: number): Promise<number> {
  const result = await prisma.cashflowValue.aggregate({
    _sum: { value: true },
    where: { userId, year, month: 11, item: { group: { type: 'saldo' } } },
  });
  return Number(result._sum.value ?? 0);
}

const findSaldoGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
  for (const group of groups) {
    if (group.type === 'saldo') return group;
    if (group.children?.length) {
      const found = findSaldoGroup(group.children);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Série anual (12 meses) da Evolução do Patrimônio de um usuário, server-side,
 * com os mesmos módulos puros usados pela planilha. Cadeia PURA (ignora
 * snapshots travados) — mesma semântica que o cron usa ao congelar um mês.
 */
export async function computeEvolucaoSeriesDoAno(userId: string, year: number): Promise<number[]> {
  const [groups, aportes, saldoDezembroAnterior, baseAplicada] = await Promise.all([
    getMergedCashflowGroups(userId, year),
    getAportesPorMes(userId, year),
    getSaldoContaCorrenteDezembro(userId, year - 1),
    getBaseAplicadaAnterior(userId, year),
  ]);

  const agg = aggregateCashflow(groups);
  const saldoGroup = findSaldoGroup(groups);
  const contaCorrenteByMonth = saldoGroup
    ? (agg.groupTotals[saldoGroup.id] ?? Array(12).fill(0))
    : Array(12).fill(0);

  const fluxoLivreByMonth = buildFluxoLivreByMonth({
    entradasByMonth: agg.entradasByMonth,
    despesasByMonth: agg.despesasByMonth,
    contaCorrenteByMonth,
    saldoDezembroAnterior,
    // Ex-planejamento: os aportes de sonho já descem como despesa da
    // linha-espelho; subtraí-los de novo aqui seria dupla contagem.
    aportesByMonth: aportes.totaisPorMes,
  });

  return computeEvolucaoSeries({
    baseAplicada,
    // Série cheia: todo aporte nominal (vinculado ou não) vira patrimônio.
    aportesByMonth: aportes.aportesFullPorMes,
    fluxoLivreByMonth,
    saldoAnteriorByMonth: buildSaldoContaCorrenteAnterior(
      contaCorrenteByMonth,
      saldoDezembroAnterior,
    ),
    snapshotByMonth: {},
  });
}

/**
 * Calcula o valor da Evolução do Patrimônio de um mês para um usuário,
 * server-side, com os mesmos módulos puros usados pela planilha.
 */
export async function computeEvolucaoDoMes(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const series = await computeEvolucaoSeriesDoAno(userId, year);
  return Math.round(series[month] * 100) / 100;
}

/**
 * Recalcula os snapshots mensais travados afetados por uma mutação retroativa
 * de transação (criação/edição/exclusão/undo com data no passado).
 *
 * Sem isto, um aporte retroativo entra nos meses SEM snapshot (recalculados ao
 * vivo) mas os meses já travados pelo cron ficam com o valor antigo — a série
 * exibida ganha um degrau (ex.: reserva de R$ 25k datada de ago/2025 criada em
 * ago/2026 aparecia em jan–jun/2026 mas sumia de jul/2026 em diante, porque
 * jul estava congelado com a base antiga).
 *
 * Afetados: snapshots do mês da transação em diante no mesmo ano (efeito em
 * cadeia) E todos os de anos seguintes (a transação muda a base aplicada da
 * virada do ano). Mantém a semântica do cron: recomputa a cadeia pura do ano.
 */
/**
 * Variante best-effort de `recomputeEvolucaoSnapshots` para rotas de fluxo de
 * caixa: falha no recompute loga e não derruba a mutação principal. Use
 * `new Date(0)` como fromDate quando o alcance retroativo é desconhecido
 * (exclusão de item com valores, tombstone, undo) — recomputa todos os
 * snapshots do usuário, que são poucos (1/mês desde jul/2026).
 */
export async function recomputeEvolucaoSnapshotsSafe(
  userId: string,
  fromDate: Date,
): Promise<void> {
  try {
    await recomputeEvolucaoSnapshots(userId, fromDate);
  } catch (error) {
    logger.error('[recomputeEvolucaoSnapshotsSafe] recompute falhou:', { userId, error });
  }
}

export async function recomputeEvolucaoSnapshots(userId: string, fromDate: Date): Promise<void> {
  const fromYear = fromDate.getUTCFullYear();
  const fromMonth = fromDate.getUTCMonth();

  const snapshots = await prisma.cashflowPatrimonioSnapshot.findMany({
    where: {
      userId,
      OR: [{ year: { gt: fromYear } }, { year: fromYear, month: { gte: fromMonth } }],
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  if (snapshots.length === 0) return;

  const years = [...new Set(snapshots.map((s) => s.year))];
  for (const year of years) {
    const series = await computeEvolucaoSeriesDoAno(userId, year);
    for (const snapshot of snapshots.filter((s) => s.year === year)) {
      const valor = Math.round(series[snapshot.month] * 100) / 100;
      if (valor === snapshot.valor) continue;
      await prisma.cashflowPatrimonioSnapshot.update({
        where: { id: snapshot.id },
        data: { valor },
      });
    }
  }
}

/** Data civil em horário de Brasília (UTC−3, sem horário de verão desde 2019). */
const toBrasiliaParts = (now: Date) => {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return { year: brt.getUTCFullYear(), month: brt.getUTCMonth(), day: brt.getUTCDate() };
};

/** Dia (1-31) do último dia útil B3 do mês. */
export function lastBusinessDayOfMonth(year: number, month: number): number {
  let cursor = Date.UTC(year, month + 1, 0); // último dia civil do mês
  while (isNonBusinessDayB3(cursor)) cursor -= DAY_MS;
  return new Date(cursor).getUTCDate();
}

export interface EvolucaoSnapshotJobResult {
  skipped: boolean;
  reason?: string;
  year?: number;
  month?: number;
  users?: number;
  errors?: number;
}

/**
 * Job do cron: no último dia útil do mês (horário de Brasília), trava a
 * Evolução do Patrimônio do mês corrente para todos os usuários. Roda
 * diariamente; nos demais dias retorna `skipped`. `force` ignora a checagem
 * de data (reprocessos manuais).
 */
export async function runCashflowEvolucaoSnapshotJob(
  now: Date = new Date(),
  force = false,
): Promise<EvolucaoSnapshotJobResult> {
  const { year, month, day } = toBrasiliaParts(now);

  if (!force && day !== lastBusinessDayOfMonth(year, month)) {
    return { skipped: true, reason: 'não é o último dia útil do mês' };
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  let ok = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const valor = await computeEvolucaoDoMes(user.id, year, month);
      await prisma.cashflowPatrimonioSnapshot.upsert({
        where: { userId_year_month: { userId: user.id, year, month } },
        create: { userId: user.id, year, month, valor },
        update: { valor },
      });
      ok++;
    } catch (error) {
      errors++;
      logger.error(`[cashflow-evolucao-snapshot] usuário ${user.id}:`, error);
    }
  }

  return { skipped: false, year, month, users: ok, errors };
}
