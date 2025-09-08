import { NextRequest, NextResponse } from 'next/server';
import { EtfData, EtfAtivo, EtfSecao } from '@/types/etf';

// Dados mockados para demonstração
const mockEtfAtivos: EtfAtivo[] = [
  // ETFs Brasil
  {
    id: '1',
    ticker: 'BOVA11',
    nome: 'iShares Ibovespa Fundo de Índice',
    indiceRastreado: 'ibovespa',
    regiao: 'brasil',
    quantidade: 200,
    precoAquisicao: 95.50,
    valorTotal: 19100,
    cotacaoAtual: 98.75,
    valorAtualizado: 19750,
    riscoPorAtivo: 15.2,
    percentualCarteira: 18.5,
    objetivo: 20.0,
    quantoFalta: 1.5,
    necessidadeAporte: 1600,
    rentabilidade: 3.40,
    observacoes: 'ETF do Ibovespa - principal índice brasileiro'
  },
  {
    id: '2',
    ticker: 'SMAL11',
    nome: 'iShares Small Caps Fundo de Índice',
    indiceRastreado: 'small_caps',
    regiao: 'brasil',
    quantidade: 150,
    precoAquisicao: 85.00,
    valorTotal: 12750,
    cotacaoAtual: 88.25,
    valorAtualizado: 13237.5,
    riscoPorAtivo: 10.2,
    percentualCarteira: 12.4,
    objetivo: 15.0,
    quantoFalta: 2.6,
    necessidadeAporte: 2200,
    rentabilidade: 3.82,
    observacoes: 'ETF de Small Caps brasileiras'
  },
  {
    id: '3',
    ticker: 'DIVO11',
    nome: 'iShares Dividendos Fundo de Índice',
    indiceRastreado: 'dividendos',
    regiao: 'brasil',
    quantidade: 100,
    precoAquisicao: 110.00,
    valorTotal: 11000,
    cotacaoAtual: 112.50,
    valorAtualizado: 11250,
    riscoPorAtivo: 8.7,
    percentualCarteira: 10.5,
    objetivo: 12.0,
    quantoFalta: 1.5,
    necessidadeAporte: 1600,
    rentabilidade: 2.27,
    observacoes: 'ETF focado em dividendos'
  },
  // ETFs Estados Unidos
  {
    id: '4',
    ticker: 'SPY',
    nome: 'SPDR S&P 500 ETF Trust',
    indiceRastreado: 'sp500',
    regiao: 'estados_unidos',
    quantidade: 50,
    precoAquisicao: 420.00,
    valorTotal: 21000,
    cotacaoAtual: 435.75,
    valorAtualizado: 21787.5,
    riscoPorAtivo: 16.8,
    percentualCarteira: 20.4,
    objetivo: 25.0,
    quantoFalta: 4.6,
    necessidadeAporte: 4900,
    rentabilidade: 3.75,
    observacoes: 'ETF do S&P 500 - principal índice americano'
  },
  {
    id: '5',
    ticker: 'QQQ',
    nome: 'Invesco QQQ Trust',
    indiceRastreado: 'nasdaq',
    regiao: 'estados_unidos',
    quantidade: 30,
    precoAquisicao: 350.00,
    valorTotal: 10500,
    cotacaoAtual: 365.25,
    valorAtualizado: 10957.5,
    riscoPorAtivo: 8.4,
    percentualCarteira: 10.3,
    objetivo: 15.0,
    quantoFalta: 4.7,
    necessidadeAporte: 5000,
    rentabilidade: 4.36,
    observacoes: 'ETF do NASDAQ - foco em tecnologia'
  },
  {
    id: '6',
    ticker: 'VTI',
    nome: 'Vanguard Total Stock Market ETF',
    indiceRastreado: 'sp500',
    regiao: 'estados_unidos',
    quantidade: 40,
    precoAquisicao: 220.00,
    valorTotal: 8800,
    cotacaoAtual: 228.50,
    valorAtualizado: 9140,
    riscoPorAtivo: 7.0,
    percentualCarteira: 8.6,
    objetivo: 10.0,
    quantoFalta: 1.4,
    necessidadeAporte: 1500,
    rentabilidade: 3.86,
    observacoes: 'ETF do mercado total americano'
  },
  {
    id: '7',
    ticker: 'VYM',
    nome: 'Vanguard High Dividend Yield ETF',
    indiceRastreado: 'dividendos',
    regiao: 'estados_unidos',
    quantidade: 25,
    precoAquisicao: 105.00,
    valorTotal: 2625,
    cotacaoAtual: 108.75,
    valorAtualizado: 2718.75,
    riscoPorAtivo: 2.1,
    percentualCarteira: 2.5,
    objetivo: 3.0,
    quantoFalta: 0.5,
    necessidadeAporte: 530,
    rentabilidade: 3.57,
    observacoes: 'ETF de dividendos altos'
  }
];

function calculateEtfData(): EtfData {
  // Calcular totais gerais
  const totalQuantidade = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockEtfAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockEtfAtivos.length > 0 
    ? mockEtfAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockEtfAtivos.length 
    : 0;

  // Agrupar por região
  const secoes: EtfSecao[] = [
    {
      regiao: 'brasil',
      nome: "ETF's Brasil",
      ativos: mockEtfAtivos.filter(ativo => ativo.regiao === 'brasil'),
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
      regiao: 'estados_unidos',
      nome: "ETF's Estados Unidos",
      ativos: mockEtfAtivos.filter(ativo => ativo.regiao === 'estados_unidos'),
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
  const alocacaoAtivo = mockEtfAtivos.map((ativo, index) => {
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
  const tabelaAuxiliar = mockEtfAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: ativo.necessidadeAporte > 0 ? Math.ceil(ativo.necessidadeAporte / ativo.cotacaoAtual) : 0
  }));

  // Calcular resumo
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 15000, // Mock em BRL
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
    const data = calculateEtfData();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados ETF:', error);
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
      console.log(`Atualizando objetivo do ETF ${ativoId} para ${objetivo}%`);
    }

    if (cotacao !== undefined) {
      if (cotacao <= 0) {
        return NextResponse.json(
          { error: 'Cotação deve ser maior que zero' },
          { status: 400 }
        );
      }
      console.log(`Atualizando cotação do ETF ${ativoId} para $${cotacao}`);
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados ETF:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
