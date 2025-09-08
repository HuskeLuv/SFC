import { NextRequest, NextResponse } from 'next/server';
import { FimFiaData, FimFiaAtivo, FimFiaSecao } from '@/types/fimFia';

// Dados mockados para demonstração
const mockFimFiaAtivos: FimFiaAtivo[] = [
  // Fundos Multimercado (FIM)
  {
    id: '1',
    nome: 'Fundo Multimercado XP',
    cotizacaoResgate: 'D+0',
    liquidacaoResgate: 'D+1',
    categoriaNivel1: 'Ativos',
    subcategoriaNivel2: 'Macro',
    valorInicialAplicado: 10000,
    aporte: 2000,
    resgate: 500,
    valorAtualizado: 11500,
    percentualCarteira: 15.5,
    riscoPorAtivo: 15.5,
    objetivo: 20.0,
    quantoFalta: 4.5,
    necessidadeAporte: 2900,
    rentabilidade: 15.0,
    tipo: 'fim',
    observacoes: 'Fundo com estratégia macro'
  },
  {
    id: '2',
    nome: 'Fundo Multimercado BTG',
    cotizacaoResgate: 'D+8',
    liquidacaoResgate: 'D+10',
    categoriaNivel1: 'Estratégia',
    subcategoriaNivel2: 'Dividendos',
    valorInicialAplicado: 15000,
    aporte: 3000,
    resgate: 1000,
    valorAtualizado: 17000,
    percentualCarteira: 22.9,
    riscoPorAtivo: 22.9,
    objetivo: 25.0,
    quantoFalta: 2.1,
    necessidadeAporte: 1550,
    rentabilidade: 13.3,
    tipo: 'fim',
    observacoes: 'Foco em dividendos'
  },
  // Fundos de Ações (FIA)
  {
    id: '3',
    nome: 'Fundo de Ações Itaú',
    cotizacaoResgate: 'D+0',
    liquidacaoResgate: 'D+2',
    categoriaNivel1: 'Alocação',
    subcategoriaNivel2: 'Small Caps',
    valorInicialAplicado: 20000,
    aporte: 5000,
    resgate: 2000,
    valorAtualizado: 23000,
    percentualCarteira: 31.0,
    riscoPorAtivo: 31.0,
    objetivo: 30.0,
    quantoFalta: -1.0,
    necessidadeAporte: -740,
    rentabilidade: 15.0,
    tipo: 'fia',
    observacoes: 'Foco em small caps'
  },
  {
    id: '4',
    nome: 'Fundo de Ações Bradesco',
    cotizacaoResgate: 'D+30',
    liquidacaoResgate: 'D+30',
    categoriaNivel1: 'Investimentos no Exterior',
    subcategoriaNivel2: 'Macro',
    valorInicialAplicado: 12000,
    aporte: 1000,
    resgate: 0,
    valorAtualizado: 13000,
    percentualCarteira: 17.5,
    riscoPorAtivo: 17.5,
    objetivo: 15.0,
    quantoFalta: -2.5,
    necessidadeAporte: -1850,
    rentabilidade: 8.3,
    tipo: 'fia',
    observacoes: 'Exposição internacional'
  }
];

function calculateFimFiaData(): FimFiaData {
  // Calcular totais gerais
  const totalValorAplicado = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0);
  const totalAporte = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.aporte, 0);
  const totalResgate = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.resgate, 0);
  const totalValorAtualizado = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = mockFimFiaAtivos.length > 0 
    ? mockFimFiaAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / mockFimFiaAtivos.length 
    : 0;

  // Agrupar por tipo (FIM e FIA)
  const fimAtivos = mockFimFiaAtivos.filter(ativo => ativo.tipo === 'fim');
  const fiaAtivos = mockFimFiaAtivos.filter(ativo => ativo.tipo === 'fia');

  // Calcular seções
  const secoes: FimFiaSecao[] = [
    {
      tipo: 'fim',
      nome: 'Fundos Multimercado (FIM)',
      ativos: fimAtivos,
      totalValorAplicado: fimAtivos.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0),
      totalAporte: fimAtivos.reduce((sum, ativo) => sum + ativo.aporte, 0),
      totalResgate: fimAtivos.reduce((sum, ativo) => sum + ativo.resgate, 0),
      totalValorAtualizado: fimAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0),
      totalPercentualCarteira: fimAtivos.reduce((sum, ativo) => sum + ativo.percentualCarteira, 0),
      totalRisco: fimAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0),
      totalObjetivo: fimAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0),
      totalQuantoFalta: fimAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0),
      totalNecessidadeAporte: fimAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0),
      rentabilidadeMedia: fimAtivos.length > 0 
        ? fimAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / fimAtivos.length 
        : 0
    },
    {
      tipo: 'fia',
      nome: 'Fundos de Ações (FIA)',
      ativos: fiaAtivos,
      totalValorAplicado: fiaAtivos.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0),
      totalAporte: fiaAtivos.reduce((sum, ativo) => sum + ativo.aporte, 0),
      totalResgate: fiaAtivos.reduce((sum, ativo) => sum + ativo.resgate, 0),
      totalValorAtualizado: fiaAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0),
      totalPercentualCarteira: fiaAtivos.reduce((sum, ativo) => sum + ativo.percentualCarteira, 0),
      totalRisco: fiaAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0),
      totalObjetivo: fiaAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0),
      totalQuantoFalta: fiaAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0),
      totalNecessidadeAporte: fiaAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0),
      rentabilidadeMedia: fiaAtivos.length > 0 
        ? fiaAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / fiaAtivos.length 
        : 0
    }
  ];

  // Calcular resumo
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 5000, // Mock
    saldoInicioMes: totalValorAtualizado - (totalAporte - totalResgate),
    valorAtualizado: totalValorAtualizado,
    rendimento: totalValorAtualizado - totalValorAplicado,
    rentabilidade: totalValorAplicado > 0 ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 : 0
  };

  return {
    resumo,
    secoes,
    totalGeral: {
      valorAplicado: totalValorAplicado,
      aporte: totalAporte,
      resgate: totalResgate,
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
    const data = calculateFimFiaData();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados FIM/FIA:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ativoId, objetivo } = body;

    if (!ativoId || objetivo === undefined) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: ativoId e objetivo' },
        { status: 400 }
      );
    }

    // Aqui você implementaria a lógica para atualizar o objetivo no banco de dados
    // Por enquanto, apenas retornamos sucesso
    console.log(`Atualizando objetivo do ativo ${ativoId} para ${objetivo}%`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar objetivo:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
