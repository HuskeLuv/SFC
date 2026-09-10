import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getMergedCashflowGroups: vi.fn(),
  ensurePersonalizedItem: vi.fn(),
  recomputeEvolucaoSnapshotsSafe: vi.fn(),
  checkOrcamentoAlertasSafe: vi.fn(),
  recordChange: vi.fn(),
  prisma: {
    cashflowValue: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mocks.getMergedCashflowGroups,
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mocks.ensurePersonalizedItem,
}));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mocks.recomputeEvolucaoSnapshotsSafe,
}));
vi.mock('@/services/cashflow/orcamentoAlertas', () => ({
  checkOrcamentoAlertasSafe: mocks.checkOrcamentoAlertasSafe,
}));
vi.mock('@/services/changeHistory', () => ({ recordChange: mocks.recordChange }));

import {
  aplicarProposta,
  assinarProposta,
  linhasEditaveis,
  montarProposta,
  pontuarLinha,
  resolverLinha,
  verificarProposta,
  type Proposta,
} from '../lancamento';
import type { CashflowGroup } from '@/types/cashflow';

process.env.ASSISTENTE_SECRET ??= 'segredo-de-teste';

const grupos = [
  {
    id: 'g-desp',
    userId: null,
    name: 'Despesas',
    type: 'despesa',
    parentId: null,
    orderIndex: 0,
    items: [],
    children: [
      {
        id: 'g-hab',
        userId: null,
        name: 'Habitação',
        type: 'despesa',
        parentId: 'g-desp',
        orderIndex: 0,
        children: [],
        items: [
          {
            id: 'i-super',
            userId: null,
            groupId: 'g-hab',
            name: 'Supermercado',
            significado: null,
            rank: null,
            values: [
              { id: 'v', itemId: 'i-super', userId: 'u1', year: 2026, month: 8, value: 1020 },
            ],
          },
          {
            id: 'i-luz',
            userId: null,
            groupId: 'g-hab',
            name: 'Energia elétrica',
            significado: null,
            rank: null,
            values: [],
          },
          {
            id: 'i-sonho',
            userId: 'u1',
            groupId: 'g-hab',
            name: 'Viagem (sonho)',
            significado: null,
            rank: null,
            values: [],
            objetivoId: 'obj-1',
          },
          { id: 'i-gas', userId: null, groupId: 'g-hab', name: 'Gás', values: [] },
          { id: 'i-outros-hab', userId: null, groupId: 'g-hab', name: 'Outros', values: [] },
        ],
      },
      {
        id: 'g-transp',
        userId: null,
        name: 'Transporte',
        type: 'despesa',
        parentId: 'g-desp',
        orderIndex: 1,
        children: [],
        items: [
          { id: 'i-comb', userId: null, groupId: 'g-transp', name: 'Combustível', values: [] },
          { id: 'i-outros-transp', userId: null, groupId: 'g-transp', name: 'Outros', values: [] },
          {
            id: 'i-oculta',
            userId: null,
            groupId: 'g-transp',
            name: 'Pneu',
            values: [],
            hidden: true,
          },
        ],
      },
    ],
  },
  {
    id: 'g-ent',
    userId: null,
    name: 'Entradas',
    type: 'entrada',
    parentId: null,
    orderIndex: 1,
    children: [],
    items: [
      {
        id: 'i-sal',
        userId: null,
        groupId: 'g-ent',
        name: 'Salário',
        significado: null,
        rank: null,
        values: [],
      },
    ],
  },
  {
    id: 'g-inv',
    userId: null,
    name: 'Investimentos',
    type: 'investimento',
    parentId: null,
    orderIndex: 2,
    children: [],
    items: [
      {
        id: 'i-inv',
        userId: null,
        groupId: 'g-inv',
        name: 'Supermercado',
        significado: null,
        rank: null,
        values: [],
      },
    ],
  },
] as unknown as CashflowGroup[];

