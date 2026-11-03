import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolioDailySnapshot: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  aposentadoriaPlanoEntry: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  deriveAcompanhamentoEntries,
  planejarSync,
  sincronizarAcompanhamentoAuto,
} from '../acompanhamentoAuto';
import { NOTA_IMPORTACAO } from '@/services/pluggy/notaImportacao';

const plano = { trackStartMonth: 1, trackStartYear: 2026, idade: 30, apos: 65 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // "Hoje" fixo: jun/2026 → offsets 1..5 (fev..jun).
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 15)));
  mockPrisma.portfolio.findMany.mockResolvedValue([]); // sem vínculos por padrão
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveAcompanhamentoEntries', () => {
  it('deriva patrimônio do último snapshot do mês e aporte líquido das transações', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 1, 20)), totalValue: 1000 },
      { date: new Date(Date.UTC(2026, 1, 28)), totalValue: 1100 }, // último de fev → vence
      { date: new Date(Date.UTC(2026, 3, 10)), totalValue: 1300 }, // abr
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: new Date(Date.UTC(2026, 2, 5)),
        type: 'compra',
        total: 500,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        date: new Date(Date.UTC(2026, 3, 12)),
        type: 'venda',
        total: 200,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        date: new Date(Date.UTC(2026, 3, 15)),
        type: 'compra',
        total: 100,
        price: 0,
        quantity: 0,
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      },
    ]);

    const res = await deriveAcompanhamentoEntries('u1', plano);

    expect(res).toHaveLength(5); // fev..jun
    const fev = res[0];
    expect(fev).toMatchObject({ off: 1, month: 2, patFinal: 1100, aporteReal: 0, hasData: true });
    const mar = res[1];
    expect(mar).toMatchObject({
      off: 2,
      month: 3,
      patFinal: null,
      aporteReal: 500,
      hasData: false,
    });
    const abr = res[2];
    // venda -200; reinvestimento ignorado
    expect(abr).toMatchObject({
      off: 3,
      month: 4,
      patFinal: 1300,
      aporteReal: -200,
      hasData: true,
    });
    const mai = res[3];
    expect(mai).toMatchObject({ off: 4, patFinal: null, hasData: false });
  });

  it('com vínculo de aposentadoria, só transações dos ativos vinculados contam', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { assetId: 'asset-apos', vinculoAposentadoria: true, planejamentoObjetivoId: null },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        assetId: 'asset-apos',
        date: new Date(Date.UTC(2026, 2, 5)),
        type: 'compra',
        total: 500,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        assetId: 'asset-outro',
        date: new Date(Date.UTC(2026, 2, 10)),
        type: 'compra',
        total: 900,
        price: 0,
        quantity: 0,
        notes: null,
      },
    ]);

    const res = await deriveAcompanhamentoEntries('u1', plano);
    const mar = res[1];
    expect(mar.aporteReal).toBe(500); // só o ativo vinculado; asset-outro fora
  });

  it('sem vínculo de aposentadoria, exclui ativos de sonho da carteira toda', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { assetId: 'asset-sonho', vinculoAposentadoria: false, planejamentoObjetivoId: 'obj-1' },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        assetId: 'asset-sonho',
        date: new Date(Date.UTC(2026, 2, 5)),
        type: 'compra',
        total: 500,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        assetId: 'asset-livre',
        date: new Date(Date.UTC(2026, 2, 10)),
        type: 'compra',
        total: 900,
        price: 0,
        quantity: 0,
        notes: null,
      },
    ]);

    const res = await deriveAcompanhamentoEntries('u1', plano);
    const mar = res[1];
    expect(mar.aporteReal).toBe(900); // carteira toda menos o ativo do sonho
  });

  it('sem snapshots nem transações → meses sem dado', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const res = await deriveAcompanhamentoEntries('u1', plano);
    expect(res).toHaveLength(5);
    expect(res.every((d) => !d.hasData && d.aporteReal === 0)).toBe(true);
  });

  it('retorna vazio quando o acompanhamento começa no futuro', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const res = await deriveAcompanhamentoEntries('u1', {
      ...plano,
      trackStartYear: 2027,
    });
    expect(res).toHaveLength(0);
  });

  it('compras da importação do Open Finance não contam como aporte (carteira antiga)', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 2, 31)), totalValue: 50000 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: new Date(Date.UTC(2026, 2, 10)),
        type: 'compra',
        total: 40000,
        price: 0,
        quantity: 0,
        notes: NOTA_IMPORTACAO,
      },
      {
        date: new Date(Date.UTC(2026, 2, 10)),
        type: 'compra',
        total: 8000,
        price: 0,
        quantity: 0,
        notes: `${NOTA_IMPORTACAO} · contrato 123`,
      },
      {
        date: new Date(Date.UTC(2026, 2, 20)),
        type: 'compra',
        total: 1000,
        price: 0,
        quantity: 0,
        notes: null,
      },
    ]);

    const res = await deriveAcompanhamentoEntries('u1', plano);
    expect(res[1]).toMatchObject({ month: 3, aporteReal: 1000, patFinal: 50000 });
  });
});

