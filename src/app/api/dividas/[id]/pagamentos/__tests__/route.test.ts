import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  divida: { findFirst: vi.fn() },
  dividaPagamento: { create: vi.fn() },
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
const mockSyncDivida = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: mockSyncDivida,
}));
// isIndexadorCorrigivel é puro e fica real; só os fatores (I/O) são mockados.
const mockMonthlyFactors = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/services/dividas/indexacaoDivida', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/dividas/indexacaoDivida')>();
  return { ...actual, monthlyIndexFactors: mockMonthlyFactors };
});

import { POST } from '../route';

const params = { params: Promise.resolve({ id: 'div-1' }) };
const postReq = (body: unknown) =>
  new NextRequest('http://localhost/api/dividas/div-1/pagamentos', {
    method: 'POST',
    body: JSON.stringify(body),
  });

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
  pagamentos: [] as unknown[],
  ...over,
});

const pagamentoRow = (over: Record<string, unknown> = {}) => ({
  id: 'pg-1',
  dividaId: 'div-1',
  month: '2026-01',
  valor: 1434.71,
  parcelaNumero: 1,
  tipo: 'pagamento',
  notes: null,
  createdAt: new Date('2026-01-05'),
  updatedAt: new Date('2026-01-05'),
  ...over,
});

beforeEach(() => {
  mockPrisma.divida.findFirst.mockReset();
  mockPrisma.dividaPagamento.create.mockReset();
  mockPrisma.userChangeLog.create.mockReset();
});

describe('POST /api/dividas/[id]/pagamentos', () => {
  it('registra parcela e devolve dívida com resumo atualizado', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    mockPrisma.dividaPagamento.create.mockResolvedValue(pagamentoRow());

    const res = await POST(postReq({ month: '2026-01', valor: 1434.71, parcelaNumero: 1 }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.pagamento.parcelaNumero).toBe(1);
    expect(body.divida.resumo.parcelasPagas).toBe(1);
    expect(body.divida.resumo.proximaParcela.numero).toBe(2);
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalled();
  });

  it('409 quando a parcela já foi registrada', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({ pagamentos: [pagamentoRow()] }),
    );
    const res = await POST(postReq({ month: '2026-02', valor: 1434.71, parcelaNumero: 1 }), params);
    expect(res.status).toBe(409);
    expect(mockPrisma.dividaPagamento.create).not.toHaveBeenCalled();
  });

  it('400 quando parcelaNumero excede o prazo', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    const res = await POST(
      postReq({ month: '2026-01', valor: 1434.71, parcelaNumero: 121 }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 quando parcelaNumero em dívida rotativa', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({ modalidade: 'rotativa', saldoInicial: 5000, dataSaldoInicial: '2026-01' }),
    );
    const res = await POST(postReq({ month: '2026-01', valor: 500, parcelaNumero: 1 }), params);
    expect(res.status).toBe(400);
  });

  it('registra ajuste em rotativa (soma ao saldo)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({ modalidade: 'rotativa', saldoInicial: 5000, dataSaldoInicial: '2026-01' }),
    );
    mockPrisma.dividaPagamento.create.mockResolvedValue(
      pagamentoRow({ parcelaNumero: null, tipo: 'ajuste', valor: 300, month: '2026-02' }),
    );

    const res = await POST(postReq({ month: '2026-02', valor: 300, tipo: 'ajuste' }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.divida.resumo.saldoDevedor).toBe(5300);
  });

  it('400 com valor não-positivo', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(financiamentoRow());
    const res = await POST(postReq({ month: '2026-01', valor: -10 }), params);
    expect(res.status).toBe(400);
  });

  it('404 quando dívida não pertence ao user', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ month: '2026-01', valor: 100 }), params);
    expect(res.status).toBe(404);
  });
});

describe('POST amortização com redução de prazo', () => {
  // SAC 12.000 / 0% / 12m → amortização de 1.000 por parcela.
  const sacRow = () =>
    financiamentoRow({ principal: 12000, taxaAm: 0, prazoMeses: 12, sistema: 'SAC' });

  it('calcula quantas parcelas do fim o valor quita e grava em parcelaNumero', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(sacRow());
    mockPrisma.dividaPagamento.create.mockResolvedValue(
      pagamentoRow({ tipo: 'amortizacao_prazo', parcelaNumero: 3, valor: 3000 }),
    );

    const res = await POST(
      postReq({ month: '2026-06', valor: 3000, tipo: 'amortizacao_prazo' }),
      params,
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.dividaPagamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'amortizacao_prazo', parcelaNumero: 3 }),
      }),
    );
    // Redução de prazo re-sincroniza a linha-espelho do fluxo.
    expect(mockSyncDivida).toHaveBeenCalled();
  });

  it('400 quando o valor não quita nem a última parcela', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(sacRow());

    const res = await POST(
      postReq({ month: '2026-06', valor: 500, tipo: 'amortizacao_prazo' }),
      params,
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('pagamento extraordinário');
    expect(mockPrisma.dividaPagamento.create).not.toHaveBeenCalled();
  });

  it('dívida indexada: corte usa a parcela CORRIGIDA pelo índice realizado', async () => {
    // Parcela base 1.000 com correção +10% → custo de hoje 1.100 por parcela:
    // R$ 3.000 cortam 2, não 3 (corrigirCronograma repete o último fator).
    mockMonthlyFactors.mockResolvedValueOnce({ '2026-01': 1.1 });
    mockPrisma.divida.findFirst.mockResolvedValue(
      financiamentoRow({
        principal: 12000,
        taxaAm: 0,
        prazoMeses: 12,
        sistema: 'SAC',
        indexador: 'IPCA',
      }),
    );
    mockPrisma.dividaPagamento.create.mockResolvedValue(
      pagamentoRow({ tipo: 'amortizacao_prazo', parcelaNumero: 2, valor: 3000 }),
    );

    const res = await POST(
      postReq({ month: '2026-06', valor: 3000, tipo: 'amortizacao_prazo' }),
      params,
    );
    expect(res.status).toBe(201);
    expect(mockMonthlyFactors).toHaveBeenCalledWith('IPCA', '2026-01', '2026-12');
    expect(mockPrisma.dividaPagamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'amortizacao_prazo', parcelaNumero: 2 }),
      }),
    );
  });

  it('400 para rotativa', async () => {
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

    const res = await POST(
      postReq({ month: '2026-06', valor: 1000, tipo: 'amortizacao_prazo' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 quando parcelaNumero vem junto de tipo que não é pagamento', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(sacRow());

    const res = await POST(
      postReq({ month: '2026-06', valor: 1000, tipo: 'amortizacao_prazo', parcelaNumero: 5 }),
      params,
    );
    expect(res.status).toBe(400);
  });
});
