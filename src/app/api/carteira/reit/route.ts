import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

// Função auxiliar para cores
function getAtivoColor(ticker: string): string {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'];
  const index = ticker.charCodeAt(0) % colors.length;
  return colors[index];
}

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar portfolio do usuário com ativos do tipo correspondente
    const portfolio = await prisma.portfolio.findMany({
      where: { 
        userId: user.id,
        asset: {
          type: 'reit'
        }
      },
      include: {
        asset: true
      }
    });

    // Converter portfolio para formato esperado
    const reitAtivos = portfolio
      .filter(item => item.asset) // Filtrar apenas itens com asset
      .map(item => ({
        id: item.id,
        ticker: item.asset!.symbol,
        nome: item.asset!.name,
      setor: 'outros', // Asset não tem setor
      subsetor: '',
      quantidade: item.quantity,
      precoAquisicao: item.avgPrice,
      valorTotal: item.totalInvested,
      cotacaoAtual: item.avgPrice, // Usar preço médio como cotação atual
      valorAtualizado: item.totalInvested,
      riscoPorAtivo: 0, // Calcular depois
      percentualCarteira: 0, // Calcular depois
      objetivo: 0, // Sem objetivo por enquanto
      quantoFalta: 0, // Calcular depois
      necessidadeAporte: 0, // Calcular depois
      rentabilidade: 0, // Sem variação por enquanto
      estrategia: 'value', // Padrão
      observacoes: undefined,
      dataUltimaAtualizacao: item.lastUpdate
    }));

    // Calcular totais gerais
    const totalQuantidade = reitAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = reitAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorAtualizado = reitAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalObjetivo = reitAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = reitAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = reitAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
    const totalRisco = reitAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const rentabilidadeMedia = reitAtivos.length > 0 
      ? reitAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / reitAtivos.length 
      : 0;

    // Agrupar por estratégia (todos como 'value' por enquanto)
    const secoes = [
      {
        estrategia: 'value',
        nome: 'REITs',
        ativos: reitAtivos,
        totalQuantidade: 0,
        totalValorAplicado: 0,
        totalValorAtualizado: 0,
        totalPercentualCarteira: 0,
        totalRisco: 0,
        totalObjetivo: 0,
        totalQuantoFalta: 0,
        totalNecessidadeAporte: 0,
        rentabilidadeMedia: 0
      }
    ];

    // Calcular valores das seções
    secoes.forEach(secao => {
      secao.totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
      secao.totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
      secao.totalValorAtualizado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
      secao.totalPercentualCarteira = secao.ativos.reduce((sum, ativo) => sum + ativo.percentualCarteira, 0);
      secao.totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
      secao.totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
      secao.totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
      secao.totalNecessidadeAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
      secao.rentabilidadeMedia = secao.ativos.length > 0 
        ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length 
        : 0;
    });

    // Calcular resumo
    const resumo = {
      necessidadeAporteTotal: totalNecessidadeAporte,
      caixaParaInvestir: 0, // Sem caixa por enquanto
      saldoInicioMes: totalValorAtualizado,
      valorAtualizado: totalValorAtualizado,
      rendimento: totalValorAtualizado - totalValorAplicado,
      rentabilidade: totalValorAplicado > 0 ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 : 0
    };

    // Calcular alocação por ativo
    const alocacaoAtivo = reitAtivos.map(ativo => ({
      name: ativo.ticker,
      value: ativo.valorAtualizado,
      color: getAtivoColor(ativo.ticker)
    }));

    // Tabela auxiliar (dados adicionais)
    const tabelaAuxiliar = reitAtivos.map(ativo => ({
      ticker: ativo.ticker,
      nome: ativo.nome,
      quantidade: ativo.quantidade,
      valorAplicado: ativo.valorTotal,
      valorAtualizado: ativo.valorAtualizado,
      rentabilidade: ativo.rentabilidade
    }));

    const data = {
      resumo,
      secoes,
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
      },
      alocacaoAtivo,
      tabelaAuxiliar
    };
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados REIT:', error);
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
    console.error('Erro ao atualizar dados REIT:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}