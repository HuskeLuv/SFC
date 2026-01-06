import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';

// Tipos de índices disponíveis
const INDICES = {
  IBOV: '^BVSP',
  IFIX: 'IFIX.SA',
  IBRX: 'IBRX.SA',
  'IMA-B': 'IMAB11.SA',
};

// Poupança e IPCA são calculados de forma diferente
const POUPANCA_ANUAL = 0.0685; // 6.85% ao ano (aproximado)
const IPCA_ANUAL = 0.045; // 4.5% ao ano (aproximado, deve vir de API externa)

interface IndexData {
  date: number;
  value: number;
}

interface IndexResponse {
  symbol: string;
  name: string;
  data: IndexData[];
}

/**
 * Calcula dados de Poupança baseado em taxa anual
 */
const calculatePoupancaData = (days: number): IndexData[] => {
  const data: IndexData[] = [];
  const today = new Date();
  const dailyRate = Math.pow(1 + POUPANCA_ANUAL, 1 / 365) - 1;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const daysFromStart = days - i;
    const value = Math.pow(1 + dailyRate, daysFromStart) * 100;
    data.push({
      date: date.getTime(),
      value: value - 100, // Retorno percentual
    });
  }
  
  return data;
};

/**
 * Calcula dados de IPCA baseado em taxa anual
 */
const calculateIPCAData = (days: number): IndexData[] => {
  const data: IndexData[] = [];
  const today = new Date();
  const dailyRate = Math.pow(1 + IPCA_ANUAL, 1 / 365) - 1;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const daysFromStart = days - i;
    const value = Math.pow(1 + dailyRate, daysFromStart) * 100;
    data.push({
      date: date.getTime(),
      value: value - 100, // Retorno percentual
    });
  }
  
  return data;
};

/**
 * Busca dados históricos de um índice da brapi
 */
const fetchIndexHistory = async (symbol: string, range: '1d' | '1mo' | '1y'): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Mapear range para formato da brapi
    const rangeMap: Record<string, string> = {
      '1d': '1d',
      '1mo': '1mo',
      '1y': '1y',
    };

    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/quote/${symbol}?range=${rangeMap[range]}&interval=1d${tokenParam}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Erro ao buscar ${symbol}: HTTP ${response.status}`);
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
    
    return historicalData.map((item: any) => ({
      date: item.date * 1000, // Converter de segundos para milissegundos
      value: item.close || 0,
    }));
  } catch (error) {
    console.error(`Erro ao buscar histórico de ${symbol}:`, error);
    return [];
  }
};

/**
 * Calcula retorno percentual baseado no primeiro valor
 */
const calculateReturns = (data: IndexData[]): IndexData[] => {
  if (data.length === 0) return [];
  
  const firstValue = data[0].value;
  if (firstValue === 0) return data;
  
  return data.map(item => ({
    date: item.date,
    value: ((item.value - firstValue) / firstValue) * 100,
  }));
};

export async function GET(request: NextRequest) {
  try {
    await requireAuthWithActing(request);
    
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get('range') || '1y') as '1d' | '1mo' | '1y';
    
    const results: IndexResponse[] = [];
    
    // Buscar dados de índices da brapi
    for (const [name, symbol] of Object.entries(INDICES)) {
      const data = await fetchIndexHistory(symbol, range);
      if (data.length > 0) {
        const returns = calculateReturns(data);
        results.push({
          symbol,
          name,
          data: returns,
        });
      }
    }
    
    // Adicionar Poupança
    const days = range === '1d' ? 1 : range === '1mo' ? 30 : 365;
    results.push({
      symbol: 'POUPANCA',
      name: 'Poupança',
      data: calculatePoupancaData(days),
    });
    
    // Adicionar IPCA
    results.push({
      symbol: 'IPCA',
      name: 'IPCA',
      data: calculateIPCAData(days),
    });
    
    return NextResponse.json({ indices: results });
  } catch (error) {
    console.error('Erro ao buscar índices:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados de índices' },
      { status: 500 }
    );
  }
}

