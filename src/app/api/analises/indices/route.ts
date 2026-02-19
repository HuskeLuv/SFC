import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { getAssetHistory } from '@/services/assetPriceService';

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
 * Busca dados históricos de CDI do banco de dados (tabela economic_indexes)
 */
const fetchCDIHistory = async (startDate?: Date): Promise<IndexData[]> => {
  try {
    const where: any = {
      indexType: 'CDI',
    };

    // Se temos startDate, filtrar por data
    if (startDate) {
      where.date = {
        gte: startDate,
      };
    }

    // Buscar dados do banco
    const cdiRecords = await prisma.economicIndex.findMany({
      where,
      orderBy: {
        date: 'asc',
      },
    });

    if (cdiRecords.length === 0) {
      console.warn('⚠️ CDI: Nenhum dado encontrado no banco de dados');
      return [];
    }

    // Converter para o formato IndexData
    // CDI está armazenado como decimal (ex: 0.00045 = 0.045% ao dia)
    // Precisamos converter para taxa anual para construir o índice
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();

    const indexData: IndexData[] = cdiRecords
      .filter(record => {
        const recordDate = new Date(record.date).getTime();
        return recordDate <= hojeTimestamp;
      })
      .map(record => {
        // Converter decimal para percentual anual
        // value está em decimal (0.00045 = taxa diária)
        // CDI diário: converter para taxa anual multiplicando por 252 dias úteis
        // Exemplo: 0.00045 * 252 * 100 = 11.34% ao ano
        const dailyRate = Number(record.value); // 0.00045 (taxa diária em decimal)
        const annualRate = dailyRate * 252 * 100; // Taxa anual em percentual (11.34%)
        
        return {
          date: new Date(record.date).getTime(),
          value: annualRate, // Taxa anual em percentual (ex: 11.34 para 11.34%)
        };
      });

    return indexData;
  } catch (error) {
    console.error('Erro ao buscar histórico de CDI do banco de dados:', error);
    return [];
  }
};

/**
 * Busca dados históricos de IPCA do banco de dados (tabela economic_indexes)
 */
const fetchIPCAHistory = async (startDate?: Date): Promise<IndexData[]> => {
  try {
    const where: any = {
      indexType: 'IPCA',
    };

    // Se temos startDate, filtrar por data
    if (startDate) {
      where.date = {
        gte: startDate,
      };
    }

    // Buscar dados do banco
    const ipcaRecords = await prisma.economicIndex.findMany({
      where,
      orderBy: {
        date: 'asc',
      },
    });

    if (ipcaRecords.length === 0) {
      console.warn('⚠️ IPCA: Nenhum dado encontrado no banco de dados');
      return [];
    }

    // Converter para o formato IndexData
    // IPCA está armazenado como decimal (ex: 0.0042 = 0.42% ao mês)
    // Precisamos converter para percentual mensal
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();

    const indexData: IndexData[] = ipcaRecords
      .filter(record => {
        const recordDate = new Date(record.date).getTime();
        return recordDate <= hojeTimestamp;
      })
      .map(record => {
        // Converter decimal para percentual mensal
        // value está em decimal (0.0042 = taxa mensal)
        // Exemplo: 0.0042 * 100 = 0.42% ao mês
        const monthlyRate = Number(record.value) * 100; // Taxa mensal em percentual (0.42%)
        
        return {
          date: new Date(record.date).getTime(),
          value: monthlyRate, // Taxa mensal em percentual (ex: 0.42 para 0.42%)
        };
      });

    return indexData;
  } catch (error) {
    console.error('Erro ao buscar histórico de IPCA do banco de dados:', error);
    if (error instanceof Error) {
      console.error('Detalhes do erro:', error.message, error.stack);
    }
    return [];
  }
};

/**
 * Calcula startDate e endDate com base no range.
 * Usa getAssetHistory (DB-first) com fallback BRAPI.
 */
