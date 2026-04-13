import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '@/lib/prisma';

// ================== CONSTANTS ==================

const TESOURO_CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

/** Number of rows to upsert per transaction batch */
const BATCH_SIZE = 50;

/** Default: only parse rows from the last N days (daily cron) */
const DEFAULT_LOOKBACK_DAYS = 7;

/** CSV column separator */
const SEPARATOR = ';';

// ================== TYPES ==================

interface TesouroDiretoRow {
  bondType: string;
  maturityDate: Date;
  baseDate: Date;
  buyRate: number | null;
  sellRate: number | null;
  buyPU: number | null;
  sellPU: number | null;
  basePU: number | null;
}

export interface TesouroDiretoSyncResult {
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  latestDate: string | null;
  rowsParsed: number;
}

// ================== HELPERS ==================

/**
 * Parse Brazilian date format DD/MM/YYYY → Date
 */
const parseDateBR = (dateStr: string): Date => {
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}`);
};

/**
 * Parse Brazilian number format: "1.234,56" → 1234.56
 * Returns null for empty/invalid values.
 */
const parseBRNumber = (value: string): number | null => {
  if (!value || value.trim() === '') return null;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

/**
 * Parse a single CSV line into a TesouroDiretoRow.
 * Expected columns:
 *   0: Tipo Titulo
 *   1: Data Vencimento
 *   2: Data Base
 *   3: Taxa Compra Manha
 *   4: Taxa Venda Manha
 *   5: PU Compra Manha
 *   6: PU Venda Manha
 *   7: PU Base Manha
 */
const parseRow = (line: string): TesouroDiretoRow | null => {
  const cols = line.split(SEPARATOR);
  if (cols.length < 8) return null;

  const bondType = cols[0].trim();
  if (!bondType) return null;

  try {
    return {
      bondType,
      maturityDate: parseDateBR(cols[1].trim()),
      baseDate: parseDateBR(cols[2].trim()),
      buyRate: parseBRNumber(cols[3]),
      sellRate: parseBRNumber(cols[4]),
      buyPU: parseBRNumber(cols[5]),
      sellPU: parseBRNumber(cols[6]),
      basePU: parseBRNumber(cols[7]),
    };
  } catch {
    return null;
  }
};

// ================== CORE SYNC ==================

/**
 * Download and parse the Tesouro Transparente CSV, persisting recent bond prices.
 *
 * Strategy: download the full CSV (~13MB) but parse from the end,
 * stopping when rows are older than the cutoff date. This avoids
 * processing 500k+ historical rows on daily runs.
 *
 * @param lookbackDays  Number of days to look back (default 7 for daily cron)
 */
export async function runTesouroDiretoSync(
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
): Promise<TesouroDiretoSyncResult> {
  const startTime = Date.now();

  console.log('🏛️  Iniciando sincronização Tesouro Direto...');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`📆 Lookback: ${lookbackDays} dias`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let latestDate: string | null = null;
  let rowsParsed = 0;

  try {
    // 1. Download CSV
    console.log('📥 Baixando CSV do Tesouro Transparente...');
    const { data: csvText } = await axios.get<string>(TESOURO_CSV_URL, {
      responseType: 'text',
      timeout: 30000,
    });

    const lines = csvText.split('\n');
    console.log(`📄 CSV: ${lines.length} linhas, ~${(csvText.length / 1024 / 1024).toFixed(1)} MB`);

    // 2. Parse all lines, collecting rows within the lookback window.
    //    The CSV is NOT sorted by date, so we must scan all lines.
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
    cutoffDate.setHours(0, 0, 0, 0);

    const rows: TesouroDiretoRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = parseRow(line);
      if (!row) continue;

      if (row.baseDate >= cutoffDate) {
        rows.push(row);
        rowsParsed++;
      }
    }

    console.log(`📊 ${rowsParsed} linhas dentro do período de ${lookbackDays} dias`);

    if (rows.length === 0) {
      console.log('⚠️  Nenhuma linha encontrada no período. CSV pode estar desatualizado.');
      const duration = (Date.now() - startTime) / 1000;
      return { inserted, updated, errors, duration, latestDate, rowsParsed };
    }

    // Track latest date for reporting
    const latestBaseDate = rows.reduce(
      (max, r) => (r.baseDate > max ? r.baseDate : max),
      rows[0].baseDate,
    );
    latestDate = latestBaseDate.toISOString().split('T')[0];

    // 3. Upsert in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      try {
        const operations = batch.map((row) => {
          const data = {
            buyRate: row.buyRate !== null ? new Decimal(row.buyRate) : null,
            sellRate: row.sellRate !== null ? new Decimal(row.sellRate) : null,
            buyPU: row.buyPU !== null ? new Decimal(row.buyPU) : null,
            sellPU: row.sellPU !== null ? new Decimal(row.sellPU) : null,
            basePU: row.basePU !== null ? new Decimal(row.basePU) : null,
          };

          return prisma.tesouroDiretoPrice.upsert({
            where: {
              bondType_maturityDate_baseDate: {
                bondType: row.bondType,
                maturityDate: row.maturityDate,
                baseDate: row.baseDate,
              },
            },
            update: {
              ...data,
              updatedAt: new Date(),
            },
            create: {
              bondType: row.bondType,
              maturityDate: row.maturityDate,
              baseDate: row.baseDate,
              ...data,
            },
          });
        });

        // Check which ones already exist for insert/update counting
        const existingKeys = await prisma.tesouroDiretoPrice.findMany({
          where: {
            OR: batch.map((row) => ({
              bondType: row.bondType,
              maturityDate: row.maturityDate,
              baseDate: row.baseDate,
            })),
          },
          select: { bondType: true, maturityDate: true, baseDate: true },
        });

        const existingSet = new Set(
          existingKeys.map(
            (k) => `${k.bondType}|${k.maturityDate.toISOString()}|${k.baseDate.toISOString()}`,
          ),
        );

        await prisma.$transaction(operations);

        for (const row of batch) {
          const key = `${row.bondType}|${row.maturityDate.toISOString()}|${row.baseDate.toISOString()}`;
          if (existingSet.has(key)) {
            updated++;
          } else {
            inserted++;
          }
        }
      } catch (batchErr) {
        console.error(`❌ Erro no batch ${i}-${i + batch.length}:`, batchErr);
        errors += batch.length;
      }
    }

    // 4. Sync asset catalog (creates searchable Asset records for the wizard)
    await syncTesouroAssetCatalog();

    // 5. Bridge: update Asset.currentPrice for user-held Tesouro assets
    await bridgeTesouroToAssetPrices(latestBaseDate);
  } catch (error) {
    console.error('💥 Erro na sincronização Tesouro Direto:', error);
    throw error;
  }

  const duration = (Date.now() - startTime) / 1000;

  console.log('📊 Resultado Tesouro Direto:');
  console.log(`   • ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
  console.log(`   • Data mais recente: ${latestDate}`);
  console.log(`   • Duração: ${duration.toFixed(2)}s`);

  return { inserted, updated, errors, duration, latestDate, rowsParsed };
}

