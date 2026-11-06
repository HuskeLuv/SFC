import { beforeEach, describe, expect, it, vi } from 'vitest';

// Escrita no banco: qualquer chamada falha o teste (o relatório é só leitura).
const escritas = vi.hoisted(() => {
  const metodos = [
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
  ] as const;
  const chamadas: string[] = [];
  const modelo = (nome: string, leituras: Record<string, unknown> = {}) => {
    const m: Record<string, unknown> = { ...leituras };
    for (const k of metodos) {
      m[k] = () => {
        chamadas.push(`${nome}.${k}`);
        throw new Error(`escrita proibida: ${nome}.${k}`);
      };
    }
    return m;
  };
  return { chamadas, modelo };
});
const mockOrcadosFindMany = vi.hoisted(() => vi.fn());
const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => {
  const prisma = {
    cashflowOrcamentoItem: escritas.modelo('cashflowOrcamentoItem', {
      findMany: mockOrcadosFindMany,
    }),
    cashflowOrcamentoPrefs: escritas.modelo('cashflowOrcamentoPrefs'),
    cashflowItem: escritas.modelo('cashflowItem'),
    cashflowGroup: escritas.modelo('cashflowGroup'),
    cashflowValue: escritas.modelo('cashflowValue'),
    $transaction: () => {
      escritas.chamadas.push('$transaction');
      throw new Error('escrita proibida: $transaction');
    },
  };
  return { prisma, default: prisma };
});
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: vi.fn(),
}));
vi.mock('@/services/planejamento/aportesMensais', () => ({
  carregarAportesMensais: vi.fn(),
  chaveMesAporte: (y: number, m0: number) => y * 12 + m0,
}));

import type { CashflowGroup } from '@/types/cashflow';
import type { MesOrcamentoRelatorio, MesesRelatorio } from '@/types/relatorioFinanceiro';
import type { OrcadoRow } from '@/services/cashflow/orcamentoV2/montarOrcamento';
import { grupo, item, valor } from '@/test/fixtures/orcamentoAnexoBArvore';
import { criarInsumos, type ContextoMontador, type Insumos } from '../insumos';
import { mesesDaJanela, periodoDoRelatorio } from '../periodo';
import {
  agregarPeriodoOrcamento,
  mesesDaReferencia,
  montarOrcamento,
  referenciaFechada,
} from '../orcamento';

/** 03/11/2026 09:42 em SP. */
const AGORA = new Date('2026-11-03T09:42:00-03:00');

type Mapa = Partial<Record<number, number>>;
const valores = (id: string, mapa: Mapa) =>
  Object.entries(mapa).map(([m, v]) => ({ ...valor(id, Number(m), v ?? 0), id: `v-${id}-${m}` }));

interface CategoriaFake {
  id: string;
  nome: string;
  /** Realizado por mês (0–11) de cada subcategoria. */
  subs: { id: string; nome: string; realizado: Mapa }[];
}

/** Árvore mesclada mínima: Entradas (Salário) + Despesas › categorias. */
function arvore(receita: Mapa, categorias: CategoriaFake[]): CashflowGroup[] {
  return [
    grupo('g-ent', 'Entradas', 'entrada', {
      items: [item('it-sal', 'g-ent', 'Salário', { values: valores('it-sal', receita) })],
    }),
    grupo('g-desp', 'Despesas', 'despesa', {
      children: categorias.map((c, i) =>
        grupo(c.id, c.nome, 'despesa', {
          orderIndex: i,
          items: c.subs.map((s, j) =>
            item(s.id, c.id, s.nome, { orderIndex: j, values: valores(s.id, s.realizado) }),
          ),
        }),
      ),
    }),
  ];
}

const orcado = (itemId: string, ano: number, mes0: number, v: number): OrcadoRow => ({
  itemId,
  ano,
  mes: mes0,
  valor: v,
  pct: null,
});

