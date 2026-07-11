import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflow: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userChangeLog: { create: vi.fn() },
}));

const mockJwtVerify = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'user-123', email: 'test@test.com' }),
);

vi.mock('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
  verify: mockJwtVerify,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

const createParams = (id: string) => Promise.resolve({ id });

const createGetRequest = () => {
  const url = new URL('http://localhost/api/cashflow/cf-1');
  const req = new NextRequest(url, { method: 'GET' });
  req.cookies.set('token', 'valid-token');
  return req;
};

const createPatchRequest = (body: Record<string, unknown>) => {
  const url = new URL('http://localhost/api/cashflow/cf-1');
  const req = new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  req.cookies.set('token', 'valid-token');
  return req;
};

const createDeleteRequest = () => {
  const url = new URL('http://localhost/api/cashflow/cf-1');
  const req = new NextRequest(url, { method: 'DELETE' });
  req.cookies.set('token', 'valid-token');
  return req;
};

describe('GET /api/cashflow/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('retorna item por id', async () => {
    const mockItem = {
      id: 'cf-1',
      userId: 'user-123',
      tipo: 'despesa',
      categoria: 'Alimentacao',
      descricao: 'Mercado',
      valor: 350,
      pago: true,
    };
    mockPrisma.cashflow.findFirst.mockResolvedValue(mockItem);

    const response = await GET(createGetRequest(), { params: createParams('cf-1') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('cf-1');
    expect(data.descricao).toBe('Mercado');
  });

  it('retorna 404 quando item nao encontrado', async () => {
    mockPrisma.cashflow.findFirst.mockResolvedValue(null);

    const response = await GET(createGetRequest(), { params: createParams('cf-999') });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Não encontrado');
  });

  it('retorna 401 quando token nao fornecido', async () => {
    const url = new URL('http://localhost/api/cashflow/cf-1');
    const req = new NextRequest(url, { method: 'GET' });

    const response = await GET(req, { params: createParams('cf-1') });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});

describe('PATCH /api/cashflow/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('atualiza item com sucesso e grava diff no histórico', async () => {
    const beforeItem = {
      id: 'cf-1',
      userId: 'user-123',
      data: new Date('2026-07-01T00:00:00Z'),
      tipo: 'Despesa',
      categoria: 'Alimentacao',
      descricao: 'Mercado',
      valor: 350,
      forma_pagamento: 'pix',
      pago: true,
    };
    const updatedItem = { ...beforeItem, descricao: 'Mercado atualizado', valor: 400 };
    mockPrisma.cashflow.findFirst.mockResolvedValue(beforeItem);
    mockPrisma.cashflow.update.mockResolvedValue(updatedItem);
    mockPrisma.cashflow.findUnique.mockResolvedValue(updatedItem);

    const response = await PATCH(
      createPatchRequest({ descricao: 'Mercado atualizado', valor: 400 }),
      {
        params: createParams('cf-1'),
      },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.descricao).toBe('Mercado atualizado');
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'lancamento.editar',
        changes: expect.arrayContaining([
          expect.objectContaining({ field: 'valor', before: 350, after: 400 }),
        ]),
      }),
    });
  });

  it('retorna 404 quando item a atualizar nao existe', async () => {
    mockPrisma.cashflow.findFirst.mockResolvedValue(null);

    const response = await PATCH(createPatchRequest({ descricao: 'Test' }), {
      params: createParams('cf-999'),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Não encontrado');
  });
});

describe('DELETE /api/cashflow/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('remove item com sucesso e grava snapshot pra desfazer', async () => {
    const beforeItem = {
      id: 'cf-1',
      userId: 'user-123',
      data: new Date('2026-07-01T00:00:00Z'),
      tipo: 'Despesa',
      categoria: 'Alimentacao',
      descricao: 'Mercado',
      valor: 350,
      forma_pagamento: 'pix',
      pago: true,
    };
    mockPrisma.cashflow.findFirst.mockResolvedValue(beforeItem);
    mockPrisma.cashflow.delete.mockResolvedValue(beforeItem);

    const response = await DELETE(createDeleteRequest(), { params: createParams('cf-1') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'lancamento.excluir',
        entityLabel: 'Mercado',
        snapshot: expect.objectContaining({
          kind: 'lancamento',
          data: expect.objectContaining({ id: 'cf-1', valor: 350 }),
        }),
      }),
    });
  });

  it('retorna 404 quando item a remover nao existe', async () => {
    mockPrisma.cashflow.findFirst.mockResolvedValue(null);

    const response = await DELETE(createDeleteRequest(), { params: createParams('cf-999') });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Não encontrado');
  });
});
