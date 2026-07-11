import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser, mockAuthAsConsultant } from '@/test/mocks/auth';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  stockTransaction: { findFirst: vi.fn(), update: vi.fn() },
  portfolio: { findFirst: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockRecalc = vi.hoisted(() => vi.fn());
const mockSyncSonho = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
  invalidatePortfolioSnapshots: vi.fn(),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: mockSyncSonho,
}));
vi.mock('@/services/planejamento/sonhoCashflowSync', () => ({
  syncObjetivoToCashflow: vi.fn(),
  syncObjetivoRecordToCashflow: vi.fn(),
  removeObjetivoCashflow: vi.fn(),
}));

import { POST } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', { method: 'POST' });

const callPOST = (id = 'log-1') => POST(createRequest(), { params: Promise.resolve({ id }) });

const baseEntry = (overrides: Record<string, unknown> = {}) => ({
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
});

const tx = {
  id: 'tx-1',
  userId: 'user-1',
  assetId: 'asset-1',
  quantity: 150,
  total: 1500,
  date: new Date('2026-06-01T00:00:00Z'),
};

beforeEach(() => {
  // resetAllMocks (não clear): limpa também as filas de mockResolvedValueOnce
  // do setupEntry, que vazariam entre testes que não consomem as duas chamadas.
  vi.resetAllMocks();
  mockRequireAuthWithActing.mockResolvedValue(mockAuthAsUser('user-1'));
  // findFirst do log (1ª chamada da rota) e da checagem LIFO (2ª chamada):
  // configurado por teste. updateMany = claim.
  mockPrisma.userChangeLog.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.userChangeLog.create.mockResolvedValue({});
  mockPrisma.stockTransaction.findFirst.mockResolvedValue(tx);
  mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
});

/** 1ª chamada: carrega a entrada; 2ª: conflito LIFO (null = sem conflito). */
const setupEntry = (entry: ReturnType<typeof baseEntry> | null, newer: unknown = null) => {
  mockPrisma.userChangeLog.findFirst.mockResolvedValueOnce(entry).mockResolvedValueOnce(newer);
};

describe('POST /api/historico-alteracoes/[id]/undo', () => {
  it('404 quando a entrada não existe ou é de outro usuário', async () => {
    setupEntry(null);
    const response = await callPOST();
    expect(response.status).toBe(404);
  });

  it('400 UNDO_NOT_SUPPORTED para action fora do registry', async () => {
    setupEntry(baseEntry({ action: 'senha.alterar' }));
    const response = await callPOST();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('UNDO_NOT_SUPPORTED');
  });

  it('400 UNDO_MISSING_DATA para exclusão pré-deploy sem snapshot', async () => {
    setupEntry(baseEntry({ action: 'transacao.excluir', snapshot: null }));
    const response = await callPOST();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('UNDO_MISSING_DATA');
  });

  it('409 UNDO_CONFLICT quando há alteração mais recente da entidade', async () => {
    setupEntry(baseEntry(), { id: 'log-newer' });
    const response = await callPOST();
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe('UNDO_CONFLICT');
  });

  it('409 ALREADY_UNDONE quando o claim concorrente perde (count 0)', async () => {
    setupEntry(baseEntry());
    mockPrisma.userChangeLog.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await callPOST();
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe('ALREADY_UNDONE');
  });

  it('sucesso: desfaz, registra .desfazer com revertsId e retorna a seção', async () => {
    setupEntry(baseEntry());
    const response = await callPOST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, section: 'carteira' });

    // Claim marcou a entrada como desfeita
    expect(mockPrisma.userChangeLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', undoneAt: null },
      data: expect.objectContaining({ undoneById: 'user-1' }),
    });
    // Mutação inversa + efeitos
    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { quantity: 100 },
    });
    expect(mockRecalc).toHaveBeenCalled();
    expect(mockSyncSonho).toHaveBeenCalled();
    // Entrada de undo com diff invertido
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'transacao.editar.desfazer',
        revertsId: 'log-1',
        changes: [{ field: 'quantity', label: 'Quantidade', before: 150, after: 100 }],
      }),
    });
  });

  it('rollback do claim quando o handler falha (estado divergente → 409)', async () => {
    setupEntry(baseEntry());
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({ ...tx, quantity: 999 });

    const response = await callPOST();
    expect(response.status).toBe(409);

    // Claim revertido — a entrada volta a ser desfazível
    expect(mockPrisma.userChangeLog.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'log-1' },
      data: { undoneAt: null, undoneById: null },
    });
    expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
  });

  it('consultor desfaz em nome do cliente: viaConsultant true e undoneById = consultor', async () => {
    mockRequireAuthWithActing.mockResolvedValue(mockAuthAsConsultant('consultant-1', 'client-1'));
    setupEntry(baseEntry({ userId: 'client-1' }));
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({ ...tx, userId: 'client-1' });

    const response = await callPOST();
    expect(response.status).toBe(200);

    expect(mockPrisma.userChangeLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', undoneAt: null },
      data: expect.objectContaining({ undoneById: 'consultant-1' }),
    });
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'client-1',
        actorId: 'consultant-1',
        viaConsultant: true,
      }),
    });
  });

  it('400 para undo de undo (revertsId preenchido)', async () => {
    setupEntry(baseEntry({ revertsId: 'log-0', action: 'transacao.editar.desfazer' }));
    const response = await callPOST();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('UNDO_NOT_SUPPORTED');
  });
});
