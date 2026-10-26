import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());
const mockExecutar = vi.hoisted(() => vi.fn());
const mockAlertas = vi.hoisted(() => vi.fn());
const mockRecompute = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));
vi.mock('@/services/cashflow/orcamentoV2/excluirSubcategoria', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/excluirSubcategoria')>();
  return { ...original, executarExclusaoSubcategoria: mockExecutar };
});
vi.mock('@/services/cashflow/orcamentoAlertas', () => ({ checkOrcamentoAlertasSafe: mockAlertas }));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mockRecompute,
}));

import { DELETE } from '../route';
import { ErroExclusaoSubcategoria } from '@/services/cashflow/orcamentoV2/excluirSubcategoria';

const req = () =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/subcategorias/pet', {
    method: 'DELETE',
  });
const ctx = (itemId = 'pet') => ({ params: Promise.resolve({ itemId }) });

const ativado = {
  featureBetas: [{ id: 'b1' }],
  cashflowOrcamentoPrefs: { estruturaCriadaEm: new Date() },
};
let uid = 0;

describe('DELETE /api/cashflow/orcamento/v2/subcategorias/[itemId]', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(ativado);
    // id novo por teste: o cache de acesso (60 s) não vaza entre os casos
    usuarioId = `del${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockExecutar.mockResolvedValue({
      itemId: 'pet',
      nome: 'Pet',
      geralId: 'geral',
      celulasMovidas: 2,
      celulasSomadas: 1,
      transacoesMovidas: 3,
      orcadosSomados: 0,
      orcadosApagados: 0,
      snapshot: {},
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('funde do dono dos dados, grava o histórico (contexto) e responde as contagens', async () => {
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      celulasMovidas: 2,
      celulasSomadas: 1,
      transacoesMovidas: 3,
    });
    expect(mockExecutar).toHaveBeenCalledWith(usuarioId, 'pet', {
      contexto: { request: expect.any(NextRequest), auth: expect.any(Object) },
    });
    expect(mockLogSensitive).toHaveBeenCalled();
    expect(mockRecompute).toHaveBeenCalledWith(usuarioId, new Date(0));
    expect(mockAlertas).toHaveBeenCalledWith(usuarioId);
  });

  it('consultor: exclui no cliente (targetUserId)', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor', email: 'c@b', role: 'consultant' },
      targetUserId: usuarioId,
      actingClient: { id: usuarioId },
    });
    await DELETE(req(), ctx());
    expect(mockExecutar).toHaveBeenCalledWith(usuarioId, 'pet', expect.any(Object));
  });

  it('cores divergentes → 409 com codigo e meses 1–12', async () => {
    mockExecutar.mockRejectedValue(
      new ErroExclusaoSubcategoria('cores_divergentes', [
        { ano: 2026, mes: 0 },
        { ano: 2026, mes: 11 },
      ]),
    );
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      codigo: 'cores_divergentes',
      meses: [
        { ano: 2026, mes: 1 },
        { ano: 2026, mes: 12 },
      ],
    });
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it.each([
    ['geral', 409],
    ['espelho', 409],
    ['fora_de_categoria', 404],
  ] as const)('recusa %s → %i', async (codigo, status) => {
    mockExecutar.mockRejectedValue(new ErroExclusaoSubcategoria(codigo));
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(status);
    expect((await res.json()).codigo).toBe(codigo);
  });

  it('flag desligada → 404 sem tocar em nada', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(404);
    expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
    expect(mockExecutar).not.toHaveBeenCalled();
  });

  it('fora do beta → 404; liberado mas não ativado → 409', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [],
      cashflowOrcamentoPrefs: null,
    });
    expect((await DELETE(req(), ctx())).status).toBe(404);

    usuarioId = `del${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: null,
    });
    expect((await DELETE(req(), ctx())).status).toBe(409);
    expect(mockExecutar).not.toHaveBeenCalled();
  });
});
