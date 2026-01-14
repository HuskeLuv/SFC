import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';

// Tipos de índices disponíveis - todos buscados da brapi
// Nota: CDI não está disponível na brapi, então foi removido
const INDICES = {
  IBOV: '^BVSP',
};

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
 * Busca dados históricos de CDI (usando SELIC como proxy) da brapi via endpoint /api/v2/prime-rate
 */
const fetchCDIHistory = async (startDate?: Date): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Formatar datas no formato DD/MM/YYYY
    const hoje = new Date();
    const endStr = `${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;
    
    // Se não temos startDate, usar uma data de início padrão (1 ano atrás)
    const dataInicio = startDate || new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    const startStr = `${dataInicio.getDate().toString().padStart(2, '0')}/${(dataInicio.getMonth() + 1).toString().padStart(2, '0')}/${dataInicio.getFullYear()}`;
    
    let url = `https://brapi.dev/api/v2/prime-rate?country=brazil&start=${startStr}&end=${endStr}&historical=true&sortBy=date&sortOrder=asc`;
    
    if (apiKey) {
      url += `&token=${apiKey}`;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Erro ao buscar CDI (SELIC): HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data['prime-rate'] || !Array.isArray(data['prime-rate']) || data['prime-rate'].length === 0) {
      return [];
    }
    
    // Converter dados do SELIC (usado como CDI) para o formato IndexData
    // O endpoint retorna epochDate em milissegundos e value como string
    let indexData = data['prime-rate'].map((item: any) => ({
      date: item.epochDate || new Date(item.date.split('/').reverse().join('-')).getTime(),
      value: parseFloat(item.value) || 0,
    }));

    // Filtrar por startDate se fornecido
    if (startDate) {
      const startTimestamp = startDate.getTime();
      indexData = indexData.filter((item: IndexData) => item.date >= startTimestamp);
    }
    
    // Filtrar dados futuros (não mostrar além do dia atual)
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();
      indexData = indexData.filter((item: IndexData) => item.date <= hojeTimestamp);
    
    return indexData;
  } catch (error) {
    console.error('Erro ao buscar histórico de CDI (SELIC):', error);
    return [];
  }
};

/**
 * Busca dados históricos de IPCA da brapi via endpoint /api/v2/inflation
 */
const fetchIPCAHistory = async (startDate?: Date): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Formatar datas no formato DD/MM/YYYY
    const hoje = new Date();
    const endStr = `${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;
    
    // Se não temos startDate, usar uma data de início padrão (1 ano atrás)
    const dataInicio = startDate || new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    const startStr = `${dataInicio.getDate().toString().padStart(2, '0')}/${(dataInicio.getMonth() + 1).toString().padStart(2, '0')}/${dataInicio.getFullYear()}`;
    
    let url = `https://brapi.dev/api/v2/inflation?country=brazil&start=${startStr}&end=${endStr}&historical=true&sortBy=date&sortOrder=asc`;
    
    if (apiKey) {
      url += `&token=${apiKey}`;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Erro ao buscar IPCA: HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.inflation || !Array.isArray(data.inflation) || data.inflation.length === 0) {
      return [];
    }
    
    // Converter dados do IPCA para o formato IndexData
    // O endpoint retorna epochDate em milissegundos e value como string
    let indexData = data.inflation.map((item: any) => ({
      date: item.epochDate || new Date(item.date.split('/').reverse().join('-')).getTime(),
      value: parseFloat(item.value) || 0,
    }));

    // Filtrar por startDate se fornecido
    if (startDate) {
      const startTimestamp = startDate.getTime();
      indexData = indexData.filter((item: IndexData) => item.date >= startTimestamp);
    }
    
    // Filtrar dados futuros (não mostrar além do dia atual)
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();
      indexData = indexData.filter((item: IndexData) => item.date <= hojeTimestamp);
    
    return indexData;
  } catch (error) {
    console.error('Erro ao buscar histórico de IPCA:', error);
    return [];
  }
};

/**
 * Busca dados históricos de um índice da brapi via endpoint /api/quote
 */
const fetchIndexHistory = async (symbol: string, range: '1d' | '1mo' | '1y', startDate?: Date): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Se temos uma startDate, usar range maior para garantir que temos dados suficientes
    // e depois filtrar. Para períodos 1d e 1mo com startDate, buscar range maior
    let brapiRange: '1d' | '1mo' | '1y' | '2y' = range;
    if ((range === '1d' || range === '1mo') && startDate) {
      // Calcular quantos dias desde startDate
      const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      // Se mais de 1 ano, usar 2y, caso contrário usar 1y
      brapiRange = daysSinceStart > 365 ? '2y' : '1y';
    }

    // Mapear range para formato da brapi
    const rangeMap: Record<string, string> = {
      '1d': '1d',
      '1mo': '1mo',
      '1y': '1y',
      '2y': '2y',
    };

    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/quote/${symbol}?range=${rangeMap[brapiRange]}&interval=1d${tokenParam}`;
    
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
    
    let indexData = historicalData.map((item: any) => ({
      date: item.date * 1000, // Converter de segundos para milissegundos
      value: item.close || 0,
    }));

    // Filtrar por startDate se fornecido
    if (startDate) {
      const startTimestamp = startDate.getTime();
      indexData = indexData.filter((item: IndexData) => item.date >= startTimestamp);
    }
    
    // Filtrar dados futuros (não mostrar além do dia atual)
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();
      indexData = indexData.filter((item: IndexData) => item.date <= hojeTimestamp);
    
    return indexData;
  } catch (error) {
    console.error(`Erro ao buscar histórico de ${symbol}:`, error);
    return [];
  }
};

/**
 * Calcula retorno percentual do índice baseado no primeiro valor
 * Este percentual representa quanto qualquer valor inicial teria rendido se investido no índice
 */
const calculateReturns = (data: IndexData[]): IndexData[] => {
  if (data.length === 0) return [];
  
  const firstValue = data[0].value;
  if (firstValue === 0) return data;
  
  // Calcular variação percentual do índice (quanto qualquer valor inicial teria rendido)
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
    const startDateParam = searchParams.get('startDate');
    
    let startDate: Date | undefined;
    if (startDateParam) {
      startDate = new Date(parseInt(startDateParam, 10));
    }
    
    const results: IndexResponse[] = [];
    
    // Buscar IBOV via endpoint /api/quote
    for (const [name, symbol] of Object.entries(INDICES)) {
      const data = await fetchIndexHistory(symbol, range, startDate);
      if (data.length > 0) {
        const returns = calculateReturns(data);
        results.push({
          symbol,
          name,
          data: returns,
        });
      }
    }
    
    // Buscar CDI (usando SELIC) via endpoint /api/v2/prime-rate
    const cdiData = await fetchCDIHistory(startDate);
    if (cdiData.length > 0) {
      const cdiReturns = calculateReturns(cdiData);
      results.push({
        symbol: 'CDI',
        name: 'CDI',
        data: cdiReturns,
      });
    }
    
    // Buscar IPCA via endpoint /api/v2/inflation
    const ipcaData = await fetchIPCAHistory(startDate);
    if (ipcaData.length > 0) {
      const ipcaReturns = calculateReturns(ipcaData);
      results.push({
        symbol: 'IPCA',
        name: 'IPCA',
        data: ipcaReturns,
      });
    }
    
    return NextResponse.json({ indices: results });
  } catch (error) {
    console.error('Erro ao buscar índices:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados de índices' },
      { status: 500 }
    );
  }
}

