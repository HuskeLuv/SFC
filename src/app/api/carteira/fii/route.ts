import { NextRequest, NextResponse } from 'next/server';
import { FiiData, FiiAtivo, FiiSecao } from '@/types/fii';

// Dados mockados para demonstração
const mockFiiAtivos: FiiAtivo[] = [
  // FOF (Fundos de Fundos)
  {
    id: '1',
    ticker: 'FOF11',
    nome: 'Fundo de Fundos XP',
    mandato: 'Estratégico',
    segmento: 'hibrido',
    quantidade: 1000,
    precoAquisicao: 95.50,
    valorTotal: 95500,
    cotacaoAtual: 98.75,
    valorAtualizado: 98750,
    riscoPorAtivo: 12.5,
    percentualCarteira: 15.2,
    objetivo: 20.0,
    quantoFalta: 4.8,
    necessidadeAporte: 31000,
    rentabilidade: 3.4,
    tipo: 'fof',
    observacoes: 'Fundo de fundos diversificado'
  },
  {
    id: '2',
    ticker: 'FOF12',
    nome: 'Fundo de Fundos BTG',
    mandato: 'Tático',
    segmento: 'logistica',
    quantidade: 500,
    precoAquisicao: 102.30,
    valorTotal: 51150,
    cotacaoAtual: 105.80,
    valorAtualizado: 52900,
    riscoPorAtivo: 6.7,
    percentualCarteira: 8.1,
    objetivo: 10.0,
    quantoFalta: 1.9,
    necessidadeAporte: 12300,
    rentabilidade: 3.4,
    tipo: 'fof',
    observacoes: 'Foco em logística'
  },
  // TVM (Títulos e Valores Mobiliários)
  {
    id: '3',
    ticker: 'TVM11',
    nome: 'Títulos e Valores Mobiliários',
    mandato: 'Estratégico',
    segmento: 'escritorios',
    quantidade: 2000,
    precoAquisicao: 88.90,
    valorTotal: 177800,
    cotacaoAtual: 92.15,
    valorAtualizado: 184300,
    riscoPorAtivo: 23.4,
    percentualCarteira: 28.3,
    objetivo: 25.0,
    quantoFalta: -3.3,
    necessidadeAporte: -21200,
    rentabilidade: 3.7,
    tipo: 'tvm',
    observacoes: 'Escritórios corporativos'
  },
  // IJOL (Imóveis para Juros e Outros)
  {
    id: '4',
    ticker: 'IJOL11',
    nome: 'Imóveis para Juros e Outros',
    mandato: 'Especulativo',
    segmento: 'shoppings',
    quantidade: 1500,
    precoAquisicao: 76.40,
    valorTotal: 114600,
    cotacaoAtual: 79.20,
    valorAtualizado: 118800,
    riscoPorAtivo: 15.0,
    percentualCarteira: 18.2,
    objetivo: 15.0,
    quantoFalta: -3.2,
    necessidadeAporte: -20800,
    rentabilidade: 3.7,
    tipo: 'ijol',
    observacoes: 'Shoppings centers'
  },
  // Híbrido
  {
    id: '5',
    ticker: 'HGLG11',
    nome: 'HGLG Logística',
    mandato: 'Estratégico',
    segmento: 'logistica',
    quantidade: 800,
    precoAquisicao: 125.60,
    valorTotal: 100480,
    cotacaoAtual: 131.25,
    valorAtualizado: 105000,
    riscoPorAtivo: 13.3,
    percentualCarteira: 16.1,
    objetivo: 18.0,
    quantoFalta: 1.9,
    necessidadeAporte: 12300,
    rentabilidade: 4.5,
    tipo: 'hibrido',
    observacoes: 'Logística premium'
  },
  // Renda
  {
    id: '6',
    ticker: 'BCFF11',
    nome: 'BCFF Renda',
    mandato: 'Tático',
    segmento: 'residencial',
    quantidade: 1200,
    precoAquisicao: 89.75,
    valorTotal: 107700,
    cotacaoAtual: 93.40,
    valorAtualizado: 112080,
    riscoPorAtivo: 14.2,
    percentualCarteira: 17.2,
    objetivo: 12.0,
    quantoFalta: -5.2,
    necessidadeAporte: -33800,
    rentabilidade: 4.1,
    tipo: 'renda',
    observacoes: 'Residencial de alto padrão'
  }
];

function calculateFiiData(): FiiData {
  // Calcular totais gerais
  const totalQuantidade = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockFiiAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockFiiAtivos.length > 0 
    ? mockFiiAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockFiiAtivos.length 
    : 0;

  // Agrupar por tipo
  const secoes: FiiSecao[] = [
    {
      tipo: 'fof',
      nome: 'FOF (Fundos de Fundos)',
      ativos: mockFiiAtivos.filter(ativo => ativo.tipo === 'fof'),
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
      nome: 'TVM (Títulos e Valores Mobiliários)',
      ativos: mockFiiAtivos.filter(ativo => ativo.tipo === 'tvm'),
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
      nome: 'IJOL (Imóveis para Juros e Outros)',
      ativos: mockFiiAtivos.filter(ativo => ativo.tipo === 'ijol'),
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
      ativos: mockFiiAtivos.filter(ativo => ativo.tipo === 'hibrido'),
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
      ativos: mockFiiAtivos.filter(ativo => ativo.tipo === 'renda'),
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

  // Calcular alocação por segmento
  const segmentos = [...new Set(mockFiiAtivos.map(ativo => ativo.segmento))];
  const alocacaoSegmento = segmentos.map((segmento, index) => {
    const ativosSegmento = mockFiiAtivos.filter(ativo => ativo.segmento === segmento);
    const valor = ativosSegmento.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const percentual = totalValorAtualizado > 0 ? (valor / totalValorAtualizado) * 100 : 0;
    
    const cores = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6B7280'];
    
    return {
      segmento: segmento.charAt(0).toUpperCase() + segmento.slice(1),
      valor,
      percentual,
      cor: cores[index % cores.length]
    };
  });

  // Calcular alocação por ativo
  const alocacaoAtivo = mockFiiAtivos.map((ativo, index) => {
    const percentual = totalValorAtualizado > 0 ? (ativo.valorAtualizado / totalValorAtualizado) * 100 : 0;
    const cores = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6B7280', '#EC4899', '#14B8A6'];
    
    return {
      ticker: ativo.ticker,
      valor: ativo.valorAtualizado,
      percentual,
      cor: cores[index % cores.length]
    };
  });

  // Calcular tabela auxiliar
  const tabelaAuxiliar = mockFiiAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: ativo.necessidadeAporte > 0 ? Math.ceil(ativo.necessidadeAporte / ativo.cotacaoAtual) : 0
  }));

  // Calcular resumo
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 15000, // Mock
    saldoInicioMes: totalValorAtualizado - (totalValorAtualizado - totalValorAplicado),
    rendimento: totalValorAtualizado - totalValorAplicado,
    rentabilidade: totalValorAplicado > 0 ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 : 0
  };

  return {
    resumo,
    secoes,
    alocacaoSegmento,
    alocacaoAtivo,
    tabelaAuxiliar,
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
    const data = calculateFiiData();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados FIIs:', error);
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
