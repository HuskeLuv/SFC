import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';
import { aporteSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { invalidatePortfolioSnapshots } from '@/services/portfolio/portfolioRecalculation';
import { isShareBasedAssetType } from '@/lib/assetClassification';
import { isDataFutura } from '@/utils/formatDate';
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
  const isReinvestimento = parsed.data.isReinvestimento === true;

  // Não existe cotação futura — aporte datado à frente corrompe a série
  // (mesma regra do resgate; pedido dos testers, 2026-08-06).
  if (isDataFutura(new Date(dataAporte))) {
    return NextResponse.json({ error: 'Data do aporte não pode ser futura' }, { status: 400 });
  }

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

  // Opção 3: aporte é operação de VALOR (renda-fixa/reservas/seguro). Ativos
  // share-based (ação/FII/ETF/REIT/BDR, cripto, moedas, fundos CVM, opções)
  // crescem via Comprar — aportar valor neles grava uma transação quantity=1
  // que envenena o recálculo por cotas (auditoria 2026-08-06, achado #6:
  // fundo com 812,5 cotas + aporte → recalc devolvia 813,5).
  if (isShareBasedAssetType(portfolio.asset?.type)) {
    return NextResponse.json(
      {
        error:
          'Este ativo é negociado em cotas — use "Comprar" para adicionar posição. Aporte é para renda fixa, reservas e seguros.',
      },
      { status: 400 },
    );
  }

  const dataTransacao = new Date(dataAporte);
  const quantity = 1;
  const price = valorAporte;
  const total = valorAporte;

  // 'reinvestimento' = dinheiro que já estava investido (rolagem de título,
  // posição pré-existente): sai das linhas automáticas de Aporte/Resgate do
  // Fluxo de Caixa e dos fluxos externos do MWR (mesma semântica do F1.10).
  const notesData = JSON.stringify({
    operation: {
      action: isReinvestimento ? 'reinvestimento' : 'aporte',
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

  const novoTotalInvestido = portfolio.totalInvested + valorAporte;
  const novaQuantidade = portfolio.quantity || 1;
  const novoPrecoMedio = novoTotalInvestido / novaQuantidade;

  // Transação + mutação do Portfolio/FI no MESMO $transaction (mesma correção
  // do resgate na auditoria 2026-08-06). Report Pedro 10/08: escrita em duas
  // etapas deixava transação órfã quando a segunda falhava — o aporte "sumia"
  // da posição mas inflava a linha Aporte/Resgate do fluxo de caixa.
  const transacao = await prisma.$transaction(async (tx) => {
    const novaTransacao = await tx.stockTransaction.create({
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

    await tx.portfolio.update({
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
      await tx.fixedIncomeAsset.updateMany({
        where: { userId: targetUserId, assetId: portfolio.assetId },
        data: { investedAmount: novoTotalInvestido },
      });
    }

    return novaTransacao;
  });

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
