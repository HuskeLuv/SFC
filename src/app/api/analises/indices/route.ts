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

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeDateStart = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const normalizeToStartZero = (data: IndexData[], startDate?: Date): IndexData[] => {
  if (data.length === 0) return [];

  const sorted = [...data].sort((a, b) => a.date - b.date);
  const filtered = startDate
    ? sorted.filter(item => item.date >= normalizeDateStart(startDate).getTime())
    : sorted;

  if (filtered.length === 0) return [];

  const values = filtered.map(item => Number(item.value)).filter(val => Number.isFinite(val));
  const baseValue = filtered[0].value;
  if (!Number.isFinite(baseValue) || baseValue === 0) {
    return filtered.map(item => ({
      date: item.date,
      value: 0,
    }));
  }

  const maxValue = values.length > 0 ? Math.max(...values) : baseValue;
  if (Math.abs(baseValue) < 1 && maxValue <= 300) {
    console.error('[normalizeToStartZero] Série já parece estar em % acumulado. Normalização abortada.');
    return [];
  }

  return filtered.map(item => ({
    date: item.date,
    value: ((item.value / baseValue) - 1) * 100,
  }));
};

const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const countBusinessDaysBetween = (start: number, end: number) => {
  let count = 0;
  for (let day = start; day <= end; day += DAY_MS) {
    if (isBusinessDay(new Date(day))) {
      count += 1;
    }
  }
  return count;
};

