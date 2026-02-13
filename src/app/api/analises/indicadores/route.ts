import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { getAllIndicators } from "@/services/marketIndicatorService";

export async function GET(request: NextRequest) {
  try {
    await requireAuthWithActing(request);

    const indicators = await getAllIndicators();

    return NextResponse.json({
      indicators: {
        ibov: indicators.ibov,
        dolar: indicators.dolar,
        bitcoin: indicators.bitcoin,
        ethereum: indicators.ethereum,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar indicadores:", error);
    return NextResponse.json(
      { error: "Erro ao buscar indicadores" },
      { status: 500 }
    );
  }
}
