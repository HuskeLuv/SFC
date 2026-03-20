import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";
import { ensurePortfolioProventosFromMarket } from "@/lib/ensurePortfolioProventosFromMarket";

const tipoOperacaoMap: Record<string, string> = {
  compra: "Aporte",
  venda: "Resgate",
};

const parseInstituicaoIdFromNotes = (notes: string | null): string | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { operation?: { instituicaoId?: string } };
    const instId = parsed?.operation?.instituicaoId;
    return typeof instId === "string" && instId.length > 0 ? instId : null;
  } catch {
    return null;
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { stock: true, asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: "Portfólio não encontrado" }, { status: 404 });
    }

    const ticker = portfolio.asset?.symbol || portfolio.stock?.ticker || "";
    const nome = portfolio.asset?.name || portfolio.stock?.companyName || ticker;

    const txWhere: { userId: string; assetId?: string; stockId?: string } = {
      userId: targetUserId,
    };
    if (portfolio.assetId) {
      txWhere.assetId = portfolio.assetId;
    } else if (portfolio.stockId) {
      txWhere.stockId = portfolio.stockId;
    }

    const transactions = await prisma.stockTransaction.findMany({
      where: txWhere,
      orderBy: { date: "desc" },
    });

    let instituicaoNome: string | null = null;
    for (const tx of transactions) {
      const instId = parseInstituicaoIdFromNotes(tx.notes);
      if (instId) {
        const inst = await prisma.institution.findUnique({ where: { id: instId } });
        if (inst) {
          instituicaoNome = inst.nome;
          break;
        }
      }
    }

    const comprasAsc = [...transactions]
      .filter((t) => t.type === "compra")
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
      transactions: transactions.map((t) => ({
        date: t.date,
        quantity: t.quantity,
        type: t.type,
      })),
      portfolioQuantity: portfolio.quantity,
      portfolioLastUpdate: portfolio.lastUpdate,
    });

    const proventosRows = await prisma.portfolioProvento.findMany({
      where: { portfolioId: portfolio.id, userId: targetUserId },
      orderBy: { dataPagamento: "desc" },
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
      movimentacaoInicial,
      operacoes,
      proventos,
    });
  } catch (error) {
    console.error("Erro ao buscar dados para edição do ativo:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
