import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockQueryRaw = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: mockQueryRaw } }));

import { GET } from '../route';

const request = () => new NextRequest('http://localhost/api/admin/cs', { method: 'GET' });

const linha = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Cliente Um',
  email: 'um@example.com',
  role: 'user',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  accessLevel: 0,
  ultimo_login: new Date('2026-11-02T12:00:00Z'),
  ativos: BigInt(3),
  usa_fluxo: true,
  usa_orcamento: false,
  msg_mes: BigInt(2),
  open_finance: false,
  prim_carteira: new Date('2026-10-03T12:00:00Z'),
  prim_fluxo: null,
  prim_conexao: null,
  ult_carteira: new Date('2026-10-20T12:00:00Z'),
  ult_fluxo: null,
  ult_orcamento: null,
  ult_planejamento: null,
  ult_assistente: null,
  ult_conexoes: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/cs', () => {
  it('responde 403 para quem não é admin e não consulta o banco', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new ApiError(403, 'Acesso negado'));
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Acesso negado' });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('responde 401 sem sessão', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw new Error('Não autorizado');
    });
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('devolve o painel para admin, sem cache e sem valores financeiros', async () => {
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mockQueryRaw.mockResolvedValue([linha(), linha({ id: 'u2', prim_carteira: null })]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.clientes).toHaveLength(2);
    expect(body.clientes[0]).toMatchObject({
      email: 'um@example.com',
      ativosCarteira: 3,
      mensagensAssistenteMes: 2,
      ativacao: { acao: 'carteira', diasAteAtivar: 2 },
    });
    expect(body.ativacao).toMatchObject({ total: 2, ativados: 1, pctAtivados: 50 });
    expect(body.csat).toBeNull();
    const texto = JSON.stringify(body);
    expect(texto).not.toMatch(/totalInvested|avgPrice|valor"|saldo/i);
  });
});
