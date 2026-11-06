import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => vi.fn());
const mockMontar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({ logSensitiveEndpointAccess: mockLog }));
vi.mock('@/services/relatorios/financeiro/montarRelatorio', () => ({
  montarRelatorioFinanceiro: mockMontar,
}));

import { GET } from '../route';

const req = (q = '') => new NextRequest(`http://localhost/api/relatorios/financeiro${q}`);

const comoUsuario = () =>
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
const comoConsultor = () =>
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'cons-1', email: 'c@t.com', role: 'consultant' },
    targetUserId: 'cli-9',
    actingClient: { id: 'cli-9', name: 'Bruna Cliente', email: 'b@t.com' },
  });

describe('GET /api/relatorios/financeiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', 'true');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', '');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    comoUsuario();
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'cons-1'
        ? { name: 'Carlos Consultor', email: 'c@t.com' }
        : { name: 'Ana Ribeiro' },
    );
    mockMontar.mockImplementation(async (p: Record<string, unknown>) => ({ versao: 1, ...p }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['0', '2', '24', 'abc', '1.5'])('400 com meses=%s', async (meses) => {
    const res = await GET(req(`?meses=${meses}`));
    expect(res.status).toBe(400);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('404 com a chave desligada (sem montar nada)', async () => {
    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', '');
    const res = await GET(req('?meses=1'));
    expect(res.status).toBe(404);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('usuário: padrão meses=1, plano adv, cliente pelo nome, sem consultor', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockMontar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        meses: 1,
        plano: 'adv',
        cliente: 'Ana Ribeiro',
        consultor: null,
      }),
    );
    expect(mockMontar.mock.calls[0][0].agora).toBeInstanceOf(Date);
  });

  it.each([1, 3, 6, 12])('aceita meses=%i', async (meses) => {
    const res = await GET(req(`?meses=${meses}`));
    expect(res.status).toBe(200);
    expect(mockMontar.mock.calls[0][0].meses).toBe(meses);
  });

  it('consultor: dados e nome do cliente (targetUserId), nome do consultor, acesso logado', async () => {
    comoConsultor();
    const res = await GET(req('?meses=6'));
    expect(res.status).toBe(200);
    expect(mockMontar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cli-9',
        meses: 6,
        cliente: 'Bruna Cliente',
        consultor: 'Carlos Consultor',
      }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'cons-1' }),
      'cli-9',
      expect.objectContaining({ id: 'cli-9' }),
      '/api/relatorios/financeiro',
      'GET',
    );
  });

  it('o log de acesso é chamado também sem consultor (ele mesmo decide não gravar)', async () => {
    await GET(req('?meses=3'));
    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'user-1' }),
      'user-1',
      null,
      '/api/relatorios/financeiro',
      'GET',
    );
  });

  it('plano forçado só com PERMITIDO=1', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    await GET(req());
    expect(mockMontar.mock.calls[0][0].plano).toBe('adv');

    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5433/sfc_test');
    await GET(req());
    expect(mockMontar.mock.calls[1][0].plano).toBe('basic');
  });

  it('sem sessão: 401', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
