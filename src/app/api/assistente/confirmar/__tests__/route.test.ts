import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  assistenteHabilitado: vi.fn(),
  marcarPropostaConfirmada: vi.fn(),
  verificarProposta: vi.fn(),
  aplicarProposta: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/assistente/limite', () => ({
  assistenteHabilitado: mocks.assistenteHabilitado,
  marcarPropostaConfirmada: mocks.marcarPropostaConfirmada,
}));
vi.mock('@/services/assistente/lancamento', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/assistente/lancamento')>();
  return {
    ...orig,
    verificarProposta: mocks.verificarProposta,
    aplicarProposta: mocks.aplicarProposta,
  };
});

import { POST } from '../route';

const user = {
  payload: { id: 'u1', email: 'a@b.c', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
};
const proposta = {
  id: 'p1',
  mensagemId: 'msg-1',
  userId: 'u1',
  itemId: 'i',
  itemNome: 'Supermercado',
  grupoNome: 'G',
  tipo: 'despesa',
  valor: 45.9,
  mes: 8,
  ano: 2026,
  descricao: null,
  valorAtual: 1020,
  valorNovo: 1065.9,
  expiraEm: Date.now() + 1000,
};

function post(body: unknown) {
  return new NextRequest('http://localhost/api/assistente/confirmar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/assistente/confirmar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthWithActing.mockResolvedValue(user);
    mocks.assistenteHabilitado.mockReturnValue(true);
  });

  it('grava a proposta válida, marca a métrica e devolve o resumo', async () => {
    mocks.verificarProposta.mockReturnValue(proposta);
    mocks.aplicarProposta.mockResolvedValue({
      itemId: 'i2',
      valorAnterior: 1020,
      valorNovo: 1065.9,
    });
    const res = await POST(post({ token: 'x'.repeat(30) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, itemId: 'i2', valorNovo: 1065.9, ano: 2026 });
    expect(body.resumo.replace(/\u00a0/g, ' ')).toContain('R$ 45,90');
    expect(body.resumo).toContain('setembro/2026');
    expect(mocks.verificarProposta).toHaveBeenCalledWith('x'.repeat(30), 'u1');
    expect(mocks.marcarPropostaConfirmada).toHaveBeenCalledWith('msg-1');
  });

  it('token inválido/expirado → 400, sem gravar', async () => {
    mocks.verificarProposta.mockReturnValue(null);
    const res = await POST(post({ token: 'x'.repeat(30) }));
    expect(res.status).toBe(400);
    expect(mocks.aplicarProposta).not.toHaveBeenCalled();
  });

  it('consultor não confirma (403); desabilitado (503); token curto (400)', async () => {
    mocks.requireAuthWithActing.mockResolvedValueOnce({
      ...user,
      actingClient: { id: 'u1', consultantId: 'c1' },
    });
    expect((await POST(post({ token: 'x'.repeat(30) }))).status).toBe(403);

    mocks.assistenteHabilitado.mockReturnValueOnce(false);
    expect((await POST(post({ token: 'x'.repeat(30) }))).status).toBe(503);

    expect((await POST(post({ token: 'curto' }))).status).toBe(400);
    expect(mocks.aplicarProposta).not.toHaveBeenCalled();
  });
});
