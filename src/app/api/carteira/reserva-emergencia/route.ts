import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

export async function GET(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    // Registrar acesso se estiver personificado
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/carteira/reserva-emergencia',
      'GET',
    );

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar portfolio do usuário com assets relacionados
    const allUserPortfolio = await prisma.portfolio.findMany({
      where: {
        userId: targetUserId,
      },
      include: {
        asset: true,
      },
      orderBy: {
        lastUpdate: 'desc',
      },
    });

    // Filtrar apenas os itens de reserva de emergência
    // Agora cada investimento tem seu próprio asset com símbolo único (RESERVA-EMERG-*)
    const portfolio = allUserPortfolio.filter(item => {
      if (!item.asset) return false;
      return item.asset.type === 'emergency' || item.asset.symbol?.startsWith('RESERVA-EMERG');
    });

    // Buscar resumo da carteira para calcular percentuais
    const allPortfolio = await prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { asset: true, stock: true },
    });

    // Calcular saldo bruto total da carteira
    let saldoBrutoTotal = 0;
    for (const item of allPortfolio) {
      // Para reservas, usar quantity * avgPrice para valor atual (sem cotação)
      if (item.asset?.type === 'emergency' || item.asset?.symbol?.startsWith('RESERVA-EMERG') ||
          item.asset?.type === 'opportunity' || item.asset?.symbol?.startsWith('RESERVA-OPORT')) {
        saldoBrutoTotal += item.quantity * item.avgPrice;
      } else {
        // Para outros ativos, usar valor investido (as cotações serão aplicadas pelo resumo)
        saldoBrutoTotal += item.totalInvested;
      }
    }

    // Buscar transações para obter metadata armazenada em notes
    const assetIds = portfolio.map(p => p.assetId).filter((id): id is string => id !== null);
    const transactions = assetIds.length > 0 ? await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
        assetId: { in: assetIds },
        type: 'compra',
      },
      orderBy: {
        date: 'desc',
      },
    }) : [];

    // Criar mapa de metadata por assetId (usar a transação mais recente)
    const metadataMap = new Map<string, {
      cotizacaoResgate: string;
      liquidacaoResgate: string;
      vencimento: string | null;
      benchmark: string;
    }>();

    transactions.forEach(transaction => {
      if (transaction.assetId && transaction.notes && !metadataMap.has(transaction.assetId)) {
        try {
          const parsed = JSON.parse(transaction.notes);
          if (parsed.cotizacaoResgate || parsed.liquidacaoResgate || parsed.vencimento || parsed.benchmark) {
            metadataMap.set(transaction.assetId, {
              cotizacaoResgate: parsed.cotizacaoResgate || 'D+0',
              liquidacaoResgate: parsed.liquidacaoResgate || 'Imediata',
              vencimento: parsed.vencimento || null,
              benchmark: parsed.benchmark || 'CDI',
            });
          }
        } catch (e) {
          // Se não for JSON válido, usar valores padrão
        }
      }
    });

    // Transformar dados do portfolio para o formato esperado
    const ativos = portfolio.map(item => {
      // Para reservas, valor atual = quantity * avgPrice (sem cotação)
      const valorAtualizado = item.quantity * item.avgPrice;
      const valorInicial = item.totalInvested;
      
      // Calcular percentual da carteira
      const percentualCarteira = saldoBrutoTotal > 0 
        ? (valorAtualizado / saldoBrutoTotal) * 100 
        : 0;
      
      // Buscar metadata do mapa ou usar valores padrão
      const metadata = item.assetId ? metadataMap.get(item.assetId) : null;
      
      return {
        id: item.id,
        nome: item.asset?.name || 'Reserva de Emergência',
        cotizacaoResgate: metadata?.cotizacaoResgate || 'D+0',
        liquidacaoResgate: metadata?.liquidacaoResgate || 'Imediata',
        vencimento: metadata?.vencimento ? new Date(metadata.vencimento) : new Date(),
        benchmark: metadata?.benchmark || 'CDI',
        valorInicial,
        aporte: 0, // TODO: Calcular aportes se necessário
        resgate: 0, // TODO: Calcular resgates se necessário
        valorAtualizado,
        percentualCarteira: Math.round(percentualCarteira * 100) / 100,
        riscoAtivo: 0, // Baixo risco para reserva de emergência
        rentabilidade: 0, // Para reservas, rentabilidade pode ser calculada com base em rendimentos futuros
      };
    });

    // Calcular totais
    const totalValorInicial = ativos.reduce((sum, ativo) => sum + ativo.valorInicial, 0);
    const totalValorAtualizado = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const saldoInicioMes = totalValorInicial; // Assumindo que é o saldo inicial
    const rendimento = totalValorAtualizado - totalValorInicial;
    const rentabilidade = totalValorInicial > 0 
      ? (rendimento / totalValorInicial) * 100 
      : 0;

    return NextResponse.json({
      ativos,
      saldoInicioMes,
      rendimento,
      rentabilidade,
    });
  } catch (error) {
    console.error('Erro ao buscar reserva de emergência:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados da reserva de emergência' },
      { status: 500 }
    );
  }
}

