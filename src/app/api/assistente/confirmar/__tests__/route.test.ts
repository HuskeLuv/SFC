import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  assistenteHabilitado: vi.fn(),
  marcarPropostaConfirmada: vi.fn(),
  verificarProposta: vi.fn(),
  aplicarProposta: vi.fn(),
  aplicarPropostas: vi.fn(),
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
    aplicarPropostas: mocks.aplicarPropostas,
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
  ano: 2026,
  descricao: null,
  modo: 'somar',
  celulas: [{ mes: 8, valorAtual: 1020, valorNovo: 1065.9 }],
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
      celulas: [{ mes: 8, valorAnterior: 1020, valorNovo: 1065.9 }],
    });
    const res = await POST(post({ token: 'x'.repeat(30) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      itemId: 'i2',
      celulas: [{ mes: 8, valorAnterior: 1020, valorNovo: 1065.9 }],
      ano: 2026,
    });
    const resumo = body.resumo.replace(/\u00a0/g, ' ');
    expect(resumo).toContain('R$ 45,90');
    expect(resumo).toContain('setembro/2026');
    expect(resumo).toContain('ficou em R$ 1.065,90');
    expect(mocks.verificarProposta).toHaveBeenCalledWith('x'.repeat(30), 'u1');
    expect(mocks.marcarPropostaConfirmada).toHaveBeenCalledWith('msg-1');
  });

  it('proposta recorrente → resumo com "por mês", período e quantidade de meses', async () => {
    const celulas = [0, 1, 2].map((mes) => ({ mes, valorAtual: 0, valorNovo: 2500 }));
    mocks.verificarProposta.mockReturnValue({
      ...proposta,
      itemNome: 'Aluguel',
      valor: 2500,
      modo: 'definir',
      celulas,
    });
    mocks.aplicarProposta.mockResolvedValue({
      itemId: 'i2',
      celulas: celulas.map((c) => ({ mes: c.mes, valorAnterior: 0, valorNovo: 2500 })),
    });
    const body = await (await POST(post({ token: 'x'.repeat(30) }))).json();
    const resumo = body.resumo.replace(/\u00a0/g, ' ');
    expect(resumo).toContain('R$ 2.500,00 por mês em "Aluguel", de janeiro a março/2026 (3 meses)');
    expect(body.celulas).toHaveLength(3);
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

  describe('lote (tokens[])', () => {
    const saude = {
      ...proposta,
      id: 'p2',
      itemId: 'i-saude',
      itemNome: 'Plano de saúde',
      valor: 1500,
      modo: 'definir',
      mensagemId: 'msg-2',
      celulas: Array.from({ length: 12 }, (_, mes) => ({ mes, valorAtual: 0, valorNovo: 1500 })),
    };
    const tok = (n: number) => `${'t'.repeat(30)}${n}`;

    it('grava todas as válidas de uma vez, marca cada mensagem e devolve um item por token na ordem enviada', async () => {
      mocks.verificarProposta.mockReturnValueOnce(proposta).mockReturnValueOnce(saude);
      mocks.aplicarPropostas.mockResolvedValue([
        {
          ok: true,
          proposta,
          resultado: { itemId: 'i', celulas: [{ mes: 8, valorAnterior: 1020, valorNovo: 1065.9 }] },
        },
        {
          ok: true,
          proposta: saude,
          resultado: {
            itemId: 'i-saude',
            celulas: saude.celulas.map((c) => ({ mes: c.mes, valorAnterior: 0, valorNovo: 1500 })),
          },
        },
      ]);
      const res = await POST(post({ tokens: [tok(1), tok(2)] }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(mocks.aplicarPropostas).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
        proposta,
        saude,
      ]);
      expect(mocks.aplicarProposta).not.toHaveBeenCalled();
      expect(body.ok).toBe(true);
      expect(body.resumo).toBe('Registrados 2 lançamentos. Dá para desfazer cada um em Histórico.');
      expect(body.itens).toHaveLength(2);
      expect(body.itens[0]).toMatchObject({
        ok: true,
        linha: 'Supermercado',
        itemId: 'i',
        ano: 2026,
      });
      expect(body.itens[1]).toMatchObject({ ok: true, linha: 'Plano de saúde', itemId: 'i-saude' });
      expect(body.itens[1].resumo.replace(/\u00a0/g, ' ')).toContain(
        'R$ 1.500,00 por mês em "Plano de saúde", de janeiro a dezembro/2026 (12 meses).',
      );
      expect(body.itens[1].resumo).not.toContain('desfazer');
      expect(mocks.marcarPropostaConfirmada.mock.calls.map((c) => c[0]).sort()).toEqual([
        'msg-1',
        'msg-2',
      ]);
    });

    it('token inválido no meio vira item com erro; os outros entram; falha de gravação idem', async () => {
      mocks.verificarProposta
        .mockReturnValueOnce(proposta)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(saude);
      mocks.aplicarPropostas.mockResolvedValue([
        {
          ok: true,
          proposta,
          resultado: { itemId: 'i', celulas: [{ mes: 8, valorAnterior: 0, valorNovo: 45.9 }] },
        },
        { ok: false, proposta: saude, erro: 'Não consegui gravar este item.' },
      ]);
      const body = await (await POST(post({ tokens: [tok(1), tok(2), tok(3)] }))).json();
      expect(mocks.aplicarPropostas).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
        proposta,
        saude,
      ]);
      expect(body.ok).toBe(true);
      expect(body.itens.map((i: { ok: boolean }) => i.ok)).toEqual([true, false, false]);
      expect(body.itens[1]).toEqual({
        ok: false,
        linha: null,
        error: 'Proposta inválida ou expirada.',
      });
      expect(body.itens[2]).toEqual({
        ok: false,
        linha: 'Plano de saúde',
        error: 'Não consegui gravar este item.',
      });
      expect(body.resumo).toBe(
        'Registrados 1 de 3 lançamentos; 2 não entraram. Dá para desfazer cada um em Histórico.',
      );
      expect(mocks.marcarPropostaConfirmada).toHaveBeenCalledTimes(1);
      expect(mocks.marcarPropostaConfirmada).toHaveBeenCalledWith('msg-1');
    });

    it('todos inválidos → 400 sem gravar; lista vazia ou acima do teto → 400', async () => {
      mocks.verificarProposta.mockReturnValue(null);
      expect((await POST(post({ tokens: [tok(1), tok(2)] }))).status).toBe(400);
      expect(mocks.aplicarPropostas).not.toHaveBeenCalled();
      expect((await POST(post({ tokens: [] }))).status).toBe(400);
      expect(
        (await POST(post({ tokens: Array.from({ length: 21 }, (_, i) => tok(i)) }))).status,
      ).toBe(400);
    });
  });
});
