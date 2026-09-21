import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Provento = {
  id: string;
  userId: string;
  dismissed: boolean;
  dataPagamento: Date;
  valorTotal: number;
  impostoRenda: number | null;
  caixaCreditadoEm: Date | null;
  caixaCreditadoValor: number | null;
  currency: string;
};

const { db, mockPrisma, mockCreditar, mockGetIndicator, mockRecord } = vi.hoisted(() => {
  const db: {
    users: Array<{ id: string; caixaProventosDesde: Date | null }>;
    proventos: Provento[];
  } = { users: [], proventos: [] };
  const portfolioProvento = {
    findMany: vi.fn(
      async ({ where }: { where: { userId: string; dataPagamento: { gte: Date; lte: Date } } }) =>
        db.proventos
          .filter(
            (p) =>
              p.userId === where.userId &&
              !p.dismissed &&
              p.caixaCreditadoEm === null &&
              p.dataPagamento >= where.dataPagamento.gte &&
              p.dataPagamento <= where.dataPagamento.lte,
          )
          .map((p) => ({
            id: p.id,
            valorTotal: p.valorTotal,
            impostoRenda: p.impostoRenda,
            portfolio: { asset: { currency: p.currency } },
          })),
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { caixaCreditadoEm: Date; caixaCreditadoValor: number };
      }) => {
        const p = db.proventos.find((x) => x.id === where.id && x.caixaCreditadoEm === null);
        if (!p) return { count: 0 };
        Object.assign(p, data);
        return { count: 1 };
      },
    ),
  };
  const user = {
    findMany: vi.fn(async ({ where }: { where: { caixaProventosDesde: { lte: Date } } }) =>
      db.users.filter(
        (u) => u.caixaProventosDesde && u.caixaProventosDesde <= where.caixaProventosDesde.lte,
      ),
    ),
    update: vi.fn(),
    findUnique: vi.fn(),
  };
  const mockPrisma = {
    user,
    portfolioProvento,
    dashboardData: {
      findMany: vi.fn(async () => [{ metric: 'caixa_para_investir_consolidado', value: 1500 }]),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };
  return {
    db,
    mockPrisma,
    mockCreditar: vi.fn(async (_tx: unknown, _userId: string, valor: number) => ({
      aba: null,
      valorOperacao: valor,
      debitoReserva: 0,
      debitoLivre: 0,
      credito: valor,
      deltaTotal: valor,
    })),
    mockGetIndicator: vi.fn(),
    mockRecord: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: mockGetIndicator }));
vi.mock('@/services/portfolio/caixaParaInvestir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portfolio/caixaParaInvestir')>()),
  creditarCaixa: mockCreditar,
  invalidateCaixaCaches: vi.fn(),
}));
vi.mock('@/services/changeHistory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/changeHistory')>()),
  recordChange: mockRecord,
}));

import { creditarProventosNoCaixa, definirCaixaProventos, hojeBrasilUtc } from '../caixaProventos';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOJE = d('2026-09-21');
const provento = (over: Partial<Provento>): Provento => ({
  id: `p-${db.proventos.length + 1}`,
  userId: 'u1',
  dismissed: false,
  dataPagamento: d('2026-09-15'),
  valorTotal: 100,
  impostoRenda: null,
  caixaCreditadoEm: null,
  caixaCreditadoValor: null,
  currency: 'BRL',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.users = [{ id: 'u1', caixaProventosDesde: d('2026-09-10') }];
  db.proventos = [];
});

describe('hojeBrasilUtc', () => {
  it('usa a data de Brasília: 01h UTC ainda é o dia anterior', () => {
    expect(hojeBrasilUtc(new Date('2026-09-22T01:00:00Z'))).toEqual(d('2026-09-21'));
    expect(hojeBrasilUtc(new Date('2026-09-22T12:00:00Z'))).toEqual(d('2026-09-22'));
  });
});

describe('definirCaixaProventos', () => {
  it('ligar grava hoje; desligar grava null', async () => {
    await definirCaixaProventos('u1', true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { caixaProventosDesde: hojeBrasilUtc() },
    });
    await definirCaixaProventos('u1', false);
    expect(mockPrisma.user.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { caixaProventosDesde: null },
    });
  });
});

