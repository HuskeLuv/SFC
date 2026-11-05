import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockSvc = vi.hoisted(() => ({ aplicar: vi.fn(), desaplicar: vi.fn(), ignorar: vi.fn() }));
vi.mock('@/services/pluggy/caixaEntrada', () => mockSvc);
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { BANCO_IMPORTACAO_UNDO_HANDLERS } from '../handlers/bancoImportacao';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

const item = (id: string) => ({
  field: `banco:${id}`,
  label: `05/11/2026 · ${id} · Nubank`,
  before: -10,
  after: 'entrou em Mercado (novembro de 2026)',
  format: 'currency',
});
const RESTO = { field: 'banco:resto', label: 'Mais 1 transação', before: null, after: null };

const makeEntry = (overrides: Partial<UserChangeLog>): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'fluxo-caixa',
    action: 'banco.aplicar',
    entity: 'banco-transacoes',
    entityId: null,
    entityLabel: '3 transações',
    changes: [item('a'), item('b'), RESTO],
    snapshot: { v: 1, kind: 'banco-transacoes', data: { ids: ['a', 'b', 'c'] } },
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-11-05T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

describe('undo banco — detalhe das transações na entrada "Desfez"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('desfez todas: repete o detalhe inteiro (com o "Mais N")', async () => {
    mockSvc.desaplicar.mockResolvedValue({ aplicadas: 3, celulas: [], ids: ['a', 'b', 'c'] });
    const out = await BANCO_IMPORTACAO_UNDO_HANDLERS['banco.aplicar'].execute({
      request,
      auth,
      entry: makeEntry({}),
    });
    expect(out).toEqual({ entityLabel: '3 transações', changes: [item('a'), item('b'), RESTO] });
  });

  it('desfez parte: só as desfeitas, sem o "Mais N"', async () => {
    mockSvc.ignorar.mockResolvedValue(['b']);
    const out = await BANCO_IMPORTACAO_UNDO_HANDLERS['banco.ignorar'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'banco.ignorar' }),
    });
    expect(mockSvc.ignorar).toHaveBeenCalledWith('user-1', ['a', 'b', 'c'], false);
    expect(out).toEqual({ entityLabel: '1 transação', changes: [item('b')] });
  });

  it('entrada antiga sem detalhe: só a contagem', async () => {
    mockSvc.aplicar.mockResolvedValue({ aplicadas: 1, celulas: [], ids: ['a'] });
    const out = await BANCO_IMPORTACAO_UNDO_HANDLERS['banco.desaplicar'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'banco.desaplicar',
        changes: null,
        snapshot: {
          v: 1,
          kind: 'banco-transacoes',
          data: { aplicacoes: [{ id: 'a', itemId: 'it-1' }] },
        },
      }),
    });
    expect(mockSvc.aplicar).toHaveBeenCalledWith('user-1', [{ id: 'a', itemId: 'it-1' }]);
    expect(out).toEqual({ entityLabel: '1 transação', changes: undefined });
  });
});
