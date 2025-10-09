import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar portfolio do usuário com ativos do tipo correspondente
    const portfolio = await prisma.portfolio.findMany({
      where: { 
        userId: user.id,
        asset: {
          type: 'imovel'
        }
      },
      include: {
        asset: true
      }
    });

    // Converter portfolio para formato esperado
    const imoveisBensAtivos = portfolio
      .filter(item => item.asset) // Filtrar apenas itens com asset
      .map(item => ({
        id: item.id,
        nome: item.asset!.name,
      tipo: 'outros', // Asset não tem tipo específico
      endereco: '',
      quantidade: item.quantity,
      valorAquisicao: item.avgPrice,
      valorMelhorias: 0, // Sem melhorias por enquanto
      valorAtualizado: item.totalInvested,
      riscoPorAtivo: 0, // Calcular depois
      percentualCarteira: 0, // Calcular depois
      objetivo: 0, // Sem objetivo por enquanto
      quantoFalta: 0, // Calcular depois
      necessidadeAporte: 0, // Calcular depois
      rentabilidade: 0, // Sem variação por enquanto
      observacoes: undefined,
      dataUltimaAtualizacao: item.lastUpdate
    }));

    // Calcular totais gerais
    const totalQuantidade = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.valorAquisicao, 0);
    const totalValorMelhorias = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.valorMelhorias, 0);
    const totalValorAtualizado = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalObjetivo = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
    const totalRisco = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const rentabilidadeMedia = imoveisBensAtivos.length > 0 
      ? imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / imoveisBensAtivos.length 
      : 0;

    // Calcular resumo
    const resumo = {
      valorTotalAquisicoes: totalValorAplicado,
      valorTotalMelhorias: totalValorMelhorias,
      valorAtualizado: totalValorAtualizado,
      rendimento: totalValorAtualizado - totalValorAplicado,
      rentabilidade: totalValorAplicado > 0 ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 : 0
    };

    const data = {
      resumo,
      ativos: imoveisBensAtivos,
      totalGeral: {
        quantidade: totalQuantidade,
        valorAplicado: totalValorAplicado,
        valorAtualizado: totalValorAtualizado,
        percentualCarteira: 100.0,
        risco: totalRisco,
        objetivo: totalObjetivo,
        quantoFalta: totalQuantoFalta,
        necessidadeAporte: totalNecessidadeAporte,
        rentabilidade: rentabilidadeMedia
      }
    };
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados Imóveis/Bens:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId } = body;

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
    console.error('Erro ao atualizar dados Imóveis/Bens:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}