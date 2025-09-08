import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId, objetivo } = body;

    if (!ativoId || objetivo === undefined) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: ativoId e objetivo' },
        { status: 400 }
      );
    }

    if (objetivo < 0 || objetivo > 100) {
      return NextResponse.json(
        { error: 'Objetivo deve estar entre 0 e 100%' },
        { status: 400 }
      );
    }

    // Aqui você implementaria a lógica para atualizar o objetivo no banco de dados
    // Por enquanto, apenas retornamos sucesso
    console.log(`Atualizando objetivo do ativo ${ativoId} para ${objetivo}%`);

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Objetivo atualizado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar objetivo:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
