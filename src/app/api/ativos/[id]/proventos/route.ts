import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithActing } from "@/utils/auth";
import { prisma } from "@/lib/prisma";

const serialize = (p: {
  id: string;
  tipo: string;
  dataCom: Date;
  dataPagamento: Date;
  precificarPor: string;
  valorTotal: number;
  quantidadeBase: number;
  impostoRenda: number | null;
}) => ({
  id: p.id,
  tipo: p.tipo,
  dataCom: p.dataCom.toISOString(),
  dataPagamento: p.dataPagamento.toISOString(),
  precificarPor: p.precificarPor,
  valorTotal: p.valorTotal,
  quantidadeBase: p.quantidadeBase,
  impostoRenda: p.impostoRenda,
});

export async function POST(
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

    const body = await request.json();
    const tipo = String(body.tipo ?? "").trim() || "Provento";
    const dataCom = body.dataCom ? new Date(body.dataCom) : null;
    const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;
    const precificarPor = body.precificarPor === "quantidade" ? "quantidade" : "valor";
    const valorTotal = typeof body.valorTotal === "number" ? body.valorTotal : parseFloat(body.valorTotal);
    const quantidadeBase =
      typeof body.quantidadeBase === "number" ? body.quantidadeBase : parseFloat(body.quantidadeBase);

    if (!dataCom || Number.isNaN(dataCom.getTime())) {
      return NextResponse.json({ error: "Data com inválida" }, { status: 400 });
    }
    if (!dataPagamento || Number.isNaN(dataPagamento.getTime())) {
      return NextResponse.json({ error: "Data de pagamento inválida" }, { status: 400 });
    }
    if (!Number.isFinite(valorTotal) || valorTotal < 0) {
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 });
    }
    if (!Number.isFinite(quantidadeBase) || quantidadeBase < 0) {
      return NextResponse.json({ error: "Quantidade base inválida" }, { status: 400 });
    }

    let impostoRenda: number | null = null;
    if (body.impostoRenda !== undefined && body.impostoRenda !== null && body.impostoRenda !== "") {
      const ir = typeof body.impostoRenda === "number" ? body.impostoRenda : parseFloat(body.impostoRenda);
      if (!Number.isFinite(ir) || ir < 0) {
        return NextResponse.json({ error: "Imposto de renda inválido" }, { status: 400 });
      }
      impostoRenda = ir;
    }

    const created = await prisma.portfolioProvento.create({
      data: {
        portfolioId,
        userId: targetUserId,
        tipo,
        dataCom,
        dataPagamento,
        precificarPor,
        valorTotal,
        quantidadeBase,
        impostoRenda,
      },
    });

    return NextResponse.json({ provento: serialize(created) }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar provento:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
