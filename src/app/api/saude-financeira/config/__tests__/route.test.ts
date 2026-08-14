import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  dashboardData: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockRecordChange = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});

import { GET, PUT } from '../route';

const BASE = 'http://localhost/api/saude-financeira/config';

const putReq = (body: unknown) =>
  new NextRequest(BASE, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dashboardData.findMany.mockResolvedValue([]);
  mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
  mockRecordChange.mockResolvedValue(undefined);
});

describe('GET /api/saude-financeira/config', () => {
  it('sem overrides devolve os defaults da metodologia', async () => {
    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.config).toEqual({
      multReserva: 3,
      multSeguranca: 12,
      fatorIdeal: 0.1,
      coberturaMinimaMeses: 6,
    });
    expect(data.defaults.multReserva).toBe(3);
  });

  it('override persistido substitui o default; valor fora da faixa é ignorado', async () => {
    mockPrisma.dashboardData.findMany.mockResolvedValue([
      { metric: 'saude_financeira_mult_reserva', value: 6 },
      { metric: 'saude_financeira_cobertura_minima', value: 99 }, // > 24 → ignora
    ]);

    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.config.multReserva).toBe(6);
    expect(data.config.coberturaMinimaMeses).toBe(6); // default
  });
});

describe('PUT /api/saude-financeira/config', () => {
  it('cria override novo e registra no histórico', async () => {
    // saveSaudeConfig: findFirst por metric (null → create); GET final relê.
    mockPrisma.dashboardData.findMany
      .mockResolvedValueOnce([]) // before
      .mockResolvedValueOnce([{ metric: 'saude_financeira_mult_reserva', value: 6 }]); // depois

    const res = await PUT(putReq({ multReserva: 6 }));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.config.multReserva).toBe(6);
    expect(mockPrisma.dashboardData.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', metric: 'saude_financeira_mult_reserva', value: 6 },
    });
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'saude-financeira', action: 'saude-config.editar' }),
    );
  });

  it('voltar ao default remove o override em vez de gravar linha', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue({
      id: 'row-1',
      metric: 'saude_financeira_mult_reserva',
      value: 6,
    });
    mockPrisma.dashboardData.findMany
      .mockResolvedValueOnce([{ metric: 'saude_financeira_mult_reserva', value: 6 }])
      .mockResolvedValueOnce([]);

    const res = await PUT(putReq({ multReserva: 3 })); // 3 = default
    expect(res.status).toBe(200);

    expect(mockPrisma.dashboardData.delete).toHaveBeenCalledWith({ where: { id: 'row-1' } });
    expect(mockPrisma.dashboardData.create).not.toHaveBeenCalled();
  });

  it('400 para valor fora da faixa', async () => {
    const res = await PUT(putReq({ multReserva: 0 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.dashboardData.create).not.toHaveBeenCalled();
  });
});
