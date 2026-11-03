import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getMergedCashflowGroups: vi.fn(),
  ensurePersonalizedItem: vi.fn(),
  recordChange: vi.fn(),
  estadoAcessoOrcamentoV2: vi.fn(),
  salvarOrcado: vi.fn(),
  resolverSubcategoria: vi.fn(),
  prisma: {
    cashflowValue: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    cashflowOrcamentoItem: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mocks.getMergedCashflowGroups,
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mocks.ensurePersonalizedItem,
}));
vi.mock('@/services/changeHistory', () => ({
  recordChange: mocks.recordChange,
  diffFields: (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys(b).map((k) => ({ field: k, label: k, before: a[k], after: b[k] })),
  CASHFLOW_FIELD_LABELS: {},
}));
vi.mock('@/services/cashflow/orcamentoV2/acesso', () => ({
  estadoAcessoOrcamentoV2: mocks.estadoAcessoOrcamentoV2,
}));
vi.mock('@/services/cashflow/orcamentoV2/escritaOrcado', () => {
  class ErroEscritaOrcamento extends Error {}
  return {
    ErroEscritaOrcamento,
    salvarOrcado: mocks.salvarOrcado,
    resolverSubcategoria: mocks.resolverSubcategoria,
    orcadoDaLinha: (l: { valor: unknown; pct: unknown } | null) =>
      l ? { valor: l.valor == null ? null : Number(l.valor), pct: null } : null,
  };
});

import {
  aplicarPropostaAjuste,
  montarPropostaComentario,
  montarPropostaCor,
  montarPropostaOrcamento,
  paraRespostaAjuste,
  verificarPropostaAjuste,
  type PropostaAjuste,
} from '../ajustes';
import { assinarPayload } from '../assinatura';

process.env.ASSISTENTE_SECRET ??= 'segredo-de-teste';

const item = (
  id: string,
  groupId: string,
  name: string,
  values: Array<Record<string, unknown>> = [],
) => ({ id, userId: 'u1', groupId, name, significado: null, rank: null, values });

const grupos = [
  {
    id: 'g-desp',
    userId: 'u1',
    name: 'Despesas',
    type: 'despesa',
    parentId: null,
    orderIndex: 0,
    items: [],
    children: [
      {
        id: 'g-edu',
        userId: 'u1',
        name: 'Educação',
        type: 'despesa',
        parentId: 'g-desp',
        orderIndex: 0,
        children: [],
        items: [
          item('i-cursos', 'g-edu', 'Cursos', [
            { year: 2026, month: 10, value: 583.01, comment: 'Gasto de R$ 583,01 (assistente)' },
          ]),
        ],
      },
      {
        id: 'g-hab',
        userId: 'u1',
        name: 'Habitação',
        type: 'despesa',
        parentId: 'g-desp',
        orderIndex: 1,
        children: [],
        items: [item('i-gas', 'g-hab', 'Gás', [{ year: 2026, month: 8, value: 100 }])],
      },
      {
        id: 'g-lazer',
        userId: 'u1',
        name: 'Lazer',
        type: 'despesa',
        parentId: 'g-desp',
        orderIndex: 2,
        children: [],
        items: [item('i-cinema', 'g-lazer', 'Cinema')],
      },
    ],
  },
];

const hoje = new Date(2026, 10, 3);
const auth = {
  payload: { id: 'u1' },
  targetUserId: 'u1',
  actingClient: null,
} as unknown as Parameters<typeof aplicarPropostaAjuste>[0];
const request = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMergedCashflowGroups.mockResolvedValue(grupos);
  mocks.ensurePersonalizedItem.mockImplementation(async (id: string) => ({
    itemId: id,
    item: { name: id === 'i-cursos' ? 'Cursos' : id === 'i-gas' ? 'Gás' : 'Cinema' },
  }));
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mocks.prisma),
  );
  mocks.estadoAcessoOrcamentoV2.mockResolvedValue({ estado: 'liberada', ativado: true });
  mocks.resolverSubcategoria.mockResolvedValue({});
  mocks.prisma.cashflowOrcamentoItem.findMany.mockResolvedValue([]);
});

describe('propor_comentario', () => {
  it('acrescenta ao comentário que já existe (padrão) e mostra antes → depois', async () => {
    const r = await montarPropostaComentario(
      'u1',
      'm1',
      { linha: 'Cursos', grupo: 'Educação', mes: 10, comentario: 'DET' },
      { hoje, anoPlanilha: 2026 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta).toMatchObject({
      tipo: 'comentario',
      itemId: 'i-cursos',
      mes: 10,
      ano: 2026,
      antes: 'Gasto de R$ 583,01 (assistente)',
      depois: 'Gasto de R$ 583,01 (assistente)\nDET',
    });
    const card = paraRespostaAjuste(r.proposta, r.token);
    expect(card.titulo).toBe('Editar comentário');
    expect(card.periodo).toBe('novembro/2026');
  });

  it('linha inexistente devolve as parecidas, sem proposta', async () => {
    const r = await montarPropostaComentario(
      'u1',
      'm1',
      { linha: 'Academia', comentario: 'x' },
      { hoje },
    );
    expect(r.ok).toBe(false);
  });

  it('gravar usa a ação comentario.editar (com Desfazer) e o snapshot da célula', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({
      id: 'cv1',
      comment: 'Gasto de R$ 583,01 (assistente)',
    });
    const r = await montarPropostaComentario(
      'u1',
      'm1',
      { linha: 'Cursos', mes: 10, comentario: 'DET', ano: 2026 },
      { hoje },
    );
    if (!r.ok) throw new Error('esperava proposta');
    const out = await aplicarPropostaAjuste(auth, request, r.proposta);
    expect(mocks.prisma.cashflowValue.update).toHaveBeenCalledWith({
      where: { id: 'cv1' },
      data: { comment: 'Gasto de R$ 583,01 (assistente)\nDET' },
    });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'comentario.editar',
        snapshot: expect.objectContaining({
          kind: 'cashflow-comentario',
          data: { comment: 'Gasto de R$ 583,01 (assistente)', valueExisted: true },
          meta: { itemId: 'i-cursos', year: 2026, month: 10 },
        }),
      }),
    );
    expect(out.resumo).toContain('Histórico');
  });
});

