import { NextRequest, NextResponse } from 'next/server';
import { ReitData, ReitAtivo, ReitSecao } from '@/types/reit';

// Dados mockados para demonstração
const mockReitAtivos: ReitAtivo[] = [
  // Value (REITs de Valor)
  {
    id: '1',
    ticker: 'O',
    nome: 'Realty Income Corporation',
    setor: 'retail',
    quantidade: 100,
    precoAquisicao: 65.50,
    valorTotal: 6550,
    cotacaoAtual: 68.75,
    valorAtualizado: 6875,
    riscoPorAtivo: 12.5,
    percentualCarteira: 15.2,
    objetivo: 18.0,
    quantoFalta: 2.8,
    necessidadeAporte: 1260,
    rentabilidade: 4.96,
    estrategia: 'value',
    observacoes: 'Realty Income - REIT de varejo'
  },
  {
    id: '2',
    ticker: 'AMT',
    nome: 'American Tower Corporation',
    setor: 'data_center',
    quantidade: 50,
    precoAquisicao: 180.00,
    valorTotal: 9000,
    cotacaoAtual: 185.25,
    valorAtualizado: 9262.5,
    riscoPorAtivo: 16.8,
    percentualCarteira: 20.5,
    objetivo: 22.0,
    quantoFalta: 1.5,
    necessidadeAporte: 675,
    rentabilidade: 2.92,
    estrategia: 'value',
    observacoes: 'American Tower - torres de telecomunicações'
  },
  // Growth (REITs de Crescimento)
  {
    id: '3',
    ticker: 'PLD',
    nome: 'Prologis, Inc.',
    setor: 'industrial',
    quantidade: 75,
    precoAquisicao: 120.00,
    valorTotal: 9000,
    cotacaoAtual: 135.80,
    valorAtualizado: 10185,
    riscoPorAtivo: 18.5,
    percentualCarteira: 22.5,
    objetivo: 25.0,
    quantoFalta: 2.5,
    necessidadeAporte: 1125,
    rentabilidade: 13.17,
    estrategia: 'growth',
    observacoes: 'Prologis - logística industrial'
  },
  {
    id: '4',
    ticker: 'CCI',
    nome: 'Crown Castle Inc.',
    setor: 'data_center',
    quantidade: 40,
    precoAquisicao: 140.00,
    valorTotal: 5600,
    cotacaoAtual: 155.50,
    valorAtualizado: 6220,
    riscoPorAtivo: 11.3,
    percentualCarteira: 13.8,
    objetivo: 15.0,
    quantoFalta: 1.2,
    necessidadeAporte: 540,
    rentabilidade: 11.07,
    estrategia: 'growth',
    observacoes: 'Crown Castle - infraestrutura de telecomunicações'
  },
  {
    id: '5',
    ticker: 'WELL',
    nome: 'Welltower Inc.',
    setor: 'healthcare',
    quantidade: 60,
    precoAquisicao: 75.00,
    valorTotal: 4500,
    cotacaoAtual: 78.25,
    valorAtualizado: 4695,
    riscoPorAtivo: 8.5,
    percentualCarteira: 10.4,
    objetivo: 12.0,
    quantoFalta: 1.6,
    necessidadeAporte: 720,
    rentabilidade: 4.33,
    estrategia: 'value',
    observacoes: 'Welltower - imóveis de saúde'
  },
  {
    id: '6',
    ticker: 'PSA',
    nome: 'Public Storage',
    setor: 'self_storage',
    quantidade: 30,
    precoAquisicao: 280.00,
    valorTotal: 8400,
    cotacaoAtual: 295.75,
    valorAtualizado: 8872.5,
    riscoPorAtivo: 16.1,
    percentualCarteira: 19.6,
    objetivo: 18.0,
    quantoFalta: -1.6,
    necessidadeAporte: -720,
    rentabilidade: 5.63,
    estrategia: 'value',
    observacoes: 'Public Storage - self storage'
  }
];

function calculateReitData(): ReitData {
  // Calcular totais gerais
  const totalQuantidade = mockReitAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = mockReitAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = mockReitAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockReitAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockReitAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockReitAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockReitAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockReitAtivos.length > 0 
    ? mockReitAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockReitAtivos.length 
    : 0;

  // Agrupar por estratégia
  const secoes: ReitSecao[] = [
    {
      estrategia: 'value',
      nome: 'Value (REITs de Valor)',
      ativos: mockReitAtivos.filter(ativo => ativo.estrategia === 'value'),
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
      nome: 'Growth (REITs de Crescimento)',
      ativos: mockReitAtivos.filter(ativo => ativo.estrategia === 'growth'),
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
  const alocacaoAtivo = mockReitAtivos.map((ativo, index) => {
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
  const tabelaAuxiliar = mockReitAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: ativo.necessidadeAporte > 0 ? Math.ceil(ativo.necessidadeAporte / ativo.cotacaoAtual) : 0
  }));

  // Calcular resumo
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 8000, // Mock em USD
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
    const data = calculateReitData();
    
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
      console.log(`Atualizando objetivo do REIT ${ativoId} para ${objetivo}%`);
    }

    if (cotacao !== undefined) {
      if (cotacao <= 0) {
        return NextResponse.json(
          { error: 'Cotação deve ser maior que zero' },
          { status: 400 }
        );
      }
      console.log(`Atualizando cotação do REIT ${ativoId} para $${cotacao}`);
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