describe('creditarProventosNoCaixa', () => {
  it('credita só o que foi pago entre a data de ativação e hoje, líquido de IR', async () => {
    db.proventos = [
      provento({ id: 'antes', dataPagamento: d('2026-09-09'), valorTotal: 999 }),
      provento({ id: 'div', valorTotal: 100 }),
      provento({ id: 'jcp', valorTotal: 200, impostoRenda: 35 }),
      provento({ id: 'futuro', dataPagamento: d('2026-09-30'), valorTotal: 50 }),
      provento({ id: 'excluido', dismissed: true, valorTotal: 70 }),
    ];
    const r = await creditarProventosNoCaixa({ hoje: HOJE });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ userId: 'u1', proventos: 2, valor: 265 });
    expect(mockCreditar).toHaveBeenCalledWith(mockPrisma, 'u1', 265);
    const marcado = (id: string) => db.proventos.find((p) => p.id === id)!.caixaCreditadoValor;
    expect(marcado('div')).toBe(100);
    expect(marcado('jcp')).toBe(165);
    expect(marcado('antes')).toBeNull();
    expect(marcado('futuro')).toBeNull();
  });

  it('é idempotente: rodar de novo não credita o que já entrou', async () => {
    db.proventos = [provento({ valorTotal: 100 })];
    await creditarProventosNoCaixa({ hoje: HOJE });
    const segunda = await creditarProventosNoCaixa({ hoje: HOJE });
    expect(segunda).toEqual([]);
    expect(mockCreditar).toHaveBeenCalledTimes(1);
  });

  it('provento em dólar entra em reais pela cotação do dia (buscada uma vez)', async () => {
    mockGetIndicator.mockResolvedValue({ price: 5.2 });
    db.proventos = [
      provento({ id: 'o', currency: 'USD', valorTotal: 10 }),
      provento({ id: 'spg', currency: 'USD', valorTotal: 20 }),
    ];
    const r = await creditarProventosNoCaixa({ hoje: HOJE });
    expect(r[0].valor).toBe(156);
    expect(mockGetIndicator).toHaveBeenCalledTimes(1);
  });

  it('dólar sem cotação e outras moedas ficam pendentes', async () => {
    mockGetIndicator.mockRejectedValue(new Error('fora do ar'));
    db.proventos = [
      provento({ id: 'usd', currency: 'USD', valorTotal: 10 }),
      provento({ id: 'eur', currency: 'EUR', valorTotal: 10 }),
    ];
    expect(await creditarProventosNoCaixa({ hoje: HOJE })).toEqual([]);
    expect(db.proventos.every((p) => p.caixaCreditadoEm === null)).toBe(true);
    expect(mockCreditar).not.toHaveBeenCalled();
  });

  it('usuário com a opção desligada ou ligada depois de hoje não recebe nada', async () => {
    db.users = [
      { id: 'u1', caixaProventosDesde: null },
      { id: 'u2', caixaProventosDesde: d('2026-09-25') },
    ];
    db.proventos = [provento({}), provento({ userId: 'u2' })];
    expect(await creditarProventosNoCaixa({ hoje: HOJE })).toEqual([]);
  });

  it('com request, registra uma entrada no histórico por usuário (desfazível)', async () => {
    db.proventos = [provento({ valorTotal: 100 }), provento({ valorTotal: 50 })];
    const request = new NextRequest('http://localhost/api/cron/brapi-sync/dividends');
    await creditarProventosNoCaixa({ hoje: HOJE, request });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const arg = mockRecord.mock.calls[0][0];
    expect(arg).toMatchObject({
      action: 'caixa-investir.proventos',
      entityLabel: '2 proventos',
      auth: { targetUserId: 'u1', payload: { id: 'u1' }, actingClient: null },
      snapshot: { kind: 'caixa-movimento', data: expect.objectContaining({ credito: 150 }) },
    });
    // total atual 1500 (mock) − 150 creditados = 1350 antes
    expect(arg.changes).toEqual([
      expect.objectContaining({ field: 'caixaParaInvestir', before: 1350, after: 1500 }),
    ]);
  });
});