function ctxCom(
  meses: MesesRelatorio,
  arvores: Record<number, CashflowGroup[]>,
  orcados: OrcadoRow[],
  agora = AGORA,
): ContextoMontador & { insumos: Insumos & { cashflowDoAno: ReturnType<typeof vi.fn> } } {
  const hojeSP = {
    ano: Number(new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 4)),
    mes0: new Date(agora.getTime() - 3 * 3600_000).getUTCMonth(),
    dia: new Date(agora.getTime() - 3 * 3600_000).getUTCDate(),
  };
  const insumos = {
    userId: 'u1',
    agora,
    hojeSP,
    janela: mesesDaJanela(hojeSP, 13),
    inicioJanela: new Date(0),
    cashflowDoAno: vi.fn(async (ano: number) => arvores[ano] ?? []),
    orcadosDosAnos: vi.fn(async () => orcados),
    saudeBase: vi.fn(),
    snapshots13m: vi.fn(),
    performance13m: vi.fn(),
    dividasComPagamentos: vi.fn(),
    aportesMensais13m: vi.fn(),
  } as unknown as Insumos & { cashflowDoAno: ReturnType<typeof vi.fn> };
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, agora),
    mesesDoPeriodo: mesesDaJanela(hojeSP, meses),
    agora,
    hojeSP,
    comConsultor: false,
    insumos,
  };
}

const cat = (m: MesOrcamentoRelatorio, chave: string) => {
  const c = m.categorias.find((x) => x.chave === chave);
  if (!c) throw new Error(`categoria ${chave} ausente em ${m.mes}`);
  return c;
};

// Ano corrente (2026): receita de ago, set e out no Fluxo; novembro ainda sem receita.
const SAUDE_26: CategoriaFake = {
  id: 'cat-saude-26',
  nome: 'Saúde',
  subs: [
    {
      id: 'it-plano-26',
      nome: 'Plano de saúde',
      realizado: { 7: 900, 8: 1_100, 9: 1_000, 10: 600 },
    },
  ],
};
const HAB_26: CategoriaFake = {
  id: 'cat-hab-26',
  nome: 'Habitação',
  subs: [
    { id: 'it-aluguel', nome: 'Aluguel', realizado: { 7: 3_000, 8: 3_000, 9: 3_000, 10: 3_000 } },
  ],
};
const PLAN_26: CategoriaFake = {
  id: 'cat-plan-26',
  nome: 'Planejamento Financeiro',
  subs: [{ id: 'it-reserva', nome: 'Reserva de emergência', realizado: { 9: 2_000, 10: 2_000 } }],
};
const ARVORE_26 = arvore({ 7: 10_000, 8: 11_000, 9: 12_000 }, [SAUDE_26, HAB_26, PLAN_26]);
const ORCADOS_26 = [
  orcado('it-plano-26', 2026, 8, 1_000),
  orcado('it-plano-26', 2026, 9, 800),
  orcado('it-plano-26', 2026, 10, 1_000),
  orcado('it-aluguel', 2026, 8, 3_000),
  orcado('it-aluguel', 2026, 9, 3_000),
  orcado('it-aluguel', 2026, 10, 3_000),
  orcado('it-reserva', 2026, 10, 2_500),
];

