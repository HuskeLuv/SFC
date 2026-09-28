import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';

/**
 * Banco de mentira só com as células do fluxo (chave item×usuário×ano×mês), para a gravação e o
 * desfazer rodarem de ponta a ponta sobre o mesmo estado.
 */
const db = vi.hoisted(() => {
  type Row = {
    id: string;
    itemId: string;
    userId: string;
    year: number;
    month: number;
    value: number;
    comment: string | null;
    formula: string | null;
  };
  const rows = new Map<string, Row>();
  const key = (w: { itemId: string; userId: string; year: number; month: number }) =>
    `${w.itemId}|${w.userId}|${w.year}|${w.month}`;
  let seq = 0;
  const cashflowValue = {
    findUnique: vi.fn(async ({ where }) => rows.get(key(where.itemId_userId_year_month)) ?? null),
    findFirst: vi.fn(async ({ where }) => rows.get(key(where)) ?? null),
    upsert: vi.fn(async ({ where, create, update }) => {
      const k = key(where.itemId_userId_year_month);
      const atual = rows.get(k);
      const row = atual
        ? { ...atual, ...update }
        : { id: `v${++seq}`, comment: null, formula: null, ...create };
      rows.set(k, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }) => {
      for (const [k, r] of rows) if (r.id === where.id) rows.set(k, { ...r, ...data });
    }),
    create: vi.fn(async ({ data }) => {
      rows.set(key(data), { id: `v${++seq}`, comment: null, formula: null, ...data });
    }),
    delete: vi.fn(async ({ where }) => {
      for (const [k, r] of rows) if (r.id === where.id) rows.delete(k);
    }),
  };
  const prisma = {
    cashflowValue,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { rows, key, prisma };
});

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
  getMergedCashflowGroups: vi.fn(),
  ensurePersonalizedItem: vi.fn(),
  recordChange: vi.fn(),
  recomputeEvolucaoSnapshotsSafe: vi.fn(),
  checkOrcamentoAlertasSafe: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mocks.logSensitiveEndpointAccess,
}));
vi.mock('@/lib/prisma', () => ({ prisma: db.prisma, default: db.prisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mocks.getMergedCashflowGroups,
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mocks.ensurePersonalizedItem,
}));
vi.mock('@/services/changeHistory', () => ({ recordChange: mocks.recordChange }));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mocks.recomputeEvolucaoSnapshotsSafe,
}));
vi.mock('@/services/cashflow/orcamentoAlertas', () => ({
  checkOrcamentoAlertasSafe: mocks.checkOrcamentoAlertasSafe,
}));
vi.mock('@/services/assistente/contexto', () => ({
  round: (n: number) => Math.round(n * 100) / 100,
  invalidarContextoUsuario: vi.fn(),
}));

import { POST } from '../route';
import { FLUXO_CAIXA_UNDO_HANDLERS } from '@/services/changeHistory/undo/handlers/fluxoCaixa';

const USER = 'user-1';

/** Árvore mesclada: Supermercado é template (vira override na 1ª escrita). */
const tree = () => [
  {
    id: 'g-desp',
    name: 'Despesas',
    type: 'despesa',
    items: [],
    children: [
      {
        id: 'g-alim',
        name: 'Alimentação',
        type: 'despesa',
        children: [],
        items: [
          {
            id: 'tpl-super',
            name: 'Supermercado',
            values: [...db.rows.values()]
              .filter((r) => r.itemId === 'user-super')
              .map((r) => ({ year: r.year, month: r.month, value: r.value, formula: r.formula })),
          },
          { id: 'i-sonho', name: 'Viagem', values: [], objetivoId: 'obj-1' },
          { id: 'i-divida', name: 'Financiamento', values: [], dividaId: 'div-1' },
        ],
      },
    ],
  },
  {
    id: 'g-inv',
    name: 'Investimentos',
    type: 'investimento',
    children: [],
    items: [{ id: 'i-aporte', name: 'Aporte', values: [] }],
  },
];

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/lancamento-rapido', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const seedCell = (
  month: number,
  value: number,
  extra: { formula?: string; comment?: string } = {},
) =>
  db.rows.set(db.key({ itemId: 'user-super', userId: USER, year: 2026, month }), {
    id: `seed-${month}`,
    itemId: 'user-super',
    userId: USER,
    year: 2026,
    month,
    value,
    comment: extra.comment ?? null,
    formula: extra.formula ?? null,
  });
const cell = (month: number) =>
  db.rows.get(db.key({ itemId: 'user-super', userId: USER, year: 2026, month }));

const base = { itemId: 'tpl-super', valor: 45.9, ano: 2026, mes: 8 };

