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

async function findProventoOwned(
  portfolioId: string,
  proventoId: string,
  userId: string
) {
  return prisma.portfolioProvento.findFirst({
    where: {
      id: proventoId,
      portfolioId,
      userId,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proventoId: string }> }
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId, proventoId } = await params;

    const existing = await findProventoOwned(portfolioId, proventoId, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: "Provento não encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const updates: {
      tipo?: string;
      dataCom?: Date;
      dataPagamento?: Date;
      precificarPor?: string;
      valorTotal?: number;
      quantidadeBase?: number;
      impostoRenda?: number | null;
    } = {};

    if (body.tipo !== undefined) {
      const t = String(body.tipo).trim();
      if (t) updates.tipo = t;
    }
    if (body.dataCom !== undefined) {
      const d = new Date(body.dataCom);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Data com inválida" }, { status: 400 });
      }
      updates.dataCom = d;
    }
    if (body.dataPagamento !== undefined) {
      const d = new Date(body.dataPagamento);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Data de pagamento inválida" }, { status: 400 });
      }
      updates.dataPagamento = d;
    }
    if (body.precificarPor !== undefined) {
      updates.precificarPor = body.precificarPor === "quantidade" ? "quantidade" : "valor";
    }
    if (body.valorTotal !== undefined) {
      const v = typeof body.valorTotal === "number" ? body.valorTotal : parseFloat(body.valorTotal);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "Valor total inválido" }, { status: 400 });
      }
      updates.valorTotal = v;
    }
    if (body.quantidadeBase !== undefined) {
      const q = typeof body.quantidadeBase === "number" ? body.quantidadeBase : parseFloat(body.quantidadeBase);
      if (!Number.isFinite(q) || q < 0) {
        return NextResponse.json({ error: "Quantidade base inválida" }, { status: 400 });
      }
      updates.quantidadeBase = q;
    }
    if (body.impostoRenda !== undefined) {
      if (body.impostoRenda === null || body.impostoRenda === "") {
        updates.impostoRenda = null;
      } else {
        const ir = typeof body.impostoRenda === "number" ? body.impostoRenda : parseFloat(body.impostoRenda);
        if (!Number.isFinite(ir) || ir < 0) {
          return NextResponse.json({ error: "Imposto de renda inválido" }, { status: 400 });
        }
        updates.impostoRenda = ir;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const updated = await prisma.portfolioProvento.update({
      where: { id: proventoId },
      data: updates,
    });

    return NextResponse.json({ provento: serialize(updated) });
  } catch (error) {
    console.error("Erro ao atualizar provento:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proventoId: string }> }
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId, proventoId } = await params;

    const existing = await findProventoOwned(portfolioId, proventoId, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: "Provento não encontrado" }, { status: 404 });
    }

    await prisma.portfolioProvento.delete({ where: { id: proventoId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir provento:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
