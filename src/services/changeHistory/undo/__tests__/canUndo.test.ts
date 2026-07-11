import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: { groupBy: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { annotateCanUndo, rowLevelUndoable } from '../canUndo';
import { assertUndoable } from '../execute';
import { UndoError } from '../types';

const baseEntry = (overrides: Partial<UserChangeLog> = {}): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'carteira',
    action: 'transacao.editar',
    entity: 'transacao',
    entityId: 'tx-1',
    entityLabel: 'PETR4',
    changes: [{ field: 'quantity', label: 'Quantidade', before: 100, after: 150 }],
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.userChangeLog.groupBy.mockResolvedValue([]);
  mockPrisma.userChangeLog.findFirst.mockResolvedValue(null);
});

describe('rowLevelUndoable', () => {
  it('aceita edição de transação com diff', () => {
    expect(rowLevelUndoable(baseEntry())).not.toBeNull();
  });

  it('rejeita entrada já desfeita', () => {
    expect(rowLevelUndoable(baseEntry({ undoneAt: new Date() }))).toBeNull();
  });

  it('rejeita entrada que é um undo (revertsId)', () => {
    expect(rowLevelUndoable(baseEntry({ revertsId: 'log-0' }))).toBeNull();
  });

  it('rejeita action fora do registry', () => {
    expect(rowLevelUndoable(baseEntry({ action: 'senha.alterar' }))).toBeNull();
    expect(rowLevelUndoable(baseEntry({ action: 'operacao.registrar' }))).toBeNull();
    expect(rowLevelUndoable(baseEntry({ action: 'ativo.editar' }))).toBeNull();
  });

  it('rejeita exclusão pré-deploy sem snapshot', () => {
    expect(rowLevelUndoable(baseEntry({ action: 'transacao.excluir', snapshot: null }))).toBeNull();
  });

  it('aceita exclusão com snapshot', () => {
    expect(
      rowLevelUndoable(
        baseEntry({
          action: 'transacao.excluir',
          snapshot: { v: 1, kind: 'transacao', data: {} } as never,
        }),
      ),
    ).not.toBeNull();
  });

  it('rejeita edição sem diff (changes vazio/nulo)', () => {
    expect(rowLevelUndoable(baseEntry({ changes: null }))).toBeNull();
    expect(rowLevelUndoable(baseEntry({ changes: [] as never }))).toBeNull();
  });
});

describe('annotateCanUndo — conflito LIFO', () => {
  it('só a entrada mais recente da entidade é desfazível', async () => {
    const older = baseEntry({ id: 'log-1', createdAt: new Date('2026-07-10T10:00:00Z') });
    const newer = baseEntry({ id: 'log-2', createdAt: new Date('2026-07-10T12:00:00Z') });
    mockPrisma.userChangeLog.groupBy.mockResolvedValueOnce([
      { entityId: 'tx-1', _max: { createdAt: new Date('2026-07-10T12:00:00Z') } },
    ]);

    const map = await annotateCanUndo([older, newer], 'user-1');
    expect(map.get('log-1')).toBe(false);
    expect(map.get('log-2')).toBe(true);
  });

  it('entrada mais nova já desfeita não bloqueia a anterior', async () => {
    const older = baseEntry({ id: 'log-1', createdAt: new Date('2026-07-10T10:00:00Z') });
    const newerUndone = baseEntry({
      id: 'log-2',
      createdAt: new Date('2026-07-10T12:00:00Z'),
      undoneAt: new Date(),
    });
    // groupBy filtra undoneAt: null → o máximo volta a ser a entrada antiga.
    mockPrisma.userChangeLog.groupBy.mockResolvedValueOnce([
      { entityId: 'tx-1', _max: { createdAt: new Date('2026-07-10T10:00:00Z') } },
    ]);

    const map = await annotateCanUndo([older, newerUndone], 'user-1');
    expect(map.get('log-1')).toBe(true);
    expect(map.get('log-2')).toBe(false);
  });

  it('entrada sem entityId usa escopo por action', async () => {
    const entry = baseEntry({
      id: 'log-3',
      action: 'resumo.atualizar',
      entityId: null,
      changes: [{ field: 'metaPatrimonio', label: 'Meta', before: 1, after: 2 }] as never,
      snapshot: {
        v: 1,
        kind: 'dashboard-metric',
        data: { value: 1 },
        meta: { metric: 'x' },
      } as never,
      createdAt: new Date('2026-07-10T12:00:00Z'),
    });
    // Sem candidatos com entityId, só a query por action roda.
    mockPrisma.userChangeLog.groupBy.mockResolvedValueOnce([
      { action: 'resumo.atualizar', _max: { createdAt: new Date('2026-07-10T12:00:00Z') } },
    ]);

    const map = await annotateCanUndo([entry], 'user-1');
    expect(map.get('log-3')).toBe(true);
  });

  it('sem candidatos não consulta o banco', async () => {
    const map = await annotateCanUndo([baseEntry({ undoneAt: new Date() })], 'user-1');
    expect(map.get('log-1')).toBe(false);
    expect(mockPrisma.userChangeLog.groupBy).not.toHaveBeenCalled();
  });
});

describe('assertUndoable', () => {
  it('lança 400 UNDO_NOT_SUPPORTED para undo de undo', async () => {
    await expect(assertUndoable(baseEntry({ revertsId: 'log-0' }), 'user-1')).rejects.toMatchObject(
      { status: 400, code: 'UNDO_NOT_SUPPORTED' },
    );
  });

  it('lança 400 UNDO_MISSING_DATA para exclusão sem snapshot', async () => {
    await expect(
      assertUndoable(baseEntry({ action: 'transacao.excluir' }), 'user-1'),
    ).rejects.toMatchObject({ status: 400, code: 'UNDO_MISSING_DATA' });
  });

  it('lança 409 UNDO_CONFLICT quando há entrada mais recente na entidade', async () => {
    mockPrisma.userChangeLog.findFirst.mockResolvedValueOnce({ id: 'log-newer' });
    await expect(assertUndoable(baseEntry(), 'user-1')).rejects.toMatchObject({
      status: 409,
      code: 'UNDO_CONFLICT',
    });
  });

  it('retorna a definição quando tudo ok', async () => {
    const def = await assertUndoable(baseEntry(), 'user-1');
    expect(def.strategy).toBe('restore-fields');
    expect(def).toBeDefined();
  });

  it('erros são instâncias de UndoError', async () => {
    try {
      await assertUndoable(baseEntry({ action: 'nao.existe' }), 'user-1');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UndoError);
    }
  });
});
