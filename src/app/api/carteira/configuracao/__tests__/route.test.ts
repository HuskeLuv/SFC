import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  alocacaoConfig: { findMany: vi.fn(), upsert: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/configuracao', {
    method: 'GET',
  });

const createPutRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/configuracao', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/carteira/configuracao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna configurações padrão zeradas quando não há configurações salvas', async () => {
    mockPrisma.alocacaoConfig.findMany.mockResolvedValue([]);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.configuracoes).toBeDefined();
    expect(data.configuracoes.length).toBe(13);
    expect(data.configuracoes[0]).toEqual(
      expect.objectContaining({ categoria: 'reservaEmergencia', minimo: 0, maximo: 0, target: 0 }),
    );
  });

  it('retorna configurações salvas do usuário', async () => {
    const savedConfigs = [
      { categoria: 'acoes', minimo: 10, maximo: 30, target: 20, descricao: 'Ações BR' },
      { categoria: 'fiis', minimo: 5, maximo: 20, target: 15, descricao: '' },
    ];
    mockPrisma.alocacaoConfig.findMany.mockResolvedValue(savedConfigs);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.configuracoes).toBeDefined();
    // Saved categories are merged with defaults
    const acoes = data.configuracoes.find((c: { categoria: string }) => c.categoria === 'acoes');
    expect(acoes.target).toBe(20);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});

describe('PUT /api/carteira/configuracao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.alocacaoConfig.upsert.mockResolvedValue({});
  });

  it('atualiza configurações com sucesso', async () => {
    const body = {
      configuracoes: [
        { categoria: 'acoes', minimo: 10, maximo: 30, target: 20 },
        { categoria: 'fiis', minimo: 5, maximo: 20, target: 15 },
      ],
    };
    const response = await PUT(createPutRequest(body));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.alocacaoConfig.upsert).toHaveBeenCalledTimes(2);
  });

  it('retorna 400 quando dados são inválidos (zod)', async () => {
    const response = await PUT(createPutRequest({ configuracoes: 'invalid' }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando campo obrigatório está ausente', async () => {
    const response = await PUT(createPutRequest({}));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando mínimo é maior que máximo', async () => {
    const body = {
      configuracoes: [{ categoria: 'acoes', minimo: 50, maximo: 10, target: 20 }],
    };
    const response = await PUT(createPutRequest(body));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('mínimo não pode ser maior que o máximo');
  });

  it('retorna 400 quando soma dos targets excede 100%', async () => {
    const body = {
      configuracoes: [
        { categoria: 'acoes', minimo: 0, maximo: 100, target: 60 },
        { categoria: 'fiis', minimo: 0, maximo: 100, target: 50 },
      ],
    };
    const response = await PUT(createPutRequest(body));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('soma dos targets não pode exceder 100%');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await PUT(
      createPutRequest({
        configuracoes: [{ categoria: 'acoes', minimo: 0, maximo: 30, target: 20 }],
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
