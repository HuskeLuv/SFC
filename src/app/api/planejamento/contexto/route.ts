/**
 * GET /api/planejamento/contexto
 *
 * Agregador único de insumos para auto-preencher o planejamento financeiro
 * (Sonhos e Aposentadoria), integrando carteira + fluxo de caixa + índices.
 *
 * Substitui os defaults isolados (`/api/aposentadoria/defaults`,
 * `/api/planejamento-sonhos/defaults`), que só liam Portfolio.totalInvested +
 * CDI. Cada consumidor lê os campos de que precisa e marca a procedência
 * ("da sua carteira", "da sua sobra de caixa") no modelo híbrido com override.
 *
 * Performance: evita o `carteira/resumo` completo (snapshots/séries). Usa
 * agregados diretos do Prisma + a agregação pura do fluxo de caixa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { aggregateCashflow, type CashflowAverages } from '@/services/cashflow/cashflowAggregation';

const DEFAULT_INFLACAO = 4.5; // % a.a. fallback (meta BCB) se não houver série IPCA.

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

const isReservaEmergenciaItem = (asset: { type: string; symbol: string } | null): boolean =>
  asset?.type === 'emergency' || asset?.symbol?.startsWith('RESERVA-EMERG') === true;

/** CDI anualizado mais recente (% a.a.), validado. Null se indisponível. */
async function getCdiAnualizado(): Promise<number | null> {
  const latest = await prisma.economicIndex.findFirst({
    where: { indexType: 'CDI_ANUALIZADO' },
    orderBy: { date: 'desc' },
    select: { value: true },
  });
  if (!latest) return null;
  const cdi = Number(latest.value);
  if (!Number.isFinite(cdi) || cdi <= 0 || cdi >= 100) return null;
  return round1(cdi);
}

/**
 * Inflação acumulada nos últimos 12 meses (% a.a.), compondo as variações
 * mensais do IPCA (cada registro vem como fração, ex.: 0.0045 = 0,45%/mês).
 * Null se não houver 12 registros — o consumidor cai no fallback.
 */
async function getInflacao12m(): Promise<number | null> {
  const records = await prisma.economicIndex.findMany({
    where: { indexType: 'IPCA' },
    orderBy: { date: 'desc' },
    take: 12,
    select: { value: true },
  });
  if (records.length < 12) return null;
  let acumulado = 1;
  for (const r of records) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) return null;
    acumulado *= 1 + v;
  }
  return round1((acumulado - 1) * 100);
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const now = new Date();
  const currentYear = now.getFullYear();
  const dozeMesesAtras = new Date(now);
  dozeMesesAtras.setFullYear(dozeMesesAtras.getFullYear() - 1);

  const [portfolioAgg, reservaItems, comprasUlt12m, cdiAnualizado, inflacao12m, cashflowGroups] =
    await Promise.all([
      prisma.portfolio.aggregate({
        where: { userId: targetUserId },
        _sum: { totalInvested: true },
      }),
      prisma.portfolio.findMany({
        where: { userId: targetUserId },
        select: {
          totalInvested: true,
          quantity: true,
          avgPrice: true,
          asset: { select: { type: true, symbol: true } },
        },
      }),
      prisma.stockTransaction.findMany({
        where: { userId: targetUserId, type: 'compra', date: { gte: dozeMesesAtras } },
        select: { total: true, price: true, quantity: true },
      }),
      getCdiAnualizado(),
      getInflacao12m(),
      getMergedCashflowGroups(targetUserId, currentYear),
    ]);

  const patrimonio = round2(Number(portfolioAgg._sum.totalInvested ?? 0));

  const reservaEmergenciaAtual = round2(
    reservaItems
      .filter((p) => isReservaEmergenciaItem(p.asset))
      .reduce((sum, p) => sum + Math.max(p.totalInvested, p.quantity * p.avgPrice), 0),
  );

  const aporteUlt12mTotal = comprasUlt12m.reduce((sum, t) => {
    const total = Number(t.total);
    return sum + (Number.isFinite(total) && total > 0 ? total : t.price * t.quantity);
  }, 0);
  const aporteMensalRealizado = round2(aporteUlt12mTotal / 12);

  // Agregação do fluxo de caixa do ano corrente. Se ainda não há meses
  // preenchidos (início do ano), recai no ano anterior para uma sugestão útil.
  let cashflowYear = currentYear;
  let averages: CashflowAverages = aggregateCashflow(cashflowGroups).averages;
  if (averages.activeMonths === 0) {
    const prevGroups = await getMergedCashflowGroups(targetUserId, currentYear - 1);
    const prevAverages = aggregateCashflow(prevGroups).averages;
    if (prevAverages.activeMonths > 0) {
      averages = prevAverages;
      cashflowYear = currentYear - 1;
    }
  }

  return NextResponse.json({
    asOf: now.toISOString(),
    patrimonio,
    reservaEmergenciaAtual,
    aporteMensalRealizado,
    cdiAnualizado,
    inflacao12m,
    inflacaoFallback: DEFAULT_INFLACAO,
    cashflow: {
      year: cashflowYear,
      activeMonths: averages.activeMonths,
      sobraMensalMedia: averages.sobraMensalMedia,
      despesaMensalMedia: averages.despesaMensalMedia,
      despesaFixaMensal: averages.despesaFixaMensal,
    },
  });
});
