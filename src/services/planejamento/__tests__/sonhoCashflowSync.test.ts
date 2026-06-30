import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cashflowValue: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  cashflowGroup: { findFirst: vi.fn() },
}));
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => ({ personalizeGroup: mockPersonalizeGroup }));

import { syncObjetivoToCashflow, removeObjetivoCashflow } from '../sonhoCashflowSync';
import { REALIZADO_COLOR } from '../cashflowToSonhoSync';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cashflowValue.findMany.mockResolvedValue([]);
  mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.cashflowValue.createMany.mockResolvedValue({ count: 12 });
});

describe('syncObjetivoToCashflow', () => {
  it('cria a linha (personalizando o grupo) e grava 12 meses com o aporte', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);
    mockPrisma.cashflowGroup.findFirst
      .mockResolvedValueOnce(null) // grupo do usuário ainda não existe
      .mockResolvedValueOnce({ id: 'tpl-grp' }); // template
    mockPersonalizeGroup.mockResolvedValue('user-grp');
    mockPrisma.cashflowItem.create.mockResolvedValue({ id: 'item-1', name: 'Viagem' });

    // target 24000, available 0, months 12, rate 0 → pmt = 2000/mês
    await syncObjetivoToCashflow(
      'u1',
      {
        id: 'obj-1',
        name: 'Viagem',
        target: 24000,
        available: 0,
        months: 12,
        rate: 0,
      },
      2026,
    );

    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-grp', 'u1');
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', groupId: 'user-grp', objetivoId: 'obj-1' }),
      }),
    );
    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(12);
    expect(createArg.data[0]).toMatchObject({
      itemId: 'item-1',
      year: 2026,
      month: 0,
      value: 2000,
    });
  });

  it('aporte 0 (meta não definida) → cria a linha mas não grava valores', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);
    mockPrisma.cashflowGroup.findFirst.mockResolvedValueOnce({ id: 'user-grp' }); // já personalizado
    mockPrisma.cashflowItem.create.mockResolvedValue({ id: 'item-1', name: 'Reserva' });

    await syncObjetivoToCashflow('u1', {
      id: 'obj-1',
      name: 'Reserva',
      target: 0,
      available: 0,
      months: 12,
      rate: 0,
    });

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.createMany).not.toHaveBeenCalled();
    expect(mockPersonalizeGroup).not.toHaveBeenCalled();
  });

  it('linha existente com nome diferente → atualiza o nome', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Antigo' });
    mockPrisma.cashflowItem.update.mockResolvedValue({ id: 'item-1', name: 'Novo' });

    await syncObjetivoToCashflow('u1', {
      id: 'obj-1',
      name: 'Novo',
      target: 0,
      available: 0,
      months: 12,
      rate: 0,
    });

    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { name: 'Novo' },
    });
    expect(mockPrisma.cashflowItem.create).not.toHaveBeenCalled();
  });

  it('preserva os meses REALIZADOS (vermelhos) ao reescrever o aporte planejado', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Viagem' });
    // Meses 0 e 1 já realizados (vermelho "Pago"); o resto é planejado.
    mockPrisma.cashflowValue.findMany.mockResolvedValue([
      { month: 0, color: REALIZADO_COLOR },
      { month: 1, color: REALIZADO_COLOR },
      { month: 2, color: null },
    ]);

    // target 24000, available 0, months 12, rate 0 → pmt = 2000/mês
    await syncObjetivoToCashflow(
      'u1',
      { id: 'obj-1', name: 'Viagem', target: 24000, available: 0, months: 12, rate: 0 },
      2026,
    );

    // deleteMany só apaga os meses NÃO realizados.
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1', userId: 'u1', year: 2026, month: { notIn: [0, 1] } },
    });
    // createMany reescreve só os 10 meses planejados (sem 0 e 1).
    const createArg = mockPrisma.cashflowValue.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(10);
    expect(createArg.data.map((d: { month: number }) => d.month)).not.toContain(0);
    expect(createArg.data.map((d: { month: number }) => d.month)).not.toContain(1);
  });
});

describe('removeObjetivoCashflow', () => {
  it('remove valores e a linha vinculada', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({ id: 'item-1' });
    mockPrisma.cashflowItem.delete.mockResolvedValue({ id: 'item-1' });

    await removeObjetivoCashflow('obj-1');

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1' },
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('no-op quando não há linha vinculada', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(null);
    await removeObjetivoCashflow('obj-x');
    expect(mockPrisma.cashflowItem.delete).not.toHaveBeenCalled();
  });
});