const validateIndexSeries = (data: IndexData[], name: string) => {
  if (data.length === 0) return false;

  const values = data.map(item => Number(item.value)).filter(val => Number.isFinite(val));
  if (values.length === 0) {
    console.error(`[${name}] Série inválida: valores não numéricos.`);
    return false;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (minValue <= 0) {
    console.error(`[${name}] Série inválida: índice não pode ser <= 0.`);
    return false;
  }

  if (maxValue < 20) {
    console.error(`[${name}] Série inválida: parece taxa/percentual, não índice base 100.`);
    return false;
  }

  if (maxValue > 1_000_000 || maxValue / Math.max(minValue, 1e-6) > 1000) {
    console.error(`[${name}] Série inválida: crescimento exponencial detectado.`);
    return false;
  }

  return true;
};

const logSeriesStats = (data: IndexData[], name: string) => {
  if (data.length < 2) return;
  const sorted = [...data].sort((a, b) => a.date - b.date);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const years = Math.max(1 / 365, (last.date - first.date) / (365 * DAY_MS));
  const cagr = Math.pow(last.value / first.value, 1 / years) - 1;
  console.log(
    `[${name}] inicial=${first.value.toFixed(2)} final=${last.value.toFixed(2)} CAGR=${(cagr * 100).toFixed(2)}%`
  );
};

const getSeriesRangeYears = (data: IndexData[]) => {
  if (data.length < 2) return 0;
  const sorted = [...data].sort((a, b) => a.date - b.date);
  return (sorted[sorted.length - 1].date - sorted[0].date) / (365 * DAY_MS);
};

const getLastValue = (data: IndexData[]) => {
  if (data.length === 0) return undefined;
  const sorted = [...data].sort((a, b) => a.date - b.date);
  return sorted[sorted.length - 1].value;
};

const fillMissingDaily = (data: IndexData[], endDate?: Date): IndexData[] => {
  if (data.length === 0) return [];

  const sorted = [...data].sort((a, b) => a.date - b.date);
  const start = normalizeDateStart(new Date(sorted[0].date)).getTime();
  const end = normalizeDateStart(endDate || new Date(sorted[sorted.length - 1].date)).getTime();

  const byDate = new Map(sorted.map(item => [normalizeDateStart(new Date(item.date)).getTime(), item.value]));
  const filled: IndexData[] = [];

  let lastValue = byDate.get(start) ?? sorted[0].value;
  for (let day = start; day <= end; day += DAY_MS) {
    const currentValue = byDate.get(day);
    if (Number.isFinite(currentValue)) {
      lastValue = currentValue as number;
    }

    filled.push({
      date: day,
      value: lastValue,
    });
  }

  return filled;
};

const normalizeMonthlySeries = (data: IndexData[]) => {
  const monthlyMap = new Map<number, IndexData>();
  data.forEach(item => {
    const date = new Date(item.date);
    const monthKey = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    monthlyMap.set(monthKey, { date: monthKey, value: item.value });
  });

  return Array.from(monthlyMap.values()).sort((a, b) => a.date - b.date);
};

const buildMonthlyIndex = (monthlyRates: IndexData[]): IndexData[] => {
  if (monthlyRates.length === 0) return [];

  const sorted = normalizeMonthlySeries(monthlyRates);
  const indexSeries: IndexData[] = [];
  let indexValue = 100;

  const firstMonth = normalizeDateStart(new Date(sorted[0].date));
  indexSeries.push({
    date: firstMonth.getTime(),
    value: indexValue,
  });

  sorted.forEach(item => {
    const rate = Number(item.value);
    if (!Number.isFinite(rate)) return;

    const monthStart = normalizeDateStart(new Date(item.date));
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    indexValue *= 1 + (rate / 100);
    indexSeries.push({
      date: nextMonthStart.getTime(),
      value: indexValue,
    });
  });

  return indexSeries;
};

const interpolateDailyIndex = (monthlyIndex: IndexData[], endDate?: Date): IndexData[] => {
  if (monthlyIndex.length === 0) return [];

  const sorted = normalizeMonthlySeries(monthlyIndex);
  const lastDate = normalizeDateStart(endDate || new Date()).getTime();
  const daily: IndexData[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const startDate = normalizeDateStart(new Date(current.date)).getTime();
    const endDateRange = next ? normalizeDateStart(new Date(next.date)).getTime() : lastDate + DAY_MS;

    const totalDays = Math.max(1, Math.round((endDateRange - startDate) / DAY_MS));
    let currentValue = current.value;
    const targetValue = next ? next.value : current.value;
    const dailyFactor = next ? Math.pow(targetValue / current.value, 1 / totalDays) : 1;

    for (let step = 0; step < totalDays; step += 1) {
      const day = startDate + (step * DAY_MS);
      if (day > lastDate) break;
      daily.push({ date: day, value: currentValue });
      currentValue *= dailyFactor;
    }
  }

  return daily;
};

const buildDailyIndexFromAnnualRate = (rateSeries: IndexData[], endDate?: Date): IndexData[] => {
  if (rateSeries.length === 0) return [];

  const sorted = [...rateSeries].sort((a, b) => a.date - b.date);
  const start = normalizeDateStart(new Date(sorted[0].date)).getTime();
  const end = normalizeDateStart(endDate || new Date()).getTime();
  let indexValue = 100;

  const byDate = new Map(sorted.map(item => [normalizeDateStart(new Date(item.date)).getTime(), item.value]));
  let currentRate = byDate.get(start) ?? sorted[0].value;
  const daily: IndexData[] = [{ date: start, value: indexValue }];

  for (let day = start + DAY_MS; day <= end; day += DAY_MS) {
    const newRate = byDate.get(day);
    if (Number.isFinite(newRate)) {
      currentRate = newRate as number;
    }

    if (isBusinessDay(new Date(day))) {
      const dailyFactor = Math.pow(1 + (Number(currentRate) / 100), 1 / 252);
      indexValue *= dailyFactor;
    }

    daily.push({ date: day, value: indexValue });
  }

  return daily;
};

const isMonthlyRateSeries = (data: IndexData[]): boolean => {
  if (data.length === 0) return true;
  const values = data
    .map(item => Math.abs(Number(item.value)))
    .filter(val => Number.isFinite(val));
  if (values.length === 0) return true;

  const maxValue = Math.max(...values);
  return maxValue <= 20;
};

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
    
    const response = await fetch(url, { 
      headers,
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Erro ao buscar CDI (SELIC): HTTP ${response.status} - ${errorText}`);
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
    // Para IPCA mensal, alinhar o início ao primeiro dia do mês
    const rawStart = startDate || new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    const dataInicio = new Date(rawStart.getFullYear(), rawStart.getMonth(), 1);
    const startStr = `${dataInicio.getDate().toString().padStart(2, '0')}/${(dataInicio.getMonth() + 1).toString().padStart(2, '0')}/${dataInicio.getFullYear()}`;
    
    let url = `https://brapi.dev/api/v2/inflation?country=brazil&start=${startStr}&end=${endStr}&historical=true&sortBy=date&sortOrder=asc`;
    
    if (apiKey) {
      url += `&token=${apiKey}`;
    }
    
    const response = await fetch(url, { 
      headers,
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Erro ao buscar IPCA: HTTP ${response.status} - ${errorText}`);
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

    return indexData;
  } catch (error) {
    console.error('Erro ao buscar histórico de IPCA:', error);
    if (error instanceof Error) {
      console.error('Detalhes do erro:', error.message, error.stack);
    }
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
    
    const response = await fetch(url, { 
      headers,
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Erro ao buscar ${symbol}: HTTP ${response.status} - ${errorText}`);
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
    if (error instanceof Error) {
      console.error('Detalhes do erro:', error.message, error.stack);
    }
    return [];
  }
};

const validateIbovGaps = (data: IndexData[]) => {
  if (data.length < 2) return true;
  const sorted = [...data].sort((a, b) => a.date - b.date);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = normalizeDateStart(new Date(sorted[i - 1].date)).getTime();
    const current = normalizeDateStart(new Date(sorted[i].date)).getTime();
    const businessDays = countBusinessDaysBetween(prev + DAY_MS, current);
    if (businessDays > 5) {
      console.error(`[IBOV] Buraco de ${businessDays} dias úteis sem dados.`);
      return false;
    }
  }
  return true;
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
      try {
        const data = await fetchIndexHistory(symbol, range, startDate);
        if (data.length > 0) {
          if (!validateIbovGaps(data)) {
            console.error(`[${name}] Série ignorada por buracos excessivos.`);
          } else {
            const filled = fillMissingDaily(data, new Date());
            if (!validateIndexSeries(filled, name)) {
              console.error(`[${name}] Série ignorada por validação.`);
            } else {
              logSeriesStats(filled, name);
              const returns = normalizeToStartZero(filled, startDate);
              results.push({
                symbol,
                name,
                data: returns,
              });
            }
          }
          console.log(`✅ ${name} (${symbol}): ${data.length} pontos de dados`);
        } else {
          console.warn(`⚠️ ${name} (${symbol}): Nenhum dado retornado`);
        }
      } catch (error) {
        console.error(`❌ Erro ao buscar ${name} (${symbol}):`, error);
      }
    }
    
    // Buscar CDI (usando SELIC) via endpoint /api/v2/prime-rate
    try {
      const cdiData = await fetchCDIHistory(startDate);
      if (cdiData.length > 0) {
        const dailyIndex = buildDailyIndexFromAnnualRate(cdiData);
        if (!validateIndexSeries(dailyIndex, 'CDI')) {
          console.error('[CDI] Série ignorada por validação.');
        } else {
          logSeriesStats(dailyIndex, 'CDI');
          const cdiReturns = normalizeToStartZero(dailyIndex, startDate);
          results.push({
            symbol: 'CDI',
            name: 'CDI',
            data: cdiReturns,
          });
        }
        console.log(`✅ CDI: ${cdiData.length} pontos de dados`);
      } else {
        console.warn(`⚠️ CDI: Nenhum dado retornado`);
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar CDI:`, error);
    }
    
    // Buscar IPCA via endpoint /api/v2/inflation
    try {
      const ipcaData = await fetchIPCAHistory(startDate);
      if (ipcaData.length > 0) {
        const monthlyIndex = isMonthlyRateSeries(ipcaData)
          ? buildMonthlyIndex(ipcaData)
          : normalizeMonthlySeries(ipcaData);
        const dailyIndex = interpolateDailyIndex(monthlyIndex);
        if (!validateIndexSeries(dailyIndex, 'IPCA')) {
          console.error('[IPCA] Série ignorada por validação.');
        } else {
          logSeriesStats(dailyIndex, 'IPCA');
          const ipcaReturns = normalizeToStartZero(dailyIndex, startDate);
          results.push({
            symbol: 'IPCA',
            name: 'IPCA',
            data: ipcaReturns,
          });
        }
        console.log(`✅ IPCA: ${ipcaData.length} pontos de dados`);
      } else {
        console.warn(`⚠️ IPCA: Nenhum dado retornado`);
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar IPCA:`, error);
    }
    
    console.log(`📊 Total de índices retornados: ${results.length}`);
    const ipcaSeries = results.find(item => item.name === 'IPCA')?.data || [];
    const cdiSeries = results.find(item => item.name === 'CDI')?.data || [];
    const ibovSeries = results.find(item => item.name === 'IBOV')?.data || [];

    const ipcaYears = getSeriesRangeYears(ipcaSeries);
    const ipcaLast = getLastValue(ipcaSeries);
    if (ipcaYears >= 8 && typeof ipcaLast === 'number' && ipcaLast > 200) {
      console.error(`[IPCA] Acumulado em ${ipcaYears.toFixed(1)} anos > 200% (valor=${ipcaLast.toFixed(2)}%).`);
    }

    const cdiYears = getSeriesRangeYears(cdiSeries);
    const cdiLast = getLastValue(cdiSeries);
    const ibovLast = getLastValue(ibovSeries);
    if (cdiYears >= 5 && typeof cdiLast === 'number' && typeof ibovLast === 'number' && cdiLast > ibovLast) {
      console.error(`[CDI] Acumulado maior que IBOV no longo prazo (CDI=${cdiLast.toFixed(2)}% IBOV=${ibovLast.toFixed(2)}%).`);
    }

    results.forEach(series => {
      const lastValue = getLastValue(series.data);
      if (typeof lastValue === 'number' && lastValue > 300) {
        console.error(`[${series.name}] Acumulado acima de 300% (valor=${lastValue.toFixed(2)}%).`);
      }
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

