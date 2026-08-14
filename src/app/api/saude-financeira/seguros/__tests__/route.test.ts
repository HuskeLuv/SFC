import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  seguroApolice: {
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

import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const BASE = 'http://localhost/api/saude-financeira/seguros';

const seguroRow = (over: Record<string, unknown> = {}) => ({
  id: 'seg-1',
  userId: 'user-1',
  nome: 'Seguro Auto',
  tipo: 'auto',
  cobertura: 'parcial',
  risco: 'alto',
  custoAnual: 4800,
  capitalSegurado: 80000,
  notes: null,
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
  ...over,
});

const jsonReq = (method: string, body: unknown, url = BASE) =>
  new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordChange.mockResolvedValue(undefined);
});

describe('GET /api/saude-financeira/seguros', () => {
  it('lista apólices serializadas (Decimal → number)', async () => {
    mockPrisma.seguroApolice.findMany.mockResolvedValue([seguroRow()]);

    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.seguros).toHaveLength(1);
    expect(data.seguros[0]).toMatchObject({
      nome: 'Seguro Auto',
      custoAnual: 4800,
      capitalSegurado: 80000,
      risco: 'alto',
    });
    expect(mockPrisma.seguroApolice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });
});

describe('POST /api/saude-financeira/seguros', () => {
  it('cria apólice válida e registra no histórico', async () => {
    mockPrisma.seguroApolice.create.mockResolvedValue(seguroRow());

    const res = await POST(
      jsonReq('POST', {
        nome: 'Seguro Auto',
        tipo: 'auto',
        cobertura: 'parcial',
        risco: 'alto',
        custoAnual: 4800,
        capitalSegurado: 80000,
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.seguro.nome).toBe('Seguro Auto');
    expect(mockPrisma.seguroApolice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', tipo: 'auto', risco: 'alto' }),
      }),
    );
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'saude-financeira', action: 'seguro.criar' }),
    );
  });

  it('400 para tipo/risco/cobertura fora do enum', async () => {
    const res = await POST(
      jsonReq('POST', {
        nome: 'X',
        tipo: 'barco',
        cobertura: 'parcial',
        risco: 'alto',
        custoAnual: 100,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.seguroApolice.create).not.toHaveBeenCalled();
  });

  it('400 para custoAnual negativo', async () => {
    const res = await POST(
      jsonReq('POST', {
        nome: 'X',
        tipo: 'vida',
        cobertura: 'total',
        risco: 'baixo',
        custoAnual: -1,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/saude-financeira/seguros/:id', () => {
  it('edita campos parciais da apólice do próprio user', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue(seguroRow());
    mockPrisma.seguroApolice.update.mockResolvedValue(seguroRow({ cobertura: 'total' }));

    const res = await PATCH(
      jsonReq('PATCH', { cobertura: 'total' }, `${BASE}/seg-1`),
      params('seg-1'),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.seguro.cobertura).toBe('total');
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seguro.editar' }),
    );
  });

  it('404 quando a apólice não é do user (blindagem)', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue(null);
    const res = await PATCH(jsonReq('PATCH', { nome: 'Novo' }, `${BASE}/seg-x`), params('seg-x'));
    expect(res.status).toBe(404);
    expect(mockPrisma.seguroApolice.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/saude-financeira/seguros/:id', () => {
  it('remove e registra estado final no histórico', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue(seguroRow());
    mockPrisma.seguroApolice.delete.mockResolvedValue(seguroRow());

    const res = await DELETE(
      new NextRequest(`${BASE}/seg-1`, { method: 'DELETE' }),
      params('seg-1'),
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.seguroApolice.delete).toHaveBeenCalledWith({ where: { id: 'seg-1' } });
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seguro.excluir', entityLabel: 'Seguro Auto' }),
    );
  });

  it('404 quando não pertence ao user', async () => {
    mockPrisma.seguroApolice.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest(`${BASE}/seg-x`, { method: 'DELETE' }),
      params('seg-x'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.seguroApolice.delete).not.toHaveBeenCalled();
  });
});
