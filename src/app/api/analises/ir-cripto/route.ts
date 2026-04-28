import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { apurarCripto, type CriptoTransaction } from '@/services/ir/criptoIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre ganho de capital em criptoativos.
 *
 * Carrega StockTransaction onde asset.type ∈ {crypto, currency, metal,
 * commodity} (mesma classificação usada em /api/carteira/operacao para
 * tipoAtivo='criptoativo'/'moeda'). Roda o serviço puro `apurarCripto`.
 */

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
    orderBy: { date: 'asc' },
  });

  const cripto: CriptoTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const t = tx.asset?.type;
    // Categorias cripto/moeda — alinhado com expectedAssetTypeByTipoAtivo.criptoativo
    if (t !== 'crypto' && t !== 'currency' && t !== 'metal' && t !== 'commodity') continue;

    cripto.push({
      date: tx.date,
      type: tx.type,
      symbol: tx.asset?.symbol || 'UNKNOWN',
      quantity: tx.quantity,
      price: Number(tx.price),
      fees: tx.fees ? Number(tx.fees) : 0,
    });
  }

  const apuracao = apurarCripto(cripto);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
