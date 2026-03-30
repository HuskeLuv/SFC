import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockRequireAuth = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' }),
);

const mockHasUserCashflowSetup = vi.hoisted(() => vi.fn());
const mockSetupUserCashflow = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowSetup', () => ({
  hasUserCashflowSetup: mockHasUserCashflowSetup,
  setupUserCashflow: mockSetupUserCashflow,
}));

const createRequest = (method: string = 'GET') => {
  const url = new URL('http://localhost/api/cashflow/setup');
  return new NextRequest(url, { method });
};

describe('GET /api/cashflow/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' });
  });

  it('retorna status de setup do usuario', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
    mockHasUserCashflowSetup.mockResolvedValue(true);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasSetup).toBe(true);
    expect(data.userId).toBe('user-123');
  });

  it('retorna hasSetup false quando nao configurado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
    mockHasUserCashflowSetup.mockResolvedValue(false);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasSetup).toBe(false);
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuth.mockImplementation(() => {
      throw new Error('Não autorizado');
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna 404 quando usuario nao encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('não encontrado');
  });
});

describe('POST /api/cashflow/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' });
  });

  it('inicializa setup com sucesso', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
    mockSetupUserCashflow.mockResolvedValue({ groupsCreated: 5 });

    const response = await POST(createRequest('POST'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('sucesso');
    expect(mockSetupUserCashflow).toHaveBeenCalledWith({ userId: 'user-123' });
  });
});
