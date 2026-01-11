import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';

export async function POST(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    const body = await request.json();
    const { portfolioId, novoValor } = body;

    if (!portfolioId || novoValor === undefined || isNaN(novoValor)) {
      return NextResponse.json(
        { error: 'portfolioId e novoValor são obrigatórios e devem ser números válidos' },
        { status: 400 }
      );
    }

    if (novoValor <= 0) {
      return NextResponse.json(
        { error: 'Valor atualizado deve ser maior que zero' },
        { status: 400 }
      );
    }

    // Buscar o portfolio
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: { asset: true },
    });

    if (!portfolio) {
      return NextResponse.json(
        { error: 'Portfolio não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se é do usuário correto
    if (portfolio.userId !== targetUserId) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 403 }
      );
    }

    // Verificar se é um imóvel/bem
    const isImovelBem = portfolio.asset?.type === 'imovel';

    if (!isImovelBem) {
      return NextResponse.json(
        { error: 'Esta API é apenas para imóveis e bens' },
        { status: 400 }
      );
    }

    // Atualizar o avgPrice do portfolio (que representa o valor atual por unidade)
    // Para imóveis, o valor atualizado é armazenado como avgPrice * quantity
    // Vamos atualizar o avgPrice para refletir o novo valor
    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        avgPrice: portfolio.quantity > 0 ? novoValor / portfolio.quantity : novoValor,
        totalInvested: novoValor, // Atualizar totalInvested também
        lastUpdate: new Date(),
      },
    });

    const result = NextResponse.json({
      success: true,
      message: 'Valor atualizado com sucesso',
    });

    // Registrar log se estiver personificado
    if (actingClient) {
      await logDataUpdate(
        request,
        { id: payload.id, role: payload.role },
        targetUserId,
        actingClient,
        '/api/carteira/imoveis-bens/valor-atualizado',
        'POST',
        body,
        { success: true },
      );
    }

    return result;
  } catch (error) {
    console.error('Erro ao atualizar valor atualizado de imóvel/bem:', error);
    
    // Registrar log de erro se estiver personificado
    try {
      const authResult = await requireAuthWithActing(request);
      if (authResult.actingClient) {
        await logDataUpdate(
          request,
          { id: authResult.payload.id, role: authResult.payload.role },
          authResult.targetUserId,
          authResult.actingClient,
          '/api/carteira/imoveis-bens/valor-atualizado',
          'POST',
          {},
          { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        );
      }
    } catch {
      // Ignorar erros de log
    }

    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor ao atualizar valor atualizado de imóvel/bem' },
      { status: 500 }
    );
  }
}

