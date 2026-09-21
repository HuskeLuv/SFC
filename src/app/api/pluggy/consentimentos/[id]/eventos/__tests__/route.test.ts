import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
const mockEvento = vi.hoisted(() => vi.fn());
vi.mock('@/services/pluggy/consentimento', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/pluggy/consentimento')>()),
  registrarEventoConsentimento: mockEvento,
}));

import { POST } from '../route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/pluggy/consentimentos/c1/eventos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: 'c1' }) };

describe('POST /api/pluggy/consentimentos/[id]/eventos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    mockAuth.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
  });

  it('registra evento conhecido do próprio usuário', async () => {
    const res = await POST(req({ evento: 'SELECTED_INSTITUTION', instituicao: 'Banco X' }), ctx);
    expect(res.status).toBe(200);
    expect(mockEvento).toHaveBeenCalledWith('u1', 'c1', {
      evento: 'SELECTED_INSTITUTION',
      instituicao: 'Banco X',
    });
  });

  it('400 para evento fora da lista; 403 para consultor', async () => {
    expect((await POST(req({ evento: 'QUALQUER' }), ctx)).status).toBe(400);
    mockAuth.mockResolvedValue({
      payload: { id: 'c9' },
      targetUserId: 'u1',
      actingClient: { id: 'u1' },
    });
    expect((await POST(req({ evento: 'WIDGET_ABERTO' }), ctx)).status).toBe(403);
    expect(mockEvento).not.toHaveBeenCalled();
  });
});
