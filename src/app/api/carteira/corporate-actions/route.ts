import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { getCorporateActions } from '@/services/pricing/dividendService';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/carteira/corporate-actions?symbol=HGLG11
 *
 * Returns corporate actions (splits/inplits/bonuses) for a given symbol.
 * DB-first with BRAPI fallback.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol é obrigatório' }, { status: 400 });
  }

  const actions = await getCorporateActions(symbol, { useBrapiFallback: true });

  return NextResponse.json({
    success: true,
    symbol: symbol.toUpperCase(),
    corporateActions: actions.map((a) => ({
      date: a.date.toISOString(),
      type: a.type,
      factor: a.factor,
      completeFactor: a.completeFactor,
      label:
        a.type === 'DESDOBRAMENTO'
          ? 'Split'
          : a.type === 'GRUPAMENTO'
            ? 'Inplit (Grupamento)'
            : a.type === 'BONIFICACAO'
              ? 'Bonificação'
              : a.type,
    })),
    count: actions.length,
  });
});
