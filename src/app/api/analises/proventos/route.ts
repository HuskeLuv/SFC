import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

interface ProventoData {
  id: string;
  data: string;
  ativo: string;
  tipo: string;
  valor: number;
  quantidade: number;
  valorUnitario: number;
  status: 'realizado' | 'a_receber';
}

export async function GET(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/analises/proventos',
      'GET',
    );

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'ativo'; // ativo, classe, tipo

    // Buscar proventos do cashflow
    const where: any = {
      userId: targetUserId,
      tipo: 'Receita',
      OR: [
        { categoria: { contains: 'dividendo', mode: 'insensitive' } },
        { categoria: { contains: 'provento', mode: 'insensitive' } },
        { categoria: { contains: 'jcp', mode: 'insensitive' } },
        { descricao: { contains: 'dividendo', mode: 'insensitive' } },
        { descricao: { contains: 'provento', mode: 'insensitive' } },
        { descricao: { contains: 'jcp', mode: 'insensitive' } },
      ],
    };

    if (startDate && endDate) {
      where.data = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const cashflows = await prisma.cashflow.findMany({
      where,
      orderBy: {
        data: 'desc',
      },
    });

    // Converter para formato de proventos
    const proventos: ProventoData[] = cashflows.map(cf => ({
      id: cf.id,
      data: cf.data.toISOString(),
      ativo: cf.descricao || 'Desconhecido',
      tipo: cf.categoria || 'Dividendo',
      valor: cf.valor,
      quantidade: 0,
      valorUnitario: cf.valor,
      status: new Date(cf.data) <= new Date() ? 'realizado' : 'a_receber',
    }));

    // Agrupar dados conforme solicitado
    let groupedData: Record<string, { total: number; count: number; items: ProventoData[] }> = {};

    proventos.forEach(provento => {
      let key = '';
      
      switch (groupBy) {
        case 'ativo':
          key = provento.ativo;
          break;
        case 'classe':
          // Tentar inferir classe do tipo
          key = provento.tipo;
          break;
        case 'tipo':
          key = provento.tipo;
          break;
        default:
          key = provento.ativo;
      }

      if (!groupedData[key]) {
        groupedData[key] = { total: 0, count: 0, items: [] };
      }

      groupedData[key].total += provento.valor;
      groupedData[key].count += 1;
      groupedData[key].items.push(provento);
    });

    return NextResponse.json({
      proventos,
      grouped: groupedData,
      total: proventos.reduce((sum, p) => sum + p.valor, 0),
      media: proventos.length > 0 
        ? proventos.reduce((sum, p) => sum + p.valor, 0) / proventos.length 
        : 0,
    });
  } catch (error) {
    console.error('Erro ao buscar proventos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados de proventos' },
      { status: 500 }
    );
  }
}


