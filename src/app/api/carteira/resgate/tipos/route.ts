import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";

const TIPO_LABELS: Record<string, string> = {
  "reserva-emergencia": "Reserva de Emergência",
  "reserva-oportunidade": "Reserva de Oportunidade",
  acao: "Ações",
  fii: "Fundos Imobiliários e REITs",
  bdr: "BDRs",
  etf: "ETFs",
  reit: "REITs",
  criptoativo: "Criptoativos",
  moeda: "Moedas",
  fundo: "Fundos",
  "renda-fixa-prefixada": "Renda Fixa Prefixada",
  "renda-fixa": "Renda Fixa",
  previdencia: "Previdência",
  "conta-corrente": "Conta Corrente",
  personalizado: "Personalizado",
  "imoveis-bens": "Imóveis & Bens",
};

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
      return "renda-fixa";
    case "insurance":
      return "previdencia";
    case "cash":
      return "conta-corrente";
    default:
      return assetType || "personalizado";
  }
};

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const portfolio = await prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    });

    const tiposSet = new Set<string>();
    portfolio.forEach((item) => {
      const tipo = mapPortfolioToTipo(item);
      if (tipo) {
        tiposSet.add(tipo);
      }
    });

    const tipos = Array.from(tiposSet).map((tipo) => ({
      value: tipo,
      label: TIPO_LABELS[tipo] || tipo,
    }));

    return NextResponse.json({ success: true, tipos });
  } catch (error) {
    console.error("Erro ao buscar tipos para resgate:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar tipos para resgate" },
      { status: 500 }
    );
  }
}
