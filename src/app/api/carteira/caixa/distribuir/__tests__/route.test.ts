import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = { id: string; userId: string; metric: string; value: number };

const { db, mockPrisma } = vi.hoisted(() => {
  const db: { rows: Row[] } = { rows: [] };
  const dashboardData = {
    findMany: vi.fn(async ({ where }: { where: { userId: string; metric: { in: string[] } } }) =>
      db.rows.filter((r) => r.userId === where.userId && where.metric.in.includes(r.metric)),
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { userId: string; metric: string } }) =>
        db.rows.find((r) => r.userId === where.userId && r.metric === where.metric) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { value: number } }) => {
      const row = db.rows.find((r) => r.id === where.id)!;
      row.value = data.value;
      return row;
    }),
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { id: `row-${db.rows.length + 1}`, ...data };
      db.rows.push(row);
      return row;
    }),
  };
  const mockPrisma = {
    dashboardData,
    // Histórico de alterações (recordChange importa prisma como default export).
    userChangeLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ dashboardData })),
  };
  return { db, mockPrisma };
});

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { POST } from '../route';

const auth = {
  payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};

const post = (body: object) =>
  new NextRequest('http://localhost/api/carteira/caixa/distribuir', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const valueOf = (metric: string) => db.rows.find((r) => r.metric === metric)?.value;

describe('POST /api/carteira/caixa/distribuir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue(auth);
    db.rows = [
      { id: 't', userId: 'user-1', metric: 'caixa_para_investir_consolidado', value: 5000 },
      { id: 'a', userId: 'user-1', metric: 'caixa_para_investir_acoes', value: 1000 },
    ];
  });

  it('move o livre para as reservas e grava uma entrada no histórico', async () => {
    const res = await POST(post({ porAba: { acoes: 1500, fii: 500 } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, porAba: { acoes: 1500, fii: 500 } });
    expect(valueOf('caixa_para_investir_acoes')).toBe(2500);
    expect(valueOf('caixa_para_investir_fii')).toBe(500);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(5000);

    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.userChangeLog.create.mock.calls[0][0];
    expect(data.action).toBe('caixa-investir.distribuir');
    expect(data.changes).toEqual([
      { field: 'acoes', label: 'Reserva de Ações', before: 1000, after: 2500, format: 'currency' },
      { field: 'fii', label: 'Reserva de FIIs', before: 0, after: 500, format: 'currency' },
    ]);
    expect(data.snapshot).toEqual({
      v: 1,
      kind: 'caixa-distribuicao',
      data: { porAba: { acoes: 1500, fii: 500 } },
    });
  });

  it('409 quando o plano não cabe mais no livre', async () => {
    const res = await POST(post({ porAba: { fii: 4500 } }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('LIVRE_INSUFICIENTE');
    expect(body.livre).toBe(4000);
    expect(valueOf('caixa_para_investir_fii')).toBeUndefined();
    expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
  });

  it('400 para aba desconhecida, valor negativo ou plano vazio', async () => {
    expect((await POST(post({ porAba: { bitcoin: 10 } }))).status).toBe(400);
    expect((await POST(post({ porAba: { acoes: -1 } }))).status).toBe(400);
    expect((await POST(post({ porAba: { acoes: 0 } }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
