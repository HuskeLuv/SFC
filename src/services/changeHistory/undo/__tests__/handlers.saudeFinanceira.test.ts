import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  seguroApolice: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { SAUDE_FINANCEIRA_UNDO_HANDLERS } from '../handlers/saudeFinanceira';
import { UndoError } from '../types';
import type { UndoContext } from '../types';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

const makeEntry = (overrides: Partial<UserChangeLog>): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'saude-financeira',
    action: 'seguro.editar',
    entity: 'seguro',
    entityId: 'seg-1',
    entityLabel: 'Seguro Auto',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-08-14T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('seguro.criar (delete-created)', () => {
  const def = SAUDE_FINANCEIRA_UNDO_HANDLERS['seguro.criar'];

  it('apaga a apólice criada', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue({ id: 'seg-1' });
    await def.execute(ctx(makeEntry({ action: 'seguro.criar', changes: [] })));
    expect(mockPrisma.seguroApolice.delete).toHaveBeenCalledWith({ where: { id: 'seg-1' } });
  });

  it('409 quando a apólice não existe mais', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue(null);
    await expect(
      def.execute(ctx(makeEntry({ action: 'seguro.criar', changes: [] }))),
    ).rejects.toThrow(UndoError);
  });
});

describe('seguro.editar (restore-fields)', () => {
  const def = SAUDE_FINANCEIRA_UNDO_HANDLERS['seguro.editar'];
  const changes = [
    { field: 'cobertura', label: 'Cobertura', before: 'parcial', after: 'total' },
    { field: 'custoAnual', label: 'Custo anual', before: 4800, after: 5200 },
  ];

  it('reaplica os valores before quando o estado atual bate com o after', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue({
      id: 'seg-1',
      cobertura: 'total',
      custoAnual: 5200, // Decimal serializado como number no mock
    });
    const outcome = await def.execute(
      ctx(makeEntry({ changes: changes as unknown as UserChangeLog['changes'] })),
    );
    expect(mockPrisma.seguroApolice.update).toHaveBeenCalledWith({
      where: { id: 'seg-1' },
      data: { cobertura: 'parcial', custoAnual: 4800 },
    });
    // Diff invertido pra entrada `seguro.editar.desfazer`.
    expect(outcome.changes?.[0]).toMatchObject({ before: 'total', after: 'parcial' });
  });

  it('409 quando outra mutação alterou o campo depois (estado não bate)', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue({
      id: 'seg-1',
      cobertura: 'nenhuma', // ≠ after ('total')
      custoAnual: 5200,
    });
    await expect(
      def.execute(ctx(makeEntry({ changes: changes as unknown as UserChangeLog['changes'] }))),
    ).rejects.toThrow(UndoError);
    expect(mockPrisma.seguroApolice.update).not.toHaveBeenCalled();
  });
});

describe('seguro.excluir (recreate-from-snapshot)', () => {
  const def = SAUDE_FINANCEIRA_UNDO_HANDLERS['seguro.excluir'];
  const snapshot = {
    v: 1,
    kind: 'seguro',
    data: {
      id: 'seg-1',
      nome: 'Seguro Auto',
      tipo: 'auto',
      cobertura: 'parcial',
      risco: 'alto',
      custoAnual: 4800,
      capitalSegurado: null,
      notes: null,
    },
  };

  it('recria a apólice com o id original', async () => {
    mockPrisma.seguroApolice.create.mockResolvedValue({ id: 'seg-1' });
    const outcome = await def.execute(
      ctx(
        makeEntry({
          action: 'seguro.excluir',
          changes: [],
          snapshot: snapshot as unknown as UserChangeLog['snapshot'],
        }),
      ),
    );
    expect(mockPrisma.seguroApolice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'seg-1', userId: 'user-1', nome: 'Seguro Auto' }),
    });
    expect(outcome.entityLabel).toBe('Seguro Auto');
  });

  it('409 quando a apólice já foi restaurada (unique violation)', async () => {
    mockPrisma.seguroApolice.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      def.execute(
        ctx(
          makeEntry({
            action: 'seguro.excluir',
            changes: [],
            snapshot: snapshot as unknown as UserChangeLog['snapshot'],
          }),
        ),
      ),
    ).rejects.toThrow('O seguro já foi restaurado');
  });
});
