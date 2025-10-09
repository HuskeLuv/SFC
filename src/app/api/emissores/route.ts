import { NextResponse } from 'next/server';
// import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Modelo Emissor não existe no schema atual
    // Retornar array vazio por enquanto
    return NextResponse.json({ emissores: [] });
    
    // const { searchParams } = new URL(request.url);
    // const search = searchParams.get('search') || '';
    // const limit = parseInt(searchParams.get('limit') || '20');

    // let emissores;

    // if (search) {
    //   emissores = await prisma.emissor.findMany({
    //     where: {
    //       AND: [
    //         { status: 'ATIVO' },
    //         {
    //           OR: [
    //             { nome: { contains: search, mode: 'insensitive' } },
    //             { tipo: { contains: search, mode: 'insensitive' } },
    //           ],
    //         },
    //       ],
    //     },
    //     take: limit,
    //     orderBy: { nome: 'asc' },
    //   });
    // } else {
    //   emissores = await prisma.emissor.findMany({
    //     where: { status: 'ATIVO' },
    //     take: limit,
    //     orderBy: { nome: 'asc' },
    //   });
    // }

    // return NextResponse.json({ emissores });
  } catch (error) {
    console.error('Erro ao buscar emissores:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}