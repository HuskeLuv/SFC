import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cashflowValue: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  cashflowGroup: { findFirst: vi.fn() },
}));
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());
const mockEnsureDividasTemplate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRecomputeEvolucao = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => ({ personalizeGroup: mockPersonalizeGroup }));
vi.mock('@/utils/cashflowTemplates', () => ({ ensureDividasTemplate: mockEnsureDividasTemplate }));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mockRecomputeEvolucao,
}));

import { syncDividaToCashflow, removeDividaCashflow } from '../dividaCashflowSync';
import { REALIZADO_COLOR } from '@/services/planejamento/cashflowToSonhoSync';
import type { DividaForSync } from '../dividaCashflowSync';

const financiamento = (over: Partial<DividaForSync> = {}): DividaForSync => ({
  id: 'div-1',
  nome: 'Apê',
  modalidade: 'financiamento',
  status: 'ativa',
  principal: 12_000,
  taxaAm: 0,
  prazoMeses: 12,
  sistema: 'PRICE',
  primeiroVencimento: '2026-01',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cashflowValue.findMany.mockResolvedValue([]);
  mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.cashflowValue.createMany.mockResolvedValue({ count: 12 });
});

describe('syncDividaToCashflow', () => {
  it('cria a linha (garantindo template + personalizando o grupo) e grava a parcela de cada mês', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);
    mockPrisma.cashflowGroup.findFirst
      .mockResolvedValueOnce(null) // grupo do usuário ainda não existe
      .mockResolvedValueOnce({ id: 'tpl-grp' }); // template
    mockPersonalizeGroup.mockResolvedValue('user-grp');
    mockPrisma.cashflowItem.create.mockResolvedValue({ id: 'item-1', name: 'Apê' });

    // 12.000 / 12m / taxa 0 → parcela 1.000 constante; janela Jan–Dez/2026
    await syncDividaToCashflow('u1', financiamento());

    expect(mockEnsureDividasTemplate).toHaveBeenCalled();
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-grp', 'u1');
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', groupId: 'user-grp', dividaId: 'div-1' }),
      }),
    );
    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(12);
    expect(createArg.data[0]).toMatchObject({
      itemId: 'item-1',
      year: 2026,
      month: 0,
      value: 1000,
    });
    expect(mockRecomputeEvolucao).toHaveBeenCalledWith('u1', new Date(0));
  });

  it('SAC grava parcela DECRESCENTE mês a mês (não constante)', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Apê' });

    await syncDividaToCashflow('u1', financiamento({ taxaAm: 0.01, sistema: 'SAC' }));

    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(12);
    expect(createArg.data[0].value).toBeCloseTo(1120, 2); // 1000 amort + 120 juros
    expect(createArg.data[1].value).toBeLessThan(createArg.data[0].value);
    expect(createArg.data[11].value).toBeCloseTo(1010, 2); // última: 1000 + 1% de 1000
  });

  it('preserva células realizadas e não as reescreve', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Apê' });
    mockPrisma.cashflowValue.findMany.mockResolvedValue([{ year: 2026, month: 0 }]);

    await syncDividaToCashflow('u1', financiamento());

    // deleteMany só apaga não-realizados
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ color: null }, { color: { not: REALIZADO_COLOR } }],
        }),
      }),
    );
    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(11); // Jan/2026 (realizado) fica de fora
    expect(
      createArg.data.some((v: { year: number; month: number }) => v.year === 2026 && v.month === 0),
    ).toBe(false);
  });

  it('dívida quitada limpa o planejado e não reescreve', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Apê' });

    await syncDividaToCashflow('u1', financiamento({ status: 'quitada' }));

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.createMany).not.toHaveBeenCalled();
    expect(mockRecomputeEvolucao).toHaveBeenCalled();
  });

  it('dívida PAUSADA/em espera limpa o planejado e não projeta (como sonho pausado)', async () => {
    for (const status of ['pausada', 'em_espera'] as const) {
      vi.clearAllMocks();
      mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Apê' });
      mockPrisma.cashflowValue.findMany.mockResolvedValue([]);

      await syncDividaToCashflow('u1', financiamento({ status }));

      expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.cashflowValue.createMany).not.toHaveBeenCalled();
    }
  });

  it('rotativa sem linha existente é no-op (não cria linha nem recomputa)', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);

    await syncDividaToCashflow('u1', {
      id: 'div-2',
      nome: 'Cartão',
      modalidade: 'rotativa',
      status: 'ativa',
      principal: null,
      taxaAm: null,
      prazoMeses: null,
      sistema: null,
      primeiroVencimento: null,
    });

    expect(mockPrisma.cashflowItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.deleteMany).not.toHaveBeenCalled();
    expect(mockRecomputeEvolucao).not.toHaveBeenCalled();
  });

  it('renomeia a linha quando o nome da dívida muda', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Nome antigo' });
    mockPrisma.cashflowItem.update.mockResolvedValue({ id: 'item-1', name: 'Apê' });

    await syncDividaToCashflow('u1', financiamento());

    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'item-1' }, data: { name: 'Apê' } }),
    );
  });

  it('janela atravessa anos (24 meses a partir de Jul/2026)', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Apê' });

    await syncDividaToCashflow(
      'u1',
      financiamento({ prazoMeses: 24, primeiroVencimento: '2026-07' }),
    );

    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(24);
    expect(createArg.data[0]).toMatchObject({ year: 2026, month: 6 });
    expect(createArg.data[23]).toMatchObject({ year: 2028, month: 5 });
  });
});

describe('removeDividaCashflow', () => {
  it('remove valores + item e recomputa snapshots', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', userId: 'u1' });

    await removeDividaCashflow('div-1');

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1' },
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    expect(mockRecomputeEvolucao).toHaveBeenCalledWith('u1', new Date(0));
  });

  it('sem linha vinculada é no-op', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);
    await removeDividaCashflow('div-x');
    expect(mockPrisma.cashflowItem.delete).not.toHaveBeenCalled();
    expect(mockRecomputeEvolucao).not.toHaveBeenCalled();
  });
});
