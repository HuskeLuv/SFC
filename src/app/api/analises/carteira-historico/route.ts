import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

interface IndexData {
  date: number;
  value: number;
}

/**
 * Busca histórico de preços de um ativo da brapi
 */
const fetchAssetHistory = async (symbol: string, startDate?: Date): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Calcular range baseado na data inicial
    let brapiRange = '1y';
    if (startDate) {
      const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      brapiRange = daysSinceStart > 365 ? '2y' : '1y';
    }

    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/quote/${symbol}?range=${brapiRange}&interval=1d${tokenParam}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Erro ao buscar histórico de ${symbol}: HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      return [];
    }

    const result = data.results[0];
    const historicalData = result.historicalDataPrice || [];
    
    if (!historicalData || historicalData.length === 0) {
      return [];
    }
    
    let assetData = historicalData.map((item: any) => ({
      date: item.date * 1000, // Converter de segundos para milissegundos
      value: item.close || 0,
    }));

    // Filtrar por startDate se fornecido
    if (startDate) {
      const startTimestamp = startDate.getTime();
      assetData = assetData.filter((item: IndexData) => item.date >= startTimestamp);
    }
    
    // Filtrar dados futuros
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();
    assetData = assetData.filter((item: IndexData) => {
      const dataTimestamp = item.date;
      return dataTimestamp <= hojeTimestamp;
    });
    
    return assetData;
  } catch (error) {
    console.error(`Erro ao buscar histórico de ${symbol}:`, error);
    return [];
  }
};

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    
    let startDate: Date | undefined;
    if (startDateParam) {
      startDate = new Date(parseInt(startDateParam, 10));
    }

    // Buscar todas as transações do usuário
    const transactions = await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
      },
      include: {
        stock: true,
        asset: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Filtrar transações que têm símbolo/ticker e podem ter histórico na brapi
    const transactionsFiltradas = transactions.filter(trans => {
      const symbol = trans.stock?.ticker || trans.asset?.symbol;
      if (!symbol) return false;
      
      // Excluir reservas, personalizados, imóveis
      if (trans.asset) {
        if (trans.asset.type === 'emergency' || trans.asset.type === 'opportunity' || 
            trans.asset.type === 'personalizado' || trans.asset.type === 'imovel') {
          return false;
        }
        if (symbol.startsWith('RESERVA-EMERG') || symbol.startsWith('RESERVA-OPORT') || 
            symbol.startsWith('PERSONALIZADO')) {
          return false;
        }
      }
      
      return true;
    });

    if (transactionsFiltradas.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Agrupar transações por símbolo
    const transactionsPorSimbolo = new Map<string, typeof transactionsFiltradas>();
    for (const trans of transactionsFiltradas) {
      const symbol = trans.stock?.ticker || trans.asset?.symbol;
      if (!symbol) continue;
      
      if (!transactionsPorSimbolo.has(symbol)) {
        transactionsPorSimbolo.set(symbol, []);
      }
      transactionsPorSimbolo.get(symbol)!.push(trans);
    }

    // Buscar histórico de preços para cada ativo
    const historicosPorAtivo = new Map<string, IndexData[]>();
    
    for (const symbol of transactionsPorSimbolo.keys()) {
      // Usar a data da primeira transação como startDate se não foi fornecido
      const primeiraTransacao = transactionsPorSimbolo.get(symbol)![0];
      const dataInicial = startDate || primeiraTransacao.date;
      const historico = await fetchAssetHistory(symbol, dataInicial);
      historicosPorAtivo.set(symbol, historico);
    }

    // Coletar todas as datas únicas dos históricos
    const todasAsDatas = new Set<number>();
    historicosPorAtivo.forEach(historico => {
      historico.forEach(item => todasAsDatas.add(item.date));
    });

    const datasOrdenadas = Array.from(todasAsDatas).sort((a, b) => a - b);

    if (datasOrdenadas.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Para cada data, calcular a quantidade acumulada de cada ativo até aquela data
    // e então calcular o patrimônio total
    const patrimonioPorData = new Map<number, number>();

    for (const data of datasOrdenadas) {
      let patrimonioTotal = 0;

      historicosPorAtivo.forEach((historico, symbol) => {
        // Calcular quantidade acumulada até esta data
        const transactionsDoAtivo = transactionsPorSimbolo.get(symbol) || [];
        let quantidadeAcumulada = 0;
        
        for (const trans of transactionsDoAtivo) {
          const transDate = trans.date.getTime();
          if (transDate <= data) {
            if (trans.type === 'compra') {
              quantidadeAcumulada += trans.quantity;
            } else if (trans.type === 'venda') {
              quantidadeAcumulada -= trans.quantity;
            }
          }
        }

        // Garantir que quantidade não fique negativa (não deve acontecer, mas por segurança)
        quantidadeAcumulada = Math.max(0, quantidadeAcumulada);
        
        if (quantidadeAcumulada > 0) {
          // Encontrar o preço histórico nesta data (ou o mais próximo antes)
          let precoNaData = 0;
          for (let i = historico.length - 1; i >= 0; i--) {
            if (historico[i].date <= data) {
              precoNaData = historico[i].value;
              break;
            }
          }

          if (precoNaData > 0) {
            patrimonioTotal += quantidadeAcumulada * precoNaData;
          }
        }
      });

      patrimonioPorData.set(data, patrimonioTotal);
    }

    // Converter para array e ordenar por data
    const historicoArray = Array.from(patrimonioPorData.entries())
      .map(([date, valor]) => ({ date, value: Math.round(valor * 100) / 100 }))
      .sort((a, b) => a.date - b.date);

    // Filtrar valores zero iniciais
    const primeiroValorNaoZero = historicoArray.find(item => item.value > 0);
    if (!primeiroValorNaoZero) {
      return NextResponse.json({ data: [] });
    }

    const historicoFiltrado = historicoArray.filter(item => 
      item.date >= primeiroValorNaoZero.date && item.value > 0
    );

    if (historicoFiltrado.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Calcular retorno percentual baseado no primeiro valor não-zero
    const firstValue = historicoFiltrado[0].value;

    const dataComRetorno = historicoFiltrado.map(item => ({
      date: item.date,
      value: ((item.value - firstValue) / firstValue) * 100,
    }));

    return NextResponse.json({ data: dataComRetorno });
  } catch (error) {
    console.error('Erro ao buscar histórico da carteira:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados da carteira' },
      { status: 500 }
    );
  }
}
