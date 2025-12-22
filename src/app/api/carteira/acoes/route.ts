import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { AcaoData, AcaoAtivo, AcaoSecao } from '@/types/acoes';
import { fetchQuotes } from '@/services/brapiQuote';

async function calculateAcoesData(userId: string): Promise<AcaoData> {
  // Buscar portfolio do usuário com ações brasileiras (tabela Stock)
  const portfolio = await prisma.portfolio.findMany({
    where: { 
      userId,
      stockId: { not: null } // Buscar apenas portfolios com stockId (ações)
    },
    include: {
      stock: true, // Incluir relação com Stock
      asset: true  // Incluir relação com Asset para compatibilidade
    }
  });

  // Filtrar apenas itens com stock válido
  const acoesPortfolio = portfolio.filter(item => item.stock);

  // Buscar cotações atuais dos ativos
  // Sempre forçar busca fresca para garantir valores atualizados
  const symbols = acoesPortfolio
    .map(item => item.stock!.ticker);
  
  // Forçar refresh para sempre obter cotações atualizadas da API
  let quotes = await fetchQuotes(symbols, true);

  // Verificar se símbolos críticos (PETR4, VALE3) foram encontrados
  // Se não foram, tentar buscar novamente
  const criticalSymbols = ['PETR4', 'VALE3'];
  const missingCriticalSymbols = criticalSymbols.filter(symbol => 
    symbols.includes(symbol) && !quotes.has(symbol)
  );

  if (missingCriticalSymbols.length > 0) {
    console.log(`🔄 Tentando buscar novamente símbolos críticos: ${missingCriticalSymbols.join(', ')}`);
    const retryQuotes = await fetchQuotes(missingCriticalSymbols, true);
    // Adicionar resultados do retry ao mapa de cotações
    retryQuotes.forEach((price, symbol) => {
      quotes.set(symbol, price);
    });
  }

  // Converter para formato AcaoAtivo
  const acoesAtivos: AcaoAtivo[] = acoesPortfolio.map(item => {
      const valorTotal = item.totalInvested;
      const ticker = item.stock!.ticker;
      
      // Buscar cotação atual da brapi
      let cotacaoAtual = quotes.get(ticker);
      
      // Se ainda não encontrou, usar preço médio como último recurso
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
      
      return {
        id: item.id,
        ticker: ticker,
        nome: item.stock!.companyName,
        setor: item.stock!.sector || 'outros',
        subsetor: item.stock!.subsector || '',
        quantidade: item.quantity,
        precoAquisicao: item.avgPrice,
        valorTotal,
        cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0, // Calcular depois
        percentualCarteira: 0, // Calcular depois
        objetivo: 0, // Sem objetivo por enquanto
        quantoFalta: 0, // Calcular depois
        necessidadeAporte: 0, // Calcular depois
        rentabilidade,
        estrategia: 'value', // Padrão
        observacoes: undefined,
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
  // Para simplificar, vamos considerar:
  // - Saldo início do mês = valor aplicado (investido)
  // - Valor atualizado = valor com cotação atual
  // - Rendimento = diferença entre valor atualizado e aplicado
  // - Rentabilidade = percentual de ganho/perda
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: 0, // Sem caixa por enquanto
    saldoInicioMes: totalValorAplicado, // Valor investido (base de cálculo)
    valorAtualizado: totalValorAtualizado, // Valor com cotação atual
    rendimento: totalValorAtualizado - totalValorAplicado, // Ganho ou perda em R$
    rentabilidade: totalValorAplicado > 0 
      ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100 
      : 0 // Percentual de ganho ou perda
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
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
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
