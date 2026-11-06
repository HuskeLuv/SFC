import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { isAtivoEmDolar } from '@/lib/ativoEmDolar';
import {
  AVISO_REGRA_LEI_14754,
  ROTULO_CAMBIO_APROXIMADO,
  apurarAnualLei14754,
  apurarStocksUs,
  montarDividendosExterior,
  montarTransacoesUs,
} from '@/services/ir/stocksUsIR';
import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';
import { carregarSerieCambio, cotacaoMoedaDasNotes } from '@/services/market/cambioUsdBrl';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre ganho de capital em moeda estrangeira.
 *
 * Cobre Stocks, REITs e ETFs EUA: só Asset stock/reit/etf com currency 'USD' (isAtivoEmDolar).
 * O ETF da B3 (IVVB11, currency 'BRL') fica fora, mesmo na seção EUA da carteira.
 * O preço é lido pela unidade gravada na transação (US$, ou R$ no stock legado) e o
 * câmbio é a cotação gravada na operação; sem ela, a série USD-BRL na data, rotulada
 * 'câmbio de mercado (aproximado)'. BDRs (negociadas em BRL na B3) seguem regras de
 * renda variável BR e não são incluídas aqui.
 *
 * `meses`: vendas mês a mês (até 2023 com a isenção de R$ 35 mil e DARF; de 2024 em diante só
 * informativos). `anos`: ajuste anual da Lei 14.754 (2024+), com os dividendos em US$ já pagos
 * (convertidos pela série USD-BRL da data de pagamento) e o prejuízo levado de um ano ao outro.
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

  const proventos = usRows.length > 0 ? (await resolveProventoEvents(targetUserId)).events : [];
  const div = montarDividendosExterior(proventos, serie);
  const anos = apurarAnualLei14754(apuracao.meses, div.dividendos, new Date().getFullYear());

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
    anos,
    dividendosSemCambio: div.semCambio,
    operacoesSemCambio: montagem.semCambio,
    operacoesCambioAproximado: montagem.comCambioAproximado,
    rotuloCambioAproximado: ROTULO_CAMBIO_APROXIMADO,
    aviso: AVISO_REGRA_LEI_14754,
  });
});
