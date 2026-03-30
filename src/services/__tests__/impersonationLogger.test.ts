import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  consultantImpersonationLog: {
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  consultant: {
    findUnique: vi.fn(),
  },
  clientConsultant: {
    findFirst: vi.fn(),
  },
}));

const mockReadConsultantActingCookie = vi.hoisted(() => vi.fn());
const mockResolveSessionToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('@/utils/consultantActing', () => ({
  readConsultantActingCookie: mockReadConsultantActingCookie,
  resolveSessionToken: mockResolveSessionToken,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import {
  logConsultantAction,
  logSensitiveEndpointAccess,
  logDataUpdate,
  isConsultantImpersonating,
} from '../impersonationLogger';

// Helper to create a mock NextApiRequest-like object (plain headers object)
const createMockRequest = (headers: Record<string, string> = {}) => {
  return {
    headers,
  } as unknown as Parameters<typeof logConsultantAction>[0]['request'];
};

describe('logConsultantAction', () => {
  it('creates log entry with correct fields', async () => {
    mockPrisma.consultantImpersonationLog.create.mockResolvedValue({});

    await logConsultantAction({
      consultantId: 'consultant-1',
      clientId: 'client-1',
      action: 'UPDATE_DATA',
      details: { endpoint: '/api/test' },
      request: createMockRequest({ 'user-agent': 'TestBrowser/1.0' }),
      sessionToken: 'session-abc',
    });

    expect(mockPrisma.consultantImpersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consultantId: 'consultant-1',
        clientId: 'client-1',
        action: 'UPDATE_DATA',
        details: { endpoint: '/api/test' },
        userAgent: 'TestBrowser/1.0',
        sessionToken: 'session-abc',
      }),
    });
  });

  it('extracts IP from x-forwarded-for header', async () => {
    mockPrisma.consultantImpersonationLog.create.mockResolvedValue({});

    await logConsultantAction({
      consultantId: 'consultant-1',
      clientId: 'client-1',
      action: 'VIEW',
      details: {},
      request: createMockRequest({ 'x-forwarded-for': '192.168.1.1, 10.0.0.1' }),
    });

    expect(mockPrisma.consultantImpersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: '192.168.1.1',
      }),
    });
  });

  it('never throws — catches errors silently', async () => {
    mockPrisma.consultantImpersonationLog.create.mockRejectedValue(new Error('DB error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logConsultantAction({
        consultantId: 'consultant-1',
        clientId: 'client-1',
        action: 'FAIL',
        details: {},
        request: createMockRequest(),
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('logSensitiveEndpointAccess', () => {
  it('logs when actingClient present and role is consultant', async () => {
    mockPrisma.consultantImpersonationLog.create.mockResolvedValue({});

    await logSensitiveEndpointAccess(
      createMockRequest(),
      { id: 'consultant-1', role: 'consultant' },
      'client-1',
      { id: 'client-1', name: 'Client Name', email: 'client@test.com' },
      '/api/carteira',
      'GET',
    );

    expect(mockPrisma.consultantImpersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consultantId: 'consultant-1',
        clientId: 'client-1',
        action: 'ACCESS_SENSITIVE_ENDPOINT',
      }),
    });
  });

  it('skips when actingClient is null', async () => {
    await logSensitiveEndpointAccess(
      createMockRequest(),
      { id: 'user-1', role: 'user' },
      'user-1',
      null,
      '/api/carteira',
      'GET',
    );

    expect(mockPrisma.consultantImpersonationLog.create).not.toHaveBeenCalled();
  });
});

describe('logDataUpdate', () => {
  it('logs with payload and result details', async () => {
    mockPrisma.consultantImpersonationLog.create.mockResolvedValue({});

    await logDataUpdate(
      createMockRequest(),
      { id: 'consultant-1', role: 'consultant' },
      'client-1',
      { id: 'client-1', name: 'Client', email: 'c@test.com' },
      '/api/carteira/operacao',
      'POST',
      { tipoAtivo: 'stock', ticker: 'PETR4' },
      { success: true },
    );

    expect(mockPrisma.consultantImpersonationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_DATA',
        details: expect.objectContaining({
          endpoint: '/api/carteira/operacao',
          method: 'POST',
          payload: { tipoAtivo: 'stock', ticker: 'PETR4' },
          result: { success: true },
        }),
      }),
    });
  });

  it('skips when not impersonating', async () => {
    await logDataUpdate(
      createMockRequest(),
      { id: 'user-1', role: 'user' },
      'user-1',
      null,
      '/api/carteira/operacao',
      'POST',
      {},
      { success: true },
    );

    expect(mockPrisma.consultantImpersonationLog.create).not.toHaveBeenCalled();
  });
});

describe('isConsultantImpersonating', () => {
  it('returns null when no session cookie', async () => {
    mockReadConsultantActingCookie.mockReturnValue(null);

    const result = await isConsultantImpersonating(createMockRequest(), 'user-1');

    expect(result).toBeNull();
    expect(mockResolveSessionToken).not.toHaveBeenCalled();
  });
});
