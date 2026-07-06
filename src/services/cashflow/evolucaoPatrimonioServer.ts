import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isNonBusinessDayB3 } from '@/utils/feriadosB3';
import { getMergedCashflowGroups } from './getCashflowTree';
import { aggregateCashflow } from './cashflowAggregation';
import { buildFluxoLivreByMonth, computeEvolucaoSeries } from './evolucaoPatrimonioSeries';
import type { CashflowGroup } from '@/types/cashflow';

/**
 * Lado server da Evolução do Patrimônio: coleta de insumos (base aplicada,
 * aportes por mês, conta corrente) e job de snapshot mensal que trava o valor
 * no último dia útil de cada mês (regra Pedro Haddad).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Total nominal aplicado até 31/dez do ano anterior: Σ (total + fees) das
 * compras − Σ (total + fees) das vendas. É a "aplicação inicial" da planilha —
 * sem marcação a mercado.
 */
export async function getBaseAplicadaAnterior(userId: string, year: number): Promise<number> {
  const grouped = await prisma.stockTransaction.groupBy({
    by: ['type'],
    where: {
      userId,
      type: { in: ['compra', 'venda'] },
      date: { lt: new Date(Date.UTC(year, 0, 1)) },
    },
    _sum: { total: true, fees: true },
  });

  let base = 0;
  for (const row of grouped) {
    const valor = (row._sum.total ?? 0) + (row._sum.fees ?? 0);
    base += row.type === 'venda' ? -valor : valor;
  }
  return Math.round(base * 100) / 100;
}

/** Detecta compra feita com provento reinvestido (não é capital novo do bolso). */
const isReinvestimento = (notes: string | null): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/**
 * Aportes (+) / resgates (−) por mês do ano, excluindo reinvestimentos de
 * proventos — mesma semântica de `GET /api/cashflow/investimentos`
 * (totaisPorMes), que alimenta a linha Aporte/Resgate da planilha.
 */
export async function getAportesPorMes(userId: string, year: number): Promise<number[]> {
  const transacoes = await prisma.stockTransaction.findMany({
    where: {
      userId,
      type: { in: ['compra', 'venda'] },
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    select: { date: true, type: true, total: true, fees: true, notes: true },
  });

  const totais = Array(12).fill(0);
  for (const t of transacoes) {
    if (isReinvestimento(t.notes)) continue;
    const valor = (t.total + (t.fees || 0)) * (t.type === 'venda' ? -1 : 1);
    totais[t.date.getMonth()] += valor;
  }
  return totais.map((v) => Math.round(v * 100) / 100);
}

/** Saldo do bloco Conta Corrente (type='saldo') em dezembro de `year`. */
export async function getSaldoContaCorrenteDezembro(userId: string, year: number): Promise<number> {
  const result = await prisma.cashflowValue.aggregate({
    _sum: { value: true },
    where: { userId, year, month: 11, item: { group: { type: 'saldo' } } },
  });
  return result._sum.value ?? 0;
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
 * Calcula o valor da Evolução do Patrimônio de um mês para um usuário,
 * server-side, com os mesmos módulos puros usados pela planilha.
 */
export async function computeEvolucaoDoMes(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const [groups, aportesByMonth, saldoDezembroAnterior, baseAplicada] = await Promise.all([
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
    aportesByMonth,
  });

  const series = computeEvolucaoSeries({
    baseAplicada,
    aportesByMonth,
    fluxoLivreByMonth,
    snapshotByMonth: {},
    realUpTo: month,
  });

  return Math.round(series[month] * 100) / 100;
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
