import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { AcaoData, AcaoAtivo, AcaoSecao } from '@/types/acoes';

async function calculateAcoesData(userId: string): Promise<AcaoData> {
  // Buscar portfolio do usuário com ativos do tipo "stock"
  const portfolio = await prisma.portfolio.findMany({
    where: { 
      userId,
      asset: {
        type: 'stock'
      }
    },
    include: {
      asset: true
    }
  });

  // Converter para formato AcaoAtivo
  const acoesAtivos: AcaoAtivo[] = portfolio.map(item => {
    const valorTotal = item.totalInvested;
    const valorAtualizado = item.totalInvested; // Usar valor investido como atual
    const rentabilidade = 0; // Sem variação por enquanto
    
    return {
      id: item.id,
      ticker: item.asset.symbol,
      nome: item.asset.name,
      setor: 'outros', // Asset não tem setor
      subsetor: '',
      quantidade: item.quantity,
      precoAquisicao: item.avgPrice,
      valorTotal,
      cotacaoAtual: item.avgPrice, // Usar preço médio como cotação atual
      valorAtualizado,
      riscoPorAtivo: 0, // Calcular depois
      percentualCarteira: 0, // Calcular depois
      objetivo: 0, // Sem objetivo por enquanto
      quantoFalta: 0, // Calcular depois
      necessidadeAporte: 0, // Calcular depois
      rentabilidade,
      estrategia: 'value', // Padrão
      observacoes: null,
      dataUltimaAtualizacao: item.lastUpdate
    };
  });

  // Calcular totais gerais
  const totalQuantidade = acoesAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = acoesAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = acoesAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = acoesAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = acoesAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = acoesAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = acoesAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = acoesAtivos.length > 0 
    ? acoesAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / acoesAtivos.length 
    : 0;

  // Agrupar por estratégia (todos como 'value' por enquanto)
  const secoes: AcaoSecao[] = [
    {
      estrategia: 'value',
      nome: 'Ações',
      ativos: acoesAtivos,
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

  return {
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
    }
  };
}

export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const data = await calculateAcoesData(user.id);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados Ações:', error);
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

    if (objetivo !== undefined) {
      if (objetivo < 0 || objetivo > 100) {
        return NextResponse.json(
          { error: 'Objetivo deve estar entre 0 e 100%' },
          { status: 400 }
        );
      }
      console.log(`Atualizando objetivo da ação ${ativoId} para ${objetivo}%`);
    }

    if (cotacao !== undefined) {
      if (cotacao <= 0) {
        return NextResponse.json(
          { error: 'Cotação deve ser maior que zero' },
          { status: 400 }
        );
      }
      console.log(`Atualizando cotação da ação ${ativoId} para R$ ${cotacao}`);
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados Ação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
