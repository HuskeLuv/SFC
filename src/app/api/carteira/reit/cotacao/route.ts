import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { ativoId, cotacao } = body;

  if (!ativoId || cotacao === undefined) {
    return NextResponse.json(
      { error: 'Parâmetros obrigatórios: ativoId e cotacao' },
      { status: 400 },
    );
  }

  if (cotacao <= 0) {
    return NextResponse.json({ error: 'Cotação deve ser maior que zero' }, { status: 400 });
  }

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Cotação atualizada com sucesso',
  });
});
