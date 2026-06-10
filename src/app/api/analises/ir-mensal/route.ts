import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import {
  apurarRendaVariavel,
  type RvTransaction,
  type RendaVariavelCategory,
} from '@/services/ir/rendaVariavelIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre operações de renda variável (ações BR / FII / ETF BR).
 *
 * Carrega todas as StockTransaction do usuário, categoriza cada uma e roda o
 * serviço puro `apurarRendaVariavel`. Retorna meses cronológicos com IR a
 * recolher por categoria + saldos atuais de prejuízo a compensar.
 *
 * Stocks US, criptos, fundos e previdência ficam de fora desta apuração — cada
 * um tem regras próprias (Fases 3, 4 e 5).
 */

/**
 * Padrão de ticker B3 para ações: 4 letras + 1 dígito (3, 4, 5, 6, 8) — ex.: PETR4, ITUB4, BBAS3.
 * Stocks US (AAPL, MSFT, NVDA) não casam — vão para a fase 3 (IR de stocks US).
 */
const isB3StockTicker = (ticker: string): boolean =>
  /^[A-Z][A-Z0-9]{3}[0-9]$/.test(ticker.toUpperCase());

function categorizeTransaction(
  ticker: string | null,
  assetType: string | null,
): RendaVariavelCategory | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase();

  // Após a consolidação Stock → Asset, o discriminador é Asset.type + padrão do ticker:
  //   - type='fii' (regra FII — 20% sem isenção 20k)
  //   - type='stock' + ticker no padrão B3 (4 letras + 1 dígito) = ação BR
  //   - type='etf' + ticker B3 (final 11) = ETF BR
  if (assetType === 'fii') return 'fii';
  if (assetType === 'stock' && isB3StockTicker(upper)) return 'acao_br';
  if (assetType === 'etf' && upper.endsWith('11')) return 'etf_br';

  // Stocks US, BDR, crypto, fundos, previdência, REIT — outras fases do IR.
  return null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
    orderBy: { date: 'asc' },
  });

  const rvTransactions: RvTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const ticker = tx.asset?.symbol || null;
    const assetType = tx.asset?.type ?? null;
    const category = categorizeTransaction(ticker, assetType);
    if (!category) continue;

    rvTransactions.push({
      date: tx.date,
      type: tx.type,
      symbol: ticker as string,
      category,
      quantity: tx.quantity,
      price: Number(tx.price),
      fees: tx.fees ? Number(tx.fees) : 0,
    });
  }

  const apuracao = apurarRendaVariavel(rvTransactions);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