const d = (off: number, aporteReal: number, patFinal: number | null) => ({
  off,
  year: 2026,
  month: off + 1,
  aporteReal,
  patFinal,
  hasData: patFinal != null,
});
const e = (off: number, aporteReal: number, patFinal: number, origem: string) => ({
  id: `e${off}`,
  off,
  year: 2026,
  month: off + 1,
  aporteReal,
  patFinal,
  origem,
});

describe('planejarSync', () => {
  it('cria meses vazios, atualiza auto desatualizado, nunca toca manual, remove auto sem base', () => {
    const r = planejarSync(
      [d(1, 100, 1000), d(2, 200, 2000), d(3, 300, 3000), d(4, 0, null), d(5, 50, 5000)],
      [
        e(1, 1, 1, 'manual'), // digitado: fica
        e(2, 200, 2000, 'auto'), // auto em dia: nada
        e(3, 0, 2500, 'auto'), // auto desatualizado: atualiza
        e(4, 10, 4000, 'auto'), // sem snapshot agora: remove
        e(9, 10, 9000, 'auto'), // fora do intervalo: remove
        e(10, 10, 9000, 'manual'), // manual fora do intervalo: fica
      ],
    );
    expect(r.criar.map((x) => x.off)).toEqual([5]);
    expect(r.atualizar.map((x) => x.id)).toEqual(['e3']);
    expect(r.remover.sort()).toEqual(['e4', 'e9']);
  });

  it('Decimal vindo do banco compara por valor', () => {
    const r = planejarSync(
      [d(1, 100.1, 1000.25)],
      [{ ...e(1, 0, 0, 'auto'), aporteReal: '100.10', patFinal: '1000.25' }],
    );
    expect(r.atualizar).toHaveLength(0);
  });
});

describe('sincronizarAcompanhamentoAuto', () => {
  it('grava como auto e protege linhas manuais no filtro do update/delete', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 1, 28)), totalValue: 1100 },
      { date: new Date(Date.UTC(2026, 2, 31)), totalValue: 1200 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.aposentadoriaPlanoEntry.findMany.mockResolvedValue([
      { id: 'a1', off: 1, year: 2026, month: 2, aporteReal: 0, patFinal: 1000, origem: 'auto' },
    ]);

    const r = await sincronizarAcompanhamentoAuto('u1', { id: 'p1', ...plano });

    expect(r).toEqual({ criados: 1, atualizados: 1, removidos: 0 });
    const criar = mockPrisma.aposentadoriaPlanoEntry.createMany.mock.calls[0][0];
    expect(criar.skipDuplicates).toBe(true);
    expect(criar.data).toEqual([
      expect.objectContaining({ planoId: 'p1', off: 2, patFinal: 1200, origem: 'auto' }),
    ]);
    expect(mockPrisma.aposentadoriaPlanoEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', origem: 'auto' },
      data: expect.objectContaining({ patFinal: 1100 }),
    });
    expect(mockPrisma.aposentadoriaPlanoEntry.deleteMany).not.toHaveBeenCalled();
  });
});
