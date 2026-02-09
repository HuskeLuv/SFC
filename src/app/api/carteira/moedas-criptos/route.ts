import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar caixa para investir específico de Moedas/Criptos
    const caixaParaInvestirData = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_moedas_criptos',
      },
    });
    const caixaParaInvestir = caixaParaInvestirData?.value || 0;

    // Buscar portfolio do usuário com ativos do tipo correspondente
    // const portfolio = await prisma.portfolio.findMany({
    //   where: { 
    //     userId: user.id,
    //     asset: {
    //       type: 'crypto'
    //     }
    //   },
    //   include: {
    //     asset: true
    //   }
    // });

    // Retornar dados vazios por enquanto
    const data = {
      resumo: {
        necessidadeAporteTotal: 0,
        caixaParaInvestir: caixaParaInvestir,
        saldoInicioMes: 0,
        valorAtualizado: caixaParaInvestir,
        rendimento: 0,
        rentabilidade: 0
      },
      secoes: [],
      totalGeral: {
        quantidade: 0,
        valorAplicado: 0,
        valorAtualizado: caixaParaInvestir,
        percentualCarteira: 0,
        risco: 0,
        objetivo: 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade: 0
      }
    };
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados Moedas/Criptos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const body = await request.json();
    const { ativoId, objetivo, cotacao, caixaParaInvestir } = body;

    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
      }

      // Salvar ou atualizar caixa para investir de Moedas/Criptos
      const existingCaixa = await prisma.dashboardData.findFirst({
        where: {
          userId: targetUserId,
          metric: 'caixa_para_investir_moedas_criptos',
        },
      });

      if (existingCaixa) {
        await prisma.dashboardData.update({
          where: { id: existingCaixa.id },
          data: { value: caixaParaInvestir },
        });
      } else {
        await prisma.dashboardData.create({
          data: {
            userId: targetUserId,
            metric: 'caixa_para_investir_moedas_criptos',
            value: caixaParaInvestir,
          },
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Caixa para investir atualizado com sucesso',
        caixaParaInvestir
      });
    }

    if (!ativoId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: ativoId' },
        { status: 400 }
      );
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados Moedas/Criptos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}