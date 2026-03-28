import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { ingestBenchmarkProfitability } from '@/services/benchmarkProfitabilityIngestion';
import { benchmarkIngestSchema, validationError } from '@/utils/validation-schemas';

/**
 * POST /api/analises/indices/ingest
 * Ingere dados de rentabilidade de benchmarks (CDI, IBOV, IPCA, Poupança)
 * a partir do formato dailyProfitabilityToChart.
 *
 * Body: { success, data: { dailyProfitabilityToChart: { categories, series } } }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthWithActing(request);

    const body = await request.json();
    const parsed = benchmarkIngestSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }
    const result = await ingestBenchmarkProfitability(parsed.data);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Erro ao ingerir benchmarks:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro ao ingerir dados de benchmarks',
      },
      { status: 500 },
    );
  }
}
