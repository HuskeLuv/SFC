import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';

export async function PATCH(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    const body = await request.json();
    const { portfolioId, valorAtualizado } = body;

    if (!portfolioId || valorAtualizado === undefined) {
      return NextResponse.json(
        { error: 'portfolioId e valorAtualizado são obrigatórios' },
        { status: 400 }
      );
    }

    if (valorAtualizado <= 0) {
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

    // Verificar se é uma reserva (emergency ou opportunity)
    const isReserva = portfolio.asset?.type === 'emergency' || 
                      portfolio.asset?.type === 'opportunity' ||
                      portfolio.asset?.symbol === 'RESERVA-EMERG' ||
                      portfolio.asset?.symbol === 'RESERVA-OPORT';

    if (!isReserva) {
      return NextResponse.json(
        { error: 'Esta API é apenas para reservas de emergência e oportunidade' },
        { status: 400 }
      );
    }

    // Atualizar o avgPrice do portfolio (que representa o valor atual por unidade)
    // Para reservas, quantity geralmente é 1, então avgPrice = valorAtualizado
    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        avgPrice: valorAtualizado,
        lastUpdate: new Date(),
      },
    });

    const result = NextResponse.json({ 
      success: true, 
      message: 'Valor atualizado com sucesso' 
    });

    // Registrar log se estiver personificado
    if (actingClient) {
      await logDataUpdate(
        request,
        { id: payload.id, role: payload.role },
        targetUserId,
        actingClient,
        '/api/carteira/reserva/valor-atualizado',
        'PATCH',
        body,
        { success: true },
      );
    }

    return result;
  } catch (error) {
    console.error('Erro ao atualizar valor atualizado:', error);
    
    // Registrar log de erro se estiver personificado
    try {
      const { requireAuthWithActing } = await import('@/utils/auth');
      const { logDataUpdate } = await import('@/services/impersonationLogger');
      const authResult = await requireAuthWithActing(request);
      if (authResult.actingClient) {
        await logDataUpdate(
          request,
          { id: authResult.payload.id, role: authResult.payload.role },
          authResult.targetUserId,
          authResult.actingClient,
          '/api/carteira/reserva/valor-atualizado',
          'PATCH',
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
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

