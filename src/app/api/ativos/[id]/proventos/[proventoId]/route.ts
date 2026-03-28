import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { proventoPatchSchema, validationError } from '@/utils/validation-schemas';

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

async function findProventoOwned(portfolioId: string, proventoId: string, userId: string) {
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
  { params }: { params: Promise<{ id: string; proventoId: string }> },
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId, proventoId } = await params;

    const existing = await findProventoOwned(portfolioId, proventoId, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Provento não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = proventoPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const updates: {
      tipo?: string;
      dataCom?: Date;
      dataPagamento?: Date;
      precificarPor?: string;
      valorTotal?: number;
      quantidadeBase?: number;
      impostoRenda?: number | null;
    } = {};

    if (parsed.data.tipo !== undefined) {
      const t = String(parsed.data.tipo).trim();
      if (t) updates.tipo = t;
    }
    if (parsed.data.dataCom !== undefined) {
      updates.dataCom = new Date(parsed.data.dataCom);
    }
    if (parsed.data.dataPagamento !== undefined) {
      updates.dataPagamento = new Date(parsed.data.dataPagamento);
    }
    if (parsed.data.precificarPor !== undefined) {
      updates.precificarPor = parsed.data.precificarPor;
    }
    if (parsed.data.valorTotal !== undefined) {
      updates.valorTotal = parsed.data.valorTotal;
    }
    if (parsed.data.quantidadeBase !== undefined) {
      updates.quantidadeBase = parsed.data.quantidadeBase;
    }
    if (parsed.data.impostoRenda !== undefined) {
      updates.impostoRenda = parsed.data.impostoRenda ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    const updated = await prisma.portfolioProvento.update({
      where: { id: proventoId },
      data: updates,
    });

    return NextResponse.json({ provento: serialize(updated) });
  } catch (error) {
    console.error('Erro ao atualizar provento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proventoId: string }> },
) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId, proventoId } = await params;

    const existing = await findProventoOwned(portfolioId, proventoId, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Provento não encontrado' }, { status: 404 });
    }

    await prisma.portfolioProvento.delete({ where: { id: proventoId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir provento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
