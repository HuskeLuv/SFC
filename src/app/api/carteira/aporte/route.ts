import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";
import { logDataUpdate } from "@/services/impersonationLogger";

export async function POST(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    const body = await request.json();

    const { portfolioId, dataAporte, valorAporte, tipoAtivo, instituicaoId } = body;

    if (!portfolioId || !dataAporte || !valorAporte) {
      return NextResponse.json({ error: "Campos obrigatórios: portfolioId, dataAporte, valorAporte" }, { status: 400 });
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { stock: true, asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
    }

    const dataTransacao = new Date(dataAporte);
    const quantity = 1;
    const price = valorAporte;
    const total = valorAporte;

    const notesData = JSON.stringify({
      operation: {
        action: "aporte",
        performedBy: {
          userId: payload.id,
          role: payload.role,
          actingClient: actingClient || null,
        },
        targetUserId,
        portfolioId,
        tipoAtivo,
        instituicaoId,
        stockId: portfolio.stockId,
        assetId: portfolio.assetId,
        symbol: portfolio.stock?.ticker || portfolio.asset?.symbol || null,
        name: portfolio.stock?.companyName || portfolio.asset?.name || null,
        quantity,
        price,
        total,
        date: dataTransacao.toISOString(),
      },
    });

    const transacao = await prisma.stockTransaction.create({
      data: {
        userId: targetUserId,
        ...(portfolio.stockId ? { stockId: portfolio.stockId } : { assetId: portfolio.assetId! }),
        type: "compra",
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

    const result = NextResponse.json({ success: true, transacao }, { status: 201 });

    if (actingClient) {
      await logDataUpdate(
        request,
        { id: payload.id, role: payload.role },
        targetUserId,
        actingClient,
        "/api/carteira/aporte",
        "POST",
        body,
        { success: true },
      );
    }

    return result;
  } catch (error) {
    console.error("Erro ao realizar aporte:", error);
    return NextResponse.json({ error: "Erro interno ao realizar aporte" }, { status: 500 });
  }
}
