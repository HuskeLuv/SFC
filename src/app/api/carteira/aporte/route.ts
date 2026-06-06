import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';
import { aporteSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { invalidatePortfolioSnapshots } from '@/services/portfolio/portfolioRecalculation';
import { isEquityAssetType } from '@/lib/assetClassification';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  const body = await request.json();

  const parsed = aporteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { portfolioId, dataAporte, valorAporte, tipoAtivo, instituicaoId } = parsed.data;

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: targetUserId },
    include: { asset: true },
  });

  if (!portfolio) {
    return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });
  }

  // Opção 3: aporte é operação de VALOR (renda-fixa/reservas). Ativos share-based
  // (ação/FII/ETF/REIT) crescem via Comprar — aportar valor neles contaria como
  // cota e corromperia o recálculo. Rejeita e orienta o usuário.
  if (isEquityAssetType(portfolio.asset?.type)) {
    return NextResponse.json(
      {
        error:
          'Para ações, FIIs, ETFs e REITs use "Comprar" para adicionar cotas. Aporte é para renda fixa e reservas.',
      },
      { status: 400 },
    );
  }

  const dataTransacao = new Date(dataAporte);
  const quantity = 1;
  const price = valorAporte;
  const total = valorAporte;

  const notesData = JSON.stringify({
    operation: {
      action: 'aporte',
      performedBy: {
        userId: payload.id,
        role: payload.role,
        actingClient: actingClient || null,
      },
      targetUserId,
      portfolioId,
      tipoAtivo,
      instituicaoId,
      assetId: portfolio.assetId,
      symbol: portfolio.asset?.symbol || null,
      name: portfolio.asset?.name || null,
      quantity,
      price,
      total,
      date: dataTransacao.toISOString(),
    },
  });

  const transacao = await prisma.stockTransaction.create({
    data: {
      userId: targetUserId,
      assetId: portfolio.assetId!,
      type: 'compra',
      quantity,
      price,
      total,
      date: dataTransacao,
      fees: 0,
      notes: notesData,
    },
  });

  const novoTotalInvestido = portfolio.totalInvested + valorAporte;
  const novaQuantidade = portfolio.quantity || 1;
  const novoPrecoMedio = novoTotalInvestido / novaQuantidade;

  await prisma.portfolio.update({
    where: { id: portfolio.id },
    data: {
      totalInvested: novoTotalInvestido,
      avgPrice: novoPrecoMedio,
      lastUpdate: new Date(),
    },
  });

  // Bug #15 (residual): aporte em RF atualizava só Portfolio.totalInvested,
  // deixando FixedIncomeAsset.investedAmount preso no valor inicial — daí a
  // divergência entre a aba Renda Fixa (lê portfolio.totalInvested) e a tela
  // de detalhes do ativo (lê fi.investedAmount). updateMany é no-op pra
  // assets sem FI vinculado (ações, FIIs, etc).
  if (portfolio.assetId) {
    await prisma.fixedIncomeAsset.updateMany({
      where: { userId: targetUserId, assetId: portfolio.assetId },
      data: { investedAmount: novoTotalInvestido },
    });
  }

  // Item A (auditoria 2026-05-19): #02 só cobriu PATCH/DELETE de
  // historico/transacao. Aporte em data passada deixava snapshots stale entre
  // [dataAporte, hoje] → série de MWR/TWR carregava do cache antigo ignorando
  // o novo fluxo. Invalidar força o reader a cair no live builder até o cron
  // diário repopular.
  await invalidatePortfolioSnapshots(targetUserId, dataTransacao);

  const result = NextResponse.json({ success: true, transacao }, { status: 201 });

  if (actingClient) {
    await logDataUpdate(
      request,
      { id: payload.id, role: payload.role },
      targetUserId,
      actingClient,
      '/api/carteira/aporte',
      'POST',
      body,
      { success: true },
    );
  }

  return result;
});
