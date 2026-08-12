import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  dividaPagamento: { findFirst: vi.fn(), delete: vi.fn() },
  userChangeLog: { create: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { DELETE } from '../route';

const params = { params: Promise.resolve({ id: 'div-1', pagamentoId: 'pg-1' }) };
const req = () => new NextRequest('http://localhost/api/dividas/div-1/pagamentos/pg-1');

beforeEach(() => {
  mockPrisma.dividaPagamento.findFirst.mockReset();
  mockPrisma.dividaPagamento.delete.mockReset();
  mockPrisma.userChangeLog.create.mockReset();
});

describe('DELETE /api/dividas/[id]/pagamentos/[pagamentoId]', () => {
  it('remove e grava snapshot com locator da dívida', async () => {
    mockPrisma.dividaPagamento.findFirst.mockResolvedValue({
      id: 'pg-1',
      dividaId: 'div-1',
      month: '2026-01',
      valor: 1434.71,
      parcelaNumero: 1,
      tipo: 'pagamento',
      notes: null,
      divida: { nome: 'Apê' },
    });
    mockPrisma.dividaPagamento.delete.mockResolvedValue({});

    const res = await DELETE(req(), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.dividaPagamento.delete).toHaveBeenCalledWith({ where: { id: 'pg-1' } });
    expect(mockPrisma.dividaPagamento.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ divida: { userId: 'user-1' } }),
      }),
    );
    const logArg = mockPrisma.userChangeLog.create.mock.calls[0][0];
    expect(logArg.data.action).toBe('divida-pagamento.excluir');
    expect(logArg.data.snapshot.meta.dividaId).toBe('div-1');
  });

  it('404 quando pagamento não pertence ao user', async () => {
    mockPrisma.dividaPagamento.findFirst.mockResolvedValue(null);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(404);
    expect(mockPrisma.dividaPagamento.delete).not.toHaveBeenCalled();
  });
});
