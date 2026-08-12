import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  divida: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  userChangeLog: { create: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockSyncDivida = vi.hoisted(() => vi.fn());
const mockRemoveDividaCashflow = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: mockSyncDivida,
  removeDividaCashflow: mockRemoveDividaCashflow,
}));

import { GET, PATCH, DELETE } from '../route';

const params = { params: Promise.resolve({ id: 'div-1' }) };

const financiamentoRow = (over: Record<string, unknown> = {}) => ({
  id: 'div-1',
  userId: 'user-1',
  nome: 'Apê',
  instituicao: null,
  tipo: 'financiamento_imobiliario',
  modalidade: 'financiamento',
  principal: 100000,
  taxaAm: 0.01,
  taxaUnidadeEntrada: 'am',
  prazoMeses: 120,
  sistema: 'PRICE',
  indexador: 'PREFIXADO',
  primeiroVencimento: '2026-01',
  saldoInicial: null,
  dataSaldoInicial: null,
  status: 'ativa',
  notes: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  pagamentos: [],
  ...over,
});

beforeEach(() => {
  mockPrisma.divida.findFirst.mockReset();
  mockPrisma.divida.update.mockReset();
  mockPrisma.divida.delete.mockReset();
  mockPrisma.userChangeLog.create.mockReset();
});

describe('GET /api/dividas/[id]', () => {
  it('retorna detalhe com pagamentos e resumo', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({
        pagamentos: [
          {
            id: 'pg-1',
            month: '2026-01',
            valor: 1434.71,
            parcelaNumero: 1,
            tipo: 'pagamento',
            notes: null,
            createdAt: new Date('2026-01-05'),
          },
        ],
      }),
    );

    const res = await GET(new NextRequest('http://localhost/api/dividas/div-1'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.divida.pagamentos).toHaveLength(1);
    expect(body.divida.resumo.parcelasPagas).toBe(1);
    expect(body.divida.resumo.saldoDevedor).toBeLessThan(100000);
    expect(mockPrisma.divida.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'div-1', userId: 'user-1' } }),
    );
  });

  it('404 quando não pertence ao user', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/dividas/div-1'), params);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/dividas/[id]', () => {
  const patchReq = (body: unknown) =>
    new NextRequest('http://localhost/api/dividas/div-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

  it('edita campos e registra no histórico', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    mockPrisma.divida.update.mockResolvedValue(financiamentoRow({ nome: 'Apartamento' }));

    const res = await PATCH(patchReq({ nome: 'Apartamento' }), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.divida.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nome: 'Apartamento' } }),
    );
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalled();
    expect(mockSyncDivida).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ nome: 'Apartamento' }),
    );
  });

  it('rejeita campo de cronograma em dívida rotativa (400)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({ modalidade: 'rotativa', saldoInicial: 5000, dataSaldoInicial: '2026-01' }),
    );
    const res = await PATCH(patchReq({ prazoMeses: 24 }), params);
    expect(res.status).toBe(400);
    expect(mockPrisma.divida.update).not.toHaveBeenCalled();
  });

  it('rejeita saldoInicial em financiamento (400)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    const res = await PATCH(patchReq({ saldoInicial: 1000 }), params);
    expect(res.status).toBe(400);
  });

  it('400 sem campos', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    const res = await PATCH(patchReq({}), params);
    expect(res.status).toBe(400);
  });

  it('404 quando não pertence ao user', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ nome: 'X' }), params);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/dividas/[id]', () => {
  it('remove e grava snapshot com pagamentos', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({
        pagamentos: [
          {
            id: 'pg-1',
            month: '2026-01',
            valor: 1434.71,
            parcelaNumero: 1,
            tipo: 'pagamento',
            notes: null,
            createdAt: new Date('2026-01-05'),
          },
        ],
      }),
    );
    mockPrisma.divida.delete.mockResolvedValue({});

    const res = await DELETE(new NextRequest('http://localhost/api/dividas/div-1'), params);
    expect(res.status).toBe(200);
    expect(mockRemoveDividaCashflow).toHaveBeenCalledWith('div-1');
    expect(mockPrisma.divida.delete).toHaveBeenCalledWith({ where: { id: 'div-1' } });
    const logArg = mockPrisma.userChangeLog.create.mock.calls[0][0];
    expect(logArg.data.action).toBe('divida.excluir');
    const snapshot = logArg.data.snapshot;
    expect(snapshot.kind).toBe('divida');
    expect(snapshot.meta.pagamentos).toHaveLength(1);
  });

  it('404 quando não pertence ao user', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost/api/dividas/div-1'), params);
    expect(res.status).toBe(404);
    expect(mockPrisma.divida.delete).not.toHaveBeenCalled();
  });
});
