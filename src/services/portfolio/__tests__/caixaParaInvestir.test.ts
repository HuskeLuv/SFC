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
const mockTesouroDestino = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/tesouroDestino', () => ({
  getTesouroDestinoByAssetId: mockTesouroDestino,
}));

import {
  CAIXA_ABA_KEYS,
  CAIXA_METRICS,
  computeCaixaResumo,
  creditarCaixa,
  debitarCaixa,
  distribuirCaixaLivre,
  loadCaixaResumo,
  resolverCaixaAba,
  reverterDistribuicaoCaixa,
  reverterMovimentoCaixa,
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

describe('resolverCaixaAba', () => {
  it('classifica pela mesma regra da carteira (categorizarAsset)', async () => {
    expect(await resolverCaixaAba(USER, { symbol: 'PETR4', type: 'stock', currency: 'BRL' })).toBe(
      'acoes',
    );
    expect(await resolverCaixaAba(USER, { symbol: 'AAPL', type: 'stock', currency: 'USD' })).toBe(
      'stocks',
    );
    expect(await resolverCaixaAba(USER, { symbol: 'IVVB11', type: 'bdr', currency: 'BRL' })).toBe(
      'acoes',
    );
    expect(await resolverCaixaAba(USER, { symbol: 'KNRI11', type: 'fii' })).toBe('fii');
    expect(await resolverCaixaAba(USER, { symbol: 'X', type: 'fia' })).toBe('fimFia');
    expect(await resolverCaixaAba(USER, { symbol: 'CDB-1', type: 'bond' })).toBe('rendaFixa');
    expect(await resolverCaixaAba(USER, { symbol: 'PREV', type: 'insurance' })).toBe(
      'previdenciaSeguros',
    );
  });

  it('reservas, conta corrente e imóveis não têm aba', async () => {
    expect(
      await resolverCaixaAba(USER, { symbol: 'RESERVA-EMERG-1', type: 'emergency' }),
    ).toBeNull();
    expect(await resolverCaixaAba(USER, { symbol: 'CC', type: 'cash' })).toBeNull();
    expect(await resolverCaixaAba(USER, { symbol: 'APTO', type: 'imovel' })).toBeNull();
    expect(await resolverCaixaAba(USER, null)).toBeNull();
  });

  it('Tesouro comprado para reserva: destino informado ou lido das compras', async () => {
    const tesouro = { id: 'a-1', symbol: 'TESOURO SELIC 2029', type: 'tesouro-direto' };
    expect(
      await resolverCaixaAba(USER, tesouro, { tesouroDestino: 'reserva-emergencia' }),
    ).toBeNull();

    mockTesouroDestino.mockResolvedValueOnce(new Map([['a-1', 'reserva-oportunidade']]));
    expect(await resolverCaixaAba(USER, tesouro)).toBeNull();

    mockTesouroDestino.mockResolvedValueOnce(new Map());
    expect(await resolverCaixaAba(USER, tesouro)).toBe('rendaFixa');
  });
});

describe('debitarCaixa / creditarCaixa / reverterMovimentoCaixa', () => {
  it('débito: reserva da aba primeiro, depois o livre; total baixa junto', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_renda_fixa: 3000 });

    const mov = await debitarCaixa(mockPrisma, USER, 'rendaFixa', 5000);

    expect(mov).toEqual({
      aba: 'rendaFixa',
      valorOperacao: 5000,
      debitoReserva: 3000,
      debitoLivre: 2000,
      credito: 0,
      deltaTotal: -5000,
    });
    expect(valueOf('caixa_para_investir_renda_fixa')).toBe(0);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(5000);
  });

  it('débito maior que o caixa: desconta só o que existe, total não fica negativo', async () => {
    seed({ caixa_para_investir_consolidado: 1000 });
    const mov = await debitarCaixa(mockPrisma, USER, 'acoes', 5000);
    expect(mov).toMatchObject({ debitoReserva: 0, debitoLivre: 1000, deltaTotal: -1000 });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(0);
  });

  it('dado legado: total zerado com reserva — deltaTotal registra só o que o total mudou', async () => {
    seed({ caixa_para_investir_consolidado: 0, caixa_para_investir_etf: 3000 });
    const mov = await debitarCaixa(mockPrisma, USER, 'etf', 1000);
    expect(mov).toMatchObject({ debitoReserva: 1000, deltaTotal: 0 });

    await reverterMovimentoCaixa(USER, mov);
    // Desfazer devolve a reserva sem inventar dinheiro no total.
    expect(valueOf('caixa_para_investir_etf')).toBe(3000);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(0);
  });

  it('desfazer um débito restaura reserva e total', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_renda_fixa: 3000 });
    const mov = await debitarCaixa(mockPrisma, USER, 'rendaFixa', 5000);
    await reverterMovimentoCaixa(USER, mov);
    expect(valueOf('caixa_para_investir_renda_fixa')).toBe(3000);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(10000);
    expect(mockDeleteCache).toHaveBeenCalledWith('carteiraResumo', `${USER}:`);
  });

  it('crédito do resgate entra no total como livre e o desfazer retira', async () => {
    seed({ caixa_para_investir_consolidado: 2000, caixa_para_investir_fii: 500 });
    const mov = await creditarCaixa(mockPrisma, USER, 1000);
    expect(mov).toMatchObject({ aba: null, credito: 1000, deltaTotal: 1000 });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(3000);
    expect(valueOf('caixa_para_investir_fii')).toBe(500);

    await reverterMovimentoCaixa(USER, mov);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(2000);
  });
});

