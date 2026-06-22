import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  dashboardData: { findFirst: vi.fn(), create: vi.fn() },
  planejamentoObjetivo: { count: vi.fn(), create: vi.fn() },
}));
const mockSync = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('../sonhoCashflowSync', () => ({ syncObjetivoToCashflow: mockSync }));

import { provisionDefaultSonhos, DEFAULT_SONHOS } from '../sonhosDefaults';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dashboardData.create.mockResolvedValue({});
  mockSync.mockResolvedValue(undefined);
  let n = 0;
  mockPrisma.planejamentoObjetivo.create.mockImplementation((args: { data: { name: string } }) =>
    Promise.resolve({ id: `obj-${++n}`, name: args.data.name, months: 12 }),
  );
});

describe('provisionDefaultSonhos', () => {
  it('no-op quando a flag já existe', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue({ id: 'flag' });
    await provisionDefaultSonhos('u1');
    expect(mockPrisma.planejamentoObjetivo.create).not.toHaveBeenCalled();
    expect(mockPrisma.dashboardData.create).not.toHaveBeenCalled();
  });

  it('usuário com objetivos próprios → só marca a flag (respeita deleções)', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.planejamentoObjetivo.count.mockResolvedValue(3);
    await provisionDefaultSonhos('u1');
    expect(mockPrisma.planejamentoObjetivo.create).not.toHaveBeenCalled();
    expect(mockPrisma.dashboardData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metric: 'sonhos_default_provisioned' }),
      }),
    );
  });

  it('conta vazia → cria os 6 sonhos, sincroniza cada um e marca a flag', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.planejamentoObjetivo.count.mockResolvedValue(0);

    await provisionDefaultSonhos('u1');

    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledTimes(DEFAULT_SONHOS.length);
    expect(mockPrisma.planejamentoObjetivo.create.mock.calls[0][0].data).toMatchObject({
      name: 'Reserva de Emergência',
      target: 0,
      status: 'Em espera',
    });
    expect(mockSync).toHaveBeenCalledTimes(DEFAULT_SONHOS.length);
    expect(mockPrisma.dashboardData.create).toHaveBeenCalledTimes(1);
  });

  it('são 6 sonhos padrão', () => {
    expect(DEFAULT_SONHOS).toHaveLength(6);
  });
});
