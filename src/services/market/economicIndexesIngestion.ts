import axios from 'axios';
import prisma from '@/lib/prisma';

// ================== TYPES ==================

type BacenResponse = {
  data: string;
  valor: string;
}[];

interface SeriesConfig {
  seriesId: number;
  indexType: string;
  divideBy100: boolean;
}

interface IngestionResult {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  details: Record<string, { inserted: number; updated: number; errors: number }>;
}

// ================== SERIES CONFIG ==================

/**
 * All BACEN SGS series to ingest.
 *
 * divideBy100: BACEN returns percentage values (e.g. 0.054 for CDI daily rate).
 *   - true  → divide by 100 to store as decimal fraction
 *   - false → store the raw value (for SELIC_META in % p.a., annualized rates, and IMA-B absolute index values)
 */
export const BACEN_SERIES: readonly SeriesConfig[] = [
  // Existing — daily rates (percentage points, need /100)
  { seriesId: 12, indexType: 'CDI', divideBy100: true },
  { seriesId: 11, indexType: 'SELIC_DIARIA', divideBy100: true },

  // Target/annualized rates (stored as-is, e.g. 14.65% p.a.)
  { seriesId: 432, indexType: 'SELIC_META', divideBy100: false },
  { seriesId: 4389, indexType: 'CDI_ANUALIZADO', divideBy100: false },

  // Monthly inflation (percentage points, need /100)
  { seriesId: 433, indexType: 'IPCA', divideBy100: true },
  { seriesId: 7478, indexType: 'IPCA15', divideBy100: true },
  { seriesId: 189, indexType: 'IGPM', divideBy100: true },
  { seriesId: 190, indexType: 'IGPDI', divideBy100: true },
  { seriesId: 188, indexType: 'INPC', divideBy100: true },

  // Other rates
  { seriesId: 226, indexType: 'TR', divideBy100: true },
  { seriesId: 25, indexType: 'POUPANCA', divideBy100: true },
  { seriesId: 256, indexType: 'TJLP', divideBy100: false },

  // ANBIMA bond indices (absolute index values, via BACEN — free!)
  { seriesId: 12466, indexType: 'IMAB', divideBy100: false },
  { seriesId: 12467, indexType: 'IMAB5', divideBy100: false },
  { seriesId: 12468, indexType: 'IMAB5PLUS', divideBy100: false },
];

// ================== CONSTANTS ==================

/** Number of series to fetch concurrently */
const BATCH_CONCURRENCY = 3;

/** Delay between concurrent batches (ms) to respect BACEN rate limits */
const BATCH_DELAY_MS = 500;

/** Default lookback for daily cron runs (days) */
const DEFAULT_LOOKBACK_DAYS = 60;

/** Lookback for backfill runs (years) */
const BACKFILL_LOOKBACK_YEARS = 5;

// ================== HELPER FUNCTIONS ==================

/**
 * Converte data no formato brasileiro (DD/MM/YYYY) para Date
 */
const parseDateBR = (date: string): Date => {
  const [day, month, year] = date.split('/');
  return new Date(`${year}-${month}-${day}`);
};

/**
 * Formata uma Date para DD/MM/YYYY (formato BACEN)
 */
const formatDateBR = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Busca dados de uma série do BACEN SGS
 */
