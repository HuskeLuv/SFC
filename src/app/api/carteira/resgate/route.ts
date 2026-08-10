import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';
import { resgateSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  invalidatePortfolioSnapshots,
  recalculatePortfolioFromTransactions,
} from '@/services/portfolio/portfolioRecalculation';
import { isShareBasedAssetType } from '@/lib/assetClassification';
import { mapPortfolioToTipo } from '@/lib/portfolioTipoMapping';
import { isDataFutura } from '@/utils/formatDate';
import {
  recordChange,
  diffFields,
  assetEntityLabel,
  TRANSACTION_FIELD_LABELS,
} from '@/services/changeHistory';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  const body = await request.json();

  const parsed = resgateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const {
    portfolioId,
    dataResgate,
    metodoResgate,
    quantidade,
    cotacaoUnitaria,
    valorResgate,
    instituicaoId,
    observacoes,
  } = parsed.data;

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: targetUserId },
    include: { asset: true },
  });

  if (!portfolio) {
    return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });
  }

  // Rodada 3 (achado #12): portfolio legado sem vínculo de Asset passava e a
  // rota criava uma StockTransaction com assetId null — venda órfã que o
  // recalc por histórico e o sync de FI ignoram. Mesmo padrão do
  // ativos/[id]/portfolio.
  if (!portfolio.assetId) {
    return NextResponse.json(
      { error: 'Investimento sem vínculo de ativo — não é possível resgatar' },
      { status: 400 },
    );
  }

  const tipoAtivo = mapPortfolioToTipo(portfolio);
  const availableQuantity = portfolio.quantity;
  const availableTotal = portfolio.totalInvested;

  const extractInstitutionId = (notes?: string | null) => {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      return parsed?.operation?.instituicaoId || null;
    } catch {
      return null;
    }
  };

  if (instituicaoId) {
    const latestCompra = await prisma.stockTransaction.findFirst({
      where: {
        userId: targetUserId,
        type: 'compra',
        assetId: portfolio.assetId!,
      },
      orderBy: { date: 'desc' },
    });
    const institutionFromNotes = extractInstitutionId(latestCompra?.notes);
    if (instituicaoId === 'unknown' && institutionFromNotes) {
      return NextResponse.json(
        { error: 'Instituição inválida para este investimento' },
        { status: 400 },
      );
    }
    if (
      instituicaoId !== 'unknown' &&
      institutionFromNotes &&
      instituicaoId !== institutionFromNotes
    ) {
      return NextResponse.json(
        { error: 'Instituição inválida para este investimento' },
        { status: 400 },
      );
    }
  }

  if (metodoResgate === 'quantidade') {
    if (!quantidade || quantidade <= 0) {
      return NextResponse.json({ error: 'Quantidade inválida' }, { status: 400 });
    }
    if (quantidade > availableQuantity) {
      return NextResponse.json({ error: 'Quantidade maior que o disponível' }, { status: 400 });
    }
    if (!cotacaoUnitaria || cotacaoUnitaria <= 0) {
      return NextResponse.json({ error: 'Cotação unitária inválida' }, { status: 400 });
    }
  }

  if (metodoResgate === 'valor') {
    if (!valorResgate || valorResgate <= 0) {
      return NextResponse.json({ error: 'Valor de resgate inválido' }, { status: 400 });
    }
    // SEM teto de availableTotal aqui: availableTotal é o CUSTO (totalInvested),
    // não o valor de mercado — um CDB de 10k que rendeu para 12,4k precisa poder
    // resgatar os 12,4k (auditoria 2026-08-06, achado #10). Resgate por valor
    // >= custo consome a base toda e encerra a posição (novaQuantidade 0 abaixo);
    // o ganho acima do custo é receita, não base.
    // Estrito (!== 1, não > 1): posição fracionária (0,5 BTC, cotas 812,5) caía
    // no cálculo qty − 1 → novaQuantidade negativa → ramo de resgate TOTAL →
    // portfolio.delete. Resgatar R$100 apagava a posição inteira (auditoria
    // 2026-08-06, achado #2). Valor é só para posições value-based (qty 1).
    if (availableQuantity !== 1) {
      return NextResponse.json(
        { error: 'Resgate por valor disponível apenas para investimentos com quantidade 1' },
        { status: 400 },
      );
    }
  }

  const dataTransacao = new Date(dataResgate);

  // Validação de data (auditoria 2026-08-06, achado #7): sem isso a rota
  // aceitava resgate datado de 2030 ou anterior à compra — e o recalc por
  // histórico processaria uma venda antes da compra correspondente.
  if (isDataFutura(dataTransacao)) {
    return NextResponse.json({ error: 'Data do resgate não pode ser futura' }, { status: 400 });
  }
  if (portfolio.assetId) {
    const primeiraCompra = await prisma.stockTransaction.findFirst({
      where: { userId: targetUserId, assetId: portfolio.assetId, type: 'compra' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (primeiraCompra && dataTransacao < primeiraCompra.date) {
      return NextResponse.json(
        { error: 'Data do resgate não pode ser anterior à primeira compra do ativo' },
        { status: 400 },
      );
    }
  }

  const quantityResgate = metodoResgate === 'valor' ? 1 : quantidade!;
  const priceResgate = metodoResgate === 'valor' ? valorResgate! : cotacaoUnitaria!;
  const totalResgate = metodoResgate === 'valor' ? valorResgate! : quantityResgate * priceResgate;

  const notesData = JSON.stringify({
    observacoes: observacoes || undefined,
    operation: {
      action: 'resgate',
      performedBy: {
        userId: payload.id,
        role: payload.role,
        actingClient: actingClient || null,
      },
      targetUserId,
      portfolioId,
      tipoAtivo,
      instituicaoId: instituicaoId || null,
      assetId: portfolio.assetId,
      symbol: portfolio.asset?.symbol || '',
      name: portfolio.asset?.name || '',
      metodoResgate,
      quantity: quantityResgate,
      price: priceResgate,
      total: totalResgate,
      dataResgate: dataTransacao.toISOString(),
      availableBefore: {
        quantity: availableQuantity,
        total: availableTotal,
      },
    },
  });

  const isResgatePorValor = metodoResgate === 'valor';
  const novaQuantidade =
    isResgatePorValor && availableQuantity === 1
      ? totalResgate >= availableTotal
        ? 0
        : 1
      : availableQuantity - quantityResgate;
  const resgateTotal = novaQuantidade <= 0;
  const shareBased = isShareBasedAssetType(portfolio.asset?.type) && !!portfolio.assetId;

  // Venda + mutação do Portfolio/FI no MESMO $transaction (auditoria
  // 2026-08-06, achado #11): antes, falha entre o create e o update/delete
  // deixava a venda registrada com a posição intacta (dupla contagem no
  // MWR/IR). O ramo share-based só grava a venda aqui — o recalc roda depois
  // e é idempotente (source of truth pelas transações).
  const transacao = await prisma.$transaction(async (tx) => {
    const novaTransacao = await tx.stockTransaction.create({
      data: {
        userId: targetUserId,
        assetId: portfolio.assetId!,
        type: 'venda',
        quantity: quantityResgate,
        price: priceResgate,
        total: totalResgate,
        date: dataTransacao,
        fees: 0,
        notes: notesData,
      },
    });

    if (resgateTotal) {
      await tx.portfolio.delete({ where: { id: portfolio.id } });
      // Resgate total: remove FI órfão (FK em Asset, não em Portfolio — sobrava
      // sem o portfolio que apontava pra ele). Sem isso, futuras buscas e o
      // pricer pegam um FI sem dono.
      if (portfolio.assetId) {
        await tx.fixedIncomeAsset.deleteMany({
          where: { userId: targetUserId, assetId: portfolio.assetId },
        });
      }
    } else if (!shareBased) {
      // Value-based (renda-fixa/reservas): cálculo inline.
      const novoTotalInvestido = Math.max(availableTotal - totalResgate, 0);
      const novoPrecoMedio = novoTotalInvestido / novaQuantidade;
      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: {
          quantity: novaQuantidade,
          totalInvested: novoTotalInvestido,
          avgPrice: novoPrecoMedio,
          lastUpdate: new Date(),
        },
      });
      // Bug #15 (residual): resgate parcial em RF atualizava só Portfolio,
      // deixando FixedIncomeAsset.investedAmount com o valor antigo. updateMany
      // é no-op pra assets sem FI vinculado.
      if (portfolio.assetId) {
        await tx.fixedIncomeAsset.updateMany({
          where: { userId: targetUserId, assetId: portfolio.assetId },
          data: { investedAmount: novoTotalInvestido },
        });
      }
    }

    return novaTransacao;
  });

  if (!resgateTotal && shareBased) {
    // Opção 3 / eventos corporativos: venda parcial de ativo share-based recalcula
    // pela source of truth, que (a) aplica eventos corporativos e (b) remove o
    // CUSTO PROPORCIONAL — o cálculo inline subtraía a RECEITA da venda do custo,
    // distorcendo o avgPrice. O recalc também invalida os snapshots internamente.
    // Desde a auditoria 2026-08-06 (achado #3) isso cobre também cripto, moedas,
    // opções e fundos CVM (Fase 2) — antes só equity.
    await recalculatePortfolioFromTransactions({
      targetUserId,
      assetId: portfolio.assetId!,
      portfolioId: portfolio.id,
      recomputeSnapshotsFrom: dataTransacao,
    });
  } else {
    // Item A (auditoria 2026-05-19): resgate em data passada deixava snapshots
    // stale entre [dataResgate, hoje]. Mesma justificativa do aporte.
    await invalidatePortfolioSnapshots(targetUserId, dataTransacao);
  }

  // Ativo vinculado a um sonho: a venda abate o realizado (líquido) do mês.
  // Passa o objetivoId capturado ANTES das mutações: no resgate total o
  // Portfolio (onde mora o vínculo) já foi deletado, e o resolve por assetId
  // fazia early-return silencioso — o realizado ficava congelado para sempre
  // (auditoria 2026-08-06, achado #8).
  if (portfolio.planejamentoObjetivoId) {
    await syncSonhoRealizadoBestEffort(targetUserId, {
      objetivoId: portfolio.planejamentoObjetivoId,
    });
  } else if (portfolio.assetId) {
    await syncSonhoRealizadoBestEffort(targetUserId, { assetId: portfolio.assetId });
  }

  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'resgate.registrar',
    entity: 'resgate',
    entityId: transacao.id,
    entityLabel: assetEntityLabel(portfolio.asset),
    changes: diffFields({}, transacao, TRANSACTION_FIELD_LABELS),
  });

  const result = NextResponse.json(
    { success: true, transacao, message: 'Resgate realizado com sucesso!' },
    { status: 201 },
  );

  if (actingClient) {
    await logDataUpdate(
      request,
      { id: payload.id, role: payload.role },
      targetUserId,
      actingClient,
      '/api/carteira/resgate',
      'POST',
      body,
      { success: true },
    );
  }

  return result;
});
