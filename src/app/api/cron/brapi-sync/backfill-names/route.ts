import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { fetchDetailedQuotes } from '@/services/pricing/brapiQuote';
import { classifyByName } from '@/services/pricing/brapiSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Backfill semanal: o sync diário ocasionalmente pega longName vazio do BRAPI
 * pra alguns ativos no batch (intermitência da API). Quando isso acontece, o
 * asset fica com `name=symbol` e o classifier não tem texto pra trabalhar —
 * FIIs viram 'stock', ETFs viram 'stock', e a aba FII some pro usuário.
 *
 * Esta rota varre os ativos source='brapi' com `name=symbol`, tenta longName
 * novamente, e quando vem reclassifica via classifyByName. Idempotente.
 *
 * Agendado em vercel.json: domingo 04:00 UTC (antes do sync diário das 07:00).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const startTime = Date.now();
  logger.info('📚 Backfill de nomes BRAPI pra ativos com name=symbol...');

  // Exclui crypto/currency: BRAPI confunde tickers de criptomoeda com ETFs
  // que carregam o mesmo símbolo no nome (XRP → "Bitwise XRP ETF").
  const candidates = await prisma.$queryRaw<
    Array<{ id: string; symbol: string; name: string; type: string }>
  >`
    SELECT id, symbol, name, type
    FROM assets
    WHERE source = 'brapi'
      AND name = symbol
      AND symbol ~ '^[A-Z]+[0-9]*$'
      AND type NOT IN ('crypto', 'currency')
    ORDER BY symbol
  `;

  if (candidates.length === 0) {
    return NextResponse.json({
      candidates: 0,
      nameUpdated: 0,
      typeChanged: 0,
      duration: (Date.now() - startTime) / 1000,
    });
  }

  let nameUpdated = 0;
  let typeChanged = 0;
  let noLongName = 0;
  let errors = 0;
  const typeMigrations: Record<string, number> = {};

  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const symbols = batch.map((a) => a.symbol);
    try {
      const results = await fetchDetailedQuotes(symbols);
      const resultBySymbol = new Map(results.map((r) => [r.symbol.toUpperCase(), r]));

      for (const asset of batch) {
        const r = resultBySymbol.get(asset.symbol.toUpperCase());
        const longName = r?.longName?.trim();
        if (!longName || longName.toUpperCase() === asset.symbol.toUpperCase()) {
          noLongName++;
          continue;
        }
        const newType = classifyByName(longName, asset.symbol, asset.type);
        const willChangeType = newType !== asset.type;
        if (willChangeType) {
          const key = `${asset.type} → ${newType}`;
          typeMigrations[key] = (typeMigrations[key] || 0) + 1;
          typeChanged++;
        }
        nameUpdated++;
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            name: longName,
            ...(willChangeType ? { type: newType } : {}),
          },
        });
      }
    } catch (err) {
      logger.warn(`Erro no batch ${i}-${i + BATCH_SIZE}:`, err);
      errors += batch.length;
    }
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  logger.info(
    `✅ Backfill BRAPI: ${nameUpdated} nomes, ${typeChanged} reclassificações, ${noLongName} sem longName, ${errors} erros em ${duration.toFixed(1)}s`,
  );

  return NextResponse.json({
    candidates: candidates.length,
    nameUpdated,
    typeChanged,
    noLongName,
    errors,
    typeMigrations,
    duration,
  });
});
