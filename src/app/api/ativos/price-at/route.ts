/**
 * D.3 (checklist mai/28): fechamento de um ativo numa data específica.
 *
 * GET /api/ativos/price-at?symbol=PETR4&date=YYYY-MM-DD
 *
 * Usado pelo Step4 do wizard pra comparar o preço digitado pelo usuário
 * com o fechamento DO DIA DA COMPRA (em vez do preço atual). Compras
 * antigas (ex: aporte de 2022) ficavam com alerta de "preço diverge >20%"
 * comparando contra o fechamento de hoje — fora de contexto.
 *
 * Symbol como query param em vez de path param porque /api/ativos/[id]
 * (portfolioId) já existe no mesmo nível e o Next.js não aceita dois
 * segmentos dinâmicos paralelos.
 *
 * Estratégia: tenta o fechamento exato; se não houver registro nesse dia
 * (feriado/fim de semana/dia em que BRAPI não publicou), pega o fechamento
 * mais recente ANTES daquela data — comportamento ANBIMA. Sem fallback
 * pra BRAPI live: o front só precisa de comparação histórica de bolso,
 * não da cotação atual.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

const yyyyMmDdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuthWithActing(request);

  const params = request.nextUrl.searchParams;
  const symbol = (params.get('symbol') || '').trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol obrigatório' }, { status: 400 });
  }

  const dateParam = params.get('date');
  if (!dateParam || !yyyyMmDdRegex.test(dateParam)) {
    return NextResponse.json({ error: 'date deve ser YYYY-MM-DD' }, { status: 400 });
  }

  const [y, m, d] = dateParam.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(target.getTime())) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
  }

  // Janela de 30 dias antes do alvo cobre fins de semana longos, feriados
  // emendados e gaps eventuais do BRAPI sem retornar tabela inteira.
  const windowStart = new Date(target.getTime() - 30 * 24 * 60 * 60 * 1000);

  const row = await prisma.assetPriceHistory.findFirst({
    where: {
      symbol,
      date: { gte: windowStart, lte: target },
    },
    orderBy: { date: 'desc' },
    select: { date: true, price: true, source: true },
  });

  if (!row) {
    return NextResponse.json(
      { error: 'Sem histórico de preço pra essa data', symbol, date: dateParam },
      { status: 404 },
    );
  }

  return NextResponse.json({
    symbol,
    date: dateParam,
    effectiveDate: row.date.toISOString().split('T')[0],
    price: Number(row.price),
    source: row.source,
  });
});
