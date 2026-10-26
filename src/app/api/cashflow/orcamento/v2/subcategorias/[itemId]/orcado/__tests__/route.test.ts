import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());
const mockSalvar = vi.hoisted(() => vi.fn());
const mockResposta = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));
vi.mock('@/services/cashflow/orcamentoV2/escritaOrcado', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/escritaOrcado')>();
  return { ...original, salvarOrcado: mockSalvar, respostaDaSubcategoria: mockResposta };
});

import { PUT } from '../route';
import { ErroEscritaOrcamento } from '@/services/cashflow/orcamentoV2/escritaOrcado';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/orcamento/v2/subcategorias/pet/orcado', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const ctx = (itemId = 'pet') => ({ params: Promise.resolve({ itemId }) });

const ativado = {
  featureBetas: [{ id: 'b1' }],
  cashflowOrcamentoPrefs: { estruturaCriadaEm: new Date() },
};
const RESPOSTA = {
  subcategoria: { id: 'pet-u', orcado: 300 },
  categoria: { id: 'cat', orcado: 300 },
  resumo: { orcado: 300 },
};
let uid = 0;

describe('PUT /api/cashflow/orcamento/v2/subcategorias/[itemId]/orcado', () => {
  let usuarioId: string;

  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(ativado);
    // id novo por teste: o cache de acesso (60 s) não vaza entre os casos
    usuarioId = `orc${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId, email: 'a@b', role: 'user' },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockSalvar.mockResolvedValue({ itemId: 'pet-u', nome: 'Pet', mudou: true });
    mockResposta.mockResolvedValue(RESPOSTA);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('valor: grava no dono dos dados (mês 0–11), com contexto do histórico, e responde o recálculo', async () => {
    const res = await PUT(req({ ano: 2026, mes: 10, valor: 300 }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESPOSTA);
    expect(mockSalvar).toHaveBeenCalledWith(
      usuarioId,
      'pet',
      { ano: 2026, mes0: 9, modo: 'valor', valor: 300 },
      { contexto: expect.objectContaining({ auth: expect.anything() }) },
    );
    // a resposta é da linha do usuário (template personalizado → id novo)
    expect(mockResposta).toHaveBeenCalledWith(usuarioId, 'pet-u', {
      ano: 2026,
      mes0: 9,
      fonte: undefined,
    });
    expect(mockLogSensitive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: usuarioId }),
      usuarioId,
      null,
      '/api/cashflow/orcamento/v2/subcategorias/[itemId]/orcado',
      'PUT',
    );
  });

  it('pct e limpar (valor: null) chegam ao serviço no modo certo; fonte vai para o recálculo', async () => {
    await PUT(req({ ano: 2026, mes: 1, pct: 7.5, fonte: 'consolidado' }), ctx());
    expect(mockSalvar.mock.calls[0][2]).toEqual({ ano: 2026, mes0: 0, modo: 'pct', pct: 7.5 });
    expect(mockResposta.mock.calls[0][2]).toMatchObject({ fonte: 'consolidado' });

    await PUT(req({ ano: 2026, mes: 12, valor: null }), ctx());
    expect(mockSalvar.mock.calls[1][2]).toEqual({
      ano: 2026,
      mes0: 11,
      modo: 'valor',
      valor: null,
    });
  });

  it('valor e pct juntos → 422 (XOR), sem escrita', async () => {
    const res = await PUT(req({ ano: 2026, mes: 1, valor: 10, pct: 5 }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).codigo).toBe('valor_e_pct');
    expect(mockSalvar).not.toHaveBeenCalled();
  });

  it.each([
    ['sem valor nem pct', { ano: 2026, mes: 1 }],
    ['valor negativo', { ano: 2026, mes: 1, valor: -1 }],
    ['valor com 3 casas', { ano: 2026, mes: 1, valor: 1.005 }],
    ['pct acima de 100', { ano: 2026, mes: 1, pct: 100.1 }],
    ['pct com 2 casas', { ano: 2026, mes: 1, pct: 7.25 }],
    ['pct null', { ano: 2026, mes: 1, pct: null }],
    ['mês 0', { ano: 2026, mes: 0, valor: 1 }],
    ['mês 13', { ano: 2026, mes: 13, valor: 1 }],
    ['valor em texto', { ano: 2026, mes: 1, valor: '10' }],
    ['corpo não-objeto', '[1]'],
  ])('%s → 400, sem escrita', async (_caso, body) => {
    const res = await PUT(req(body), ctx());
    expect(res.status).toBe(400);
    expect(mockSalvar).not.toHaveBeenCalled();
  });

  it.each([
    ['pct fora de poupança/na Geral', new ErroEscritaOrcamento('pct_nao_permitido'), 400],
    [
      'item oculto/outro usuário/fora das categorias',
      new ErroEscritaOrcamento('nao_encontrado'),
      404,
    ],
  ])('%s → %s com o código', async (_caso, erro, status) => {
    mockSalvar.mockRejectedValue(erro);
    const res = await PUT(req({ ano: 2026, mes: 1, pct: 5 }), ctx());
    expect(res.status).toBe(status);
    expect((await res.json()).codigo).toBe(erro.codigo);
    expect(mockResposta).not.toHaveBeenCalled();
  });

  it('consultor agindo: escreve no cliente e o contexto leva o auth do consultor', async () => {
    const consultor = {
      payload: { id: 'consultor-1', email: 'c@b', role: 'consultant' },
      targetUserId: usuarioId,
      actingClient: { id: usuarioId, name: 'Cliente' },
    };
    mockRequireAuthWithActing.mockResolvedValue(consultor);
    await PUT(req({ ano: 2026, mes: 1, valor: 10 }), ctx());
    expect(mockSalvar).toHaveBeenCalledWith(usuarioId, 'pet', expect.anything(), {
      contexto: expect.objectContaining({ auth: consultor }),
    });
  });

  it('não ativado → 409; fora do beta → 404; flag desligada → 404 sem tocar na sessão', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [{ id: 'b1' }],
      cashflowOrcamentoPrefs: null,
    });
    expect((await PUT(req({ ano: 2026, mes: 1, valor: 1 }), ctx())).status).toBe(409);

    usuarioId = `orc${++uid}`;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: usuarioId },
      targetUserId: usuarioId,
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      featureBetas: [],
      cashflowOrcamentoPrefs: null,
    });
    expect((await PUT(req({ ano: 2026, mes: 1, valor: 1 }), ctx())).status).toBe(404);

    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    mockRequireAuthWithActing.mockClear();
    expect((await PUT(req({ ano: 2026, mes: 1, valor: 1 }), ctx())).status).toBe(404);
    expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
    expect(mockSalvar).not.toHaveBeenCalled();
  });
});
