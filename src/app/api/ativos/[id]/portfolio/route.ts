import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
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
    } else {
      return NextResponse.json(
        { error: "Investimento sem vínculo de ativo" },
        { status: 400 }
      );
    }

    await prisma.stockTransaction.deleteMany({ where: txWhere });
    await prisma.portfolio.delete({ where: { id: portfolioId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir portfólio:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
