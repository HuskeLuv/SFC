import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

import {
  SESSION_VERSION_CACHE_TTL_MS,
  assertSessionVersion,
  bumpSessionVersion,
  getSessionVersion,
  resetSessionVersionCache,
} from '../sessionVersion';

beforeEach(() => {
  vi.clearAllMocks();
  resetSessionVersionCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getSessionVersion', () => {
  it('guarda em cache por 60s', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 2 });

    expect(await getSessionVersion('u1')).toBe(2);
    expect(await getSessionVersion('u1')).toBe(2);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { sessionVersion: true },
    });

    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 3 });
    vi.advanceTimersByTime(SESSION_VERSION_CACHE_TTL_MS - 1);
    expect(await getSessionVersion('u1')).toBe(2);

    vi.advanceTimersByTime(2);
    expect(await getSessionVersion('u1')).toBe(3);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('usuário inexistente → null', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect(await getSessionVersion('ghost')).toBeNull();
  });
});

describe('bumpSessionVersion', () => {
  it('incrementa, devolve o novo valor e atualiza o cache na hora', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 0 });
    await getSessionVersion('u1');

    mockPrisma.user.update.mockResolvedValue({ sessionVersion: 1 });
    expect(await bumpSessionVersion('u1')).toBe(1);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    // Sem novo findUnique: o cache já tem o valor novo
    expect(await getSessionVersion('u1')).toBe(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    await expect(assertSessionVersion({ id: 'u1', sv: 0 })).rejects.toThrow('Sessão expirada');
    await expect(assertSessionVersion({ id: 'u1', sv: 1 })).resolves.toBeUndefined();
  });
});

describe('assertSessionVersion', () => {
  it('passa quando o sv do token é o atual', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 4 });
    await expect(assertSessionVersion({ id: 'u1', sv: 4 })).resolves.toBeUndefined();
  });

  it('token legado sem sv vale como 0', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 0 });
    await expect(assertSessionVersion({ id: 'u1' })).resolves.toBeUndefined();
  });

  it('sv divergente → ApiError 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 1 });
    const err = await assertSessionVersion({ id: 'u1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(401);
    expect((err as ApiError).message).toBe('Sessão expirada');
  });

  it('usuário inexistente → ApiError 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(assertSessionVersion({ id: 'ghost', sv: 0 })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
