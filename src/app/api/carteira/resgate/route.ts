import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";
import { logDataUpdate } from "@/services/impersonationLogger";

const mapPortfolioToTipo = (item: { stock?: { ticker: string } | null; asset?: { type?: string | null } | null }) => {
  if (item.stock?.ticker) {
    const ticker = item.stock.ticker.toUpperCase();
    return ticker.endsWith("11") ? "fii" : "acao";
  }

  const assetType = item.asset?.type || "";
  switch (assetType) {
    case "emergency":
      return "reserva-emergencia";
    case "opportunity":
      return "reserva-oportunidade";
    case "personalizado":
      return "personalizado";
    case "imovel":
      return "imoveis-bens";
    case "crypto":
      return "criptoativo";
    case "currency":
      return "moeda";
    case "etf":
      return "etf";
    case "reit":
      return "reit";
    case "bdr":
      return "bdr";
    case "fund":
      return "fundo";
    case "bond":
      return "renda-fixa-prefixada";
    case "insurance":
      return "previdencia";
    case "cash":
      return "conta-corrente";
    default:
      return assetType || "personalizado";
  }
};

export async function POST(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    const body = await request.json();

    const {
      portfolioId,
      dataResgate,
      metodoResgate,
      quantidade,
      cotacaoUnitaria,
      valorResgate,
      instituicaoId,
      observacoes,
    } = body;

    if (!portfolioId || !dataResgate || !metodoResgate) {
      return NextResponse.json({ error: "Campos obrigatórios: portfolioId, dataResgate, metodoResgate" }, { status: 400 });
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { stock: true, asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: "Investimento não encontrado" }, { status: 404 });
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
          type: "compra",
          ...(portfolio.stockId ? { stockId: portfolio.stockId } : { assetId: portfolio.assetId! }),
        },
        orderBy: { date: "desc" },
      });
      const institutionFromNotes = extractInstitutionId(latestCompra?.notes);
      if (instituicaoId === "unknown" && institutionFromNotes) {
        return NextResponse.json({ error: "Instituição inválida para este investimento" }, { status: 400 });
      }
      if (instituicaoId !== "unknown" && institutionFromNotes && instituicaoId !== institutionFromNotes) {
        return NextResponse.json({ error: "Instituição inválida para este investimento" }, { status: 400 });
      }
    }

    if (metodoResgate === "quantidade") {
      if (!quantidade || quantidade <= 0) {
        return NextResponse.json({ error: "Quantidade inválida" }, { status: 400 });
      }
      if (quantidade > availableQuantity) {
        return NextResponse.json({ error: "Quantidade maior que o disponível" }, { status: 400 });
      }
      if (!cotacaoUnitaria || cotacaoUnitaria <= 0) {
        return NextResponse.json({ error: "Cotação unitária inválida" }, { status: 400 });
      }
    }

    if (metodoResgate === "valor") {
      if (!valorResgate || valorResgate <= 0) {
        return NextResponse.json({ error: "Valor de resgate inválido" }, { status: 400 });
      }
      if (valorResgate > availableTotal) {
        return NextResponse.json({ error: "Valor maior que o disponível" }, { status: 400 });
      }
      if (availableQuantity > 1) {
        return NextResponse.json({ error: "Resgate por valor disponível apenas para investimentos com quantidade 1" }, { status: 400 });
      }
    }

    const dataTransacao = new Date(dataResgate);
    const quantityResgate = metodoResgate === "valor" ? 1 : quantidade;
    const priceResgate = metodoResgate === "valor" ? valorResgate : cotacaoUnitaria;
    const totalResgate = metodoResgate === "valor" ? valorResgate : quantityResgate * priceResgate;

    const notesData = JSON.stringify({
      observacoes: observacoes || undefined,
      operation: {
        action: "resgate",
        performedBy: {
          userId: payload.id,
          role: payload.role,
          actingClient: actingClient || null,
        },
        targetUserId,
        portfolioId,
        tipoAtivo,
        instituicaoId: instituicaoId || null,
        stockId: portfolio.stockId,
        assetId: portfolio.assetId,
        symbol: portfolio.stock?.ticker || portfolio.asset?.symbol || "",
        name: portfolio.stock?.companyName || portfolio.asset?.name || "",
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
        ...(portfolio.stockId ? { stockId: portfolio.stockId } : { assetId: portfolio.assetId! }),
        type: "venda",
        quantity: quantityResgate,
        price: priceResgate,
        total: totalResgate,
        date: dataTransacao,
        fees: 0,
        notes: notesData,
      },
    });

    const isResgatePorValor = metodoResgate === "valor";
    const novaQuantidade = isResgatePorValor && availableQuantity === 1
      ? (totalResgate >= availableTotal ? 0 : 1)
      : availableQuantity - quantityResgate;

    if (novaQuantidade <= 0) {
      await prisma.portfolio.delete({ where: { id: portfolio.id } });
    } else {
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
    }

    const result = NextResponse.json(
      { success: true, transacao, message: "Resgate realizado com sucesso!" },
      { status: 201 }
    );

    if (actingClient) {
      await logDataUpdate(
        request,
        { id: payload.id, role: payload.role },
        targetUserId,
        actingClient,
        "/api/carteira/resgate",
        "POST",
        body,
        { success: true }
      );
    }

    return result;
  } catch (error) {
    console.error("Erro ao resgatar investimento:", error);
    return NextResponse.json(
      { error: "Erro interno ao resgatar investimento" },
      { status: 500 }
    );
  }
}
