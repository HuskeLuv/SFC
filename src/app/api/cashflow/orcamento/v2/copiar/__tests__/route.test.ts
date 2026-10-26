import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());
const mockCopiar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));
vi.mock('@/services/cashflow/orcamentoV2/copiarMes', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/copiarMes')>();
  return { ...original, copiarMes: mockCopiar };
});

import { POST } from '../route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/copiar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const ativado = {
  featureBetas: [{ id: 'b1' }],
  cashflowOrcamentoPrefs: { estruturaCriadaEm: new Date() },
};
let uid = 0;

describe('POST /api/cashflow/orcamento/v2/copiar', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(ativado);
    usuarioId = `cop${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockCopiar.mockResolvedValue({ copiados: 5, ignorados: 2, celulas: [{}] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([true, false])(
    'sobrescrever=%s: copia no dono dos dados com meses 0–11 e responde {copiados, ignorados}',
    async (sobrescrever) => {
      const res = await POST(
        req({ de: { ano: 2026, mes: 12 }, para: { ano: 2027, mes: 1 }, sobrescrever }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ copiados: 5, ignorados: 2 });
      expect(mockCopiar).toHaveBeenCalledWith(
        usuarioId,
        { de: { ano: 2026, mes0: 11 }, para: { ano: 2027, mes0: 0 }, sobrescrever },
        { contexto: { request: expect.any(NextRequest), auth: expect.any(Object) } },
      );
    },
  );

  it('consultor: copia no cliente com o auth do consultor no histórico', async () => {
    const consultor = {
      payload: { id: 'consultor-1', email: 'c@b', role: 'consultant' },
      targetUserId: usuarioId,
      actingClient: { id: usuarioId },
    };
    mockRequireAuthWithActing.mockResolvedValue(consultor);
    await POST(
      req({ de: { ano: 2026, mes: 9 }, para: { ano: 2026, mes: 10 }, sobrescrever: false }),
    );
    expect(mockCopiar).toHaveBeenCalledWith(usuarioId, expect.anything(), {
      contexto: expect.objectContaining({ auth: consultor }),
    });
  });

  it.each([
    ['mesmo mês', { de: { ano: 2026, mes: 9 }, para: { ano: 2026, mes: 9 }, sobrescrever: false }],
    ['sem sobrescrever', { de: { ano: 2026, mes: 9 }, para: { ano: 2026, mes: 10 } }],
    ['mês 13', { de: { ano: 2026, mes: 13 }, para: { ano: 2026, mes: 10 }, sobrescrever: true }],
    ['sem destino', { de: { ano: 2026, mes: 9 }, sobrescrever: true }],
  ])('%s → 400', async (_caso, body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(mockCopiar).not.toHaveBeenCalled();
  });

  it('não ativado → 409; fora do beta → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: null,
    });
    const body = { de: { ano: 2026, mes: 9 }, para: { ano: 2026, mes: 10 }, sobrescrever: true };
    expect((await POST(req(body))).status).toBe(409);

    usuarioId = `cop${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [],
      cashflowOrcamentoPrefs: null,
    });
    expect((await POST(req(body))).status).toBe(404);
    expect(mockCopiar).not.toHaveBeenCalled();
  });
});
