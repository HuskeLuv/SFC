import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import { POST } from '../route';

const SECRET = 'segredo-do-webhook';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/pluggy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/webhooks/pluggy', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    process.env.PLUGGY_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('responde 404 quando a integração está desligada', async () => {
    delete process.env.PLUGGY_HABILITADO;
    const res = await POST(post({ event: 'item/updated' }, { 'x-webhook-secret': SECRET }));
    expect(res.status).toBe(404);
  });

  it('responde 503 sem PLUGGY_WEBHOOK_SECRET', async () => {
    delete process.env.PLUGGY_WEBHOOK_SECRET;
    const res = await POST(post({ event: 'item/updated' }));
    expect(res.status).toBe(503);
  });

  it('responde 401 com segredo errado ou ausente (Pluggy não retenta 401)', async () => {
    expect((await POST(post({ event: 'item/updated' }))).status).toBe(401);
    expect(
      (await POST(post({ event: 'item/updated' }, { 'x-webhook-secret': 'outro' }))).status,
    ).toBe(401);
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('responde 400 para JSON inválido ou sem event', async () => {
    expect((await POST(post('{nope', { 'x-webhook-secret': SECRET }))).status).toBe(400);
    expect((await POST(post({ itemId: 'x' }, { 'x-webhook-secret': SECRET }))).status).toBe(400);
  });

  it('confirma e registra o evento com segredo correto', async () => {
    const res = await POST(
      post(
        { event: 'item/updated', itemId: 'item-1', triggeredBy: 'CLIENT', extra: 1 },
        { 'x-webhook-secret': SECRET },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[pluggy webhook] evento recebido',
      expect.objectContaining({ event: 'item/updated', itemId: 'item-1' }),
    );
  });

  it('em produção exige o IP fixo do Pluggy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const negado = await POST(
      post({ event: 'item/updated' }, { 'x-webhook-secret': SECRET, 'x-forwarded-for': '1.2.3.4' }),
    );
    expect(negado.status).toBe(401);
    const ok = await POST(
      post(
        { event: 'item/updated' },
        { 'x-webhook-secret': SECRET, 'x-forwarded-for': '52.67.145.81' },
      ),
    );
    expect(ok.status).toBe(200);
    vi.unstubAllEnvs();
  });
});
