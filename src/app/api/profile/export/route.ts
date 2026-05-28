/**
 * GET /api/profile/export — portabilidade dos dados pessoais (Art. 18, V).
 *
 * Retorna JSON estruturado com tudo o que a plataforma armazena sobre o
 * usuário: perfil, portfolio, transações, fluxo de caixa, planejamento,
 * notificações, consentimentos. Faz download direto com
 * Content-Disposition.
 *
 * Sem rate limit dedicado por enquanto — o middleware aplica o tier API
 * (60/min) que cobre o caso comum. Se virar gargalo, dedicar tier mais
 * baixo (1-2 exports/dia por user).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const userId = payload.id;

  const [
    user,
    consents,
    portfolios,
    stockTransactions,
    portfolioProventos,
    fixedIncomeAssets,
    cashflowItems,
    cashflowValues,
    cashflowGroups,
    planejamentoObjetivos,
    notifications,
    watchlists,
    alocacaoConfigs,
    portfolioGoal,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    }),
    prisma.userConsent.findMany({ where: { userId } }),
    prisma.portfolio.findMany({ where: { userId }, include: { asset: true } }),
    prisma.stockTransaction.findMany({ where: { userId }, include: { asset: true } }),
    prisma.portfolioProvento.findMany({ where: { userId } }),
    prisma.fixedIncomeAsset.findMany({ where: { userId } }),
    prisma.cashflowItem.findMany({ where: { userId } }),
    prisma.cashflowValue.findMany({ where: { userId } }),
    prisma.cashflowGroup.findMany({ where: { userId } }),
    prisma.planejamentoObjetivo.findMany({ where: { userId }, include: { entries: true } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.watchlist.findMany({ where: { userId } }),
    prisma.alocacaoConfig.findMany({ where: { userId } }),
    prisma.portfolioGoal.findFirst({ where: { userId } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const payload_ = {
    exportedAt: new Date().toISOString(),
    formatVersion: '1.0',
    profile: user,
    consents,
    portfolio: {
      positions: portfolios,
      stockTransactions,
      proventos: portfolioProventos,
      fixedIncomeAssets,
      goal: portfolioGoal,
      watchlists,
      alocacaoConfigs,
    },
    cashflow: {
      items: cashflowItems,
      values: cashflowValues,
      groups: cashflowGroups,
    },
    planejamento: planejamentoObjetivos,
    notifications,
  };

  const json = JSON.stringify(payload_, null, 2);
  const fileName = `myfinance-export-${userId}-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
});
