import { NextRequest, NextResponse } from 'next/server';
import { AcaoData, AcaoAtivo, AcaoSecao } from '@/types/acoes';

// Dados mockados para demonstração
const mockAcoesAtivos: AcaoAtivo[] = [
  // Value (Ações de Valor)
  {
    id: '1',
    ticker: 'PETR4',
    nome: 'Petróleo Brasileiro S.A.',
    setor: 'energia',
    subsetor: 'Petróleo e Gás',
    quantidade: 1000,
    precoAquisicao: 28.50,
    valorTotal: 28500,
    cotacaoAtual: 32.75,
    valorAtualizado: 32750,
    riscoPorAtivo: 15.2,
    percentualCarteira: 12.8,
    objetivo: 15.0,
    quantoFalta: 2.2,
    necessidadeAporte: 17200,
    rentabilidade: 14.9,
    estrategia: 'value',
    observacoes: 'Petrobras - ação de valor'
  },
  {
    id: '2',
    ticker: 'VALE3',
    nome: 'Vale S.A.',
    setor: 'materiais',
    subsetor: 'Mineração',
    quantidade: 500,
    precoAquisicao: 65.80,
    valorTotal: 32900,
    cotacaoAtual: 72.40,
    valorAtualizado: 36200,
    riscoPorAtivo: 16.8,
    percentualCarteira: 14.2,
    objetivo: 12.0,
    quantoFalta: -2.2,
    necessidadeAporte: -17600,
    rentabilidade: 10.0,
    estrategia: 'value',
    observacoes: 'Vale - mineração'
  },
  // Growth (Ações de Crescimento)
  {
    id: '3',
    ticker: 'MGLU3',
    nome: 'Magazine Luiza S.A.',
    setor: 'consumo',
    subsetor: 'Comércio',
    quantidade: 2000,
    precoAquisicao: 12.30,
    valorTotal: 24600,
    cotacaoAtual: 15.80,
    valorAtualizado: 31600,
    riscoPorAtivo: 14.7,
    percentualCarteira: 12.4,
    objetivo: 18.0,
    quantoFalta: 5.6,
    necessidadeAporte: 14300,
    rentabilidade: 28.5,
    estrategia: 'growth',
    observacoes: 'Magazine Luiza - crescimento'
  },
  {
    id: '4',
    ticker: 'WEGE3',
    nome: 'WEG S.A.',
    setor: 'industria',
    subsetor: 'Equipamentos Industriais',
    quantidade: 300,
    precoAquisicao: 45.60,
    valorTotal: 13680,
    cotacaoAtual: 52.30,
    valorAtualizado: 15690,
    riscoPorAtivo: 7.3,
    percentualCarteira: 6.1,
    objetivo: 8.0,
    quantoFalta: 1.9,
    necessidadeAporte: 4850,
    rentabilidade: 14.7,
    estrategia: 'growth',
    observacoes: 'WEG - equipamentos industriais'
  },
  // Risk (Ações de Risco)
  {
    id: '5',
    ticker: 'B3SA3',
    nome: 'B3 S.A. - Brasil, Bolsa, Balcão',
    setor: 'financeiro',
    subsetor: 'Serviços Financeiros',
    quantidade: 800,
    precoAquisicao: 8.90,
    valorTotal: 7120,
    cotacaoAtual: 11.25,
    valorAtualizado: 9000,
    riscoPorAtivo: 4.2,
    percentualCarteira: 3.5,
    objetivo: 5.0,
    quantoFalta: 1.5,
    necessidadeAporte: 3850,
    rentabilidade: 26.4,
    estrategia: 'risk',
    observacoes: 'B3 - bolsa de valores'
  },
  {
    id: '6',
    ticker: 'CVCB3',
    nome: 'CVC Brasil Operadora e Agência de Viagens S.A.',
    setor: 'consumo',
    subsetor: 'Turismo',
    quantidade: 1500,
    precoAquisicao: 3.20,
    valorTotal: 4800,
    cotacaoAtual: 2.85,
    valorAtualizado: 4275,
    riscoPorAtivo: 2.0,
    percentualCarteira: 1.7,
    objetivo: 3.0,
    quantoFalta: 1.3,
    necessidadeAporte: 3300,
    rentabilidade: -10.9,
    estrategia: 'risk',
    observacoes: 'CVC - turismo (especulativa)'
  }
];

function calculateAcoesData(): AcaoData {
  // Calcular totais gerais
  const totalQuantidade = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockAcoesAtivos.length > 0 
    ? mockAcoesAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockAcoesAtivos.length 
    : 0;

  // Agrupar por estratégia
  const secoes: AcaoSecao[] = [
    {
      estrategia: 'value',
      nome: 'Value (Ações de Valor)',
      ativos: mockAcoesAtivos.filter(ativo => ativo.estrategia === 'value'),
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
      nome: 'Growth (Ações de Crescimento)',
      ativos: mockAcoesAtivos.filter(ativo => ativo.estrategia === 'growth'),
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
      nome: 'Risk (Ações de Risco)',
      ativos: mockAcoesAtivos.filter(ativo => ativo.estrategia === 'risk'),
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
    caixaParaInvestir: 25000, // Mock
    saldoInicioMes: totalValorAtualizado - (totalValorAtualizado - totalValorAplicado),
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

export async function GET() {
  try {
    const data = calculateAcoesData();
    
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
