/**
 * Handlers de undo — seção CARTEIRA.
 *
 * Template de efeitos colaterais = PATCH/DELETE de /api/historico/transacao/[id]:
 * mutação inversa → recalculatePortfolioFromTransactions (cutoff correto) →
 * syncSonhoRealizadoBestEffort. Nunca criar rows órfãs: toda FK é revalidada
 * e a falta degrada em UndoError(409) legível.
 */

import type { FixedIncomeIndexer, FixedIncomeLiquidity, FixedIncomeType } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  recalculatePortfolioFromTransactions,
  invalidatePortfolioSnapshots,
} from '@/services/portfolio/portfolioRecalculation';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import {
  assertCurrentMatchesAfter,
  getChanges,
  getSnapshot,
  invertChanges,
  isUniqueViolation,
  restoreData,
} from '../helpers';

const TX_DATE_FIELDS = new Set(['date']);
const PROVENTO_DATE_FIELDS = new Set(['dataCom', 'dataPagamento']);

interface SnapshotPortfolioMeta {
  id: string;
  assetId: string | null;
  objetivo?: number;
  estrategia?: string | null;
  tipoFii?: string | null;
  regiaoEtf?: string | null;
  planejamentoObjetivoId?: string | null;
  vinculoAposentadoria?: boolean;
}

interface SnapshotFixedIncome {
  type: string;
  description: string;
  startDate: string | null;
  maturityDate: string | null;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  liquidityType: string | null;
  taxExempt: boolean;
  tesouroBondType: string | null;
  tesouroMaturity: string | null;
}

interface SnapshotTransacao {
  id: string;
  assetId: string | null;
  type: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
  fees: number | null;
  notes: string | null;
}

/** FK de sonho pode ter sumido (sonho excluído) — degrada pra null, não órfã. */
async function safePlanejamentoObjetivoId(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const sonho = await prisma.planejamentoObjetivo.findUnique({
    where: { id },
    select: { id: true },
  });
  return sonho ? sonho.id : null;
}

/** Recria um Portfolio zerado a partir da meta do snapshot (recalc preenche). */
async function recreatePortfolioStub(userId: string, meta: SnapshotPortfolioMeta) {
  return prisma.portfolio.create({
    data: {
      id: meta.id,
      userId,
      assetId: meta.assetId,
      quantity: 0,
      avgPrice: 0,
      totalInvested: 0,
      objetivo: meta.objetivo ?? 0,
      estrategia: meta.estrategia ?? null,
      tipoFii: meta.tipoFii ?? null,
      regiaoEtf: meta.regiaoEtf ?? null,
      planejamentoObjetivoId: await safePlanejamentoObjetivoId(meta.planejamentoObjetivoId),
      vinculoAposentadoria: meta.vinculoAposentadoria ?? false,
    },
  });
}

async function recreateFixedIncomeIfMissing(
  userId: string,
  assetId: string,
  fi: SnapshotFixedIncome,
): Promise<void> {
  const existing = await prisma.fixedIncomeAsset.findUnique({ where: { assetId } });
  if (existing) return;
  await prisma.fixedIncomeAsset.create({
    data: {
      userId,
      assetId,
      type: fi.type as FixedIncomeType,
      description: fi.description,
      startDate: fi.startDate ? new Date(fi.startDate) : new Date(),
      maturityDate: fi.maturityDate ? new Date(fi.maturityDate) : new Date(),
      investedAmount: fi.investedAmount,
      annualRate: fi.annualRate,
      indexer: (fi.indexer as FixedIncomeIndexer | null) ?? null,
      indexerPercent: fi.indexerPercent,
      liquidityType: (fi.liquidityType as FixedIncomeLiquidity | null) ?? null,
      taxExempt: fi.taxExempt,
      tesouroBondType: fi.tesouroBondType,
      tesouroMaturity: fi.tesouroMaturity ? new Date(fi.tesouroMaturity) : null,
    },
  });
}