beforeEach(() => {
  vi.clearAllMocks();
  db.rows.clear();
  mocks.requireAuthWithActing.mockResolvedValue(mockAuthAsUser(USER));
  // A árvore é montada na hora (reflete o que já foi gravado no "banco").
  mocks.getMergedCashflowGroups.mockImplementation(async () => tree());
  mocks.ensurePersonalizedItem.mockResolvedValue({ itemId: 'user-super', item: {} });
  mocks.recordChange.mockResolvedValue('log-9');
});

describe('POST /api/cashflow/lancamento-rapido — validação', () => {
  it.each([
    ['campo extra', { ...base, extra: 1 }],
    ['modo enviado', { ...base, modo: 'definir' }],
    ['mesFim sem recorrente', { ...base, mesFim: 11 }],
    ['mesFim antes do mês', { ...base, recorrente: true, mesFim: 3 }],
    ['valor zero', { ...base, valor: 0 }],
    ['valor negativo', { ...base, valor: -5 }],
    ['mês fora de 0..11', { ...base, mes: 12 }],
    ['ano fora de 2000..2100', { ...base, ano: 1999 }],
    ['descrição longa', { ...base, descricao: 'x'.repeat(201) }],
  ])('400 com %s', async (_nome, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(db.prisma.cashflowValue.upsert).not.toHaveBeenCalled();
  });

  it('400 com JSON inválido', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/cashflow/lancamento-rapido', {
        method: 'POST',
        body: '{',
      }),
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ['sonho', 'i-sonho'],
    ['dívida', 'i-divida'],
    ['investimento', 'i-aporte'],
    ['fora da árvore do usuário', 'item-de-outro-usuario'],
  ])('422 para linha de %s', async (_nome, itemId) => {
    const res = await POST(req({ ...base, itemId, confirmar: true }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Linha não encontrada ou não editável.' });
    expect(db.prisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(mocks.recordChange).not.toHaveBeenCalled();
  });

  it('401 sem sessão', async () => {
    mocks.requireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const res = await POST(req(base));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/cashflow/lancamento-rapido — prévia', () => {
  it('confirmar=false devolve a prévia (soma) sem escrever nada', async () => {
    seedCell(8, 1020, { formula: '=1000+20' });
    const res = await POST(req(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      previa: {
        itemId: 'tpl-super',
        itemNome: 'Supermercado',
        trilha: 'Despesas > Alimentação',
        tipo: 'despesa',
        ano: 2026,
        valor: 45.9,
        modo: 'somar',
        celulas: [
          { mes: 8, valorAtual: 1020, valorNovo: 1065.9, diminui: false, temFormula: true },
        ],
      },
    });
    expect(db.prisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.ensurePersonalizedItem).not.toHaveBeenCalled();
    expect(mocks.recordChange).not.toHaveBeenCalled();
    expect(mocks.logSensitiveEndpointAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: USER }),
      USER,
      null,
      '/api/cashflow/lancamento-rapido',
      'POST',
    );
  });

  it('recorrente: define até mesFim e marca os meses que diminuem', async () => {
    seedCell(9, 1020);
    seedCell(10, 100);
    const res = await POST(req({ ...base, valor: 460, mes: 9, recorrente: true, mesFim: 11 }));
    const body = await res.json();
    expect(body.previa.modo).toBe('definir');
    expect(body.previa.celulas).toEqual([
      { mes: 9, valorAtual: 1020, valorNovo: 460, diminui: true, temFormula: false },
      { mes: 10, valorAtual: 100, valorNovo: 460, diminui: false, temFormula: false },
      { mes: 11, valorAtual: 0, valorNovo: 460, diminui: false, temFormula: false },
    ]);
    expect(db.prisma.cashflowValue.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/cashflow/lancamento-rapido — gravação e desfazer', () => {
  it('único: soma na célula, sem descrição não carimba, registra valor.editar e devolve o changeLogId', async () => {
    seedCell(8, 1020, { comment: 'nota', formula: '=1000+20' });
    const res = await POST(req({ ...base, confirmar: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      changeLogId: 'log-9',
      resultado: {
        itemId: 'user-super',
        grupoNome: 'Despesas > Alimentação',
        celulas: [{ mes: 8, valorAnterior: 1020, valorNovo: 1065.9 }],
      },
    });
    expect(mocks.ensurePersonalizedItem).toHaveBeenCalledWith('tpl-super', USER);
    expect(cell(8)).toMatchObject({ value: 1065.9, formula: null, comment: 'nota' });
    expect(mocks.recordChange).toHaveBeenCalledTimes(1);
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'valor.editar',
        entityLabel: 'Supermercado · setembro/2026 (lançamento rápido)',
        snapshot: expect.objectContaining({
          meta: expect.objectContaining({ origem: 'lancamento-rapido' }),
        }),
      }),
    );
    expect(mocks.recomputeEvolucaoSnapshotsSafe).toHaveBeenCalledWith(USER, new Date(2026, 8, 1));
    expect(mocks.checkOrcamentoAlertasSafe).toHaveBeenCalledWith(USER);
  });

  it('com descrição: carimba o comentário com "(lançamento rápido)"', async () => {
    const res = await POST(req({ ...base, descricao: 'remédio', confirmar: true }));
    expect(res.status).toBe(200);
    expect(cell(8)).toMatchObject({
      value: 45.9,
      comment: 'Gasto de R$ 45,90 — remédio (lançamento rápido)',
    });
  });

  it('409 quando algum mês diminui sem aceitaReducao — nada é gravado', async () => {
    seedCell(9, 1020);
    const res = await POST(
      req({ ...base, valor: 460, mes: 9, recorrente: true, mesFim: 10, confirmar: true }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Alguns meses vão diminuir. Confirme para continuar.');
    expect(body.previa.celulas[0]).toMatchObject({ mes: 9, diminui: true });
    expect(db.prisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(cell(9)?.value).toBe(1020);
  });

  it('recorrente com aceitaReducao: grava UMA entrada valores.editar-recorrente e o desfazer devolve os valores', async () => {
    seedCell(9, 1020);
    seedCell(10, 460);
    const res = await POST(
      req({
        ...base,
        valor: 460,
        mes: 9,
        recorrente: true,
        confirmar: true,
        aceitaReducao: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changeLogId).toBe('log-9');
    expect(cell(9)?.value).toBe(460);
    expect(cell(10)?.value).toBe(460); // já valia 460: intocada
    expect(cell(11)?.value).toBe(460);
    expect(mocks.recordChange).toHaveBeenCalledTimes(1);
    const registro = mocks.recordChange.mock.calls[0][0];
    expect(registro.action).toBe('valores.editar-recorrente');

    // Desfazer: a entrada gravada alimenta o handler de undo do histórico.
    const entry = {
      id: 'log-9',
      userId: USER,
      section: 'fluxo-caixa',
      action: registro.action,
      entityId: registro.entityId,
      changes: registro.changes,
      snapshot: registro.snapshot,
    } as unknown as UserChangeLog;
    const handler = FLUXO_CAIXA_UNDO_HANDLERS['valores.editar-recorrente'];
    expect(handler.precheck!(entry)).toBe(true);
    await handler.execute({
      auth: mockAuthAsUser(USER),
      entry,
      request: req({}),
    } as never);
    expect(cell(9)?.value).toBe(1020);
    expect(cell(10)?.value).toBe(460);
    expect(cell(11)).toBeUndefined();
  });

  it('desfazer do lançamento único restaura o valor anterior', async () => {
    seedCell(8, 1020);
    await POST(req({ ...base, confirmar: true }));
    expect(cell(8)?.value).toBe(1065.9);
    const registro = mocks.recordChange.mock.calls[0][0];
    const entry = {
      id: 'log-9',
      userId: USER,
      section: 'fluxo-caixa',
      action: registro.action,
      entityId: registro.entityId,
      changes: registro.changes,
      snapshot: registro.snapshot,
    } as unknown as UserChangeLog;
    const handler = FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'];
    expect(handler.precheck!(entry)).toBe(true);
    await handler.execute({ auth: mockAuthAsUser(USER), entry, request: req({}) } as never);
    expect(cell(8)?.value).toBe(1020);
  });

  it('consultor personificando pode lançar (histórico com o auth do consultor)', async () => {
    const consultor = mockAuthAsConsultant('consultor-1', USER);
    mocks.requireAuthWithActing.mockResolvedValue(consultor);
    const res = await POST(req({ ...base, confirmar: true }));
    expect(res.status).toBe(200);
    expect(mocks.getMergedCashflowGroups).toHaveBeenCalledWith(USER, 2026);
    expect(mocks.ensurePersonalizedItem).toHaveBeenCalledWith('tpl-super', USER);
    expect(mocks.recordChange).toHaveBeenCalledWith(expect.objectContaining({ auth: consultor }));
    expect(cell(8)?.value).toBe(45.9);
  });

  it('nada a mudar: changeLogId null', async () => {
    seedCell(8, 460);
    const res = await POST(
      req({ ...base, valor: 460, mes: 8, recorrente: true, mesFim: 8, confirmar: true }),
    );
    const body = await res.json();
    expect(body.changeLogId).toBeNull();
    expect(mocks.recordChange).not.toHaveBeenCalled();
  });
});
