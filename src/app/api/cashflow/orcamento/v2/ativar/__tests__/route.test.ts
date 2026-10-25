import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());
const mockAtivar = vi.hoisted(() => vi.fn());
const mockLimparCache = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));
vi.mock('@/services/cashflow/orcamentoV2/ativacao', () => ({ ativarOrcamentoV2: mockAtivar }));
vi.mock('@/services/cashflow/orcamentoV2/acesso', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/cashflow/orcamentoV2/acesso')>();
  return { ...original, limparCacheAcessoOrcamentoV2: mockLimparCache };
});

import { POST } from '../route';

const req = () =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/ativar', { method: 'POST' });

const mudancas = {
  gruposPersonalizados: 0,
  ocultosPreservados: 0,
  geraisCriadas: 3,
  geraisAdotadas: 0,
  orcadosInseridos: 24,
  sugestoesCriadas: 0,
  prefsGravado: true,
};

function relatorio(status: string, motivo: string | null = null, divergencias: unknown[] = []) {
  return {
    userId: 'u1',
    status,
    dryRun: false,
    motivo,
    plano: { userId: 'u1' },
    mudancas,
    divergencias,
  };
}

const naLista = { featureBetas: [{ id: 'b1' }], cashflowOrcamentoPrefs: null };
const foraDaLista = { featureBetas: [], cashflowOrcamentoPrefs: null };
let uid = 0;

describe('POST /api/cashflow/orcamento/v2/ativar', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    mockPrisma.user.findUnique.mockReset().mockResolvedValue(naLista);
    mockRequireAuthWithActing.mockReset();
    mockLogSensitive.mockReset().mockResolvedValue(undefined);
    mockAtivar.mockReset().mockResolvedValue(relatorio('ativado'));
    mockLimparCache.mockReset();
    // id novo por teste: o cache de acesso (60 s) do módulo real não vaza entre os casos
    usuarioId = `u${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag desligada → 404 sem olhar a sessão nem ativar', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
    expect(mockAtivar).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await POST(req())).status).toBe(401);
    expect(mockAtivar).not.toHaveBeenCalled();
  });

  it('fora do beta → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(foraDaLista);
    expect((await POST(req())).status).toBe(404);
    expect(mockAtivar).not.toHaveBeenCalled();
  });

  it('liberada → ativa de verdade (sem dry-run, sem órfãs), limpa o cache e devolve o resumo', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockAtivar).toHaveBeenCalledWith(usuarioId, { dryRun: false });
    expect(mockLimparCache).toHaveBeenCalledWith(usuarioId);
    const corpo = await res.json();
    expect(corpo).toEqual({ status: 'ativado', motivo: null, mudancas, divergencias: 0 });
    expect(corpo).not.toHaveProperty('plano');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockLogSensitive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: usuarioId }),
      usuarioId,
      null,
      '/api/cashflow/orcamento/v2/ativar',
      'POST',
    );
  });

  it('já ativado → 200 ja_ativado (idempotente)', async () => {
    mockAtivar.mockResolvedValue(relatorio('ja_ativado'));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ja_ativado');
  });

  it('abortado → 409 com o motivo', async () => {
    mockAtivar.mockResolvedValue(relatorio('abortado', 'valores_em_item_template'));
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: 'abortado',
      motivo: 'valores_em_item_template',
    });
  });

  it('compensado → 500 com o número de divergências', async () => {
    mockAtivar.mockResolvedValue(
      relatorio('compensado', 'verificacao_divergiu', [{ chave: 'x', tipo: 'orcado' }]),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: 'compensado', divergencias: 1 });
    spy.mockRestore();
  });

  it('consultor agindo pelo cliente: ativa o CLIENTE (targetUserId)', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'cons', email: 'c@b', role: 'consultant' },
      targetUserId: `cliente-${usuarioId}`,
      actingClient: { id: `cliente-${usuarioId}` },
    });
    expect((await POST(req())).status).toBe(200);
    expect(mockAtivar).toHaveBeenCalledWith(`cliente-${usuarioId}`, { dryRun: false });
    expect(mockLimparCache).toHaveBeenCalledWith(`cliente-${usuarioId}`);
  });
});
