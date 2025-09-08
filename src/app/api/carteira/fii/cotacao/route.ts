import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId, cotacao } = body;

    if (!ativoId || cotacao === undefined) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: ativoId e cotacao' },
        { status: 400 }
      );
    }

    if (cotacao <= 0) {
      return NextResponse.json(
        { error: 'Cotação deve ser maior que zero' },
        { status: 400 }
      );
    }

    // Aqui você implementaria a lógica para atualizar a cotação no banco de dados
    console.log(`Atualizando cotação do FII ${ativoId} para R$ ${cotacao}`);

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Cotação atualizada com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar cotação FII:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