describe('resolução de linha', () => {
  it('só considera linhas de entrada/despesa sem espelho de sonho ou dívida', () => {
    const ids = linhasEditaveis(grupos).map((l) => l.itemId);
    expect(ids).toEqual([
      'i-super',
      'i-luz',
      'i-gas',
      'i-outros-hab',
      'i-comb',
      'i-outros-transp',
      'i-sal',
    ]);
  });

  it('pontua igual > prefixo > contém > tokens', () => {
    expect(pontuarLinha('supermercado', 'Supermercado')).toBe(100);
    expect(pontuarLinha('super', 'Supermercado')).toBe(85);
    expect(pontuarLinha('mercado', 'Supermercado')).toBe(70);
    expect(pontuarLinha('conta de luz elétrica', 'Energia elétrica')).toBeGreaterThan(0);
    expect(pontuarLinha('gasolina', 'Supermercado')).toBe(0);
  });

  it('linha curta só casa com o pedido em palavra inteira ("gás" ≠ "gasolina")', () => {
    // Bug de prod 10/09: "Gasolina, em transporte" caiu em "Gás" (Habitação).
    expect(pontuarLinha('gasolina', 'Gás')).toBe(0);
    expect(pontuarLinha('gás de cozinha', 'Gás')).toBe(85);
    expect(pontuarLinha('conta do gás', 'Gás')).toBe(70);
    expect(pontuarLinha('supermercado extra', 'Supermercado')).toBe(85);
  });

  it('escolhe a melhor linha do tipo certo e lista alternativas', () => {
    const r = resolverLinha(grupos, 'mercado', 'despesa');
    expect(r.melhor?.itemId).toBe('i-super');
    expect(r.melhor?.grupoNome).toBe('Despesas > Habitação');
    expect(resolverLinha(grupos, 'mercado', 'entrada').melhor).toBeNull();
    expect(resolverLinha(grupos, 'gasolina', 'despesa')).toEqual({
      melhor: null,
      alternativas: [],
    });
  });

  it('grupo informado desempata nomes repetidos e não substitui a linha', () => {
    expect(resolverLinha(grupos, 'Outros', 'despesa', 'Transporte').melhor?.itemId).toBe(
      'i-outros-transp',
    );
    expect(resolverLinha(grupos, 'Outros', 'despesa', 'Habitação').melhor?.itemId).toBe(
      'i-outros-hab',
    );
    // Grupo certo com linha errada não vira "melhor": o bônus não supera o mínimo de nome.
    const r = resolverLinha(grupos, 'gasolina', 'despesa', 'Transporte');
    expect(r.melhor).toBeNull();
    expect(r.alternativas.map((a) => a.itemId)).toEqual(['i-comb', 'i-outros-transp']);
    // Grupo errado não impede achar a linha certa pelo nome.
    expect(resolverLinha(grupos, 'Combustível', 'despesa', 'Habitação').melhor?.itemId).toBe(
      'i-comb',
    );
  });
});

describe('montarProposta', () => {
  beforeEach(() => {
    mocks.getMergedCashflowGroups.mockReset().mockResolvedValue(grupos);
  });

  it('soma na célula do mês atual da linha encontrada e assina', async () => {
    const r = await montarProposta('u1', 'msg-1', {
      tipo: 'despesa',
      linha: 'mercado',
      valor: 45.9,
      mes: 8,
      ano: 2026,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta).toMatchObject({
      itemId: 'i-super',
      itemNome: 'Supermercado',
      valor: 45.9,
      valorAtual: 1020,
      valorNovo: 1065.9,
      mes: 8,
      ano: 2026,
      userId: 'u1',
      mensagemId: 'msg-1',
    });
    expect(verificarProposta(r.token, 'u1')).toMatchObject({ id: r.proposta.id });
  });

  it('rejeita valor inválido e linha inexistente', async () => {
    expect(
      await montarProposta('u1', 'm', { tipo: 'despesa', linha: 'mercado', valor: -1 }),
    ).toMatchObject({ ok: false });
    const r = await montarProposta('u1', 'm', { tipo: 'despesa', linha: 'gasolina', valor: 10 });
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('gasolina') });
  });
});

