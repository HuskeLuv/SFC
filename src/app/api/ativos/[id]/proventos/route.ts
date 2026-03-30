import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { proventoCreateSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
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

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
    });

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfólio não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = proventoCreateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const tipo = String(parsed.data.tipo ?? '').trim() || 'Provento';
    const dataCom = new Date(parsed.data.dataCom);
    const dataPagamento = new Date(parsed.data.dataPagamento);
    const precificarPor = parsed.data.precificarPor === 'quantidade' ? 'quantidade' : 'valor';
    const valorTotal = parsed.data.valorTotal;
    const quantidadeBase = parsed.data.quantidadeBase;
    const impostoRenda = parsed.data.impostoRenda ?? null;

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
  },
);
