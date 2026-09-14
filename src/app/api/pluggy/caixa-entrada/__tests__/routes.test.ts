import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));
const mockSvc = vi.hoisted(() => ({
  listarPendentes: vi.fn(),
  aplicar: vi.fn(),
  ignorar: vi.fn(),
  desaplicar: vi.fn(),
}));
vi.mock('@/services/pluggy/caixaEntrada', () => mockSvc);
const mockRecord = vi.hoisted(() => vi.fn());
vi.mock('@/services/changeHistory/recordChange', () => ({ recordChange: mockRecord }));
const mockPrisma = vi.hoisted(() => ({ bankTransaction: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET as listar } from '../route';
import { POST as aplicar } from '../aplicar/route';
import { POST as ignorar } from '../ignorar/route';
import { POST as desaplicar } from '../desaplicar/route';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('rotas /api/pluggy/caixa-entrada', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    mockAuth.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@x', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockRecord.mockResolvedValue(undefined);
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('GET lista pendentes com paginação saneada', async () => {
    mockSvc.listarPendentes.mockResolvedValue({ pendentes: [], total: 0, page: 1, totalPages: 0 });
    const res = await listar(req('/api/pluggy/caixa-entrada?page=abc&limit=20'));
    expect(res.status).toBe(200);
    expect(mockSvc.listarPendentes).toHaveBeenCalledWith('user-1', { page: 1, limit: 20 });
  });

  it('403 para consultor personificado', async () => {
    mockAuth.mockResolvedValue({
      payload: { id: 'c', email: 'c@x', role: 'consultant' },
      targetUserId: 'user-1',
      actingClient: { id: 'user-1' },
    });
    expect((await listar(req('/api/pluggy/caixa-entrada'))).status).toBe(403);
    expect(
      (
        await aplicar(
          req('/api/pluggy/caixa-entrada/aplicar', 'POST', {
            aplicacoes: [{ id: T1, itemId: 'i' }],
          }),
        )
      ).status,
    ).toBe(403);
  });

  it('aplicar valida o corpo, delega e registra no histórico com os ids', async () => {
    expect(
      (await aplicar(req('/api/pluggy/caixa-entrada/aplicar', 'POST', { aplicacoes: [] }))).status,
    ).toBe(400);
    expect(
      (
        await aplicar(
          req('/api/pluggy/caixa-entrada/aplicar', 'POST', {
            aplicacoes: [{ id: 'x', itemId: 'i' }],
          }),
        )
      ).status,
    ).toBe(400);

    mockSvc.aplicar.mockResolvedValue({
      aplicadas: 2,
      celulas: [{ itemId: 'i', year: 2026, month: 7, value: 305 }],
      ids: [T1, T2],
    });
    const res = await aplicar(
      req('/api/pluggy/caixa-entrada/aplicar', 'POST', {
        aplicacoes: [
          { id: T1, itemId: 'it-1' },
          { id: T2, itemId: 'it-1' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).aplicadas).toBe(2);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'fluxo-caixa',
        action: 'banco.aplicar',
        entityLabel: '2 transações',
        snapshot: { v: 1, kind: 'banco-transacoes', data: { ids: [T1, T2] } },
      }),
    );
  });

  it('ignorar registra só quando algo mudou', async () => {
    mockSvc.ignorar.mockResolvedValue([]);
    const nada = await ignorar(req('/api/pluggy/caixa-entrada/ignorar', 'POST', { ids: [T1] }));
    expect(await nada.json()).toEqual({ ignoradas: 0, ids: [] });
    expect(mockRecord).not.toHaveBeenCalled();

    mockSvc.ignorar.mockResolvedValue([T1]);
    await ignorar(req('/api/pluggy/caixa-entrada/ignorar', 'POST', { ids: [T1] }));
    expect(mockSvc.ignorar).toHaveBeenLastCalledWith('user-1', [T1], true);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'banco.ignorar', entityLabel: '1 transação' }),
    );
  });

  it('desaplicar guarda o item de origem no snapshot para o desfazer', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ id: T1, cashflowItemId: 'it-1' }]);
    mockSvc.desaplicar.mockResolvedValue({ aplicadas: 1, celulas: [], ids: [T1] });
    const res = await desaplicar(
      req('/api/pluggy/caixa-entrada/desaplicar', 'POST', { ids: [T1] }),
    );
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'banco.desaplicar',
        snapshot: {
          v: 1,
          kind: 'banco-transacoes',
          data: { aplicacoes: [{ id: T1, itemId: 'it-1' }] },
        },
      }),
    );
  });
});