describe('assinatura', () => {
  const originalSecret = process.env.ASSISTENTE_SECRET;
  beforeEach(() => {
    process.env.ASSISTENTE_SECRET = 'segredo-de-teste';
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.ASSISTENTE_SECRET;
    else process.env.ASSISTENTE_SECRET = originalSecret;
  });

  const base: Proposta = {
    id: 'p1',
    mensagemId: 'm1',
    userId: 'u1',
    itemId: 'i',
    itemNome: 'X',
    grupoNome: 'G',
    tipo: 'despesa',
    valor: 10,
    mes: 0,
    ano: 2026,
    descricao: null,
    valorAtual: 0,
    valorNovo: 10,
    expiraEm: Date.now() + 60_000,
  };

  it('recusa token adulterado, de outro usuário ou expirado', () => {
    const token = assinarProposta(base);
    expect(verificarProposta(token, 'u1')?.id).toBe('p1');
    expect(verificarProposta(token.slice(0, -2) + 'zz', 'u1')).toBeNull();
    expect(verificarProposta(token, 'u2')).toBeNull();
    expect(
      verificarProposta(assinarProposta({ ...base, expiraEm: Date.now() - 1 }), 'u1'),
    ).toBeNull();
    expect(verificarProposta('lixo', 'u1')).toBeNull();
  });
});

describe('aplicarProposta', () => {
  const auth = {
    payload: { id: 'u1', email: 'a@b.c', role: 'user' as const },
    targetUserId: 'u1',
    actingClient: null,
  };
  const request = { headers: new Headers() } as unknown as NextRequest;
  const proposta: Proposta = {
    id: 'p1',
    mensagemId: 'm1',
    userId: 'u1',
    itemId: 'i-super',
    itemNome: 'Supermercado',
    grupoNome: 'Despesas > Habitação',
    tipo: 'despesa',
    valor: 45.9,
    mes: 8,
    ano: 2026,
    descricao: 'pão',
    valorAtual: 1020,
    valorNovo: 1065.9,
    expiraEm: Date.now() + 60_000,
  };

  beforeEach(() => {
    mocks.ensurePersonalizedItem
      .mockReset()
      .mockResolvedValue({ itemId: 'i-super-user', item: {} });
    mocks.prisma.cashflowValue.findUnique.mockReset();
    mocks.prisma.cashflowValue.upsert.mockReset().mockResolvedValue({});
    mocks.recordChange.mockReset();
    mocks.recomputeEvolucaoSnapshotsSafe.mockReset();
    mocks.checkOrcamentoAlertasSafe.mockReset();
  });

  it('soma ao valor ATUAL do banco (não ao da proposta), carimba o comentário e registra histórico desfazível', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({
      value: 1030,
      comment: 'antigo',
      formula: '=1000+30',
    });
    const r = await aplicarProposta(auth, request, proposta);
    expect(r).toEqual({ itemId: 'i-super-user', valorAnterior: 1030, valorNovo: 1075.9 });

    const upsert = mocks.prisma.cashflowValue.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({
      itemId_userId_year_month: { itemId: 'i-super-user', userId: 'u1', year: 2026, month: 8 },
    });
    expect(upsert.update).toMatchObject({ value: 1075.9, formula: null });
    expect(upsert.update.comment).toBe('antigo\nGasto de R$ 45,90 — pão (assistente)');

    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'fluxo-caixa',
        action: 'valor.editar',
        entityId: 'i-super-user',
        changes: [expect.objectContaining({ field: 'monthlyValue', before: 1030, after: 1075.9 })],
        snapshot: expect.objectContaining({
          kind: 'cashflow-valor',
          data: { value: 1030 },
          meta: expect.objectContaining({
            itemId: 'i-super-user',
            year: 2026,
            month: 8,
            origem: 'assistente',
          }),
        }),
      }),
    );
    expect(mocks.recomputeEvolucaoSnapshotsSafe).toHaveBeenCalledWith('u1', new Date(2026, 8, 1));
    expect(mocks.checkOrcamentoAlertasSafe).toHaveBeenCalledWith('u1');
  });

  it('célula inexistente: cria com o valor e guarda before=null para o desfazer remover a célula', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue(null);
    const r = await aplicarProposta(auth, request, { ...proposta, descricao: null });
    expect(r).toEqual({ itemId: 'i-super-user', valorAnterior: 0, valorNovo: 45.9 });
    const upsert = mocks.prisma.cashflowValue.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({ value: 45.9, comment: 'Gasto de R$ 45,90 (assistente)' });
    const change = mocks.recordChange.mock.calls[0][0];
    expect(change.changes[0].before).toBeNull();
    expect(change.snapshot.data).toEqual({ value: null });
  });
});
