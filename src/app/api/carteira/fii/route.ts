import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { FiiData, FiiAtivo, FiiSecao } from '@/types/fii';

// Funções auxiliares para cores
function getSegmentColor(tipo: string): string {
  const colors: { [key: string]: string } = {
    'fof': '#3B82F6',
    'tvm': '#10B981',
    'ijol': '#F59E0B',
    'hibrido': '#8B5CF6',
    'renda': '#EF4444'
  };
  return colors[tipo] || '#6B7280';
}

function getAtivoColor(ticker: string): string {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'];
  const index = ticker.charCodeAt(0) % colors.length;
  return colors[index];
}

async function calculateFiiData(userId: string): Promise<FiiData> {
  // Buscar portfolio do usuário com ativos do tipo "fii"
  const portfolio = await prisma.portfolio.findMany({
    where: { 
      userId,
      asset: {
        type: 'fii'
      }
    },
    include: {
      asset: true
    }
  });

  // Converter para formato FiiAtivo
  const fiiAtivos: FiiAtivo[] = portfolio.map(item => {
    const valorTotal = item.totalInvested;
    const valorAtualizado = item.totalInvested; // Usar valor investido como atual
    const rentabilidade = 0; // Sem variação por enquanto
    
    return {
      id: item.id,
      ticker: item.asset.symbol,
      nome: item.asset.name,
      mandato: 'Estratégico', // Padrão
      segmento: 'outros', // Asset não tem segmento
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
      tipo: 'fof', // Padrão
      observacoes: null,
      dataUltimaAtualizacao: item.lastUpdate
    };
  });

  // Calcular totais gerais
  const totalQuantidade = fiiAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = fiiAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = fiiAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = fiiAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = fiiAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = fiiAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = fiiAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = fiiAtivos.length > 0 
    ? fiiAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / fiiAtivos.length 
    : 0;

  // Agrupar por tipo (todos como 'fof' por enquanto)
  const secoes: FiiSecao[] = [
    {
      tipo: 'fof',
      nome: 'Fundos de Fundos (FOF)',
      ativos: fiiAtivos.filter(ativo => ativo.tipo === 'fof'),
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0
    },
    {
      tipo: 'tvm',
      nome: 'Títulos e Valores Mobiliários (TVM)',
      ativos: fiiAtivos.filter(ativo => ativo.tipo === 'tvm'),
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0
    },
    {
      tipo: 'ijol',
      nome: 'Imóveis para Juros e Outros (IJOL)',
      ativos: fiiAtivos.filter(ativo => ativo.tipo === 'ijol'),
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0
    },
    {
      tipo: 'hibrido',
      nome: 'Híbrido',
      ativos: fiiAtivos.filter(ativo => ativo.tipo === 'hibrido'),
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0
    },
    {
      tipo: 'renda',
      nome: 'Renda',
      ativos: fiiAtivos.filter(ativo => ativo.tipo === 'renda'),
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

  // Calcular alocação por segmento
  const alocacaoSegmento = secoes.map(secao => ({
    name: secao.nome,
    value: secao.totalValorAtualizado,
    color: getSegmentColor(secao.tipo)
  }));

  // Calcular alocação por ativo
  const alocacaoAtivo = fiiAtivos.map(ativo => ({
    name: ativo.ticker,
    value: ativo.valorAtualizado,
    color: getAtivoColor(ativo.ticker)
  }));

  // Tabela auxiliar (dados adicionais)
  const tabelaAuxiliar = fiiAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    quantidade: ativo.quantidade,
    valorAplicado: ativo.valorTotal,
    valorAtualizado: ativo.valorAtualizado,
    rentabilidade: ativo.rentabilidade
  }));

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
    },
    alocacaoSegmento,
    alocacaoAtivo,
    tabelaAuxiliar
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

    const data = await calculateFiiData(user.id);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados FII:', error);
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
      console.log(`Atualizando objetivo do FII ${ativoId} para ${objetivo}%`);
    }

    if (cotacao !== undefined) {
      if (cotacao <= 0) {
        return NextResponse.json(
          { error: 'Cotação deve ser maior que zero' },
          { status: 400 }
        );
      }
      console.log(`Atualizando cotação do FII ${ativoId} para R$ ${cotacao}`);
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados FII:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}