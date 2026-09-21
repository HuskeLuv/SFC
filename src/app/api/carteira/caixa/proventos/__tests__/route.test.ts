import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, POST } from '../route';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const req = (method: string, body?: object) =>
  new NextRequest('http://localhost/api/carteira/caixa/proventos', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/caixa/proventos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue(auth);
  });

  it('GET devolve se está ligado e desde quando', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      caixaProventosDesde: new Date('2026-09-21T00:00:00Z'),
    });
    expect(await (await GET(req('GET'))).json()).toEqual({ ativo: true, desde: '2026-09-21' });
    mockPrisma.user.findUnique.mockResolvedValue({ caixaProventosDesde: null });
    expect(await (await GET(req('GET'))).json()).toEqual({ ativo: false, desde: null });
  });

  it('POST liga a partir de hoje e desliga', async () => {
    const ligado = await (await POST(req('POST', { ativo: true }))).json();
    expect(ligado.ativo).toBe(true);
    expect(ligado.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { caixaProventosDesde: expect.any(Date) },
    });
    expect(await (await POST(req('POST', { ativo: false }))).json()).toEqual({
      ativo: false,
      desde: null,
    });
  });

  it('POST valida o corpo', async () => {
    expect((await POST(req('POST', { ativo: 'sim' }))).status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
