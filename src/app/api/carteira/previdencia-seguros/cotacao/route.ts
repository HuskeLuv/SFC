import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId, cotacao } = body;

    if (!ativoId || cotacao === undefined) {
      return NextResponse.json(
        { error: 'ativoId e cotacao são obrigatórios' },
        { status: 400 }
      );
    }

    if (cotacao <= 0) {
      return NextResponse.json(
        { error: 'Cotação deve ser maior que zero' },
        { status: 400 }
      );
    }

    // Aqui você faria a atualização no banco de dados
    // Por enquanto, apenas simula o sucesso
    console.log(`Atualizando cotação do ativo ${ativoId} para ${cotacao}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Cotação atualizada com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar cotação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

