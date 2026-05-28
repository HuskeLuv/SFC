import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
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

import { GET, POST } from '../route';

const buildRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'obj-1',
  userId: 'user-1',
  name: 'Reserva Casa',
  target: 200_000,
  months: 60,
  startDate: '2026-01',
  available: 5_000,
  rate: 0.01,
  priority: 'Alta',
  category: 'm',
  status: 'Em espera',
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  entries: [],
  ...overrides,
});

const createGetRequest = () =>
  new NextRequest('http://localhost/api/planejamento-sonhos', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/planejamento-sonhos', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
});

describe('GET /api/planejamento-sonhos', () => {
  it('retorna lista de objetivos do user (filtrada por userId)', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([
      buildRow({ id: 'obj-1' }),
      buildRow({ id: 'obj-2', name: 'Outro' }),
    ]);

    const res = await GET(createGetRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.objetivos).toHaveLength(2);
    expect(data.objetivos[0].id).toBe('obj-1');
    expect(mockPrisma.planejamentoObjetivo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        include: { entries: true },
      }),
    );
  });

  it('serializa Decimal → number na resposta', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([
      buildRow({
        target: { toNumber: () => 200_000 },
        available: { toNumber: () => 5_000 },
        rate: { toNumber: () => 0.01 },
        entries: [
          {
            month: '2026-02',
            aporte: { toNumber: () => 1_000 },
            balance: { toNumber: () => 6_000 },
          },
        ],
      }),
    ]);

    const res = await GET(createGetRequest());
    const data = await res.json();
    expect(data.objetivos[0].target).toBe(200_000);
    expect(data.objetivos[0].available).toBe(5_000);
    expect(data.objetivos[0].rate).toBe(0.01);
    expect(data.objetivos[0].entries[0].balance).toBe(6_000);
  });

  it('retorna 401 quando não autorizado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const res = await GET(createGetRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/planejamento-sonhos', () => {
  beforeEach(() => {
    mockPrisma.planejamentoObjetivo.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        buildRow({ ...data, id: 'obj-novo', entries: [] }),
    );
  });

  it('cria objetivo retornando 201', async () => {
    const res = await POST(
      createPostRequest({
        name: 'Casa',
        target: 200_000,
        months: 60,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.objetivo.id).toBe('obj-novo');
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'Casa',
          target: 200_000,
          months: 60,
          priority: 'Alta',
          status: 'Em espera',
        }),
      }),
    );
  });

  it('valida required: name', async () => {
    const res = await POST(
      createPostRequest({
        target: 100_000,
        months: 24,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('name');
  });

  it('valida required: target', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        months: 24,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('target');
  });

  it('valida required: months', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        target: 100,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('months');
  });

  it('valida required: priority', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        target: 100,
        months: 24,
        status: 'Em espera',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('priority');
  });

  it('valida required: status', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        target: 100,
        months: 24,
        priority: 'Alta',
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('status');
  });

  it('auto-aplica category="c" quando months <= 12', async () => {
    await POST(
      createPostRequest({
        name: 'Curto',
        target: 10_000,
        months: 6,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'c' }),
      }),
    );
  });

  it('auto-aplica category="m" quando 12 < months <= 60', async () => {
    await POST(
      createPostRequest({
        name: 'Médio',
        target: 50_000,
        months: 36,
        priority: 'Moderado',
        status: 'Em espera',
      }),
    );
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'm' }),
      }),
    );
  });

  it('auto-aplica category="l" quando months > 60', async () => {
    await POST(
      createPostRequest({
        name: 'Longo',
        target: 1_000_000,
        months: 120,
        priority: 'Baixa',
        status: 'Em espera',
      }),
    );
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'l' }),
      }),
    );
  });

  it('respeita category passada explicitamente no body', async () => {
    // months=120 normalmente seria "l", mas user forçou "m" — respeita.
    await POST(
      createPostRequest({
        name: 'Custom',
        target: 1_000_000,
        months: 120,
        priority: 'Alta',
        status: 'Em espera',
        category: 'm',
      }),
    );
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'm' }),
      }),
    );
  });

  it('valida months > 480 (40 anos)', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        target: 100,
        months: 600,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('valida rate fora do range [-1, 1]', async () => {
    const res = await POST(
      createPostRequest({
        name: 'X',
        target: 100,
        months: 12,
        priority: 'Alta',
        status: 'Em espera',
        rate: 2, // 200% ao mês — fora do range válido
      }),
    );
    expect(res.status).toBe(400);
  });

  it('aplica defaults: available=0, rate=0', async () => {
    await POST(
      createPostRequest({
        name: 'Minimal',
        target: 1_000,
        months: 12,
        priority: 'Alta',
        status: 'Em espera',
      }),
    );
    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ available: 0, rate: 0 }),
      }),
    );
  });
});
