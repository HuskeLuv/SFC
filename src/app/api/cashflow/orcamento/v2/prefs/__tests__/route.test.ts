import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  cashflowOrcamentoPrefs: { findUnique: vi.fn(), update: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));

import { PUT } from '../route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/prefs', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const ESTRUTURA = new Date('2026-10-20T12:00:00Z');
const ativado = {
  featureBetas: [{ id: 'b1' }],
  cashflowOrcamentoPrefs: { estruturaCriadaEm: ESTRUTURA },
};
let uid = 0;

describe('PUT /api/cashflow/orcamento/v2/prefs', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(ativado);
    usuarioId = `prefs${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockPrisma.cashflowOrcamentoPrefs.findUnique.mockResolvedValue({ avisoGeralVistoEm: null });
    mockPrisma.cashflowOrcamentoPrefs.update.mockImplementation(async ({ data }) => ({
      categoriasRecolhidas: [],
      graficoVisivel: true,
      fonte: 'lancado',
      estruturaCriadaEm: ESTRUTURA,
      avisoGeralVistoEm: null,
      ...data,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('grava só os campos enviados (sem duplicar recolhidas) no targetUserId', async () => {
    const res = await PUT(
      req({
        categoriasRecolhidas: ['g1', 'g2', 'g1'],
        graficoVisivel: false,
        fonte: 'consolidado',
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.cashflowOrcamentoPrefs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: usuarioId },
        data: { categoriasRecolhidas: ['g1', 'g2'], graficoVisivel: false, fonte: 'consolidado' },
      }),
    );
    expect(await res.json()).toEqual({
      categoriasRecolhidas: ['g1', 'g2'],
      graficoVisivel: false,
      fonte: 'consolidado',
      avisoGeralPendente: true,
    });
  });

  it('avisoGeralVisto: true grava a data (mantém a primeira); false volta a mostrar', async () => {
    let res = await PUT(req({ avisoGeralVisto: true }));
    const data = mockPrisma.cashflowOrcamentoPrefs.update.mock.calls[0][0].data;
    expect(data.avisoGeralVistoEm).toBeInstanceOf(Date);
    expect((await res.json()).avisoGeralPendente).toBe(false);

    const primeira = new Date('2026-10-21T00:00:00Z');
    mockPrisma.cashflowOrcamentoPrefs.findUnique.mockResolvedValue({
      avisoGeralVistoEm: primeira,
    });
    await PUT(req({ avisoGeralVisto: true }));
    expect(mockPrisma.cashflowOrcamentoPrefs.update.mock.calls[1][0].data).toEqual({
      avisoGeralVistoEm: primeira,
    });

    res = await PUT(req({ avisoGeralVisto: false }));
    expect(mockPrisma.cashflowOrcamentoPrefs.update.mock.calls[2][0].data).toEqual({
      avisoGeralVistoEm: null,
    });
    expect((await res.json()).avisoGeralPendente).toBe(true);
  });

  it.each([
    ['vazio', {}],
    ['fonte inválida', { fonte: 'banco' }],
    ['recolhidas não-array', { categoriasRecolhidas: 'g1' }],
    ['gráfico em texto', { graficoVisivel: 'sim' }],
  ])('%s → 400, sem escrita', async (_caso, body) => {
    expect((await PUT(req(body))).status).toBe(400);
    expect(mockPrisma.cashflowOrcamentoPrefs.update).not.toHaveBeenCalled();
  });

  it('não ativado → 409; flag desligada → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: null,
    });
    expect((await PUT(req({ graficoVisivel: false }))).status).toBe(409);
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    expect((await PUT(req({ graficoVisivel: false }))).status).toBe(404);
    expect(mockPrisma.cashflowOrcamentoPrefs.update).not.toHaveBeenCalled();
  });
});