const fetchBacenSeries = async (
  seriesId: number,
  startDate?: string,
  endDate?: string,
): Promise<BacenResponse> => {
  let url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json`;

  if (startDate) {
    url += `&dataInicial=${startDate}`;
  }

  if (endDate) {
    url += `&dataFinal=${endDate}`;
  }

  const { data } = await axios.get<BacenResponse>(url);
  return data;
};

// ================== INGESTION FUNCTIONS ==================

/**
 * Ingere dados de um índice econômico a partir de uma série BACEN SGS
 */
const ingestIndex = async (
  series: SeriesConfig,
  startDate?: string,
  endDate?: string,
): Promise<{ inserted: number; updated: number; errors: number }> => {
  const { seriesId, indexType, divideBy100 } = series;

  console.log(`📊 Iniciando ingestão de ${indexType} (série ${seriesId})...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    const data = await fetchBacenSeries(seriesId, startDate, endDate);

    console.log(`📥 Recebidos ${data.length} registros de ${indexType}`);

    for (const item of data) {
      try {
        const date = parseDateBR(item.data);
        const rawValue = Number(item.valor);
        const value = divideBy100 ? rawValue / 100 : rawValue;

        const existing = await prisma.economicIndex.findUnique({
          where: {
            indexType_date: { indexType, date },
          },
        });

        await prisma.economicIndex.upsert({
          where: {
            indexType_date: { indexType, date },
          },
          update: {
            value,
            updatedAt: new Date(),
          },
          create: {
            indexType,
            date,
            value,
          },
        });

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar registro ${item.data} de ${indexType}:`, error);
        errors++;
      }
    }

    console.log(`✅ ${indexType}: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  } catch (error) {
    console.error(`💥 Erro ao buscar dados de ${indexType} (série ${seriesId}):`, error);
    throw error;
  }

  return { inserted, updated, errors };
};

/**
 * Executa a ingestão completa de todos os índices econômicos configurados.
 *
 * @param startDate  Data inicial no formato DD/MM/YYYY. Se omitido, usa 60 dias atrás.
 * @param endDate    Data final no formato DD/MM/YYYY (opcional).
 * @param backfill   Se true, usa 5 anos de lookback em vez do padrão de 60 dias.
 */
export const runEconomicIndexesIngestion = async (
  startDate?: string,
  endDate?: string,
  backfill = false,
): Promise<IngestionResult> => {
  const startTime = Date.now();

  console.log('🕐 Iniciando ingestão de índices econômicos...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`📋 Séries configuradas: ${BACEN_SERIES.length}`);

  // Determinar data inicial
  let finalStartDate = startDate;
  if (!finalStartDate) {
    const defaultDate = new Date();
    if (backfill) {
      defaultDate.setFullYear(defaultDate.getFullYear() - BACKFILL_LOOKBACK_YEARS);
    } else {
      defaultDate.setDate(defaultDate.getDate() - DEFAULT_LOOKBACK_DAYS);
    }
    finalStartDate = formatDateBR(defaultDate);
    const period = backfill ? `${BACKFILL_LOOKBACK_YEARS} anos` : `${DEFAULT_LOOKBACK_DAYS} dias`;
    console.log(`📆 Usando período padrão: ${finalStartDate} até hoje (${period})`);
  } else if (endDate) {
    console.log(`📆 Período: ${finalStartDate} a ${endDate}`);
  } else {
    console.log(`📆 A partir de: ${finalStartDate}`);
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  const details: Record<string, { inserted: number; updated: number; errors: number }> = {};

  // Process series in batches of BATCH_CONCURRENCY
  for (let i = 0; i < BACEN_SERIES.length; i += BATCH_CONCURRENCY) {
    const batch = BACEN_SERIES.slice(i, i + BATCH_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((series) => ingestIndex(series, finalStartDate, endDate)),
    );

    for (let j = 0; j < results.length; j++) {
      const series = batch[j];
      const result = results[j];

      if (result.status === 'fulfilled') {
        details[series.indexType] = result.value;
        totalInserted += result.value.inserted;
        totalUpdated += result.value.updated;
        totalErrors += result.value.errors;
      } else {
        console.warn(
          `⚠️  Falha ao ingerir ${series.indexType} (série ${series.seriesId}):`,
          result.reason,
        );
        details[series.indexType] = { inserted: 0, updated: 0, errors: 1 };
        totalErrors++;
      }
    }

    // Delay between batches (skip after last batch)
    if (i + BATCH_CONCURRENCY < BACEN_SERIES.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  const ingestionResult: IngestionResult = {
    inserted: totalInserted,
    updated: totalUpdated,
    errors: totalErrors,
    duration,
    details,
  };

  console.log('📊 Resultado da ingestão:');
  for (const [indexType, detail] of Object.entries(details)) {
    console.log(
      `   • ${indexType}: ${detail.inserted} inseridos, ${detail.updated} atualizados, ${detail.errors} erros`,
    );
  }
  console.log(
    `   • Total: ${totalInserted} inseridos, ${totalUpdated} atualizados, ${totalErrors} erros`,
  );
  console.log(`   • Duração: ${duration.toFixed(2)}s`);

  return ingestionResult;
};

/**
 * Testa a conexão com a API do BACEN
 */
export const testBacenConnection = async (): Promise<boolean> => {
  console.log('🧪 Testando conexão com API do BACEN...');

  try {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - 30);
    const startDate = formatDateBR(testDate);

    const data = await fetchBacenSeries(12, startDate);
    const isWorking = Array.isArray(data) && data.length > 0;

    if (isWorking) {
      console.log(`✅ Teste de conexão com BACEN passou! Recebidos ${data.length} registros.`);
    } else {
      console.log('❌ Teste de conexão com BACEN falhou!');
    }

    return isWorking;
  } catch (error) {
    console.error('❌ Erro no teste de conexão com BACEN:', error);
    return false;
  }
};