/**
 * Slugify a bond type name into a deterministic symbol fragment.
 * "Tesouro IPCA+ com Juros Semestrais" → "TESOURO-IPCA-COM-JUROS-SEMESTRAIS"
 */
function slugifyBondType(bondType: string): string {
  return bondType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9\s]/g, '') // strip special chars (the + in IPCA+)
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase();
}

/**
 * Create/update searchable Asset records for each active Tesouro bond.
 * These are the entries that appear in the wizard's autocomplete search.
 *
 * Symbol format: TD-TESOURO-SELIC-2029 (deterministic, stable across syncs)
 * Asset type: 'tesouro-direto'
 * Source: 'tesouro_gov'
 */
async function syncTesouroAssetCatalog(): Promise<void> {
  console.log('📚 Sincronizando catálogo de títulos Tesouro...');

  // Get distinct active bonds (with price data from the last 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const latestPrices = await prisma.tesouroDiretoPrice.findMany({
    where: { baseDate: { gte: cutoff } },
    distinct: ['bondType', 'maturityDate'],
    orderBy: { baseDate: 'desc' },
    select: { bondType: true, maturityDate: true, sellPU: true, sellRate: true, baseDate: true },
  });

  if (latestPrices.length === 0) {
    console.log('   ⚠️  Nenhum título com preço recente');
    return;
  }

  let synced = 0;
  for (const bond of latestPrices) {
    const maturityYear = bond.maturityDate.getFullYear();
    const slug = slugifyBondType(bond.bondType);
    const symbol = `TD-${slug}-${maturityYear}`;
    const name = `${bond.bondType} ${maturityYear}`;

    try {
      await prisma.asset.upsert({
        where: { symbol },
        update: {
          currentPrice: bond.sellPU,
          priceUpdatedAt: bond.baseDate,
        },
        create: {
          symbol,
          name,
          type: 'tesouro-direto',
          currency: 'BRL',
          source: 'tesouro_gov',
          currentPrice: bond.sellPU,
          priceUpdatedAt: bond.baseDate,
        },
      });
      synced++;
    } catch (err) {
      console.error(`   ❌ Erro ao sincronizar ${symbol}:`, err);
    }
  }

  console.log(`   ✅ ${synced} títulos no catálogo`);
}

/**
 * For each Tesouro asset in the user's portfolio that has explicit bond type + maturity,
 * look up the latest sellPU from TesouroDiretoPrice and update Asset.currentPrice.
 */
async function bridgeTesouroToAssetPrices(latestBaseDate: Date): Promise<void> {
  console.log('🔗 Atualizando preços de ativos Tesouro vinculados...');

  const tesourAssets = await prisma.fixedIncomeAsset.findMany({
    where: {
      tesouroBondType: { not: null },
      tesouroMaturity: { not: null },
    },
    include: { asset: { select: { id: true, symbol: true } } },
  });

  if (tesourAssets.length === 0) {
    console.log('   ℹ️  Nenhum ativo Tesouro vinculado encontrado');
    return;
  }

  let bridged = 0;
  for (const fi of tesourAssets) {
    if (!fi.tesouroBondType || !fi.tesouroMaturity) continue;

    const price = await prisma.tesouroDiretoPrice.findFirst({
      where: {
        bondType: fi.tesouroBondType,
        maturityDate: fi.tesouroMaturity,
      },
      orderBy: { baseDate: 'desc' },
      select: { sellPU: true, baseDate: true },
    });

    if (!price?.sellPU) continue;

    const now = new Date();
    await prisma.$transaction([
      prisma.asset.update({
        where: { id: fi.asset.id },
        data: {
          currentPrice: price.sellPU,
          priceUpdatedAt: now,
          source: 'tesouro_gov',
        },
      }),
      prisma.assetPriceHistory.upsert({
        where: {
          symbol_date: {
            symbol: fi.asset.symbol,
            date: latestBaseDate,
          },
        },
        update: { price: price.sellPU },
        create: {
          assetId: fi.asset.id,
          symbol: fi.asset.symbol,
          price: price.sellPU,
          currency: 'BRL',
          source: 'TESOURO_GOV',
          date: latestBaseDate,
        },
      }),
    ]);

    bridged++;
  }

  console.log(`   ✅ ${bridged} ativos Tesouro atualizados com PU de venda`);
}
