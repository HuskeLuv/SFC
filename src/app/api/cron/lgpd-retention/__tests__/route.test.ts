import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  consultantInvite: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  consultantImpersonationLog: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  loginEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  userChangeLog: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

import { GET } from '../route';

const DAYS = 24 * 60 * 60 * 1000;

const createRequest = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/lgpd-retention', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/lgpd-retention', () => {
  it('retorna 401 sem o secret', async () => {
    const response = await GET(createRequest('errado'));
    expect(response.status).toBe(401);
  });

  it('purga user_change_logs com cutoff de 365 dias', async () => {
    const response = await GET(createRequest('test-secret'));
    expect(response.status).toBe(200);

    expect(mockPrisma.userChangeLog.deleteMany).toHaveBeenCalledOnce();
    const cutoff = mockPrisma.userChangeLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const expectedMs = Date.now() - 365 * DAYS;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(60_000);

    const body = await response.json();
    expect(body.changeLogsPurged).toBe(4);
    expect(body.cutoffs.changeLogs).toBeDefined();
  });

  it('mantém as purgas pré-existentes (invites, impersonation, login)', async () => {
    await GET(createRequest('test-secret'));
    expect(mockPrisma.consultantInvite.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.consultantImpersonationLog.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledOnce();
  });
});