describe('montarOrcamento — mês atual (03/11/2026)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mês corrente sem receita usa a média dos 3 meses e calcula o ritmo do dia 3', async () => {
    const b = await montarOrcamento(ctxCom(1, { 2026: ARVORE_26, 2025: [] }, ORCADOS_26));
    expect(b.meses).toHaveLength(1);
    const nov = b.meses[0];
    expect(nov).toMatchObject({
      mes: '2026-11',
      rotulo: 'Nov/26',
      fechado: false,
      receita: 11_000,
      receitaOrigem: 'media3m',
    });
    // % do orçado lançado = o KPI da tela (com a Reserva): 5.600 / 6.500.
    expect(b.ritmo).toEqual({ dia: 3, diasNoMes: 30, pctMes: 10, pctOrcadoLancado: 86.2 });
    expect(b.temOrcamento).toBe(true);
  });

  it('Planejamento Financeiro fica fora dos gastos (não vira categoria)', async () => {
    const b = await montarOrcamento(ctxCom(1, { 2026: ARVORE_26, 2025: [] }, ORCADOS_26));
    const chaves = b.meses[0].categorias.map((c) => c.chave);
    expect(chaves).toEqual(['saude', 'habitacao']);
    expect(chaves).not.toContain('planejamento');
    const a = agregarPeriodoOrcamento(b.meses);
    // 11.000 − (600 + 3.000); os 2.000 da Reserva não são gasto.
    expect(a.realizado).toBe(3_600);
    expect(a.sobra).toBe(7_400);
    expect(a.indicePoupanca).toBe(67.3);
  });

  it('status do app: estouro acima de 100,5% = bad; à frente do ritmo = ritmo', async () => {
    const b = await montarOrcamento(ctxCom(3, { 2026: ARVORE_26, 2025: [] }, ORCADOS_26));
    const [set, out, nov] = b.meses;
    expect(cat(set, 'saude')).toMatchObject({ orcado: 1_000, realizado: 1_100, status: 'bad' });
    expect(cat(out, 'saude')).toMatchObject({ orcado: 800, realizado: 1_000, status: 'bad' });
    expect(cat(out, 'habitacao')).toMatchObject({ orcado: 3_000, realizado: 3_000, status: 'ok' });
    // Dia 3: 600/1.000 = 60% < 80% → ok; Aluguel 100% num dia 3 → à frente do ritmo.
    expect(cat(nov, 'saude').status).toBe('ok');
    expect(cat(nov, 'habitacao').status).toBe('ritmo');
  });

  it('referência fechada no dia 3 de novembro usa ago–out', async () => {
    expect(mesesDaReferencia({ ano: 2026, mes0: 10, dia: 3 })).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    const b = await montarOrcamento(ctxCom(1, { 2026: ARVORE_26, 2025: [] }, ORCADOS_26));
    // Receita 10.000/11.000/12.000; gastos 3.900/4.100/4.000 (sem a Reserva).
    expect(b.referenciaFechada).toEqual({
      receitaMedia3m: 11_000,
      gastoMedio3m: 4_000,
      sobraMesAnterior: 8_000,
    });
  });

  it('sem orçados: temOrcamento false, realizado continua listado', async () => {
    const b = await montarOrcamento(ctxCom(1, { 2026: ARVORE_26, 2025: [] }, []));
    expect(b.temOrcamento).toBe(false);
    expect(b.meses[0].categorias.map((c) => [c.chave, c.orcado, c.realizado])).toEqual([
      ['saude', 0, 600],
      ['habitacao', 0, 3_000],
    ]);
    // Orçado 0 com gasto = 'bad' (barra vermelha e '—' no front).
    expect(b.meses[0].categorias.every((c) => c.status === 'bad')).toBe(true);
    expect(b.ritmo?.pctOrcadoLancado).toBeNull();
  });
});

