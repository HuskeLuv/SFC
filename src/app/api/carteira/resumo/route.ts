import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { fetchQuotes } from '@/services/brapiQuote';

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
        asset: true,
      },
    });

    // Buscar investimentos em cashflow (grupos tipo 'investimento')
    // Buscar templates e personalizações
    const investmentGroupsTemplate = await prisma.cashflowGroup.findMany({
      where: {
        userId: null,
        type: 'investimento',
      },
      include: {
        items: {
          include: {
            values: {
              where: {
                userId: user.id,
                year: new Date().getFullYear(),
              },
            },
          },
        },
      },
    });

    const investmentGroupsCustom = await prisma.cashflowGroup.findMany({
      where: {
        userId: user.id,
        type: 'investimento',
      },
      include: {
        items: {
          include: {
            values: {
              where: {
                userId: user.id,
                year: new Date().getFullYear(),
              },
            },
          },
        },
      },
    });

    // Mesclar grupos (personalizações têm prioridade)
    const allInvestmentGroups = [...investmentGroupsCustom];
    const templateMap = new Map(investmentGroupsTemplate.map(g => [g.name, g]));
    investmentGroupsCustom.forEach(custom => templateMap.delete(custom.name));
    allInvestmentGroups.push(...Array.from(templateMap.values()));

    // Coletar todos os itens de investimento
    const investments = allInvestmentGroups.flatMap(group => group.items || []);

    // Buscar cotações atuais dos ativos no portfolio
    const symbols = portfolio
      .map(item => {
        if (item.asset) {
          return item.asset.symbol;
        } else if (item.stock) {
          return item.stock.ticker;
        }
        return null;
      })
      .filter((symbol): symbol is string => symbol !== null);

    const quotes = await fetchQuotes(symbols);

    // Calcular totais do portfolio de ações
    const stocksTotalInvested = portfolio.reduce((sum, item) => sum + item.totalInvested, 0);
    
    // Calcular valor atual usando cotações da brapi.dev
    let stocksCurrentValue = 0;
    for (const item of portfolio) {
      const symbol = item.asset?.symbol || item.stock?.ticker;
      if (symbol) {
        const currentPrice = quotes.get(symbol);
        if (currentPrice) {
          // Valor atual = quantidade * cotação atual
          stocksCurrentValue += item.quantity * currentPrice;
        } else {
          // Se não conseguir a cotação, usar valor investido como fallback
          stocksCurrentValue += item.totalInvested;
        }
      } else {
        stocksCurrentValue += item.totalInvested;
      }
    }

    // Calcular totais dos outros investimentos
    const otherInvestmentsTotalInvested = investments.reduce((sum, item) => {
      const totalValues = (item.values || []).reduce((sumValues, value) => sumValues + value.value, 0);
      return sum + totalValues;
    }, 0);

    // Usar valor investido como valor atual (sem variação simulada)
    const otherInvestmentsCurrentValue = otherInvestmentsTotalInvested;

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

    // Buscar transações de ações para gerar histórico real
    const stockTransactions = await prisma.stockTransaction.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    });

    // Buscar investimentos em cashflow para gerar histórico real
    // Reutilizar os grupos já buscados acima ou buscar novamente
    const cashflowInvestments = investments;

    // Gerar histórico baseado nas transações reais
    const historicoPatrimonio = [];
    
    if (stockTransactions.length > 0 || cashflowInvestments.length > 0) {
      // Criar mapa de datas e valores acumulados
      const patrimonioPorData = new Map<number, number>();
      
      // Processar transações de ações
      let patrimonioAcoes = 0;
      stockTransactions.forEach(transaction => {
        if (transaction.type === 'compra') {
          patrimonioAcoes += transaction.total;
        } else if (transaction.type === 'venda') {
          patrimonioAcoes -= transaction.total;
        }
        
        const dataKey = new Date(transaction.date.getFullYear(), transaction.date.getMonth(), 1).getTime();
        patrimonioPorData.set(dataKey, (patrimonioPorData.get(dataKey) || 0) + patrimonioAcoes);
      });
      
      // Processar investimentos em cashflow
      let patrimonioCashflow = 0;
      cashflowInvestments.forEach(investment => {
        const totalValor = (investment.values || []).reduce((sum, value) => sum + value.value, 0);
        patrimonioCashflow += totalValor;
        
        // Usar data atual (campo dataVencimento não existe mais)
        const dataReferencia = new Date();
        const dataKey = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth(), 1).getTime();
        patrimonioPorData.set(dataKey, (patrimonioPorData.get(dataKey) || 0) + patrimonioCashflow);
      });
      
      // Converter para array e ordenar por data
      const historicoArray = Array.from(patrimonioPorData.entries())
        .map(([data, valor]) => ({ data, valor: Math.round(valor * 100) / 100 }))
        .sort((a, b) => a.data - b.data);
      
      // Se não há transações, usar valor atual
      if (historicoArray.length === 0) {
        historicoArray.push({
          data: new Date().getTime(),
          valor: Math.round(valorAplicado * 100) / 100,
        });
      }
      
      // Adicionar pontos intermediários para suavizar o gráfico
      const hoje = new Date();
      const primeiroAporte = new Date(Math.min(...historicoArray.map(h => h.data)));
      
      // Adicionar ponto inicial (antes do primeiro aporte)
      historicoPatrimonio.push({
        data: new Date(primeiroAporte.getFullYear(), primeiroAporte.getMonth() - 1, 1).getTime(),
        valor: 0,
      });
      
      // Adicionar pontos do histórico real
      historicoArray.forEach(ponto => {
        historicoPatrimonio.push(ponto);
      });
      
      // Adicionar ponto atual com valor atualizado (usando cotações)
      const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime();
      const ultimoMesHistorico = Math.max(...historicoArray.map(h => h.data));
      
      if (mesAtual > ultimoMesHistorico) {
        historicoPatrimonio.push({
          data: mesAtual,
          valor: Math.round(saldoBruto * 100) / 100, // Usar saldo bruto com cotações atuais
        });
      } else {
        // Se o último ponto já é do mês atual, atualizá-lo com valor real
        const ultimoIndice = historicoPatrimonio.findIndex(p => p.data === mesAtual);
        if (ultimoIndice !== -1) {
          historicoPatrimonio[ultimoIndice].valor = Math.round(saldoBruto * 100) / 100;
        }
      }
    } else {
      // Se não há transações, mostrar linha plana com valor atual
      const hoje = new Date();
      for (let i = 11; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        historicoPatrimonio.push({
          data: data.getTime(),
          valor: Math.round(valorAplicado * 100) / 100,
        });
      }
    }

    // Usar os investimentos já buscados acima
    const categorizedInvestments = investments;

    // Inicializar contadores para cada categoria
    const categorias = {
      reservaOportunidade: 0,
      rendaFixaFundos: 0,
      fimFia: 0,
      fiis: 0,
      acoes: 0,
      stocks: 0,
      reits: 0,
      etfs: 0,
      moedasCriptos: 0,
      previdenciaSeguros: 0,
      opcoes: 0,
    };

    // Categorizar portfolio baseado no tipo do ativo
    for (const item of portfolio) {
      const symbol = item.asset?.symbol || item.stock?.ticker;
      if (!symbol) continue;
      
      // Buscar o Asset correspondente para obter o tipo
      const asset = item.asset || await prisma.asset.findUnique({
        where: { symbol }
      });

      // Calcular valor atual com cotação
      const currentPrice = quotes.get(symbol);
      const valorAtual = currentPrice 
        ? item.quantity * currentPrice 
        : item.totalInvested; // Fallback para valor investido
      
      if (asset) {
        const tipo = asset.type?.toLowerCase() || '';
        
        switch (tipo) {
          case 'ação':
          case 'acao':
          case 'stock': {
            if (asset.currency === 'BRL') {
              categorias.acoes += valorAtual;
            } else {
              categorias.stocks += valorAtual;
            }
            break;
          }
          case 'bdr':
          case 'brd':
            categorias.stocks += valorAtual;
            break;
          case 'fii':
            categorias.fiis += valorAtual;
            break;
          case 'fund':
          case 'funds': {
            const symbolUpper = symbol.toUpperCase();
            const nameLower = (asset.name || '').toLowerCase();
            if (symbolUpper.endsWith('11') || nameLower.includes('fii') || nameLower.includes('imobili')) {
              categorias.fiis += valorAtual;
            } else {
              categorias.fimFia += valorAtual;
            }
            break;
          }
          case 'etf':
            categorias.etfs += valorAtual;
            break;
          case 'reit':
            categorias.reits += valorAtual;
            break;
          case 'crypto':
            categorias.moedasCriptos += valorAtual;
            break;
          case 'bond':
            categorias.rendaFixaFundos += valorAtual;
            break;
          case 'insurance':
            categorias.previdenciaSeguros += valorAtual;
            break;
          case 'currency':
            categorias.moedasCriptos += valorAtual;
            break;
          case 'cash':
            categorias.reservaOportunidade += valorAtual;
            break;
          case 'custom':
            categorias.fimFia += valorAtual;
            break;
          default:
            if (symbol.includes('11')) {
              categorias.fiis += valorAtual;
            } else {
              categorias.acoes += valorAtual;
            }
        }
      } else {
        // Se não encontrar o asset, usar heurística baseada no ticker
        if (symbol.includes('11')) {
          categorias.fiis += valorAtual; // FIIs geralmente terminam em 11
        } else {
          categorias.acoes += valorAtual; // Assumir ação por padrão
        }
      }
    }

    // Categorizar investimentos baseado no nome
    categorizedInvestments.forEach(investment => {
      const totalValor = (investment.values || []).reduce((sum, value) => sum + value.value, 0);
      const name = investment.name.toLowerCase();

      // Lógica de categorização baseada em palavras-chave no nome
      if (name.includes('reserva') || name.includes('emergencia')) {
        categorias.reservaOportunidade += totalValor;
      } else if (name.includes('cdb') || name.includes('lci') || name.includes('lca') || 
                 name.includes('tesouro') || name.includes('renda fixa')) {
        categorias.rendaFixaFundos += totalValor;
      } else if (name.includes('fim') || name.includes('fia') || name.includes('fundo')) {
        categorias.fimFia += totalValor;
      } else if (name.includes('fii') || name.includes('imobiliario')) {
        categorias.fiis += totalValor;
      } else if (name.includes('stock') || name.includes('exterior')) {
        categorias.stocks += totalValor;
      } else if (name.includes('reit')) {
        categorias.reits += totalValor;
      } else if (name.includes('etf')) {
        categorias.etfs += totalValor;
      } else if (name.includes('crypto') || name.includes('bitcoin') || name.includes('moeda')) {
        categorias.moedasCriptos += totalValor;
      } else if (name.includes('previdencia') || name.includes('seguro')) {
        categorias.previdenciaSeguros += totalValor;
      } else if (name.includes('opcao') || name.includes('option')) {
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
      metaPatrimonio: metaPatrimonio?.value || 0,
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
