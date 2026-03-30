import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '20');

  let institutions;

  if (search) {
    institutions = await prisma.institution.findMany({
      where: {
        AND: [
          { status: 'ATIVA' },
          {
            OR: [
              { nome: { contains: search, mode: 'insensitive' } },
              { codigo: { contains: search, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: limit,
      orderBy: { nome: 'asc' },
    });
  } else {
    institutions = await prisma.institution.findMany({
      where: { status: 'ATIVA' },
      take: limit,
      orderBy: { nome: 'asc' },
    });
  }

  return NextResponse.json({
    success: true,
    institutions: institutions.map((inst) => ({
      id: inst.id,
      nome: inst.nome,
      codigo: inst.codigo,
      status: inst.status,
    })),
    count: institutions.length,
  });
});