describe('montarOrcamento — 12 meses cruzando o ano', () => {
  // 2025: a mesma Saúde com OUTRO id (árvore do ano anterior) e receita só em dez.
  const SAUDE_25: CategoriaFake = {
    id: 'cat-saude-25',
    nome: 'Saúde',
    subs: [{ id: 'it-plano-25', nome: 'Plano de saúde', realizado: { 11: 700 } }],
  };
  const ARVORE_25 = arvore({ 11: 9_000 }, [SAUDE_25]);
  const ORCADOS = [...ORCADOS_26, orcado('it-plano-25', 2025, 11, 650)];

  it('soma a categoria pelo nome entre as 2 árvores; mês passado sem receita = 0 vazio', async () => {
    const ctx = ctxCom(12, { 2025: ARVORE_25, 2026: ARVORE_26 }, ORCADOS);
    const b = await montarOrcamento(ctx);
    expect(b.meses.map((m) => m.mes)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(ctx.insumos.cashflowDoAno).toHaveBeenCalledWith(2025);
    expect(ctx.insumos.cashflowDoAno).toHaveBeenCalledWith(2026);

    const dez = b.meses[0];
    expect(dez).toMatchObject({ receita: 9_000, receitaOrigem: 'fluxo', fechado: true });
    expect(cat(dez, 'saude')).toMatchObject({ orcado: 650, realizado: 700, status: 'bad' });

    // Jan–jul/26 sem receita no Fluxo: 0 e 'vazio' (a média de 3 meses é só do mês corrente).
    for (const m of b.meses.slice(1, 8)) {
      expect(m).toMatchObject({ receita: 0, receitaOrigem: 'vazio', fechado: true });
    }

    const a = agregarPeriodoOrcamento(b.meses);
    const saude = a.categorias.filter((c) => c.chave === 'saude');
    expect(saude).toHaveLength(1);
    // 700 + 900 + 1.100 + 1.000 + 600; orçado 650 + 1.000 + 800 + 1.000.
    expect(saude[0]).toMatchObject({
      nome: 'Saúde',
      realizado: 4_300,
      orcado: 3_450,
      pctConsumido: 124.6,
      mesesEstourados: 3,
      status: 'bad',
    });
    expect(a.receita).toBe(9_000 + 10_000 + 11_000 + 12_000 + 11_000);
  });
});

describe('agregarPeriodoOrcamento — soma de 3 meses', () => {
  const mes = (
    m: string,
    receita: number,
    cats: [string, number, number, 'ok' | 'ritmo' | 'bad'][],
  ): MesOrcamentoRelatorio => ({
    mes: m,
    rotulo: m,
    fechado: true,
    receita,
    receitaOrigem: 'fluxo',
    categorias: cats.map(([chave, orcado, realizado, status]) => ({
      chave,
      nome: chave,
      orcado,
      realizado,
      status,
    })),
  });

  it('% recalculado sobre a soma (não média dos %)', () => {
    const a = agregarPeriodoOrcamento([
      mes('2026-09', 10_000, [
        ['lazer', 1_000, 1_500, 'bad'],
        ['saude', 2_000, 1_000, 'ok'],
      ]),
      mes('2026-10', 10_000, [
        ['lazer', 3_000, 2_000, 'ok'],
        ['saude', 2_000, 2_000, 'ok'],
      ]),
      mes('2026-11', 20_000, [
        ['lazer', 0, 0, 'ok'],
        ['saude', 2_000, 1_800, 'ritmo'],
      ]),
    ]);
    const lazer = a.categorias.find((c) => c.chave === 'lazer')!;
    // 3.500 / 4.000 = 87,5% (a média dos % daria (150 + 66,7) / 2 = 108,3%).
    expect(lazer).toMatchObject({ orcado: 4_000, realizado: 3_500, pctConsumido: 87.5 });
    expect(lazer.status).toBe('ok');
    expect(lazer.mesesEstourados).toBe(1);
    const saude = a.categorias.find((c) => c.chave === 'saude')!;
    expect(saude).toMatchObject({
      orcado: 6_000,
      realizado: 4_800,
      pctConsumido: 80,
      status: 'ritmo',
    });
    expect(a).toMatchObject({
      receita: 40_000,
      orcado: 10_000,
      realizado: 8_300,
      sobra: 31_700,
      indicePoupanca: 79.3,
      orcadoPctReceita: 25,
      realizadoPctOrcado: 83,
    });
  });

  it('referenciaFechada: mês fechado sem receita zera a média (a saúde lê "—")', () => {
    const r = referenciaFechada([
      mes('2026-08', 0, [['x', 0, 100, 'bad']]),
      mes('2026-09', 5_000, [['x', 0, 200, 'bad']]),
      mes('2026-10', 6_000, [['x', 0, 300, 'bad']]),
    ]);
    expect(r).toEqual({ receitaMedia3m: 0, gastoMedio3m: 200, sobraMesAnterior: 5_700 });
  });
});

describe('montarOrcamento com os insumos reais (prisma mockado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    escritas.chamadas.length = 0;
    mockGetMergedCashflowGroups.mockImplementation(async (_u: string, ano: number) =>
      ano === 2026 ? ARVORE_26 : [],
    );
    mockOrcadosFindMany.mockResolvedValue(
      ORCADOS_26.map((o) => ({ ...o, valor: String(o.valor), pct: null })),
    );
  });

  it('só lê: nenhum método de escrita do prisma é chamado', async () => {
    const insumos = criarInsumos('u1', AGORA);
    const ctx: ContextoMontador = {
      userId: 'u1',
      meses: 6,
      periodo: periodoDoRelatorio(6, AGORA),
      mesesDoPeriodo: mesesDaJanela(insumos.hojeSP, 6),
      agora: AGORA,
      hojeSP: insumos.hojeSP,
      comConsultor: false,
      insumos,
    };
    const b = await montarOrcamento(ctx);
    expect(b.meses).toHaveLength(6);
    expect(cat(b.meses[4], 'saude')).toMatchObject({ orcado: 800, realizado: 1_000 });
    expect(mockOrcadosFindMany).toHaveBeenCalledTimes(1);
    expect(mockOrcadosFindMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      ano: { in: [2025, 2026] },
    });
    expect(escritas.chamadas).toEqual([]);
  });
});
