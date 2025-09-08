import { NextRequest, NextResponse } from 'next/server';
import { CarteiraStockData, CarteiraStockAtivo, CarteiraStockSecao } from '@/types/carteiraStocks';

// Dados mockados para demonstração
const mockStocksAtivos: CarteiraStockAtivo[] = [
  // Value (Stocks de Valor)
  {
    id: '1',
    ticker: 'AAPL',
    nome: 'Apple Inc.',
    sector: 'technology',
    industryCategory: 'Consumer Electronics',
    quantidade: 50,
    precoAquisicao: 150.00,
    valorTotal: 7500,
    cotacaoAtual: 175.50,
    valorAtualizado: 8775,
    riscoPorAtivo: 18.5,
    percentualCarteira: 15.2,
    objetivo: 20.0,
    quantoFalta: 4.8,
    necessidadeAporte: 2770,
    rentabilidade: 17.0,
    estrategia: 'value',
    observacoes: 'Apple - tecnologia de valor'
  },
  {
    id: '2',
    ticker: 'JNJ',
    nome: 'Johnson & Johnson',
    sector: 'healthcare',
    industryCategory: 'Pharmaceuticals',
    quantidade: 30,
    precoAquisicao: 160.00,
    valorTotal: 4800,
    cotacaoAtual: 165.75,
    valorAtualizado: 4972.5,
    riscoPorAtivo: 10.5,
    percentualCarteira: 8.6,
    objetivo: 10.0,
    quantoFalta: 1.4,
    necessidadeAporte: 805,
    rentabilidade: 3.6,
    estrategia: 'value',
    observacoes: 'J&J - farmacêutica estável'
  },
  // Growth (Stocks de Crescimento)
  {
    id: '3',
    ticker: 'MSFT',
    nome: 'Microsoft Corporation',
    sector: 'technology',
    industryCategory: 'Software',
    quantidade: 40,
    precoAquisicao: 300.00,
    valorTotal: 12000,
    cotacaoAtual: 380.25,
    valorAtualizado: 15210,
    riscoPorAtivo: 32.1,
    percentualCarteira: 26.4,
    objetivo: 25.0,
    quantoFalta: -1.4,
    necessidadeAporte: -805,
    rentabilidade: 26.8,
    estrategia: 'growth',
    observacoes: 'Microsoft - crescimento em nuvem'
  },
  {
    id: '4',
    ticker: 'GOOGL',
    nome: 'Alphabet Inc.',
    sector: 'technology',
    industryCategory: 'Internet Services',
    quantidade: 25,
    precoAquisicao: 120.00,
    valorTotal: 3000,
    cotacaoAtual: 145.80,
    valorAtualizado: 3645,
    riscoPorAtivo: 7.7,
    percentualCarteira: 6.3,
    objetivo: 8.0,
    quantoFalta: 1.7,
    necessidadeAporte: 980,
    rentabilidade: 21.5,
    estrategia: 'growth',
    observacoes: 'Google - publicidade digital'
  },
  // Risk (Stocks de Risco)
  {
    id: '5',
    ticker: 'TSLA',
    nome: 'Tesla, Inc.',
    sector: 'consumer',
    industryCategory: 'Electric Vehicles',
    quantidade: 20,
    precoAquisicao: 200.00,
    valorTotal: 4000,
    cotacaoAtual: 250.00,
    valorAtualizado: 5000,
    riscoPorAtivo: 10.6,
    percentualCarteira: 8.7,
    objetivo: 12.0,
    quantoFalta: 3.3,
    necessidadeAporte: 1905,
    rentabilidade: 25.0,
    estrategia: 'risk',
    observacoes: 'Tesla - veículos elétricos'
  },
  {
    id: '6',
    ticker: 'NVDA',
    nome: 'NVIDIA Corporation',
    sector: 'technology',
    industryCategory: 'Semiconductors',
    quantidade: 15,
    precoAquisicao: 400.00,
    valorTotal: 6000,
    cotacaoAtual: 450.00,
    valorAtualizado: 6750,
    riscoPorAtivo: 14.3,
    percentualCarteira: 11.7,
    objetivo: 15.0,
    quantoFalta: 3.3,
    necessidadeAporte: 1905,
    rentabilidade: 12.5,
    estrategia: 'risk',
    observacoes: 'NVIDIA - chips para IA'
  }
];

function calculateStocksData(): CarteiraStockData {
  // Calcular totais gerais
  const totalQuantidade = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockStocksAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockStocksAtivos.length > 0 
    ? mockStocksAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockStocksAtivos.length 
    : 0;

  // Agrupar por estratégia
  const secoes: CarteiraStockSecao[] = [
    {
      estrategia: 'value',
      nome: 'Value (Stocks de Valor)',
      ativos: mockStocksAtivos.filter(ativo => ativo.estrategia === 'value'),
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
      estrategia: 'growth',
      nome: 'Growth (Stocks de Crescimento)',
      ativos: mockStocksAtivos.filter(ativo => ativo.estrategia === 'growth'),
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
      estrategia: 'risk',
      nome: 'Risk (Stocks de Risco)',
      ativos: mockStocksAtivos.filter(ativo => ativo.estrategia === 'risk'),
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

  // Calcular alocação por ativo
  const alocacaoAtivo = mockStocksAtivos.map((ativo, index) => {
    const percentual = totalValorAtualizado > 0 ? (ativo.valorAtualizado / totalValorAtualizado) * 100 : 0;
    const cores = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6B7280', '#EC4899', '#14B8A6', '#F97316', '#06B6D4'];
    
    return {
      ticker: ativo.ticker,
      valor: ativo.valorAtualizado,
      percentual,
      cor: cores[index % cores.length]
    };
  });

  // Calcular tabela auxiliar
  const tabelaAuxiliar = mockStocksAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: ativo.necessidadeAporte > 0 ? Math.ceil(ativo.necessidadeAporte / ativo.cotacaoAtual) : 0
  }));

  // Calcular resumo
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 10000, // Mock em USD
    saldoInicioMes: totalValorAtualizado - (totalValorAtualizado - totalValorAplicado),
    valorAtualizado: totalValorAtualizado,
    rendimento: totalValorAtualizado - totalValorAplicado,
    rentabilidade: totalValorAplicado > 0 ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 : 0
  };

  return {
    resumo,
    secoes,
    tabelaAuxiliar,
    alocacaoAtivo,
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

export async function GET() {
  try {
    const data = calculateStocksData();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados Stocks:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId, objetivo, cotacao } = body;

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
      console.log(`Atualizando objetivo do stock ${ativoId} para ${objetivo}%`);
    }

    if (cotacao !== undefined) {
      if (cotacao <= 0) {
        return NextResponse.json(
          { error: 'Cotação deve ser maior que zero' },
          { status: 400 }
        );
      }
      console.log(`Atualizando cotação do stock ${ativoId} para $${cotacao}`);
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados Stock:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
