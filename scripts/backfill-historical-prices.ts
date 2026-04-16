/**
 * Backfill missing historical prices using BRAPI's historical data endpoint.
 * Fetches daily prices for the last month for all portfolio-held assets,
 * filling in the gaps from the cron outage (April 11-14, 2026).
 *
 * Run with: npx tsx scripts/backfill-historical-prices.ts
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import Brapi from 'brapi';

const prisma = new PrismaClient();

const BATCH_SIZE = 5; // Smaller batches for historical data (heavier responses)
const BATCH_DELAY = 500;

async function backfillHistoricalPrices() {
  const startTime = Date.now();
  console.log('=== HISTORICAL PRICE BACKFILL ===');
  console.log(`Date: ${new Date().toISOString()}\n`);

  const apiKey = process.env.BRAPI_API_KEY;
  if (!apiKey) {
    console.error('BRAPI_API_KEY not set');
    process.exit(1);
  }

  const client = new Brapi({ apiKey, maxRetries: 2, timeout: 25000 });

  // Get assets users actually hold (non-crypto, non-currency — those don't have historical data via quote endpoint)
  const heldAssets = await prisma.asset.findMany({
    where: {
      portfolios: { some: {} },
      type: {
        notIn: ['crypto', 'currency', 'emergency', 'opportunity', 'personalizado', 'imovel'],
      },
      source: { not: 'manual' },
      symbol: { not: { startsWith: 'RESERVA-' } },
    },
    select: { id: true, symbol: true, type: true, currency: true },
  });

  const validAssets = heldAssets.filter(
    (a) =>
      !a.symbol.startsWith('RENDA-FIXA') &&
      !a.symbol.startsWith('CONTA-CORRENTE') &&
      !a.symbol.startsWith('-') &&
      /^[A-Za-z]/.test(a.symbol),
  );

  console.log(`${validAssets.length} portfolio-held assets to backfill\n`);

  const assetBySymbol = new Map(validAssets.map((a) => [a.symbol.toUpperCase(), a]));
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  const symbols = validAssets.map((a) => a.symbol.trim().toUpperCase());

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const tickers = batch.join(',');

    try {
      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${tickers}`,
      );

      const response = await client.quote.retrieve(tickers, {
        range: '1mo',
        interval: '1d',
      });

      if (!response.results || !Array.isArray(response.results)) {
        console.warn('  No results');
        continue;
      }

      for (const result of response.results) {
        const symbol = result.symbol?.toUpperCase();
        if (!symbol) continue;
        const asset = assetBySymbol.get(symbol);
        if (!asset) continue;

        const history = result.historicalDataPrice;
        if (!history || !Array.isArray(history) || history.length === 0) {
          console.log(`  ${symbol}: no historical data`);
          continue;
        }

        for (const point of history) {
          if (!point.close || point.close <= 0 || !point.date) continue;

          // point.date is a UNIX timestamp in seconds
          const dateObj = new Date(point.date * 1000);
          const dayDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

          try {
            const existing = await prisma.assetPriceHistory.findUnique({
              where: { symbol_date: { symbol, date: dayDate } },
            });

            if (existing) {
              // Update if price differs
              if (Number(existing.price) !== point.close) {
                await prisma.assetPriceHistory.update({
                  where: { symbol_date: { symbol, date: dayDate } },
                  data: { price: new Decimal(point.close) },
                });
                totalUpdated++;
              }
            } else {
              await prisma.assetPriceHistory.create({
                data: {
                  assetId: asset.id,
                  symbol,
                  price: new Decimal(point.close),
                  currency: asset.currency || 'BRL',
                  source: 'BRAPI',
                  date: dayDate,
                },
              });
              totalInserted++;
            }
          } catch {
            errors++;
          }
        }

        // Also update currentPrice to latest
        const latest = history[history.length - 1];
        if (latest?.close && latest.close > 0) {
          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              currentPrice: new Decimal(latest.close),
              priceUpdatedAt: new Date(),
            },
          });
        }

        console.log(`  ${symbol}: ${history.length} data points processed`);
      }

      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    } catch (err) {
      console.error(`  Batch error:`, err instanceof Error ? err.message : err);
      errors += batch.length;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== DONE (${duration}s) ===`);
  console.log(`Inserted: ${totalInserted}, Updated: ${totalUpdated}, Errors: ${errors}`);

  await prisma.$disconnect();
}

backfillHistoricalPrices().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
