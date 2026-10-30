import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { ensurePortfolioProventosFromMarket } from '@/lib/ensurePortfolioProventosFromMarket';
import { isCorporateActionAuditTx } from '@/services/portfolio/corporateActions';
import { posicaoEmDolar } from '@/lib/ativoEmDolar';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { aceitaEmissor, ehInstituicaoEmissora } from '@/lib/fgc/produtosCobertos';

const tipoOperacaoMap: Record<string, string> = {
  compra: 'Aporte',
  venda: 'Resgate',
};

const parseInstituicaoIdFromNotes = (notes: string | null): string | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { operation?: { instituicaoId?: string } };
    const instId = parsed?.operation?.instituicaoId;
    return typeof instId === 'string' && instId.length > 0 ? instId : null;
  } catch {
    return null;
  }
};

type EmissorInfo = {
  emissor: { id: string; nome: string; cnpj: string | null; cnpjCalculado: boolean } | null;
  aceitaEmissor: boolean;
  /** Texto do emissor que o Open Finance mandou e não casou com o catálogo. */
  emissorInformadoOpenFinance: string | null;
};

const SEM_EMISSOR: EmissorInfo = {
  emissor: null,
  aceitaEmissor: false,
  emissorInformadoOpenFinance: null,
};

async function carregarEmissor(
  userId: string,
  assetId: string | null,
  symbol: string,
): Promise<EmissorInfo> {
  if (!assetId) return SEM_EMISSOR;
  const fi = await prisma.fixedIncomeAsset.findFirst({
    where: { userId, assetId },
    select: {
      id: true,
      type: true,
      tesouroBondType: true,
      emissor: { select: { id: true, nome: true, cnpj: true, cnpjCalculado: true } },
    },
  });
  if (!fi) return SEM_EMISSOR;
  const doPluggy = /^PLUGGY-RF-/i.test(symbol);
  const bankInvestment = doPluggy
    ? await prisma.bankInvestment.findFirst({
        where: { userId, fixedIncomeAssetId: fi.id },
        select: { subtype: true, issuer: true },
      })
    : null;
  const aceita = aceitaEmissor({
    type: fi.type,
    tesouroBondType: fi.tesouroBondType,
    assetSymbol: symbol,
    pluggySubtype: bankInvestment?.subtype ?? null,
  });
  if (!aceita) return SEM_EMISSOR;
  return {
    emissor: fi.emissor,
    aceitaEmissor: true,
    emissorInformadoOpenFinance:
      !fi.emissor && bankInvestment?.issuer?.trim() ? bankInvestment.issuer.trim() : null,
  };
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfólio não encontrado' }, { status: 404 });
    }

    const ticker = portfolio.asset?.symbol || '';
    const nome = portfolio.asset?.name || ticker;

    const transactions = portfolio.assetId
      ? await prisma.stockTransaction.findMany({
          where: { userId: targetUserId, assetId: portfolio.assetId },
          orderBy: { date: 'desc' },
        })
      : [];

    let instituicaoId: string | null = null;
    let instituicaoNome: string | null = null;
    let corretoraEmissora: boolean | null = null;
    for (const tx of transactions) {
      const instId = parseInstituicaoIdFromNotes(tx.notes);
      if (instId) {
        const inst = await prisma.institution.findUnique({ where: { id: instId } });
        if (inst) {
          instituicaoId = inst.id;
          instituicaoNome = inst.nome;
          corretoraEmissora = ehInstituicaoEmissora(inst);
          break;
        }
      }
    }

    // Banco emissor da renda fixa coberta pelo FGC (ClickUp 86e2xqh69).
    const emissorInfo = await carregarEmissor(targetUserId, portfolio.assetId, ticker);

    const comprasAsc = [...transactions]
      .filter((t) => t.type === 'compra')
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const primeiraCompra = comprasAsc[0] ?? null;

    const movimentacaoInicial = primeiraCompra
      ? {
          id: primeiraCompra.id,
          date: primeiraCompra.date.toISOString(),
          quantity: primeiraCompra.quantity,
          price: primeiraCompra.price,
          total: primeiraCompra.total,
          fees: primeiraCompra.fees,
        }
      : null;

    const operacoes = transactions.map((tx) => ({
      id: tx.id,
      tipoOperacao: tipoOperacaoMap[tx.type] || tx.type,
      tipoRaw: tx.type,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      date: tx.date.toISOString(),
      fees: tx.fees,
      notes: tx.notes,
    }));

    await ensurePortfolioProventosFromMarket({
      portfolioId: portfolio.id,
      userId: targetUserId,
      ticker,
      // Exclui linhas de auditoria de evento corporativo — a timeline de
      // proventos aplica o fator multiplicativo, não o delta congelado.
      transactions: transactions
        .filter((t) => !isCorporateActionAuditTx(t.notes))
        .map((t) => ({
          date: t.date,
          quantity: t.quantity,
          type: t.type,
        })),
      portfolioQuantity: portfolio.quantity,
      portfolioLastUpdate: portfolio.lastUpdate,
    });

    const proventosRows = await prisma.portfolioProvento.findMany({
      where: { portfolioId: portfolio.id, userId: targetUserId, dismissed: false },
      orderBy: { dataPagamento: 'desc' },
    });

    const proventos = proventosRows.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      dataCom: p.dataCom.toISOString(),
      dataPagamento: p.dataPagamento.toISOString(),
      precificarPor: p.precificarPor,
      valorTotal: p.valorTotal,
      quantidadeBase: p.quantidadeBase,
      impostoRenda: p.impostoRenda,
    }));

    return NextResponse.json({
      portfolioId: portfolio.id,
      ticker,
      nome,
      instituicaoNome,
      instituicaoId,
      ...emissorInfo,
      // ehInstituicaoEmissora da corretora atual: false = corretora pura/IP (aviso âmbar).
      corretoraEmissora,
      // Vínculo com planejamento (Portfolio) — editável na página.
      vinculoPlanejamento: portfolio.vinculoAposentadoria
        ? { tipo: 'aposentadoria' as const, objetivoId: null }
        : portfolio.planejamentoObjetivoId
          ? { tipo: 'sonho' as const, objetivoId: portfolio.planejamentoObjetivoId }
          : null,
      movimentacaoInicial,
      operacoes,
      proventos,
      // Carteira EUA em US$: unidade gravada da posição (preço/total das transações em US$;
      // corretagem e IR seguem em R$). A tela rotula os campos por ela.
      moeda: posicaoEmDolar(portfolio, portfolio.asset) ? 'USD' : 'BRL',
    });
  },
);
