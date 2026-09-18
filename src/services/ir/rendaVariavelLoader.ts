/**
 * Carrega a apuração de IR de renda variável de um usuário.
 *
 * A categorização (ação BR / FII / ETF BR) e a leitura das StockTransaction
 * moravam dentro de /api/analises/ir-mensal; foram extraídas aqui para que a
 * Agenda (fonte `ir`) projete o DARF a partir da MESMA apuração que a tela de
 * IR mostra — uma regra só, sem risco de divergir.
 */
import { prisma } from '@/lib/prisma';
import {
  apurarRendaVariavel,
  type ApuracaoResult,
  type RendaVariavelCategory,
  type RvTransaction,
} from './rendaVariavelIR';

/**
 * Padrão de ticker B3 para ações: 4 letras + 1 dígito (3, 4, 5, 6, 8) — ex.: PETR4, ITUB4, BBAS3.
 * Stocks US (AAPL, MSFT, NVDA) não casam — vão para a fase 3 (IR de stocks US).
 */
export const isB3StockTicker = (ticker: string): boolean =>
  /^[A-Z][A-Z0-9]{3}[0-9]$/.test(ticker.toUpperCase());

/**
 * Após a consolidação Stock → Asset, o discriminador é Asset.type + padrão do ticker:
 *   - type='fii' (regra FII — 20% sem isenção 20k)
 *   - type='stock' + ticker no padrão B3 (4 letras + 1 dígito) = ação BR
 *   - type='etf' + ticker B3 (final 11) = ETF BR
 * Stocks US, BDR, crypto, fundos, previdência e REIT ficam de fora — cada um
 * tem regra própria em outra fase do IR.
 */
export function categorizeTransaction(
  ticker: string | null,
  assetType: string | null,
): RendaVariavelCategory | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase();
  if (assetType === 'fii') return 'fii';
  if (assetType === 'stock' && isB3StockTicker(upper)) return 'acao_br';
  if (assetType === 'etf' && upper.endsWith('11')) return 'etf_br';
  return null;
}

export async function carregarApuracaoRendaVariavel(userId: string): Promise<ApuracaoResult> {
  const transactions = await prisma.stockTransaction.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { date: 'asc' },
  });

  const rvTransactions: RvTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const ticker = tx.asset?.symbol || null;
    const category = categorizeTransaction(ticker, tx.asset?.type ?? null);
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

  return apurarRendaVariavel(rvTransactions);
}
