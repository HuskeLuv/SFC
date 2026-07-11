import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';
import { aporteSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { invalidatePortfolioSnapshots } from '@/services/portfolio/portfolioRecalculation';
import { isEquityAssetType } from '@/lib/assetClassification';
import {
  recordChange,
  diffFields,
  assetEntityLabel,
  TRANSACTION_FIELD_LABELS,
} from '@/services/changeHistory';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';
import { aplicarVinculoPlanejamento } from '@/utils/planejamentoVinculo';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  const body = await request.json();

  const parsed = aporteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { portfolioId, dataAporte, valorAporte, tipoAtivo, instituicaoId } = parsed.data;
  const { vinculoTipo, vinculoObjetivoId } = parsed.data;

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: targetUserId },
    include: { asset: true },
  });

  if (!portfolio) {
    return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });
  }

  // Vínculo com planejamento (quando enviado): grava no Portfolio antes de
  // registrar o aporte — o sync do realizado do sonho já enxerga o vínculo.
  let vinculoAnteriorObjetivoId: string | null = null;
  if (vinculoTipo !== undefined && portfolio.assetId) {
    const vinculo = await aplicarVinculoPlanejamento({
      userId: targetUserId,
      assetId: portfolio.assetId,
      vinculoTipo,
      vinculoObjetivoId,
    });
    if (!vinculo.ok) {
      return NextResponse.json({ error: vinculo.error }, { status: 400 });
    }
    vinculoAnteriorObjetivoId = vinculo.previousObjetivoId;
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

  // Ativo vinculado a um sonho: o aporte vira realizado da linha-espelho.
  if (portfolio.assetId) {
    await syncSonhoRealizadoBestEffort(targetUserId, { assetId: portfolio.assetId });
  }
  // Vínculo mudou de sonho: re-sincroniza a linha-espelho do sonho anterior.
  if (vinculoAnteriorObjetivoId && vinculoAnteriorObjetivoId !== vinculoObjetivoId) {
    await syncSonhoRealizadoBestEffort(targetUserId, { objetivoId: vinculoAnteriorObjetivoId });
  }

  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'aporte.registrar',
    entity: 'aporte',
    entityId: transacao.id,
    entityLabel: assetEntityLabel(portfolio.asset),
    changes: diffFields({}, transacao, TRANSACTION_FIELD_LABELS),
  });

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
