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
import { APPLICABLE_CORPORATE_ACTION_TYPES } from '@/services/portfolio/corporateActions';
import { isRawPriceSource } from '@/services/pricing/sourcePrecedence';

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

  // O usuário digita o preço CRU que valia naquele dia — mas a escala da linha
  // armazenada depende da FONTE: BRAPI grava split-ADJUSTED (des-ajustamos
  // multiplicando pelos eventos posteriores à data), enquanto o COTAHIST da B3
  // grava o preço CRU da época (devolvido como está). Multiplicar linha crua
  // dobra o ajuste — ticket 24/08: PRIO3 02/06/2020 (COTAHIST R$33,59, split
  // 5:1 em 2021) era sugerido como R$167,95 e o aporte ficava 5× o real.
  const corporateActions = await prisma.assetCorporateAction.findMany({
    where: { symbol, type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
    select: { type: true, date: true, factor: true },
    orderBy: { date: 'asc' },
  });
  const rowMs = row.date.getTime();
  const actionsAfter = corporateActions.filter(
    (ca) => ca.date.getTime() > rowMs && Number.isFinite(ca.factor) && ca.factor > 0,
  );

  let rawPrice = Number(row.price);
  if (!isRawPriceSource(row.source)) {
    const cumFactorAfter = actionsAfter.reduce((f, ca) => f * ca.factor, 1);
    rawPrice = rawPrice * cumFactorAfter;
  }

  return NextResponse.json({
    symbol,
    date: dateParam,
    effectiveDate: row.date.toISOString().split('T')[0],
    price: rawPrice,
    source: row.source,
    // Eventos corporativos POSTERIORES à data — o front usa pra explicar
    // quando o preço digitado está na escala ajustada de hoje (ticket 26/08:
    // BBAS3 16,55×33,13 e GGRC11 13,52×133,33 eram preço de gráfico ajustado,
    // não erro de casa decimal).
    corporateActionsAfter: actionsAfter.map((ca) => ({
      type: ca.type,
      date: ca.date.toISOString().split('T')[0],
      factor: ca.factor,
    })),
  });
});
