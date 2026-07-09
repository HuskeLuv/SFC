import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), findMany: vi.fn() },
  planejamentoObjetivo: { findFirst: vi.fn() },
  cashflowItem: { findUnique: vi.fn() },
  cashflowValue: { deleteMany: vi.fn(), upsert: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const mockSyncRecord = vi.hoisted(() => vi.fn());
const mockSyncReverse = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('../sonhoCashflowSync', () => ({ syncObjetivoRecordToCashflow: mockSyncRecord }));
vi.mock('../cashflowToSonhoSync', () => ({
  REALIZADO_COLOR: '#FF0000',
  syncCashflowToObjetivo: mockSyncReverse,
}));

import { syncSonhoRealizadoFromCarteira } from '../carteiraToSonhoRealizado';

const objetivo = {
  id: 'obj-1',
  name: 'Viagem',
  target: 24000,
  available: 0,
  months: 12,
  rate: 0,
  startDate: '2026-01',
  status: 'Iniciado',
  portfolios: [{ assetId: 'asset-1' }],
};

const tx = (overrides: Record<string, unknown>) => ({
  type: 'compra',
  total: 1000,
  fees: 0,
  date: new Date(2026, 2, 10), // mar/2026 (getMonth local, como investimentosPorMes)
  notes: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(objetivo);
  mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1' });
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.cashflowValue.deleteMany.mockImplementation((args) => ({ _op: 'deleteMany', args }));
  mockPrisma.cashflowValue.upsert.mockImplementation((args) => ({ _op: 'upsert', args }));
  mockPrisma.$transaction.mockResolvedValue([]);
});

const txOps = () =>
  mockPrisma.$transaction.mock.calls.at(-1)?.[0] as Array<{ _op: string; args: unknown }>;

describe('syncSonhoRealizadoFromCarteira', () => {
  it('escreve o líquido mensal como célula REALIZADO (vermelha) e re-deriva os syncs', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000, fees: 2 }),
      tx({ total: 500, date: new Date(2026, 3, 5) }), // abr
    ]);

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    const ops = txOps();
    expect(ops[0]._op).toBe('deleteMany'); // limpa TODAS as vermelhas antes (100% carteira)
    const upserts = ops.filter((o) => o._op === 'upsert') as Array<{
      args: { create: { year: number; month: number; value: number; color: string } };
    }>;
    expect(upserts).toHaveLength(2);
    expect(upserts[0].args.create).toMatchObject({
      year: 2026,
      month: 2,
      value: 1002,
      color: '#FF0000',
    });
    expect(upserts[1].args.create).toMatchObject({ year: 2026, month: 3, value: 500 });

    // Reprojeta o planejado e re-deriva entries/status
    expect(mockSyncRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'obj-1' }));
    expect(mockSyncReverse).toHaveBeenCalledWith('u1', 'obj-1');
  });

  it('venda abate o líquido do mês (pode ficar negativo)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 500 }),
      tx({ type: 'venda', total: 800, date: new Date(2026, 2, 20) }),
    ]);

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    const upserts = txOps().filter((o) => o._op === 'upsert') as Array<{
      args: { create: { value: number } };
    }>;
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args.create.value).toBe(-300);
  });

  it('mês com líquido zero não vira célula (só o deleteMany limpa)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 500 }),
      tx({ type: 'venda', total: 500, date: new Date(2026, 2, 20) }),
    ]);

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    expect(txOps().filter((o) => o._op === 'upsert')).toHaveLength(0);
  });

  it('ignora reinvestimentos de proventos', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 100, notes: JSON.stringify({ operation: { action: 'reinvestimento' } }) }),
    ]);

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    expect(txOps().filter((o) => o._op === 'upsert')).toHaveLength(0);
  });

  it('assetId não vinculado → no-op', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ planejamentoObjetivoId: null });

    await syncSonhoRealizadoFromCarteira('u1', { assetId: 'asset-livre' });

    expect(mockPrisma.planejamentoObjetivo.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('assetId vinculado → resolve e sincroniza o objetivo do vínculo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ planejamentoObjetivoId: 'obj-1' });

    await syncSonhoRealizadoFromCarteira('u1', { assetId: 'asset-1' });

    expect(mockPrisma.planejamentoObjetivo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'obj-1', userId: 'u1' } }),
    );
    expect(mockSyncReverse).toHaveBeenCalledWith('u1', 'obj-1');
  });

  it('cria a linha-espelho via sync direto quando ela não existe', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'item-1' });

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    // 1ª chamada garante a linha; a 2ª (pós-transação) reprojeta o planejado
    expect(mockSyncRecord).toHaveBeenCalledTimes(2);
  });

  it('objetivo sem portfolios vinculados: limpa as vermelhas e re-deriva (unlink)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({ ...objetivo, portfolios: [] });

    await syncSonhoRealizadoFromCarteira('u1', { objetivoId: 'obj-1' });

    expect(mockPrisma.stockTransaction.findMany).not.toHaveBeenCalled();
    const ops = txOps();
    expect(ops[0]._op).toBe('deleteMany');
    expect(mockSyncReverse).toHaveBeenCalledWith('u1', 'obj-1');
  });
});
