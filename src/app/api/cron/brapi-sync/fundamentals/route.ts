import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncFundamentalsForSymbols } from '@/services/pricing/fundamentalsService';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron diário: sincroniza fundamentos (P/L, Beta, Dividend Yield) na tabela
 * `AssetFundamentals` a partir do `modules=defaultKeyStatistics` da BRAPI.
 *
 * Endereça o bug F1.9: até hoje a populção do AssetFundamentals dependia de
 * lazy fetch — só recebia escrita quando alguém abria /ativos/[id] pela 1ª
 * vez. Em produção, apenas 10/2794 ativos elegíveis tinham linha e mesmo
 * essas estavam com beta/dividendYield NULL porque o endpoint antigo
 * `?fundamental=true` não devolve esses campos.
 *
 * Escopo: ativos de origem BRAPI dos tipos stock/fii/etf/reit/fim-fia. Ignora
 * crypto/currency (fundamentos não fazem sentido pra esses) e ativos manuais
 * (RENDA-FIXA, PERSONALIZADO, etc.).
 *
 * Agendado em vercel.json: 07:30 UTC (depois do sync de preços/dividendos).
 * Limite Vercel: 60s. Sync rodando em batches de 15 (~187 batches pra 2.8k
 * ativos), com BRAPI a ~150ms por batch fica em ~30s. Margem confortável.
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

  // Pega apenas symbols únicos de ativos elegíveis. Ordenamos por symbol pra
  // resultado determinístico (facilita debug quando run X bate diferente de
  // run Y).
  const assets = await prisma.asset.findMany({
    where: {
      type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] },
      source: 'brapi',
    },
    select: { symbol: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });

  const symbols = assets.map((a) => a.symbol).filter((s) => /^[A-Z][A-Z0-9.]*$/i.test(s));

  if (symbols.length === 0) {
    return NextResponse.json({
      symbols: 0,
      processed: 0,
      updated: 0,
      withData: 0,
      errors: [],
      duration: (Date.now() - startTime) / 1000,
    });
  }

  logger.info(`📊 Cron fundamentos: ${symbols.length} symbols pra sincronizar`);

  const result = await syncFundamentalsForSymbols(symbols);
  const duration = (Date.now() - startTime) / 1000;

  logger.info(
    `✅ Cron fundamentos: ${result.updated}/${result.processed} upserts, ` +
      `${result.withData} com dados, ${result.errors.length} erros em ${duration.toFixed(1)}s`,
  );

  return NextResponse.json({
    symbols: symbols.length,
    ...result,
    duration,
  });
});
