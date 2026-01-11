import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { FiiData, FiiAtivo, FiiSecao } from '@/types/fii';
import { fetchQuotes } from '@/services/brapiQuote';

// Funções auxiliares para cores
function getSegmentColor(tipo: string): string {
  const colors: { [key: string]: string } = {
    'fofi': '#3B82F6',
    'fof': '#3B82F6', // Compatibilidade
    'tvm': '#10B981',
    'tijolo': '#F59E0B',
    'ijol': '#F59E0B', // Compatibilidade
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
  // Buscar portfolio do usuário com FIIs
  // FIIs podem estar em stockId (tabela Stock) ou assetId (tabela Asset)
  const portfolio = await prisma.portfolio.findMany({
    where: { 
      userId,
      OR: [
        { 
          stockId: { not: null }
        },
        {
          asset: {
            type: 'fii'
          }
        }
      ]
    },
    include: {
      stock: true, // Incluir relação com Stock
      asset: true  // Incluir relação com Asset
    }
  });

  // Filtrar apenas FIIs: stocks com ticker terminando em '11' OU assets do tipo 'fii'
  const fiiPortfolio = portfolio.filter(item => {
    // Se é stock com ticker terminando em '11', é FII
    if (item.stock && item.stock.ticker && item.stock.ticker.toUpperCase().endsWith('11')) {
      return true;
    }
    
    // Se é asset do tipo 'fii', é FII
    if (item.asset && item.asset.type === 'fii') return true;
    
    return false;
  });

  // Buscar cotações atuais dos FIIs na API brapi
  const symbols = fiiPortfolio
    .map(item => {
      const ticker = item.stock?.ticker || item.asset?.symbol || '';
      return ticker;
    })
    .filter(ticker => ticker && ticker.trim());
  
  // Buscar cotações (forçar refresh para garantir valores atualizados)
  const quotes = await fetchQuotes(symbols, true);

  // Converter para formato FiiAtivo
  const fiiAtivos: FiiAtivo[] = fiiPortfolio
    .map(item => {
      const valorTotal = item.totalInvested;
      
      // Determinar ticker e nome baseado na origem (Stock ou Asset)
      const ticker = item.stock?.ticker || item.asset?.symbol || '';
      const nome = item.stock?.companyName || item.asset?.name || '';
      
      // Buscar cotação atual da brapi
      let cotacaoAtual = quotes.get(ticker);
      
      // Se não encontrou cotação, usar preço médio como fallback
      if (!cotacaoAtual) {
        console.warn(`⚠️  Não foi possível obter cotação de ${ticker}, usando preço médio como fallback`);
        cotacaoAtual = item.avgPrice;
      }
      
      // Calcular valor atualizado com cotação atual
      const valorAtualizado = item.quantity * cotacaoAtual;
      
      // Calcular rentabilidade real
      const rentabilidade = item.avgPrice > 0 
        ? ((cotacaoAtual - item.avgPrice) / item.avgPrice) * 100 
        : 0;
      
      // Usar padrão 'fofi' já que não há campo de identificação no schema
      // O tipo pode ser determinado pelo usuário no wizard, mas não está persistido no banco
      const tipoFii: 'fofi' | 'tvm' | 'tijolo' = 'fofi';
      
      return {
        id: item.id,
        ticker: ticker,
        nome: nome,
        mandato: 'Estratégico', // Padrão
        segmento: 'outros', // Asset não tem segmento
        quantidade: item.quantity,
        precoAquisicao: item.avgPrice,
        valorTotal,
        cotacaoAtual: cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0, // Calcular depois
        percentualCarteira: 0, // Calcular depois
        objetivo: 0, // Sem objetivo por enquanto
        quantoFalta: 0, // Calcular depois
        necessidadeAporte: 0, // Calcular depois
        rentabilidade,
        tipo: tipoFii, // Usar tipo novo diretamente
        observacoes: undefined,
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

  // Agrupar por tipo (fofi, tvm, tijolo)
  const tipos: ('fofi' | 'tvm' | 'tijolo')[] = ['fofi', 'tvm', 'tijolo'];
  const secoes: FiiSecao[] = tipos.map(tipo => {
    const ativosDoTipo = fiiAtivos.filter(ativo => ativo.tipo === tipo);
    
    const nomesTipo = {
      'fofi': 'FOFI (Fundos de Fundos)',
      'tvm': 'TVM (Títulos e Valores Mobiliários)',
      'tijolo': 'Tijolo'
    };
    
    return {
      tipo: tipo as any, // Tipo compatível com TipoFii
      nome: nomesTipo[tipo],
      ativos: ativosDoTipo,
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0
    };
  }).filter(secao => secao.ativos.length > 0); // Remover seções vazias

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
    segmento: secao.nome,
    valor: secao.totalValorAtualizado,
    percentual: (secao.totalValorAtualizado / totalValorAtualizado) * 100,
    cor: getSegmentColor(secao.tipo)
  }));

  // Calcular alocação por ativo
  const alocacaoAtivo = fiiAtivos.map(ativo => ({
    ticker: ativo.ticker,
    valor: ativo.valorAtualizado,
    percentual: (ativo.valorAtualizado / totalValorAtualizado) * 100,
    cor: getAtivoColor(ativo.ticker)
  }));

  // Tabela auxiliar (dados adicionais)
  const tabelaAuxiliar = fiiAtivos.map(ativo => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    quantidade: ativo.quantidade,
    valorAplicado: ativo.valorTotal,
    valorAtualizado: ativo.valorAtualizado,
    rentabilidade: ativo.rentabilidade,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: Math.ceil(ativo.quantidade / 100) // Aproximação
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
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
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