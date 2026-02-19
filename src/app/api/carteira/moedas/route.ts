import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/carteira/moedas
 * Lista moedas disponíveis para cotação (Asset type: currency).
 * Usado no wizard de adição de moedas (Step 3).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuthWithActing(request);

    const moedas = await prisma.asset.findMany({
      where: { type: 'currency' },
      orderBy: { symbol: 'asc' },
      select: {
        id: true,
        symbol: true,
        name: true,
      },
    });

    const options = moedas.map((m) => ({
      value: m.id,
      label: m.name,
      symbol: m.symbol,
    }));

    return NextResponse.json({ moedas: options });
  } catch (error) {
    console.error('Erro ao buscar moedas:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
