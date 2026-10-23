import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { isAtivoEmDolar } from '@/lib/ativoEmDolar';
import {
  AVISO_REGRA_LEI_14754,
  ROTULO_CAMBIO_APROXIMADO,
  apurarStocksUs,
  montarTransacoesUs,
} from '@/services/ir/stocksUsIR';
import { carregarSerieCambio, cotacaoMoedaDasNotes } from '@/services/market/cambioUsdBrl';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre ganho de capital em moeda estrangeira.
 *
 * Cobre Stocks US e REITs US: só Asset stock/reit com currency 'USD' (isAtivoEmDolar).
 * O preço é lido pela unidade gravada na transação (US$, ou R$ no stock legado) e o
 * câmbio é a cotação gravada na operação; sem ela, a série USD-BRL na data, rotulada
 * 'câmbio de mercado (aproximado)'. BDRs (negociadas em BRL na B3) seguem regras de
 * renda variável BR e não são incluídas aqui.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
    orderBy: { date: 'asc' },
  });

  // Série de câmbio só quando há ativo em dólar (fallback das operações sem cotação).
  const usRows = transactions.filter((tx) => isAtivoEmDolar(tx.asset));
  const serie = usRows.length > 0 ? await carregarSerieCambio() : null;

  const montagem = montarTransacoesUs(usRows, { cotacaoGravada: cotacaoMoedaDasNotes, serie });
  const apuracao = apurarStocksUs(montagem.transactions);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
    operacoesSemCambio: montagem.semCambio,
    operacoesCambioAproximado: montagem.comCambioAproximado,
    rotuloCambioAproximado: ROTULO_CAMBIO_APROXIMADO,
    aviso: AVISO_REGRA_LEI_14754,
  });
});
