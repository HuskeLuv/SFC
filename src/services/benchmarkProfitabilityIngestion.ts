/**
 * Serviço para ingerir dados de rentabilidade de benchmarks (CDI, IBOV, IPCA, Poupança)
 * a partir do formato dailyProfitabilityToChart.
 *
 * Formato esperado:
 * {
 *   data: {
 *     dailyProfitabilityToChart: {
 *       categories: string[],  // datas ISO
 *       series: Array<{ name: string; data: number[] }>
 *     }
 *   }
 * }
 */

import prisma from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

const BENCHMARK_NAME_MAP: Record<string, string> = {
  CDI: 'CDI',
  IBOV: 'IBOV',
  'Inflação (IPCA)': 'IPCA',
  IPCA: 'IPCA',
  Poupança: 'POUPANCA',
  POUPANCA: 'POUPANCA',
};

export interface DailyProfitabilityInput {
  success?: boolean;
  data?: {
    dailyProfitabilityToChart?: {
      categories: string[];
      series: Array<{ name: string; data: number[] }>;
    };
  };
}

export interface IngestionResult {
  inserted: number;
  updated: number;
  errors: number;
  byBenchmark: Record<string, { inserted: number; updated: number }>;
}

const parseDate = (dateStr: string): Date => {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Extrai e persiste os dados de CDI, IBOV, IPCA e Poupança no banco.
 */
export const ingestBenchmarkProfitability = async (
  input: DailyProfitabilityInput
): Promise<IngestionResult> => {
  const result: IngestionResult = {
    inserted: 0,
    updated: 0,
    errors: 0,
    byBenchmark: {},
  };

  const chart = input?.data?.dailyProfitabilityToChart;
  if (!chart?.categories?.length || !chart?.series?.length) {
    throw new Error('Formato inválido: esperado data.dailyProfitabilityToChart com categories e series');
  }

  const { categories, series } = chart;

  for (const serie of series) {
    const benchmarkType = BENCHMARK_NAME_MAP[serie.name];
    if (!benchmarkType) continue;

    result.byBenchmark[benchmarkType] = { inserted: 0, updated: 0 };

    for (let i = 0; i < categories.length && i < serie.data.length; i++) {
      const dateStr = categories[i];
      const cumulativeReturn = serie.data[i];

      if (typeof cumulativeReturn !== 'number' || !Number.isFinite(cumulativeReturn)) {
        result.errors++;
        continue;
      }

      try {
        const date = parseDate(dateStr);

        const existing = await prisma.benchmarkCumulativeReturn.findUnique({
          where: {
            benchmarkType_date: { benchmarkType, date },
          },
        });

        await prisma.benchmarkCumulativeReturn.upsert({
          where: {
            benchmarkType_date: { benchmarkType, date },
          },
          update: {
            cumulativeReturn: new Decimal(cumulativeReturn),
            updatedAt: new Date(),
          },
          create: {
            date,
            benchmarkType,
            cumulativeReturn: new Decimal(cumulativeReturn),
          },
        });

        if (existing) {
          result.updated++;
          result.byBenchmark[benchmarkType].updated++;
        } else {
          result.inserted++;
          result.byBenchmark[benchmarkType].inserted++;
        }
      } catch (err) {
        console.error(`Erro ao salvar ${benchmarkType} ${dateStr}:`, err);
        result.errors++;
      }
    }
  }

  return result;
};
