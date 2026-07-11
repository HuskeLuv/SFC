/**
 * Handlers de undo — seção PLANEJAMENTO.
 *
 * Todo undo que toca sonho re-dispara o sync da linha-espelho no fluxo de
 * caixa (mesmas chamadas das rotas), senão a planilha fica dessincronizada.
 */

import prisma from '@/lib/prisma';
import {
  syncObjetivoToCashflow,
  syncObjetivoRecordToCashflow,
  removeObjetivoCashflow,
} from '@/services/planejamento/sonhoCashflowSync';
import { syncSonhoRealizadoBestEffort } from '@/services/planejamento/carteiraToSonhoRealizado';
import { categoryFromMonths } from '@/services/planejamento/planejamentoSonhos';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import {
  assertCurrentMatchesAfter,
  getChanges,
  getSnapshot,
  invertChanges,
  isUniqueViolation,
  restoreData,
} from '../helpers';

interface SonhoRecord {
  id: string;
  name: string;
  target: unknown;
  available: unknown;
  months: number;
  rate: unknown;
  startDate: string | null;
  status: string;
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
};

async function syncSonhoMirror(userId: string, objetivo: SonhoRecord): Promise<void> {
  await syncObjetivoToCashflow(userId, {
    id: objetivo.id,
    name: objetivo.name,
    target: toNumber(objetivo.target),
    available: toNumber(objetivo.available),
    months: objetivo.months,
    rate: toNumber(objetivo.rate),
    startDate: objetivo.startDate,
    status: objetivo.status,
  });
}

const sonhoCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!objetivo) throw new UndoError(409, 'O sonho não existe mais');

    // Mesma ordem do DELETE da rota: espelho primeiro (FK SetNull deixaria
    // a linha órfã), depois o objetivo (cascade nas entries).
    await removeObjetivoCashflow(objetivo.id);
    await prisma.planejamentoObjetivo.delete({ where: { id: objetivo.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const sonhoEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const changes = getChanges(entry);
    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!objetivo) throw new UndoError(409, 'O sonho não existe mais');

    assertCurrentMatchesAfter(objetivo as unknown as Record<string, unknown>, changes);

    const data = restoreData(changes);
    // Prazo restaurado re-deriva a categoria (mesma regra do PATCH).
    if (typeof data.months === 'number') {
      data.category = categoryFromMonths(data.months);
    }
    const updated = await prisma.planejamentoObjetivo.update({
      where: { id: objetivo.id },
      data,
    });
    await syncSonhoMirror(targetUserId, updated as unknown as SonhoRecord);
    return { changes: invertChanges(changes) };
  },
};

const sonhoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      id: string;
      name: string;
      target: number;
      months: number;
      startDate: string | null;
      available: number;
      rate: number;
      priority: string;
      category: string;
      status: string;
      notes: string | null;
    };
    const meta = (snap.meta ?? {}) as {
      entries?: Array<{ month: string; aporte: number; balance: number; source: string }>;
      portfolioIds?: string[];
    };

    let created;
    try {
      created = await prisma.planejamentoObjetivo.create({
        data: {
          id: data.id,
          userId: targetUserId,
          name: data.name,
          target: data.target,
          months: data.months,
          startDate: data.startDate,
          available: data.available,
          rate: data.rate,
          priority: data.priority,
          category: data.category,
          status: data.status,
          notes: data.notes,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O sonho já foi restaurado');
      throw error;
    }

    if (meta.entries && meta.entries.length > 0) {
      await prisma.planejamentoObjetivoEntry.createMany({
        data: meta.entries.map((e) => ({
          objetivoId: created.id,
          month: e.month,
          aporte: e.aporte,
          balance: e.balance,
          source: e.source,
        })),
      });
    }

    // Re-linka só os ativos que ainda existem e não ganharam outro vínculo.
    if (meta.portfolioIds && meta.portfolioIds.length > 0) {
      await prisma.portfolio.updateMany({
        where: {
          id: { in: meta.portfolioIds },
          userId: targetUserId,
          planejamentoObjetivoId: null,
          vinculoAposentadoria: false,
        },
        data: { planejamentoObjetivoId: created.id },
      });
    }

    await syncSonhoMirror(targetUserId, created as unknown as SonhoRecord);
    await syncSonhoRealizadoBestEffort(targetUserId, { objetivoId: created.id });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const sonhoAporteRegistrar: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const meta = (snap.meta ?? {}) as { month?: string; prevStatus?: string };
    const prevEntry = (
      snap.data as {
        prevEntry: { aporte: number; balance: number; source: string } | null;
      }
    ).prevEntry;
    if (!meta.month) throw new UndoError(400, 'Snapshot sem mês', 'UNDO_MISSING_DATA');

    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!objetivo) throw new UndoError(409, 'O sonho não existe mais');

    const current = await prisma.planejamentoObjetivoEntry.findUnique({
      where: { objetivoId_month: { objetivoId: objetivo.id, month: meta.month } },
    });
    // Checagem otimista contra o diff (aporte/balance registrados).
    assertCurrentMatchesAfter(
      {
        aporte: current ? toNumber(current.aporte) : null,
        balance: current ? toNumber(current.balance) : null,
      },
      getChanges(entry).filter((c) => c.field === 'aporte' || c.field === 'balance'),
    );

    if (prevEntry === null) {
      if (current) await prisma.planejamentoObjetivoEntry.delete({ where: { id: current.id } });
    } else {
      await prisma.planejamentoObjetivoEntry.upsert({
        where: { objetivoId_month: { objetivoId: objetivo.id, month: meta.month } },
        create: { objetivoId: objetivo.id, month: meta.month, ...prevEntry },
        update: prevEntry,
      });
    }

    // Transição automática de status feita pelo registro é revertida junto.
    if (meta.prevStatus && meta.prevStatus !== objetivo.status) {
      const reverted = await prisma.planejamentoObjetivo.update({
        where: { id: objetivo.id },
        data: { status: meta.prevStatus },
      });
      await syncObjetivoRecordToCashflow(
        targetUserId,
        reverted as unknown as Parameters<typeof syncObjetivoRecordToCashflow>[1],
      );
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const sonhoAporteExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const { targetUserId } = auth;
    const snap = getSnapshot(entry)!;
    const meta = (snap.meta ?? {}) as { month?: string; prevStatus?: string };
    const data = snap.data as unknown as { aporte: number; balance: number; source: string };
    if (!meta.month) throw new UndoError(400, 'Snapshot sem mês', 'UNDO_MISSING_DATA');

    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: entry.entityId!, userId: targetUserId },
    });
    if (!objetivo) throw new UndoError(409, 'O sonho não existe mais');

    const existing = await prisma.planejamentoObjetivoEntry.findUnique({
      where: { objetivoId_month: { objetivoId: objetivo.id, month: meta.month } },
    });
    if (existing) throw new UndoError(409, 'O mês já tem um registro novo');

    await prisma.planejamentoObjetivoEntry.create({
      data: { objetivoId: objetivo.id, month: meta.month, ...data },
    });

    if (meta.prevStatus && meta.prevStatus !== objetivo.status) {
      const reverted = await prisma.planejamentoObjetivo.update({
        where: { id: objetivo.id },
        data: { status: meta.prevStatus },
      });
      await syncObjetivoRecordToCashflow(
        targetUserId,
        reverted as unknown as Parameters<typeof syncObjetivoRecordToCashflow>[1],
      );
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const aposentadoriaEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const plano = await prisma.aposentadoriaPlano.findUnique({
      where: { userId: auth.targetUserId },
    });
    if (!plano || plano.id !== entry.entityId) {
      throw new UndoError(409, 'O plano de aposentadoria não existe mais');
    }
    assertCurrentMatchesAfter(plano as unknown as Record<string, unknown>, changes);
    await prisma.aposentadoriaPlano.update({
      where: { id: plano.id },
      data: restoreData(changes),
    });
    return { changes: invertChanges(changes) };
  },
};

const aposentadoriaAporteRegistrar: UndoDefinition = {
  strategy: 'custom',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const off = (snap.meta as { off?: number } | undefined)?.off;
    const prevEntry = (
      snap.data as {
        prevEntry: { aporteReal: number; patFinal: number } | null;
      }
    ).prevEntry;
    if (typeof off !== 'number') {
      throw new UndoError(400, 'Snapshot sem offset do mês', 'UNDO_MISSING_DATA');
    }

    const plano = await prisma.aposentadoriaPlano.findUnique({
      where: { userId: auth.targetUserId },
    });
    if (!plano || plano.id !== entry.entityId) {
      throw new UndoError(409, 'O plano de aposentadoria não existe mais');
    }

    const current = await prisma.aposentadoriaPlanoEntry.findUnique({
      where: { planoId_off: { planoId: plano.id, off } },
    });
    assertCurrentMatchesAfter(
      {
        aporteReal: current ? toNumber(current.aporteReal) : null,
        patFinal: current ? toNumber(current.patFinal) : null,
      },
      getChanges(entry).filter((c) => c.field === 'aporteReal' || c.field === 'patFinal'),
    );

    if (prevEntry === null) {
      if (current) await prisma.aposentadoriaPlanoEntry.delete({ where: { id: current.id } });
    } else if (current) {
      await prisma.aposentadoriaPlanoEntry.update({
        where: { id: current.id },
        data: prevEntry,
      });
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const aposentadoriaAporteExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      off: number;
      year: number;
      month: number;
      aporteReal: number;
      patFinal: number;
    };

    const plano = await prisma.aposentadoriaPlano.findUnique({
      where: { userId: auth.targetUserId },
    });
    if (!plano || plano.id !== entry.entityId) {
      throw new UndoError(409, 'O plano de aposentadoria não existe mais');
    }

    try {
      await prisma.aposentadoriaPlanoEntry.create({
        data: { planoId: plano.id, ...data },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O mês já tem um registro novo');
      throw error;
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

export const PLANEJAMENTO_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'sonho.criar': sonhoCriar,
  'sonho.editar': sonhoEditar,
  'sonho.excluir': sonhoExcluir,
  'sonho-aporte.registrar': sonhoAporteRegistrar,
  'sonho-aporte.excluir': sonhoAporteExcluir,
  'aposentadoria.editar': aposentadoriaEditar,
  'aposentadoria-aporte.registrar': aposentadoriaAporteRegistrar,
  'aposentadoria-aporte.excluir': aposentadoriaAporteExcluir,
};
