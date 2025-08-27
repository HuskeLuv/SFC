import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar portfolio de ações
    const portfolio = await prisma.portfolio.findMany({
      where: { userId: user.id },
      include: {
        stock: true,
      },
    });

    // Buscar investimentos em cashflow (isInvestment = true)
    const investments = await prisma.cashflowItem.findMany({
      where: {
        group: {
          userId: user.id,
        },
        isInvestment: true,
        isActive: true,
      },
      include: {
        valores: true,
      },
    });

    // Calcular totais do portfolio de ações
    const stocksTotalInvested = portfolio.reduce((sum, item) => sum + item.totalInvested, 0);
    
    // Para valor atual das ações, vamos usar uma variação simulada baseada no investido
    // Em um sistema real, você integraria com uma API de cotações
    const stocksCurrentValue = portfolio.reduce((sum, item) => {
      // Simulando variação entre -10% e +25% para cada ação
      const variation = 0.95 + (Math.random() * 0.4); // 0.95 a 1.35
      return sum + (item.totalInvested * variation);
    }, 0);

    // Calcular totais dos outros investimentos
    const otherInvestmentsTotalInvested = investments.reduce((sum, item) => {
      const totalValores = item.valores.reduce((sumValores, valor) => sumValores + valor.valor, 0);
      return sum + totalValores;
    }, 0);

    // Para outros investimentos, simular variação mais conservadora
    const otherInvestmentsCurrentValue = otherInvestmentsTotalInvested * (1.02 + (Math.random() * 0.08)); // 2% a 10%

    // Totais consolidados
    const valorAplicado = stocksTotalInvested + otherInvestmentsTotalInvested;
    const saldoBruto = stocksCurrentValue + otherInvestmentsCurrentValue;
    const rentabilidade = valorAplicado > 0 ? ((saldoBruto - valorAplicado) / valorAplicado) * 100 : 0;

    // Buscar meta de patrimônio (se existir no DashboardData)
    const metaPatrimonio = await prisma.dashboardData.findFirst({
      where: {
        userId: user.id,
        metric: 'meta_patrimonio',
      },
    });

    // Histórico simulado dos últimos 12 meses
    const historicoPatrimonio = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const baseValue = valorAplicado * 0.7; // Valor base há 12 meses
      const crescimento = (12 - i) * 0.08; // 8% de crescimento médio por mês
      const variacao = (Math.random() - 0.5) * 0.1; // ±5% de variação aleatória
      const valor = baseValue * (1 + crescimento + variacao);
      
      historicoPatrimonio.push({
        data: data.getTime(),
        valor: Math.round(valor * 100) / 100,
      });
    }

    // Buscar investimentos categorizados por tipo
    const categorizedInvestments = await prisma.cashflowItem.findMany({
      where: {
        group: {
          userId: user.id,
        },
        isInvestment: true,
        isActive: true,
      },
      include: {
        valores: true,
      },
    });

    // Inicializar contadores para cada categoria
    const categorias = {
      reservaOportunidade: 0,
      rendaFixaFundos: 0,
      fimFia: 0,
      fiis: 0,
      acoes: stocksCurrentValue, // Valor real das ações do portfolio
      stocks: 0,
      reits: 0,
      etfs: 0,
      moedasCriptos: 0,
      previdenciaSeguros: 0,
      opcoes: 0,
    };

    // Categorizar investimentos baseado na descrição/categoria
    categorizedInvestments.forEach(investment => {
      const totalValor = investment.valores.reduce((sum, valor) => sum + valor.valor, 0);
      const categoria = investment.categoria?.toLowerCase() || '';
      const descricao = investment.descricao.toLowerCase();

      // Lógica de categorização baseada em palavras-chave
      if (descricao.includes('reserva') || descricao.includes('emergencia') || categoria.includes('reserva')) {
        categorias.reservaOportunidade += totalValor;
      } else if (descricao.includes('cdb') || descricao.includes('lci') || descricao.includes('lca') || 
                 descricao.includes('tesouro') || descricao.includes('renda fixa') || categoria.includes('renda fixa')) {
        categorias.rendaFixaFundos += totalValor;
      } else if (descricao.includes('fim') || descricao.includes('fia') || descricao.includes('fundo') || categoria.includes('fundo')) {
        categorias.fimFia += totalValor;
      } else if (descricao.includes('fii') || descricao.includes('imobiliario') || categoria.includes('fii')) {
        categorias.fiis += totalValor;
      } else if (descricao.includes('stock') || descricao.includes('exterior') || categoria.includes('exterior')) {
        categorias.stocks += totalValor;
      } else if (descricao.includes('reit') || categoria.includes('reit')) {
        categorias.reits += totalValor;
      } else if (descricao.includes('etf') || categoria.includes('etf')) {
        categorias.etfs += totalValor;
      } else if (descricao.includes('crypto') || descricao.includes('bitcoin') || descricao.includes('moeda') || 
                 categoria.includes('crypto') || categoria.includes('moeda')) {
        categorias.moedasCriptos += totalValor;
      } else if (descricao.includes('previdencia') || descricao.includes('seguro') || categoria.includes('previdencia')) {
        categorias.previdenciaSeguros += totalValor;
      } else if (descricao.includes('opcao') || descricao.includes('option') || categoria.includes('opcao')) {
        categorias.opcoes += totalValor;
      } else {
        // Se não se encaixa em nenhuma categoria específica, vai para renda fixa
        categorias.rendaFixaFundos += totalValor;
      }
    });

    // Calcular total para percentuais
    const totalCategorizado = Object.values(categorias).reduce((sum, valor) => sum + valor, 0);

    // Se não há investimentos categorizados, usar valor bruto como base
    const baseValue = totalCategorizado > 0 ? totalCategorizado : saldoBruto;

    // Distribuição por tipo de investimento com dados reais
    const distribuicao = {
      reservaOportunidade: {
        valor: Math.round(categorias.reservaOportunidade * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.reservaOportunidade / baseValue) * 10000) / 100 : 0,
      },
      rendaFixaFundos: {
        valor: Math.round(categorias.rendaFixaFundos * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.rendaFixaFundos / baseValue) * 10000) / 100 : 0,
      },
      fimFia: {
        valor: Math.round(categorias.fimFia * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.fimFia / baseValue) * 10000) / 100 : 0,
      },
      fiis: {
        valor: Math.round(categorias.fiis * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.fiis / baseValue) * 10000) / 100 : 0,
      },
      acoes: {
        valor: Math.round(categorias.acoes * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.acoes / baseValue) * 10000) / 100 : 0,
      },
      stocks: {
        valor: Math.round(categorias.stocks * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.stocks / baseValue) * 10000) / 100 : 0,
      },
      reits: {
        valor: Math.round(categorias.reits * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.reits / baseValue) * 10000) / 100 : 0,
      },
      etfs: {
        valor: Math.round(categorias.etfs * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.etfs / baseValue) * 10000) / 100 : 0,
      },
      moedasCriptos: {
        valor: Math.round(categorias.moedasCriptos * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.moedasCriptos / baseValue) * 10000) / 100 : 0,
      },
      previdenciaSeguros: {
        valor: Math.round(categorias.previdenciaSeguros * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.previdenciaSeguros / baseValue) * 10000) / 100 : 0,
      },
      opcoes: {
        valor: Math.round(categorias.opcoes * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.opcoes / baseValue) * 10000) / 100 : 0,
      },
    };

    const resumo = {
      saldoBruto: Math.round(saldoBruto * 100) / 100,
      valorAplicado: Math.round(valorAplicado * 100) / 100,
      rentabilidade: Math.round(rentabilidade * 100) / 100,
      metaPatrimonio: metaPatrimonio?.value || 500000,
      historicoPatrimonio,
      distribuicao,
      portfolioDetalhes: {
        totalAcoes: portfolio.length,
        totalInvestimentos: investments.length,
        stocksTotalInvested: Math.round(stocksTotalInvested * 100) / 100,
        stocksCurrentValue: Math.round(stocksCurrentValue * 100) / 100,
        otherInvestmentsTotalInvested: Math.round(otherInvestmentsTotalInvested * 100) / 100,
        otherInvestmentsCurrentValue: Math.round(otherInvestmentsCurrentValue * 100) / 100,
      },
    };

    return NextResponse.json(resumo);
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar resumo da carteira:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST para atualizar meta de patrimônio
export async function POST(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { metaPatrimonio } = await request.json();

    if (!metaPatrimonio || metaPatrimonio <= 0) {
      return NextResponse.json({ 
        error: 'Meta de patrimônio deve ser um valor positivo' 
      }, { status: 400 });
    }

    // Criar ou atualizar meta no DashboardData
    const existingMeta = await prisma.dashboardData.findFirst({
      where: {
        userId: user.id,
        metric: 'meta_patrimonio',
      },
    });

    if (existingMeta) {
      await prisma.dashboardData.update({
        where: { id: existingMeta.id },
        data: { value: metaPatrimonio },
      });
    } else {
      await prisma.dashboardData.create({
        data: {
          userId: user.id,
          metric: 'meta_patrimonio',
          value: metaPatrimonio,
        },
      });
    }

    return NextResponse.json({ success: true, metaPatrimonio });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao atualizar meta de patrimônio:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 