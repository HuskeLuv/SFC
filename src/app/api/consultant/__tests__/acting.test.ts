import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  impersonationSession: { create: vi.fn(), updateMany: vi.fn() },
}));

const mockAuthenticateConsultant = vi.hoisted(() => vi.fn());
const mockAssertClientOwnership = vi.hoisted(() => vi.fn());
const mockLogConsultantAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockReadConsultantActingCookie = vi.hoisted(() => vi.fn());
const mockResolveSessionToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/utils/consultantAuth', () => ({
  authenticateConsultant: mockAuthenticateConsultant,
  assertClientOwnership: mockAssertClientOwnership,
}));
vi.mock('@/services/impersonationLogger', () => ({
  logConsultantAction: mockLogConsultantAction,
}));
vi.mock('@/utils/consultantActing', () => ({
  CONSULTANT_ACTING_COOKIE: 'consultant-acting',
  readConsultantActingCookie: mockReadConsultantActingCookie,
  resolveSessionToken: mockResolveSessionToken,
}));

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-session-uuid',
}));

import { POST, DELETE } from '../../consultant/acting/route';

const createPostRequest = (body?: object, searchParams?: Record<string, string>) => {
  const url = new URL('http://localhost/api/consultant/acting');
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, {
    method: 'POST',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
};

const createDeleteRequest = (cookies?: Record<string, string>) => {
  const req = new NextRequest('http://localhost/api/consultant/acting', { method: 'DELETE' });
  if (cookies) {
    Object.entries(cookies).forEach(([k, v]) => req.cookies.set(k, v));
  }
  return req;
};

describe('POST /api/consultant/acting', () => {
  const clientProfile = { id: 'client-1', name: 'Client One', email: 'client@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateConsultant.mockResolvedValue({
      consultantId: 'consultant-1',
      userId: 'user-1',
    });
    mockAssertClientOwnership.mockResolvedValue({ id: 'cc-1' });
    mockPrisma.user.findUnique.mockResolvedValue(clientProfile);
    mockPrisma.impersonationSession.create.mockResolvedValue({ id: 'session-1' });
    mockLogConsultantAction.mockResolvedValue(undefined);
  });

  it('inicia impersonacao e define cookie de sessao', async () => {
    const response = await POST(createPostRequest({ clientId: 'client-1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.actingClient).toEqual({
      id: 'client-1',
      name: 'Client One',
      email: 'client@test.com',
    });

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('consultant-acting=mock-session-uuid');

    expect(mockPrisma.impersonationSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionToken: 'mock-session-uuid',
          consultantId: 'user-1',
          clientId: 'client-1',
        }),
      }),
    );
  });

  it('aceita clientId via query string', async () => {
    const response = await POST(createPostRequest(undefined, { clientId: 'client-1' }));

    expect(response.status).toBe(200);
  });

  it('retorna 400 quando clientId nao e informado', async () => {
    const response = await POST(createPostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Cliente não informado');
  });

  it('retorna erro quando consultor nao autenticado', async () => {
    mockAuthenticateConsultant.mockRejectedValue({
      status: 403,
      message: 'Acesso restrito a consultores',
    });

    const response = await POST(createPostRequest({ clientId: 'client-1' }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('retorna erro quando cliente nao vinculado', async () => {
    mockAssertClientOwnership.mockRejectedValue({
      status: 404,
      message: 'Cliente não vinculado ao consultor',
    });

    const response = await POST(createPostRequest({ clientId: 'client-1' }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});

describe('DELETE /api/consultant/acting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateConsultant.mockResolvedValue({
      consultantId: 'consultant-1',
      userId: 'user-1',
    });
    mockReadConsultantActingCookie.mockReturnValue('session-token-123');
    mockResolveSessionToken.mockResolvedValue({
      clientId: 'client-1',
      consultantId: 'user-1',
    });
    mockPrisma.impersonationSession.updateMany.mockResolvedValue({ count: 1 });
    mockLogConsultantAction.mockResolvedValue(undefined);
  });

  it('encerra impersonacao e limpa cookie', async () => {
    const response = await DELETE(
      createDeleteRequest({ 'consultant-acting': 'session-token-123' }),
    );

    expect(response.status).toBe(204);

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('consultant-acting=');
    expect(setCookie).toContain('Max-Age=0');

    expect(mockPrisma.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: { sessionToken: 'session-token-123', endedAt: null },
      data: { endedAt: expect.any(Date) },
    });

    expect(mockLogConsultantAction).toHaveBeenCalledWith(
      expect.objectContaining({
        consultantId: 'user-1',
        clientId: 'client-1',
        action: 'END_IMPERSONATION',
      }),
    );
  });

  it('encerra mesmo sem cookie de sessao', async () => {
    mockReadConsultantActingCookie.mockReturnValue(null);

    const response = await DELETE(createDeleteRequest());

    expect(response.status).toBe(204);
    expect(mockPrisma.impersonationSession.updateMany).not.toHaveBeenCalled();
  });

  it('encerra mesmo com sessao expirada/invalida', async () => {
    mockResolveSessionToken.mockResolvedValue(null);

    const response = await DELETE(createDeleteRequest({ 'consultant-acting': 'expired-token' }));

    expect(response.status).toBe(204);
    expect(mockPrisma.impersonationSession.updateMany).not.toHaveBeenCalled();
  });
});
