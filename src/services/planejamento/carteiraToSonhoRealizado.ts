import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { REALIZADO_COLOR, syncCashflowToObjetivo } from './cashflowToSonhoSync';
import { syncObjetivoRecordToCashflow } from './sonhoCashflowSync';
import { isReinvestimentoTransaction } from '@/services/cashflow/investimentosPorMes';

/**
 * Sync carteira → sonho: quando um sonho tem ATIVOS VINCULADOS
 * (Portfolio.planejamentoObjetivoId), o realizado da linha-espelho no fluxo
 * de caixa deixa de ser digitado à mão e passa a ser 100% derivado das
 * transações reais — líquido mensal (compras − vendas, total + taxas),
 * excluindo reinvestimentos de proventos (não são capital novo).
 *
 * O serviço reescreve as células REALIZADO (vermelhas) da linha-espelho e
 * então reusa os syncs existentes: `syncObjetivoRecordToCashflow` reprojeta o
 * planejado nos meses não realizados e `syncCashflowToObjetivo` re-deriva as
 * entries `auto` (saldo composto, transições de status).
 *
 * Chamado best-effort após mutações de carteira (operacao/aporte/resgate/
 * edição de transação) e quando o vínculo do ativo muda.
 */

export interface SyncSonhoRealizadoOptions {
  /** Sincroniza só o sonho apontado (usado ao mudar/remover vínculo). */
  objetivoId?: string;
  /** Resolve o sonho a partir do ativo movimentado; no-op se não vinculado. */
  assetId?: string;
}

export async function syncSonhoRealizadoFromCarteira(
  userId: string,
  opts: SyncSonhoRealizadoOptions = {},
): Promise<void> {
  let objetivoIds: string[];

  if (opts.objetivoId) {
    objetivoIds = [opts.objetivoId];
  } else if (opts.assetId) {
    const portfolio = await prisma.portfolio.findFirst({
      where: { userId, assetId: opts.assetId },
      select: { planejamentoObjetivoId: true },
    });
    if (!portfolio?.planejamentoObjetivoId) return;
    objetivoIds = [portfolio.planejamentoObjetivoId];
  } else {
    const vinculados = await prisma.portfolio.findMany({
      where: { userId, planejamentoObjetivoId: { not: null } },
      select: { planejamentoObjetivoId: true },
    });
    objetivoIds = [
      ...new Set(
        vinculados.map((p) => p.planejamentoObjetivoId).filter((id): id is string => id != null),
      ),
    ];
  }

  for (const objetivoId of objetivoIds) {
    await syncOne(userId, objetivoId);
  }
}

/** Variante best-effort para os gatilhos de rota: loga e não propaga erro. */
export async function syncSonhoRealizadoBestEffort(
  userId: string,
  opts: SyncSonhoRealizadoOptions = {},
): Promise<void> {
  try {
    await syncSonhoRealizadoFromCarteira(userId, opts);
  } catch (error) {
    logger.error('[carteiraToSonhoRealizado] sync falhou (best-effort):', error);
  }
}

async function syncOne(userId: string, objetivoId: string): Promise<void> {
  const objetivo = await prisma.planejamentoObjetivo.findFirst({
    where: { id: objetivoId, userId },
    select: {
      id: true,
      name: true,
      target: true,
      available: true,
      months: true,
      rate: true,
      startDate: true,
      status: true,
      portfolios: { select: { assetId: true } },
    },
  });
  if (!objetivo) return;

  const assetIds = objetivo.portfolios
    .map((p) => p.assetId)
    .filter((id): id is string => id != null);

  // Garante a linha-espelho (sonhos criados antes do grupo template existir).
  let item = await prisma.cashflowItem.findUnique({ where: { objetivoId } });
  if (!item) {
    await syncObjetivoRecordToCashflow(userId, objetivo);
    item = await prisma.cashflowItem.findUnique({ where: { objetivoId } });
    if (!item) return; // template "Planejamento Financeiro" ausente — nada a espelhar
  }

  // Líquido mensal das transações dos ativos vinculados (todos os anos).
  // Bucket por getFullYear/getMonth — mesma convenção da linha Aporte/Resgate
  // (investimentosPorMes), para as duas visões nunca divergirem de mês.
  const netByKey = new Map<string, { year: number; month: number; value: number }>();
  if (assetIds.length > 0) {
    const transacoes = await prisma.stockTransaction.findMany({
      where: { userId, assetId: { in: assetIds }, type: { in: ['compra', 'venda'] } },
      select: { type: true, total: true, fees: true, date: true, notes: true },
    });
    for (const tx of transacoes) {
      if (isReinvestimentoTransaction(tx.notes)) continue;
      const year = tx.date.getFullYear();
      const month = tx.date.getMonth();
      const valor = (tx.total + (tx.fees || 0)) * (tx.type === 'venda' ? -1 : 1);
      const key = `${year}-${month}`;
      const current = netByKey.get(key);
      netByKey.set(key, { year, month, value: (current?.value ?? 0) + valor });
    }
  }

  const realizados = [...netByKey.values()]
    .map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 }))
    .filter((r) => Math.abs(r.value) >= 0.005);

  // Reescreve as células vermelhas: com vínculo, o realizado é 100% carteira —
  // células vermelhas manuais/stale são substituídas. Upsert (não createMany)
  // porque o mês pode ter célula PLANEJADA (color null) na mesma chave única.
  await prisma.$transaction([
    prisma.cashflowValue.deleteMany({
      where: { itemId: item.id, userId, color: REALIZADO_COLOR },
    }),
    ...realizados.map((r) =>
      prisma.cashflowValue.upsert({
        where: {
          itemId_userId_year_month: {
            itemId: item.id,
            userId,
            year: r.year,
            month: r.month,
          },
        },
        update: { value: r.value, color: REALIZADO_COLOR },
        create: {
          itemId: item.id,
          userId,
          year: r.year,
          month: r.month,
          value: r.value,
          color: REALIZADO_COLOR,
        },
      }),
    ),
  ]);

  // Reprojeta o planejado (meses que deixaram de ser realizados voltam a
  // mostrar o pmt dentro da janela; respeita status Pausado/Em espera)...
  await syncObjetivoRecordToCashflow(userId, objetivo);
  // ...e re-deriva as entries auto + status a partir das células vermelhas.
  await syncCashflowToObjetivo(userId, objetivoId);
}
