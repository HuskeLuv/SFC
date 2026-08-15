import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  divida: { findMany: vi.fn(), create: vi.fn() },
  economicIndex: { findMany: vi.fn() },
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
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/simpleTtlCache', () => ({
  getTtlCache: () => ({ get: () => undefined, set: () => {} }),
  deleteTtlCacheKeyPrefix: () => {},
}));
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: mockSyncDivida,
  removeDividaCashflow: vi.fn(),
}));

import { GET, POST } from '../route';

const financiamentoRow = (over: Record<string, unknown> = {}) => ({
  id: 'div-1',
  userId: 'user-1',
  nome: 'Apê',
  instituicao: 'Caixa',
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
  mockPrisma.divida.findMany.mockReset();
  mockPrisma.divida.create.mockReset();
  mockPrisma.userChangeLog.create.mockReset();
});

describe('GET /api/dividas', () => {
  it('lista dívidas do user com resumo computado', async () => {
    mockPrisma.divida.findMany.mockResolvedValue([financiamentoRow()]);

    const res = await GET(new NextRequest('http://localhost/api/dividas'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dividas).toHaveLength(1);
    expect(body.dividas[0].resumo.saldoDevedor).toBe(100000);
    expect(body.dividas[0].resumo.totalParcelas).toBe(120);
    expect(body.dividas[0].resumo.categoria).toBe('l');
    expect(mockPrisma.divida.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    // Prefixado não consulta índice nem ganha campos corrigidos.
    expect(body.dividas[0].resumo.saldoCorrigido).toBeUndefined();
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('dívida indexada: resumo ganha saldo e próxima parcela corrigidos pelo índice realizado', async () => {
    mockPrisma.divida.findMany.mockResolvedValue([financiamentoRow({ indexador: 'IPCA' })]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 0.01 }]);

    const res = await GET(new NextRequest('http://localhost/api/dividas'));
    const body = await res.json();
    const resumo = body.dividas[0].resumo;
    expect(resumo.fatorIndexacao).toBeCloseTo(1.01, 10);
    expect(resumo.saldoCorrigido).toBeCloseTo(101000, 2);
    expect(resumo.proximaParcelaCorrigida).toBeCloseTo(resumo.proximaParcela.parcela * 1.01, 2);
    // Base em moeda constante permanece intacta.
    expect(resumo.saldoDevedor).toBe(100000);
  });
});

describe('POST /api/dividas', () => {
  const postReq = (body: unknown) =>
    new NextRequest('http://localhost/api/dividas', {
      method: 'POST',
      body: JSON.stringify(body),
    });

  it('cria financiamento e registra no histórico', async () => {
    mockPrisma.divida.create.mockResolvedValue(financiamentoRow());

    const res = await POST(
      postReq({
        modalidade: 'financiamento',
        nome: 'Apê',
        tipo: 'financiamento_imobiliario',
        principal: 100000,
        taxaAm: 0.01,
        prazoMeses: 120,
        sistema: 'PRICE',
        primeiroVencimento: '2026-01',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.divida.nome).toBe('Apê');
    expect(body.divida.resumo.saldoDevedor).toBe(100000);
    expect(mockPrisma.divida.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', modalidade: 'financiamento' }),
      }),
    );
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalled();
    expect(mockSyncDivida).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'div-1' }));
  });

  it('cria rotativa sem campos de cronograma', async () => {
    mockPrisma.divida.create.mockResolvedValue(
      financiamentoRow({
        modalidade: 'rotativa',
        tipo: 'cartao_credito',
        principal: null,
        taxaAm: null,
        prazoMeses: null,
        sistema: null,
        primeiroVencimento: null,
        saldoInicial: 5000,
        dataSaldoInicial: '2026-01',
      }),
    );

    const res = await POST(
      postReq({
        modalidade: 'rotativa',
        nome: 'Cartão',
        tipo: 'cartao_credito',
        saldoInicial: 5000,
        dataSaldoInicial: '2026-01',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.divida.resumo.saldoDevedor).toBe(5000);
    expect(body.divida.resumo.categoria).toBe('c');
  });

  it('rejeita financiamento sem parâmetros de cronograma (400)', async () => {
    const res = await POST(
      postReq({ modalidade: 'financiamento', nome: 'X', tipo: 'outro', principal: 1000 }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.divida.create).not.toHaveBeenCalled();
  });

  it('rejeita primeiroVencimento fora de YYYY-MM (400)', async () => {
    const res = await POST(
      postReq({
        modalidade: 'financiamento',
        nome: 'X',
        tipo: 'outro',
        principal: 1000,
        taxaAm: 0.01,
        prazoMeses: 12,
        sistema: 'SAC',
        primeiroVencimento: '01/2026',
      }),
    );
    expect(res.status).toBe(400);
  });
});
