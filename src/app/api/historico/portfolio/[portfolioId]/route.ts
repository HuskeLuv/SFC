import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ portfolioId: string }> }
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { stock: true, asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: "Portfólio não encontrado" }, { status: 404 });
    }

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

    const tipoOperacaoMap: Record<string, string> = {
      compra: "Aporte",
      venda: "Resgate",
    };

    const historico = transactions.map((tx) => ({
      id: tx.id,
      tipoOperacao: tipoOperacaoMap[tx.type] || tx.type,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      date: tx.date,
      fees: tx.fees,
      notes: tx.notes,
    }));

    return NextResponse.json({
      portfolio: {
        id: portfolio.id,
        symbol: portfolio.asset?.symbol || portfolio.stock?.ticker,
        nome: portfolio.asset?.name || portfolio.stock?.companyName,
        quantity: portfolio.quantity,
        avgPrice: portfolio.avgPrice,
        totalInvested: portfolio.totalInvested,
      },
      historico,
    });
  } catch (error) {
    console.error("Erro ao buscar histórico do ativo:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
