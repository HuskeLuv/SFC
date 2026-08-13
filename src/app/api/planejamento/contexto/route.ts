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
import { isReinvestimentoTransaction } from '@/services/cashflow/investimentosPorMes';
import {
  DEFAULT_INFLACAO_AA as DEFAULT_INFLACAO,
  getCdiAnualizado,
  getInflacao12m,
} from '@/services/market/economicRates';

const round2 = (v: number) => Math.round(v * 100) / 100;

const isReservaEmergenciaItem = (asset: { type: string; symbol: string } | null): boolean =>
  asset?.type === 'emergency' || asset?.symbol?.startsWith('RESERVA-EMERG') === true;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const now = new Date();
  const currentYear = now.getFullYear();
  const dozeMesesAtras = new Date(now);
  dozeMesesAtras.setFullYear(dozeMesesAtras.getFullYear() - 1);

  const [portfolioAgg, reservaItems, transacoesUlt12m, cdiAnualizado, inflacao12m, cashflowGroups] =
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
          assetId: true,
          planejamentoObjetivoId: true,
          vinculoAposentadoria: true,
          asset: { select: { type: true, symbol: true } },
        },
      }),
      prisma.stockTransaction.findMany({
        where: {
          userId: targetUserId,
          type: { in: ['compra', 'venda'] },
          date: { gte: dozeMesesAtras },
        },
        select: {
          assetId: true,
          type: true,
          total: true,
          price: true,
          quantity: true,
          notes: true,
        },
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

  // Vínculos de planejamento: assets de sonho saem da média geral (esse
  // dinheiro pertence à meta do sonho); assets de aposentadoria têm média
  // própria, que alimenta o `aporteM` automático do simulador.
  const assetsDeSonho = new Set(
    reservaItems.filter((p) => p.planejamentoObjetivoId && p.assetId).map((p) => p.assetId),
  );
  const assetsAposentadoria = new Set(
    reservaItems.filter((p) => p.vinculoAposentadoria && p.assetId).map((p) => p.assetId),
  );

  const valorLiquido = (t: (typeof transacoesUlt12m)[number]) => {
    if (isReinvestimentoTransaction(t.notes)) return 0;
    const total = Number(t.total);
    const abs = Number.isFinite(total) && total > 0 ? total : t.price * t.quantity;
    return t.type === 'venda' ? -abs : abs;
  };

  // Líquido 12m (compras − vendas, excl. reinvestimento e assets de sonho).
  const aporteUlt12mTotal = transacoesUlt12m.reduce(
    (sum, t) => (t.assetId && assetsDeSonho.has(t.assetId) ? sum : sum + valorLiquido(t)),
    0,
  );
  const aporteMensalRealizado = round2(aporteUlt12mTotal / 12);

  // Média 12m dos assets vinculados à aposentadoria (null sem vínculo).
  let aporteMensalAposentadoria: number | null = null;
  if (assetsAposentadoria.size > 0) {
    const totalAposentadoria = transacoesUlt12m.reduce(
      (sum, t) => (t.assetId && assetsAposentadoria.has(t.assetId) ? sum + valorLiquido(t) : sum),
      0,
    );
    aporteMensalAposentadoria = round2(totalAposentadoria / 12);
  }

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
    aporteMensalAposentadoria,
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
