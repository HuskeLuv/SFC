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
import { isEquityAssetType } from '@/lib/assetClassification';
import { recordChange, assetEntityLabel } from '@/services/changeHistory';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';

const mapPortfolioToTipo = (item: { asset?: { type?: string | null } | null }) => {
  const assetType = item.asset?.type || '';
  // Pós-consolidação: ações B3 e FIIs também viram Asset (type='stock' / 'fii').
  if (assetType === 'stock') return 'acao';
  if (assetType === 'fii') return 'fii';
  switch (assetType) {
    case 'emergency':
      return 'reserva-emergencia';
    case 'opportunity':
      return 'reserva-oportunidade';
    case 'personalizado':
      return 'personalizado';
    case 'imovel':
      return 'imoveis-bens';
    case 'crypto':
      return 'criptoativo';
    case 'currency':
      return 'moeda';
    case 'etf':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'bdr':
      return 'bdr';
    case 'fund':
      return 'fundo';
    case 'bond':
      return 'renda-fixa-prefixada';
    case 'insurance':
      return 'previdencia';
    case 'cash':
      return 'conta-corrente';
    default:
      return assetType || 'personalizado';
  }
};

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
    if (valorResgate > availableTotal) {
      return NextResponse.json({ error: 'Valor maior que o disponível' }, { status: 400 });
    }
    if (availableQuantity > 1) {
      return NextResponse.json(
        { error: 'Resgate por valor disponível apenas para investimentos com quantidade 1' },
        { status: 400 },
      );
    }
  }

  const dataTransacao = new Date(dataResgate);
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

  const transacao = await prisma.stockTransaction.create({
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

  const isResgatePorValor = metodoResgate === 'valor';
  const novaQuantidade =
    isResgatePorValor && availableQuantity === 1
      ? totalResgate >= availableTotal
        ? 0
        : 1
      : availableQuantity - quantityResgate;

  if (novaQuantidade <= 0) {
    await prisma.portfolio.delete({ where: { id: portfolio.id } });
    // Resgate total: remove FI órfão (FK em Asset, não em Portfolio — sobrava
    // sem o portfolio que apontava pra ele). Sem isso, futuras buscas e o
    // pricer pegam um FI sem dono.
    if (portfolio.assetId) {
      await prisma.fixedIncomeAsset.deleteMany({
        where: { userId: targetUserId, assetId: portfolio.assetId },
      });
    }
    // Item A (auditoria 2026-05-19): resgate em data passada deixava snapshots
    // stale entre [dataResgate, hoje]. Mesma justificativa do aporte.
    await invalidatePortfolioSnapshots(targetUserId, dataTransacao);
  } else if (isEquityAssetType(portfolio.asset?.type) && portfolio.assetId) {
    // Opção 3 / eventos corporativos: venda parcial de ativo share-based recalcula
    // pela source of truth, que (a) aplica eventos corporativos e (b) remove o
    // CUSTO PROPORCIONAL — o cálculo inline subtraía a RECEITA da venda do custo,
    // distorcendo o avgPrice. O recalc também invalida os snapshots internamente.
    await recalculatePortfolioFromTransactions({
      targetUserId,
      assetId: portfolio.assetId,
      portfolioId: portfolio.id,
      recomputeSnapshotsFrom: dataTransacao,
    });
  } else {
    // Value-based (renda-fixa/reservas): cálculo inline.
    const novoTotalInvestido = Math.max(availableTotal - totalResgate, 0);
    const novoPrecoMedio = novoTotalInvestido / novaQuantidade;
    await prisma.portfolio.update({
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
      await prisma.fixedIncomeAsset.updateMany({
        where: { userId: targetUserId, assetId: portfolio.assetId },
        data: { investedAmount: novoTotalInvestido },
      });
    }
    await invalidatePortfolioSnapshots(targetUserId, dataTransacao);
  }

  // Ativo vinculado a um sonho: a venda abate o realizado (líquido) do mês.
  if (portfolio.assetId) {
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