const getRangeDates = (range: '1d' | '1mo' | '1y' | '2y', startDateParam?: Date) => {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '1d':
      start.setDate(start.getDate() - 1);
      break;
    case '1mo':
      start.setMonth(start.getMonth() - 1);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case '2y':
      start.setFullYear(start.getFullYear() - 2);
      break;
    default:
      start.setFullYear(start.getFullYear() - 1);
  }

  const startDate = startDateParam && startDateParam < start ? startDateParam : start;
  return { startDate, endDate: end };
};

/**
 * Busca dados de benchmarks na tabela benchmark_cumulative_returns.
 * Retorna no formato { date, value }[] (value = rentabilidade acumulada %).
 */
const toUtcStartOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));

const toUtcEndOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));

const fetchBenchmarkCumulativeReturns = async (
  benchmarkType: string,
  startDate?: Date,
  endDate?: Date
): Promise<IndexData[]> => {
  const where: { benchmarkType: string; date?: { gte?: Date; lte?: Date } } = {
    benchmarkType,
  };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = toUtcStartOfDay(startDate);
    if (endDate) where.date.lte = toUtcEndOfDay(endDate);
  }

  const records = await prisma.benchmarkCumulativeReturn.findMany({
    where,
    orderBy: { date: 'asc' },
  });

  return records.map((r) => ({
    date: new Date(r.date).getTime(),
    value: Number(r.cumulativeReturn),
  }));
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
    const range = (searchParams.get('range') || '1y') as '1d' | '1mo' | '1y' | '2y';
    const startDateParam = searchParams.get('startDate');
    
    let startDate: Date | undefined;
    if (startDateParam) {
      startDate = new Date(parseInt(startDateParam, 10));
    }
    
    const { startDate: rangeStart, endDate: rangeEnd } = getRangeDates(range, startDate);
    const results: IndexResponse[] = [];
    
    // Prioridade 1: Buscar em benchmark_cumulative_returns (dados ingeridos externamente)
    const benchmarkTypes = ['CDI', 'IBOV', 'IPCA', 'POUPANCA'] as const;
    for (const benchmarkType of benchmarkTypes) {
      try {
        const data = await fetchBenchmarkCumulativeReturns(benchmarkType, rangeStart, rangeEnd);
        if (data.length > 0) {
          let filtered = data;
          if (startDate) {
            const startTs = startDate.getTime();
            filtered = data.filter((item) => item.date >= startTs);
          }
          const hoje = new Date();
          hoje.setHours(23, 59, 59, 999);
          filtered = filtered.filter((item) => item.date <= hoje.getTime());
          if (filtered.length > 0) {
            results.push({
              symbol: benchmarkType,
              name: benchmarkType === 'POUPANCA' ? 'Poupança' : benchmarkType,
              data: filtered,
            });
            console.log(`✅ ${benchmarkType}: ${filtered.length} pontos (benchmark_cumulative_returns)`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ ${benchmarkType} em benchmark_cumulative_returns:`, err);
      }
    }
    
    // Se já temos os 4 benchmarks, retornar
    if (results.length >= 4) {
      const validResults = results.filter((r) =>
        r.data.length > 0 &&
        r.data.every((item) => Number.isFinite(item.date) && Number.isFinite(item.value))
      );
      return NextResponse.json({ indices: validResults });
    }
    
    // Prioridade 2: Fallback para fontes originais (apenas para os que faltam)
    const hasBenchmark = (name: string) => results.some((r) => r.name === name || r.symbol === name);
    
    // Buscar IBOV: banco primeiro, fallback BRAPI (se não tiver em benchmark_cumulative_returns)
    if (!hasBenchmark('IBOV')) {
    for (const [name, symbol] of Object.entries(INDICES)) {
      try {
        const rawData = await getAssetHistory(symbol, rangeStart, rangeEnd);
        let data: IndexData[] = rawData.map(({ date, value }) => ({ date, value }));

        // Filtrar por startDate se fornecido
        if (startDate) {
          const startTimestamp = startDate.getTime();
          data = data.filter((item) => item.date >= startTimestamp);
        }

        // Filtrar dados futuros
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        const hojeTimestamp = hoje.getTime();
        data = data.filter((item) => item.date <= hojeTimestamp);
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
    }
    
    // Buscar CDI do banco de dados (se não tiver em benchmark_cumulative_returns)
    if (!hasBenchmark('CDI')) {
    try {
      const cdiData = await fetchCDIHistory(startDate);
      if (Array.isArray(cdiData) && cdiData.length > 0) {
        const dailyIndex = buildDailyIndexFromAnnualRate(cdiData);
        if (!validateIndexSeries(dailyIndex, 'CDI')) {
          console.error('[CDI] Série ignorada por validação.');
        } else {
          logSeriesStats(dailyIndex, 'CDI');
          const cdiReturns = normalizeToStartZero(dailyIndex, startDate);
          if (Array.isArray(cdiReturns) && cdiReturns.length > 0) {
            results.push({
              symbol: 'CDI',
              name: 'CDI',
              data: cdiReturns,
            });
          }
        }
        console.log(`✅ CDI: ${cdiData.length} pontos de dados`);
      } else {
        console.warn(`⚠️ CDI: Nenhum dado retornado`);
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar CDI:`, error);
    }
    }
    
    // Buscar IPCA do banco de dados (se não tiver em benchmark_cumulative_returns)
    if (!hasBenchmark('IPCA')) {
    try {
      const ipcaData = await fetchIPCAHistory(startDate);
      if (Array.isArray(ipcaData) && ipcaData.length > 0) {
        const monthlyIndex = isMonthlyRateSeries(ipcaData)
          ? buildMonthlyIndex(ipcaData)
          : normalizeMonthlySeries(ipcaData);
        const dailyIndex = interpolateDailyIndex(monthlyIndex);
        if (!validateIndexSeries(dailyIndex, 'IPCA')) {
          console.error('[IPCA] Série ignorada por validação.');
        } else {
          logSeriesStats(dailyIndex, 'IPCA');
          const ipcaReturns = normalizeToStartZero(dailyIndex, startDate);
          if (Array.isArray(ipcaReturns) && ipcaReturns.length > 0) {
            results.push({
              symbol: 'IPCA',
              name: 'IPCA',
              data: ipcaReturns,
            });
          }
        }
        console.log(`✅ IPCA: ${ipcaData.length} pontos de dados`);
      } else {
        console.warn(`⚠️ IPCA: Nenhum dado retornado`);
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar IPCA:`, error);
    }
    }
    
    // Garantir que todos os resultados têm a estrutura correta
    const validResults = results.filter(result => 
      result && 
      typeof result.name === 'string' &&
      typeof result.symbol === 'string' &&
      Array.isArray(result.data) &&
      result.data.length > 0 &&
      result.data.every(item => 
        item && 
        typeof item.date === 'number' && 
        typeof item.value === 'number' &&
        Number.isFinite(item.date) &&
        Number.isFinite(item.value)
      )
    );

    console.log(`📊 Total de índices retornados: ${validResults.length} (${results.length} processados)`);
    
    const ipcaSeries = validResults.find(item => item.name === 'IPCA')?.data || [];
    const cdiSeries = validResults.find(item => item.name === 'CDI')?.data || [];
    const ibovSeries = validResults.find(item => item.name === 'IBOV')?.data || [];

    const ipcaYears = getSeriesRangeYears(ipcaSeries);
    const ipcaLast = getLastValue(ipcaSeries);
    if (ipcaYears >= 8 && typeof ipcaLast === 'number' && ipcaLast > 200) {
      console.error(`[IPCA] Acumulado em ${ipcaYears.toFixed(1)} anos > 200% (valor=${ipcaLast.toFixed(2)}%).`);
    }

    // Validação removida: CDI pode ser maior que IBOV em alguns períodos,
    // especialmente em períodos de alta taxa de juros ou baixa performance do mercado de ações.
    // Isso é normal e não deve ser tratado como erro.

    validResults.forEach(series => {
      const lastValue = getLastValue(series.data);
      if (typeof lastValue === 'number' && lastValue > 300) {
        console.error(`[${series.name}] Acumulado acima de 300% (valor=${lastValue.toFixed(2)}%).`);
      }
    });
    
    return NextResponse.json({ indices: validResults });
  } catch (error) {
    console.error('Erro ao buscar índices:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados de índices' },
      { status: 500 }
    );
  }
}

