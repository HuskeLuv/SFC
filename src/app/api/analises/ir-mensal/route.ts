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

function categorizeTransaction(
  fromStockTable: boolean,
  ticker: string | null,
  assetType: string | null,
): RendaVariavelCategory | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase();

  // Stock table só guarda ações da B3 — sempre BR (acao ou FII).
  if (fromStockTable) return upper.endsWith('11') ? 'fii' : 'acao_br';

  // Asset.type='etf' com ticker terminando em '11' = ETF BR (BOVA11, IVVB11 etc.).
  // ETFs US (VOO, SPY) vão pra apuração de stocks US (Fase 3) — fora do escopo.
  if (assetType === 'etf' && upper.endsWith('11')) return 'etf_br';

  // Stocks US, BDR, crypto, fundos, previdência, REIT — outras fases.
  return null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    include: { stock: true, asset: true },
    orderBy: { date: 'asc' },
  });

  const rvTransactions: RvTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const ticker = tx.stock?.ticker || tx.asset?.symbol || null;
    const fromStockTable = Boolean(tx.stock);
    const assetType = tx.asset?.type ?? null;
    const category = categorizeTransaction(fromStockTable, ticker, assetType);
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