describe('propor_cor', () => {
  it('vermelho = Pago: grava o hex da legenda e registra cor.editar com a cor de antes', async () => {
    const r = await montarPropostaCor(
      'u1',
      'm1',
      { linha: 'Gás', grupo: 'Habitação', cor: 'red', mes: 8, ano: 2026 },
      { hoje },
    );
    if (!r.ok) throw new Error('esperava proposta');
    expect(paraRespostaAjuste(r.proposta, r.token)).toMatchObject({
      titulo: 'Cor · Pago',
      corCss: '#FF0000',
      periodo: 'setembro/2026',
    });
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({ id: 'cv9', color: null });
    await aplicarPropostaAjuste(auth, request, r.proposta);
    expect(mocks.prisma.cashflowValue.update).toHaveBeenCalledWith({
      where: { id: 'cv9' },
      data: { color: '#FF0000' },
    });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cor.editar',
        snapshot: expect.objectContaining({
          kind: 'cashflow-cores',
          data: { celulas: [{ month: 8, before: null, after: '#FF0000', existia: true }] },
        }),
      }),
    );
  });

  it('célula que já está na cor pedida não vira proposta', async () => {
    mocks.getMergedCashflowGroups.mockResolvedValue([
      {
        ...grupos[0],
        children: [
          {
            ...grupos[0].children[1],
            items: [item('i-gas', 'g-hab', 'Gás', [{ year: 2026, month: 8, color: '#ff0000' }])],
          },
        ],
      },
    ]);
    const r = await montarPropostaCor(
      'u1',
      'm1',
      { linha: 'Gás', cor: 'red', mes: 8, ano: 2026 },
      { hoje },
    );
    expect(r.ok).toBe(false);
  });
});

describe('propor_orcamento', () => {
  it('Orçamento v2 ativo: proposta por mês e gravação via salvarOrcado (histórico + Desfazer)', async () => {
    mocks.prisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      { mes: 10, valor: 0, pct: null },
    ]);
    const r = await montarPropostaOrcamento(
      'u1',
      'm1',
      { subcategoria: 'Cinema', categoria: 'Lazer', valor: 200, mesInicio: 10, ano: 2026 },
      { hoje },
    );
    if (!r.ok) throw new Error('esperava proposta');
    expect(r.proposta).toMatchObject({
      tipo: 'orcamento',
      itemId: 'i-cinema',
      valor: 200,
      celulas: [
        { mes: 10, antes: 0 },
        { mes: 11, antes: null },
      ],
    });
    mocks.salvarOrcado.mockImplementation(async (_u: string, itemId: string) => ({
      itemId: `${itemId}-u`,
      nome: 'Cinema',
    }));
    const out = await aplicarPropostaAjuste(auth, request, r.proposta);
    expect(mocks.salvarOrcado).toHaveBeenCalledTimes(2);
    expect(mocks.salvarOrcado.mock.calls[0]).toEqual([
      'u1',
      'i-cinema',
      { ano: 2026, mes0: 10, modo: 'valor', valor: 200 },
      { contexto: { request, auth } },
    ]);
    // Item-template personalizado na 1ª gravação: o mês seguinte usa o id do usuário.
    expect(mocks.salvarOrcado.mock.calls[1][1]).toBe('i-cinema-u');
    expect(out.resumo).toContain('R$');
  });

  it('sem o Orçamento v2 ativado não propõe (pede para abrir a aba Orçamento)', async () => {
    mocks.estadoAcessoOrcamentoV2.mockResolvedValue({ estado: 'liberada', ativado: false });
    const r = await montarPropostaOrcamento(
      'u1',
      'm1',
      { subcategoria: 'Cinema', valor: 200 },
      { hoje },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('Orçamento');
  });
});

describe('verificarPropostaAjuste', () => {
  const base = {
    kind: 'ajuste',
    id: 'x',
    mensagemId: 'm',
    userId: 'u1',
    itemId: 'i',
    itemNome: 'Gás',
    grupoNome: 'Despesas > Habitação',
    ano: 2026,
    tipo: 'cor',
    cor: 'red',
    celulas: [{ mes: 8, antes: null }],
  };

  it('aceita a do próprio usuário dentro da validade; recusa de outro, expirada ou de outro tipo', () => {
    const valida = { ...base, expiraEm: Date.now() + 60_000 } as unknown as PropostaAjuste;
    expect(verificarPropostaAjuste(assinarPayload(valida), 'u1')).not.toBeNull();
    expect(verificarPropostaAjuste(assinarPayload(valida), 'u2')).toBeNull();
    expect(
      verificarPropostaAjuste(assinarPayload({ ...valida, expiraEm: Date.now() - 1 }), 'u1'),
    ).toBeNull();
    expect(verificarPropostaAjuste(assinarPayload({ ...valida, kind: 'evento' }), 'u1')).toBeNull();
  });
});