async function recreateTransacao(userId: string, tx: SnapshotTransacao): Promise<void> {
  try {
    await prisma.stockTransaction.create({
      data: {
        id: tx.id,
        userId,
        assetId: tx.assetId,
        type: tx.type,
        quantity: tx.quantity,
        price: tx.price,
        total: tx.total,
        date: new Date(tx.date),
        fees: tx.fees,
        notes: tx.notes,
      },
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new UndoError(409, 'A transação já foi restaurada');
    }
    throw error;
  }
}

const transacaoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const changes = getChanges(entry);

    const tx = await prisma.stockTransaction.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!tx) throw new UndoError(409, 'A transação não existe mais');

    assertCurrentMatchesAfter(tx as unknown as Record<string, unknown>, changes);

    const data = restoreData(changes, TX_DATE_FIELDS);
    await prisma.stockTransaction.update({ where: { id: tx.id }, data });

    const restoredDate = (data.date as Date | undefined) ?? tx.date;
    const cutoff = restoredDate.getTime() <= tx.date.getTime() ? restoredDate : tx.date;

    if (tx.assetId) {
      const portfolio = await prisma.portfolio.findFirst({
        where: { userId: targetUserId, assetId: tx.assetId },
      });
      if (portfolio) {
        await recalculatePortfolioFromTransactions({
          targetUserId,
          assetId: tx.assetId,
          portfolioId: portfolio.id,
          recomputeSnapshotsFrom: cutoff,
        });
      }
      await syncSonhoRealizadoBestEffort(targetUserId, { assetId: tx.assetId });
    }

    return { changes: invertChanges(changes) };
  },
};

const transacaoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const tx = snap.data as unknown as SnapshotTransacao;
    const meta = (snap.meta ?? {}) as {
      portfolio?: SnapshotPortfolioMeta;
      fixedIncome?: SnapshotFixedIncome;
    };

    if (!tx.assetId) throw new UndoError(400, 'Snapshot sem ativo vinculado', 'UNDO_MISSING_DATA');

    const asset = await prisma.asset.findUnique({ where: { id: tx.assetId } });
    if (!asset) throw new UndoError(409, 'O ativo desta transação não existe mais');

    // O recálculo deletou Portfolio/FixedIncomeAsset se esta era a última
    // transação — recria a partir do snapshot antes de reinserir.
    let portfolio = await prisma.portfolio.findFirst({
      where: { userId: targetUserId, assetId: tx.assetId },
    });
    if (!portfolio && meta.portfolio) {
      portfolio = await recreatePortfolioStub(targetUserId, meta.portfolio);
    }
    if (!portfolio) throw new UndoError(409, 'A posição deste ativo não existe mais na carteira');

    if (meta.fixedIncome) {
      await recreateFixedIncomeIfMissing(targetUserId, tx.assetId, meta.fixedIncome);
    }

    await recreateTransacao(targetUserId, tx);

    await recalculatePortfolioFromTransactions({
      targetUserId,
      assetId: tx.assetId,
      portfolioId: portfolio.id,
      recomputeSnapshotsFrom: new Date(tx.date),
    });
    await syncSonhoRealizadoBestEffort(targetUserId, { assetId: tx.assetId });

    return { changes: invertChanges(getChanges(entry)) };
  },
};

const ativoRemover: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      portfolio: SnapshotPortfolioMeta;
      transactions: SnapshotTransacao[];
      fixedIncome?: SnapshotFixedIncome;
    };
    const assetId = data.portfolio.assetId;
    if (!assetId) throw new UndoError(400, 'Snapshot sem ativo vinculado', 'UNDO_MISSING_DATA');

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new UndoError(409, 'O ativo não existe mais no catálogo');

    const existing = await prisma.portfolio.findFirst({
      where: { userId: targetUserId, assetId },
    });
    if (existing) throw new UndoError(409, 'O ativo já foi readicionado à carteira');

    const portfolio = await recreatePortfolioStub(targetUserId, data.portfolio);
    if (data.fixedIncome) {
      await recreateFixedIncomeIfMissing(targetUserId, assetId, data.fixedIncome);
    }
    for (const tx of data.transactions) {
      await recreateTransacao(targetUserId, tx);
    }

    const firstDate = data.transactions
      .map((t) => new Date(t.date))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (firstDate) {
      await invalidatePortfolioSnapshots(targetUserId, firstDate);
    }
    await recalculatePortfolioFromTransactions({
      targetUserId,
      assetId,
      portfolioId: portfolio.id,
    });
    await syncSonhoRealizadoBestEffort(targetUserId, { assetId });

    return { changes: invertChanges(getChanges(entry)) };
  },
};

const proventoAdicionar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const provento = await prisma.portfolioProvento.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!provento) throw new UndoError(409, 'O provento não existe mais');
    await prisma.portfolioProvento.delete({ where: { id: provento.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const proventoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const provento = await prisma.portfolioProvento.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId, dismissed: false },
    });
    if (!provento) throw new UndoError(409, 'O provento não existe mais');

    assertCurrentMatchesAfter(provento as unknown as Record<string, unknown>, changes);

    // `source: 'manual'` preservado — restauração também é edição manual.
    await prisma.portfolioProvento.update({
      where: { id: provento.id },
      data: { ...restoreData(changes, PROVENTO_DATE_FIELDS), source: 'manual' },
    });
    return { changes: invertChanges(changes) };
  },
};

