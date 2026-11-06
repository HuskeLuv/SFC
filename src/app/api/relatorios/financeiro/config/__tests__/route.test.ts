import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));

import { GET as GET_CONFIG } from '../route';

describe('GET /api/relatorios/financeiro/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ id: 'user-1', role: 'user' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('exige sessão', async () => {
    mockRequireSession.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET_CONFIG(
      new NextRequest('http://localhost/api/relatorios/financeiro/config'),
    );
    expect(res.status).toBe(401);
  });

  it('habilitado segue a chave', async () => {
    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', 'true');
    let res = await GET_CONFIG(
      new NextRequest('http://localhost/api/relatorios/financeiro/config'),
    );
    expect(await res.json()).toEqual({ habilitado: true });

    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', '');
    res = await GET_CONFIG(new NextRequest('http://localhost/api/relatorios/financeiro/config'));
    expect(await res.json()).toEqual({ habilitado: false });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
