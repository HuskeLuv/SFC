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

    // Buscar portfolio do usuário com ativos do tipo imovel e personalizado
    const portfolio = await prisma.portfolio.findMany({
      where: { 
        userId: user.id,
        asset: {
          type: {
            in: ['imovel', 'personalizado']
          }
        }
      },
      include: {
        asset: true
      }
    });

    // Converter portfolio para formato esperado
    const imoveisBensAtivos = portfolio
      .filter(item => item.asset) // Filtrar apenas itens com asset
      .map(item => {
        // Para imóveis, valorAtualizado = totalInvested (que é atualizado quando o usuário edita manualmente)
        // Se quantity > 0, usar totalInvested diretamente (já está atualizado)
        // Caso contrário, calcular como quantity * avgPrice
        const valorAtualizado = item.totalInvested > 0 ? item.totalInvested : (item.quantity * item.avgPrice);
        const valorTotal = item.quantity * item.avgPrice; // Valor total (aquisição + melhorias)
        
        return {
          id: item.id,
          nome: item.asset!.name,
          cidade: '', // Asset não tem cidade por enquanto
          mandato: 'Estratégico', // Padrão
          quantidade: item.quantity,
          precoAquisicao: item.avgPrice,
          melhorias: 0, // Sem melhorias por enquanto
          valorTotal,
          valorAtualizado,
          riscoPorAtivo: 0, // Calcular depois no frontend com totalCarteira
          percentualCarteira: 0, // Calcular depois no frontend com totalCarteira
          rentabilidade: 0, // Sem variação por enquanto
          observacoes: undefined,
          objetivo: 0, // Não aplicável para imóveis e bens
          quantoFalta: 0, // Não aplicável para imóveis e bens
          necessidadeAporte: 0, // Não aplicável para imóveis e bens
        };
      });

    // Calcular totais gerais
    const totalQuantidade = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorMelhorias = imoveisBensAtivos.reduce((sum, ativo) => sum + ativo.melhorias, 0);
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