const proventoExcluir: UndoDefinition = {
  // Exclusão de provento é soft (dismissed) — desfazer é "un-dismiss".
  // Funciona até para entradas antigas: não requer snapshot.
  strategy: 'custom',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const provento = await prisma.portfolioProvento.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!provento) throw new UndoError(409, 'O provento não existe mais');
    if (!provento.dismissed) throw new UndoError(409, 'O provento já está restaurado');
    await prisma.portfolioProvento.update({
      where: { id: provento.id },
      data: { dismissed: false },
    });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

/** caixa-investir.atualizar e resumo.atualizar — upsert de métrica DashboardData. */
const dashboardMetricRestore: UndoDefinition = {
  strategy: 'custom',
  requires: { changes: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const metric = (snap.meta as { metric?: string } | undefined)?.metric;
    if (!metric) throw new UndoError(400, 'Snapshot sem métrica', 'UNDO_MISSING_DATA');
    const previousValue = (snap.data as { value: number | null }).value;

    const changes = getChanges(entry);
    const current = await prisma.dashboardData.findFirst({
      where: { userId: targetUserId, metric },
    });

    // O diff dessas rotas tem exatamente 1 par (o valor da métrica).
    assertCurrentMatchesAfter({ [changes[0].field]: current?.value ?? null }, changes);

    if (previousValue === null) {
      // A métrica não existia antes — desfazer = remover a row.
      if (current) await prisma.dashboardData.delete({ where: { id: current.id } });
    } else if (current) {
      await prisma.dashboardData.update({
        where: { id: current.id },
        data: { value: previousValue },
      });
    } else {
      await prisma.dashboardData.create({
        data: { userId: targetUserId, metric, value: previousValue },
      });
    }
    return { changes: invertChanges(changes) };
  },
};

/** Valor manual de imóvel/bem: totalInvested + avgPrice derivados do valor. */
const imovelBemAtualizarValor: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const change = changes.find((c) => c.field === 'valorAtualizado');
    if (!change || typeof change.before !== 'number') {
      throw new UndoError(400, 'Diff sem valor anterior', 'UNDO_MISSING_DATA');
    }
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!portfolio) throw new UndoError(409, 'O ativo não existe mais na carteira');

    const currentValue =
      portfolio.totalInvested > 0
        ? portfolio.totalInvested
        : portfolio.quantity * portfolio.avgPrice;
    assertCurrentMatchesAfter({ valorAtualizado: currentValue }, [change]);

    const valorAnterior = change.before;
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        avgPrice: portfolio.quantity > 0 ? valorAnterior / portfolio.quantity : valorAnterior,
        totalInvested: valorAnterior,
        lastUpdate: new Date(),
      },
    });
    return { changes: invertChanges(changes) };
  },
};

/** Valor manual de fundo sem cota CVM: só avgPrice deriva do valor. */
const fundoAtualizarValor: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const change = changes.find((c) => c.field === 'valorAtualizado');
    if (!change || typeof change.before !== 'number') {
      throw new UndoError(400, 'Diff sem valor anterior', 'UNDO_MISSING_DATA');
    }
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!portfolio) throw new UndoError(409, 'O ativo não existe mais na carteira');

    const qty = portfolio.quantity || 1;
    assertCurrentMatchesAfter({ valorAtualizado: qty * portfolio.avgPrice }, [change]);

    const valorAnterior = change.before;
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { avgPrice: qty > 0 ? valorAnterior / qty : valorAnterior, lastUpdate: new Date() },
    });
    return { changes: invertChanges(changes) };
  },
};

/** Objetivo (%) do ativo na classe — restore simples de Portfolio.objetivo. */
const objetivoClasseDefinir: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!portfolio) throw new UndoError(409, 'O ativo não existe mais na carteira');

    assertCurrentMatchesAfter(portfolio as unknown as Record<string, unknown>, changes);
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: restoreData(changes) as { objetivo?: number },
    });
    return { changes: invertChanges(changes) };
  },
};

export const CARTEIRA_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'transacao.editar': transacaoEditar,
  'transacao.excluir': transacaoExcluir,
  'ativo.remover': ativoRemover,
  'provento.adicionar': proventoAdicionar,
  'provento.editar': proventoEditar,
  'provento.excluir': proventoExcluir,
  'caixa-investir.atualizar': dashboardMetricRestore,
  'resumo.atualizar': dashboardMetricRestore,
  'imovel-bem.atualizar-valor': imovelBemAtualizarValor,
  'fundo.atualizar-valor': fundoAtualizarValor,
  'objetivo-classe.definir': objetivoClasseDefinir,
};