describe('distribuirCaixaLivre / reverterDistribuicaoCaixa', () => {
  it('move o livre para as reservas sem mexer no total', async () => {
    seed({ caixa_para_investir_consolidado: 10000, caixa_para_investir_acoes: 1000 });
    const result = await distribuirCaixaLivre(USER, { acoes: 2000, fii: 500.25, etf: 0 });
    expect(result).toEqual({
      ok: true,
      porAba: { acoes: 2000, fii: 500.25 },
      anterior: { acoes: 1000, fii: 0 },
    });
    expect(valueOf('caixa_para_investir_consolidado')).toBe(10000);
    expect(valueOf('caixa_para_investir_acoes')).toBe(3000);
    expect(valueOf('caixa_para_investir_fii')).toBe(500.25);
    expect(valueOf('caixa_para_investir_etf')).toBeUndefined();
    expect(mockDeleteCache).toHaveBeenCalledWith('carteiraResumo', `${USER}:`);
  });

  it('recusa quando o plano não cabe mais no livre (caixa mudou depois da prévia)', async () => {
    seed({ caixa_para_investir_consolidado: 5000, caixa_para_investir_acoes: 4000 });
    const result = await distribuirCaixaLivre(USER, { fii: 1500 });
    expect(result).toEqual({ ok: false, code: 'LIVRE_INSUFICIENTE', livre: 1000 });
    expect(valueOf('caixa_para_investir_fii')).toBeUndefined();
    expect(mockDeleteCache).not.toHaveBeenCalled();
  });

  it('aceita distribuir exatamente o livre', async () => {
    seed({ caixa_para_investir_consolidado: 5000, caixa_para_investir_acoes: 4000 });
    const result = await distribuirCaixaLivre(USER, { fii: 600, etf: 400 });
    expect(result.ok).toBe(true);
    expect((await loadCaixaResumo(USER)).livre).toBe(0);
  });

  it('desfazer tira por delta e preserva edições posteriores da reserva', async () => {
    seed({ caixa_para_investir_consolidado: 10000 });
    await distribuirCaixaLivre(USER, { acoes: 2000, fii: 1000 });
    // usuário mexeu na reserva de ações depois (2000 → 2500)
    db.rows.find((r) => r.metric === 'caixa_para_investir_acoes')!.value = 2500;
    // e zerou a de FII — o desfazer não deixa negativa
    db.rows.find((r) => r.metric === 'caixa_para_investir_fii')!.value = 0;

    await reverterDistribuicaoCaixa(USER, { acoes: 2000, fii: 1000 });
    expect(valueOf('caixa_para_investir_acoes')).toBe(500);
    expect(valueOf('caixa_para_investir_fii')).toBe(0);
    expect(valueOf('caixa_para_investir_consolidado')).toBe(10000);
  });
});
