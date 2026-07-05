import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn(), update: vi.fn() },
  institution: { findUnique: vi.fn() },
  $transaction: vi.fn(),
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
// Mocks pra não importar todo o universo do GET (que arrastaria pricer/dividends/etc).
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
  getAssetHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/dividendService', () => ({
  getDividends: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/fundamentalsService', () => ({
  getFundamentals: vi.fn().mockResolvedValue({ pl: null, beta: null, dividendYield: null }),
}));

import { PATCH } from '../route';
import { parseRangeMonths } from '@/utils/rangeQuery';

const createPatchRequest = (body: object) =>
  new NextRequest('http://localhost/api/ativos/pf-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const callPATCH = (body: object, id = 'pf-1') =>
  PATCH(createPatchRequest(body), { params: Promise.resolve({ id }) });

describe('PATCH /api/ativos/[id] — Bug #11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('atualiza instituicaoId em todas as transações preservando o restante de notes', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({
      id: 'inst-novo',
      nome: 'Terra Investimentos',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        notes: JSON.stringify({
          operation: { instituicaoId: 'inst-antigo', tipoAtivo: 'acoes-brasil' },
          extra: 'preserva-me',
        }),
      },
      {
        id: 'tx-2',
        notes: JSON.stringify({
          operation: { instituicaoId: 'inst-antigo' },
        }),
      },
    ]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    const res = await callPATCH({ instituicaoId: 'inst-novo' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.instituicao).toEqual({ id: 'inst-novo', nome: 'Terra Investimentos' });

    // Ambas as transações foram atualizadas com a nova instituicaoId
    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledTimes(2);

    const calls = mockPrisma.stockTransaction.update.mock.calls;
    const notes1 = JSON.parse(calls[0][0].data.notes);
    const notes2 = JSON.parse(calls[1][0].data.notes);

    expect(notes1.operation.instituicaoId).toBe('inst-novo');
    expect(notes2.operation.instituicaoId).toBe('inst-novo');

    // Campos não relacionados preservados
    expect(notes1.operation.tipoAtivo).toBe('acoes-brasil');
    expect(notes1.extra).toBe('preserva-me');
  });

  it('preserva notes que não eram JSON como `raw` (não perde conteúdo)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-novo', nome: 'XP' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { id: 'tx-legacy', notes: 'observação livre do usuário, não JSON' },
    ]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    await callPATCH({ instituicaoId: 'inst-novo' });

    const updatedNotes = JSON.parse(mockPrisma.stockTransaction.update.mock.calls[0][0].data.notes);
    expect(updatedNotes.raw).toBe('observação livre do usuário, não JSON');
    expect(updatedNotes.operation.instituicaoId).toBe('inst-novo');
  });

  it('cria operation={} quando notes é null', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'Inst' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([{ id: 'tx-1', notes: null }]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    await callPATCH({ instituicaoId: 'inst-1' });

    const updatedNotes = JSON.parse(mockPrisma.stockTransaction.update.mock.calls[0][0].data.notes);
    expect(updatedNotes.operation.instituicaoId).toBe('inst-1');
  });

  it('retorna 404 quando portfolio não pertence ao usuário', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    const res = await callPATCH({ instituicaoId: 'inst-1' });
    expect(res.status).toBe(404);
  });

  it('retorna 404 quando instituição não existe', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue(null);

    const res = await callPATCH({ instituicaoId: 'inst-fantasma' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/Instituição/);
  });

  it('rejeita payload sem instituicaoId (zod)', async () => {
    const res = await callPATCH({});
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando portfolio não tem ativo vinculado', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: null,
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'X' });

    const res = await callPATCH({ instituicaoId: 'inst-1' });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/* parseRangeMonths — query param ?range= (#15/#16/#18 do checklist)  */
/* ================================================================== */

const reqWithRange = (range?: string) =>
  new NextRequest(`http://localhost/api/ativos/pf-1${range ? `?range=${range}` : ''}`);

describe('parseRangeMonths', () => {
  it('default 24M quando nenhum param', () => {
    expect(parseRangeMonths(reqWithRange())).toBe(24);
  });

  it('MAX retorna null (sem cap)', () => {
    expect(parseRangeMonths(reqWithRange('MAX'))).toBeNull();
    expect(parseRangeMonths(reqWithRange('max'))).toBeNull();
  });

  it('converte aliases 12M/24M/36M', () => {
    expect(parseRangeMonths(reqWithRange('12M'))).toBe(12);
    expect(parseRangeMonths(reqWithRange('24M'))).toBe(24);
    expect(parseRangeMonths(reqWithRange('36M'))).toBe(36);
  });

  it('converte aliases 2A/3A/5A/10A', () => {
    expect(parseRangeMonths(reqWithRange('2A'))).toBe(24);
    expect(parseRangeMonths(reqWithRange('3A'))).toBe(36);
    expect(parseRangeMonths(reqWithRange('5A'))).toBe(60);
    expect(parseRangeMonths(reqWithRange('10A'))).toBe(120);
  });

  it('valor inválido cai no default 24', () => {
    expect(parseRangeMonths(reqWithRange('quinze-anos'))).toBe(24);
    expect(parseRangeMonths(reqWithRange(''))).toBe(24);
  });
});
