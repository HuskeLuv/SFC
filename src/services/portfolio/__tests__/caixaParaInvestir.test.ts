import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; userId: string; metric: string; value: number };

const { db, mockPrisma, mockDeleteCache } = vi.hoisted(() => {
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
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ dashboardData })),
  };
  return { db, mockPrisma, mockDeleteCache: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: mockDeleteCache }));

import {
  CAIXA_ABA_KEYS,
  CAIXA_METRICS,
  computeCaixaResumo,
  loadCaixaResumo,
  salvarCaixaAba,
  salvarCaixaTotal,
} from '../caixaParaInvestir';

const USER = 'user-1';
const seed = (values: Record<string, number>) => {
  db.rows = Object.entries(values).map(([metric, value], i) => ({
    id: `seed-${i}`,
    userId: USER,
    metric,
    value,
  }));
};
const valueOf = (metric: string) => db.rows.find((r) => r.metric === metric)?.value;

beforeEach(() => {
  db.rows = [];
  vi.clearAllMocks();
});

describe('computeCaixaResumo', () => {
  it('cobre o consolidado + as 10 abas', () => {
    expect(CAIXA_ABA_KEYS).toHaveLength(10);
    expect(CAIXA_METRICS).toHaveLength(11);
  });

  it('total = bolso, reservado = Σ abas, livre = total − reservado', () => {
    const resumo = computeCaixaResumo([
      { metric: 'caixa_para_investir_consolidado', value: 10000 },
      { metric: 'caixa_para_investir_acoes', value: 4000 },
      { metric: 'caixa_para_investir_fii', value: 2500.5 },
    ]);
    expect(resumo.total).toBe(10000);
    expect(resumo.reservado).toBe(6500.5);
    expect(resumo.livre).toBe(3499.5);
    expect(resumo.bolso).toBe(10000);
    expect(resumo.porAba.acoes).toBe(4000);
    expect(resumo.porAba.rendaFixa).toBe(0);
  });

  it('dado legado com reservas acima do total: livre negativo, bolso = reservado', () => {
    const resumo = computeCaixaResumo([
      { metric: 'caixa_para_investir_consolidado', value: 1000 },
      { metric: 'caixa_para_investir_etf', value: 3000 },
    ]);
    expect(resumo.livre).toBe(-2000);
    expect(resumo.bolso).toBe(3000);
  });

  it('ignora métricas que não são de caixa e trata null como zero', () => {
    const resumo = computeCaixaResumo([
      { metric: 'meta_patrimonio', value: 999999 },
      { metric: 'caixa_para_investir_consolidado', value: null },
    ]);
    expect(resumo.total).toBe(0);
    expect(resumo.reservado).toBe(0);
  });
});

describe('salvarCaixaAba', () => {
  it('grava a reserva quando cabe no total', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_fii: 3000 });

    const result = await salvarCaixaAba(USER, 'acoes', 7000);

    expect(result).toEqual({ ok: true, valorAnterior: null });
    expect(valueOf('caixa_para_investir_acoes')).toBe(7000);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(10000);
    expect(mockDeleteCache).toHaveBeenCalledWith('carteiraResumo', `${USER}:`);
  });

  it('recusa quando a soma das reservas passaria do total', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_fii: 3000 });

    const result = await salvarCaixaAba(USER, 'acoes', 7000.01);

    expect(result).toEqual({
      ok: false,
      code: 'RESERVA_EXCEDE_TOTAL',
      total: 10000,
      reservadoOutrasAbas: 3000,
      maximoAba: 7000,
      totalNecessario: 10000.01,
    });
    expect(valueOf('caixa_para_investir_acoes')).toBeUndefined();
    expect(mockDeleteCache).not.toHaveBeenCalled();
  });

  it('com ajustarTotal sobe o total até caber e devolve o total anterior', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_fii: 3000 });

    const result = await salvarCaixaAba(USER, 'acoes', 9000, { ajustarTotal: true });

    expect(result).toEqual({
      ok: true,
      valorAnterior: null,
      totalAjustado: { anterior: 10000, novo: 12000 },
    });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(12000);
    const resumo = await loadCaixaResumo(USER);
    expect(resumo.livre).toBe(0);
  });

  it('reduzir a reserva é sempre permitido, mesmo com dado legado inconsistente', async () => {
    seed({ caixa_para_investir_consolidado: 1000, caixa_para_investir_etf: 3000 });

    const result = await salvarCaixaAba(USER, 'etf', 2000);

    expect(result).toEqual({ ok: true, valorAnterior: 3000 });
    expect(valueOf('caixa_para_investir_etf')).toBe(2000);
  });
});

describe('salvarCaixaTotal', () => {
  it('grava o total e devolve null quando a métrica não existia', async () => {
    const result = await salvarCaixaTotal(USER, 5000);
    expect(result).toEqual({ ok: true, valorAnterior: null });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(5000);
  });

  it('recusa baixar o total para menos do que as abas já reservam', async () => {
    seed({
      caixa_para_investir_consolidado: 10000,
      caixa_para_investir_acoes: 4000,
      caixa_para_investir_fii: 2000,
    });

    const result = await salvarCaixaTotal(USER, 5999.99);

    expect(result).toEqual({ ok: false, code: 'TOTAL_ABAIXO_DAS_RESERVAS', reservado: 6000 });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(10000);
  });

  it('aceita baixar até exatamente o reservado', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_acoes: 4000 });
    const result = await salvarCaixaTotal(USER, 4000);
    expect(result).toEqual({ ok: true, valorAnterior: 10000 });
  });

  it('dado legado: aumentar o total é permitido mesmo ainda abaixo das reservas', async () => {
    seed({ caixa_para_investir_consolidado: 1000, caixa_para_investir_etf: 3000 });
    const result = await salvarCaixaTotal(USER, 2000);
    expect(result).toEqual({ ok: true, valorAnterior: 1000 });
  });
});
