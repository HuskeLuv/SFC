import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '../../auth/logout/route';

const createRequest = () => new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });

describe('POST /api/auth/logout', () => {
  it('retorna 200 com mensagem de sucesso', async () => {
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Sessão encerrada com sucesso');
  });

  it('limpa o cookie do token', async () => {
    const response = await POST(createRequest());

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('token=');
    expect(setCookie).toContain('Max-Age=0');
  });
});
