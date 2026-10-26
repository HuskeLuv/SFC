import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockPlanejar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({ logSensitiveEndpointAccess: vi.fn() }));
vi.mock('@/services/cashflow/orcamentoV2/excluirSubcategoria', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/excluirSubcategoria')>();
  return { ...original, planejarExclusao: mockPlanejar };
});

import { GET } from '../route';
import { ErroExclusaoSubcategoria } from '@/services/cashflow/orcamentoV2/excluirSubcategoria';

const req = () =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/subcategorias/pet/impacto');
const ctx = (itemId = 'pet') => ({ params: Promise.resolve({ itemId }) });
let uid = 0;

describe('GET /api/cashflow/orcamento/v2/subcategorias/[itemId]/impacto', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: { estruturaCriadaEm: new Date() },
    });
    usuarioId = `imp${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockPlanejar.mockResolvedValue({
      itemId: 'pet',
      nome: 'Pet',
      geralId: 'geral',
      celulas: 4,
      transacoes: 2,
      mesesComOrcado: 3,
      coresDivergentes: [{ ano: 2026, mes: 2 }],
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('contagens do dono dos dados, meses 1–12, sem expor o id da Geral', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      itemId: 'pet',
      nome: 'Pet',
      celulas: 4,
      transacoes: 2,
      mesesComOrcado: 3,
      coresDivergentes: [{ ano: 2026, mes: 3 }],
    });
    expect(mockPlanejar).toHaveBeenCalledWith(usuarioId, 'pet', expect.any(Object));
  });

  it('Geral → 409; fora de categoria → 404', async () => {
    mockPlanejar.mockRejectedValueOnce(new ErroExclusaoSubcategoria('geral'));
    expect((await GET(req(), ctx())).status).toBe(409);
    mockPlanejar.mockRejectedValueOnce(new ErroExclusaoSubcategoria('nao_encontrado'));
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it('flag desligada → 404', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    expect((await GET(req(), ctx())).status).toBe(404);
    expect(mockPlanejar).not.toHaveBeenCalled();
  });

  it('não ativado → 409', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: null,
    });
    expect((await GET(req(), ctx())).status).toBe(409);
    expect(mockPlanejar).not.toHaveBeenCalled();
  });
});
