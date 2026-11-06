/**
 * Aporte líquido por mês (compras − vendas), a ÚNICA função de aporte mensal do app: serve o
 * Acompanhamento do planejamento e, no Relatório financeiro, a seção 4a, o Resumo e a seção 5.
 *
 * Regras (as de deriveAcompanhamentoEntries, em acompanhamentoAuto.ts):
 *  - reinvestimento de proventos não é capital novo;
 *  - compras da importação do Open Finance não contam (carteira antiga gravada na conexão);
 *  - com ativos vinculados à aposentadoria, só as transações DELES contam; sem vínculo, vale a
 *    carteira toda menos os ativos de sonho;
 *  - transação em US$ entra em R$ pelo câmbio da transação (`totalBRLTransacao`).
 *
 * A lógica saiu de acompanhamentoAuto.ts sem mudança (Relatório financeiro); o Acompanhamento
 * importa daqui.
 */
import { prisma } from '@/lib/prisma';
import { unidadeDaTransacao } from '@/lib/ativoEmDolar';
import {
  carregarCambioDasTransacoes,
  totalBRLTransacao,
} from '@/services/cashflow/investimentosPorMes';
import { ehImportacaoOpenFinance } from '@/services/pluggy/notaImportacao';

/** Transação de compra/venda como a lê o Acompanhamento. */
export interface TransacaoAporte {
  assetId: string | null;
  date: Date;
  type: string;
  total: number;
  price: number;
  quantity: number;
  fees: number | null;
  notes: string | null;
  asset: { type: string | null; currency: string | null } | null;
}

/** Vínculos de Portfolio que mudam o que conta como aporte. */
export interface VinculoAporte {
  assetId: string | null;
  vinculoAposentadoria: boolean;
  planejamentoObjetivoId: string | null;
}

/** Chave de mês-calendário em UTC (snapshots e transações são gravados em UTC midnight). */
export const chaveMesAporte = (year: number, month0: number): number => year * 12 + month0;

/** Compras de reinvestimento de proventos não são aporte de capital novo. */
const isReinvestimento = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/**
 * Pura (salvo o câmbio, que lê a série das moedas das transações): aporte líquido por mês,
 * chave `chaveMesAporte(ano, mes0)`. Valores sem arredondar.
 */
export async function aporteLiquidoPorMes(
  transactions: TransacaoAporte[],
  vinculos: VinculoAporte[],
): Promise<Map<number, number>> {
  const assetsAposentadoria = new Set(
    vinculos.filter((v) => v.vinculoAposentadoria && v.assetId).map((v) => v.assetId),
  );
  const assetsDeSonho = new Set(
    vinculos.filter((v) => v.planejamentoObjetivoId && v.assetId).map((v) => v.assetId),
  );

  const aporteByMonth = new Map<number, number>();
  const lastRateByAsset = new Map<string, number>();
  const serieCambio = await carregarCambioDasTransacoes(transactions);
  for (const tx of transactions) {
    if (isReinvestimento(tx.notes)) continue;
    if (ehImportacaoOpenFinance(tx.notes)) continue;
    if (assetsAposentadoria.size > 0) {
      if (!tx.assetId || !assetsAposentadoria.has(tx.assetId)) continue;
    } else if (tx.assetId && assetsDeSonho.has(tx.assetId)) {
      continue;
    }
    const key = chaveMesAporte(tx.date.getUTCFullYear(), tx.date.getUTCMonth());
    // R$ legado: como sempre (total, sem somar taxas). US$: total × câmbio da tx + fees.
    const total =
      unidadeDaTransacao(tx, tx.asset) === 'USD'
        ? totalBRLTransacao(
            {
              ...tx,
              total: Number(tx.total) > 0 ? Number(tx.total) : tx.price * tx.quantity,
            },
            lastRateByAsset,
            serieCambio,
          )
        : Number(tx.total) > 0
          ? Number(tx.total)
          : tx.price * tx.quantity;
    const signed = tx.type === 'compra' ? total : -total;
    aporteByMonth.set(key, (aporteByMonth.get(key) ?? 0) + signed);
  }
  return aporteByMonth;
}

/** Lê as transações e vínculos de `userId` entre `desde` e `ate` e devolve o aporte por mês. */
export async function carregarAportesMensais(
  userId: string,
  desde: Date,
  ate: Date,
): Promise<Map<number, number>> {
  const [transactions, vinculos] = await Promise.all([
    prisma.stockTransaction.findMany({
      where: { userId, type: { in: ['compra', 'venda'] }, date: { gte: desde, lte: ate } },
      select: {
        assetId: true,
        date: true,
        type: true,
        total: true,
        price: true,
        quantity: true,
        fees: true,
        notes: true,
        asset: { select: { type: true, currency: true } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.portfolio.findMany({
      where: {
        userId,
        OR: [{ vinculoAposentadoria: true }, { planejamentoObjetivoId: { not: null } }],
      },
      select: { assetId: true, vinculoAposentadoria: true, planejamentoObjetivoId: true },
    }),
  ]);
  return aporteLiquidoPorMes(transactions, vinculos);
}
