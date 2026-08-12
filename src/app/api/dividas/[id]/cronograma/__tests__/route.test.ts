import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  divida: { findFirst: vi.fn() },
  economicIndex: { findMany: vi.fn() },
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
vi.mock('@/lib/simpleTtlCache', () => ({
  getTtlCache: () => ({ get: () => undefined, set: () => {} }),
  deleteTtlCacheKeyPrefix: () => {},
}));

import { GET } from '../route';

const params = { params: Promise.resolve({ id: 'div-1' }) };
const req = () => new NextRequest('http://localhost/api/dividas/div-1/cronograma');

const financiamentoRow = (over: Record<string, unknown> = {}) => ({
  id: 'div-1',
  userId: 'user-1',
  nome: 'Apê',
  modalidade: 'financiamento',
  principal: 100000,
  taxaAm: 0.01,
  prazoMeses: 120,
  sistema: 'PRICE',
  indexador: 'PREFIXADO',
  primeiroVencimento: '2026-01',
  saldoInicial: null,
  dataSaldoInicial: null,
  pagamentos: [] as unknown[],
  ...over,
});

beforeEach(() => {
  mockPrisma.divida.findFirst.mockReset();
  mockPrisma.economicIndex.findMany.mockReset();
});

describe('GET /api/dividas/[id]/cronograma', () => {
  it('devolve cronograma Price completo com saldo e fator 1 (prefixado)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cronograma).toHaveLength(120);
    expect(body.cronograma[0].parcela).toBeCloseTo(1434.71, 2);
    expect(body.cronograma[119].saldoDevedor).toBe(0);
    expect(body.saldo.saldoDevedor).toBe(100000);
    expect(body.fatorIndexacao).toBe(1);
    expect(body.saldoCorrigido).toBe(100000);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('aplica fator de indexação realizado quando indexada (CDI)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow({ indexador: 'CDI' }));
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 0.01 }]);

    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.fatorIndexacao).toBeCloseTo(1.01, 10);
    expect(body.saldoCorrigido).toBeCloseTo(101000, 2);
  });

  it('400 para dívida rotativa', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({
        modalidade: 'rotativa',
        principal: null,
        taxaAm: null,
        prazoMeses: null,
        sistema: null,
        primeiroVencimento: null,
        saldoInicial: 5000,
        dataSaldoInicial: '2026-01',
      }),
    );
    const res = await GET(req(), params);
    expect(res.status).toBe(400);
  });

  it('404 quando não pertence ao user', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });
});
