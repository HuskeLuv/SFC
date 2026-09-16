import { describe, expect, it } from 'vitest';
import {
  catalogoLinhas,
  classesComPosicao,
  compactCashflow,
  compactClasse,
  compactProventos,
  familiaProvento,
  listarLinhasEditaveis,
  montarContexto,
  resumirMes,
  slim,
} from '../contexto';

describe('slim', () => {
  it('remove ids/datas técnicas, nulos e vazios; arredonda números', () => {
    expect(
      slim({
        id: 'x',
        userId: 'u',
        createdAt: '2026-01-01',
        nome: 'ITSA4',
        valor: 12.3456,
        vazio: '',
        nulo: null,
        ok: true,
        lista: [1, 2],
      }),
    ).toEqual({ nome: 'ITSA4', valor: 12.35, ok: true });
  });

  it('com allowlist mantém só os campos pedidos', () => {
    expect(slim({ id: 'x', ticker: 'A', setor: 'b', extra: 1 }, ['ticker'])).toEqual({
      ticker: 'A',
    });
  });
});

describe('compactCashflow', () => {
  it('achata a árvore, ignora linhas zeradas e devolve só os meses com valor', () => {
    const out = compactCashflow([
      {
        name: 'Despesas',
        type: 'despesa',
        items: [],
        children: [
          {
            name: 'Habitação',
            type: 'despesa',
            items: [
              {
                name: 'Aluguel',
                values: [
                  { month: 0, value: 1000 },
                  { month: 1, value: '1000.5' },
                  { month: 5, value: null },
                ],
              },
              { name: 'Zerada', values: [{ month: 0, value: 0 }] },
            ],
          },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        grupo: 'Despesas > Habitação',
        tipo: 'despesa',
        totalAno: 2000.5,
        totalPorMes: { jan: 1000, fev: 1000.5 },
        linhas: [{ linha: 'Aluguel', totalAno: 2000.5, meses: { jan: 1000, fev: 1000.5 } }],
      },
    ]);
  });

  it('soma o total do grupo por mês a partir de todas as linhas', () => {
    const out = compactCashflow([
      {
        name: 'Habitação',
        type: 'despesa',
        items: [
          { name: 'Aluguel', values: [{ month: 8, value: 1100 }] },
          {
            name: 'Energia',
            values: [
              { month: 8, value: 195.5 },
              { month: 7, value: 200 },
            ],
          },
        ],
      },
    ]);
    expect(out[0].totalAno).toBe(1495.5);
    expect(out[0].totalPorMes).toEqual({ ago: 200, set: 1295.5 });
  });
});

describe('resumirMes', () => {
  const groups = [
    {
      name: 'Entradas',
      type: 'entrada',
      items: [{ name: 'Salário', values: [{ month: 8, value: 9000 }] }],
    },
    {
      name: 'Despesas',
      type: 'despesa',
      items: [],
      children: [
        {
          name: 'Despesas Fixas',
          type: 'despesa',
          items: [],
          children: [
            {
              name: 'Habitação',
              type: 'despesa',
              items: [
                { name: 'Aluguel', values: [{ month: 8, value: 1100 }] },
                {
                  name: 'Energia',
                  values: [
                    { month: 8, value: 195 },
                    { month: 7, value: 200 },
                  ],
                },
              ],
            },
            {
              name: 'Outros',
              type: 'despesa',
              items: [{ name: 'X', values: [{ month: 8, value: 10 }] }],
            },
          ],
        },
        {
          name: 'Despesas Variáveis',
          type: 'despesa',
          items: [],
          children: [
            {
              name: 'Outros',
              type: 'despesa',
              items: [{ name: 'Y', values: [{ month: 8, value: 5 }] }],
            },
          ],
        },
      ],
    },
  ];

  it('dá o total de cada grupo de despesa no mês, entradas, despesas e sobra', () => {
    expect(resumirMes(groups, 8)).toEqual({
      mes: 'setembro',
      entradas: 9000,
      despesas: 1310,
      sobra: 7690,
      despesasPorGrupo: {
        Habitação: 1295,
        'Despesas > Despesas Fixas > Outros': 10,
        'Despesas > Despesas Variáveis > Outros': 5,
      },
    });
  });

  it('mês sem lançamentos fica zerado, sem grupos', () => {
    expect(resumirMes(groups, 0)).toEqual({
      mes: 'janeiro',
      entradas: 0,
      despesas: 0,
      sobra: 0,
      despesasPorGrupo: {},
    });
  });
});

describe('catalogoLinhas / listarLinhasEditaveis', () => {
  const groups = [
    {
      name: 'Despesas',
      type: 'despesa',
      items: [],
      children: [
        {
          name: 'Habitação',
          type: 'despesa',
          items: [
            { id: 'a', name: 'Supermercado', values: [{ month: 0, value: 100 }] },
            { id: 'b', name: 'Gás', values: [] },
            { id: 'c', name: 'Sonho', values: [], objetivoId: 'o1' },
            { id: 'd', name: 'Oculta', values: [], hidden: true },
          ],
        },
        { name: 'Escondido', type: 'despesa', hidden: true, items: [{ id: 'e', name: 'X' }] },
      ],
    },
    { name: 'Investimentos', type: 'investimento', items: [{ id: 'f', name: 'Aporte' }] },
    { name: 'Entradas', type: 'entrada', items: [{ id: 'g', name: 'Salário' }] },
  ];

  it('lista TODAS as linhas editáveis (inclusive zeradas), sem sonho/dívida/ocultas/investimento', () => {
    expect(listarLinhasEditaveis(groups).map((l) => l.itemId)).toEqual(['a', 'b', 'g']);
  });

  it('catálogo agrupa só os nomes por trilha do grupo', () => {
    expect(catalogoLinhas(groups)).toEqual({
      'Despesas > Habitação': ['Supermercado', 'Gás'],
      Entradas: ['Salário'],
    });
  });
});

describe('compactClasse / classesComPosicao', () => {
  it('descarta classes sem ativos e mantém só campos úteis dos ativos', () => {
    expect(compactClasse({ secoes: [{ nome: 'x', ativos: [] }] })).toBeNull();
    const c = compactClasse({
      resumo: { saldoAtual: 10 },
      secoes: [
        {
          nome: 'pos-fixada',
          totalValorAtualizado: 12784.444,
          ativos: [{ id: 'a', nome: 'DEB', valorAtualizado: 12784.44, ir: { x: 1 }, foo: 'bar' }],
        },
      ],
      totalGeral: { valorAplicado: 10000 },
    });
    expect(c).toEqual({
      resumo: { saldoAtual: 10 },
      secoes: [
        {
          secao: 'pos-fixada',
          total: 12784.44,
          ativos: [{ nome: 'DEB', valorAtualizado: 12784.44 }],
        },
      ],
      totalGeral: { valorAplicado: 10000 },
    });
  });

  it('tira os ativos PLANEJADOS (sem posição) das posições da classe', () => {
    const c = compactClasse({
      secoes: [
        {
          nome: 'Growth',
          ativos: [
            { id: 'p1', ticker: 'VALE3', planejado: true, objetivo: 10, valorAtualizado: 0 },
            { id: 'a1', ticker: 'ITSA4', valorAtualizado: 100 },
          ],
        },
        { nome: 'Risk', ativos: [{ id: 'p2', ticker: 'PETR4', planejado: true }] },
      ],
    });
    expect(c).toEqual({
      resumo: {},
      secoes: [{ secao: 'Growth', ativos: [{ ticker: 'ITSA4', valorAtualizado: 100 }] }],
      totalGeral: {},
    });
  });

  it('mapeia distribuição com valor para as rotas de posição', () => {
    expect(
      classesComPosicao({
        distribuicao: {
          acoes: { valor: 10 },
          fiis: { valor: 0 },
          rendaFixaFundos: { valor: 5 },
          desconhecida: { valor: 3 },
        },
      }),
    ).toEqual(['acoes', 'renda-fixa']);
    expect(classesComPosicao(null)).toEqual([]);
  });
});

describe('montarContexto', () => {
  it('monta o JSON com data do dia, carteira, fluxo, orçamento, dívidas, saúde e objetivos', () => {
    const ctx = montarContexto(
      {
        ano: 2026,
        resumo: {
          saldoBruto: 100,
          valorAplicado: 90,
          rentabilidade: 11.1,
          totais: { dinheiro: 100 },
          distribuicao: { acoes: { valor: 100, percentual: 100 }, fiis: { valor: 0 } },
        },
        posicoes: { acoes: { secoes: [{ nome: 's', ativos: [{ ticker: 'ITSA4' }] }] } },
        cashflow: {
          groups: [{ name: 'Entradas', type: 'entrada', items: [{ id: 'g', name: 'Salário' }] }],
        },
        orcamento: {
          categorias: [{ nome: 'Lazer', metaMensal: 100, realAnual: { lancado: 50 } }],
          totais: { metaMensal: 100 },
        },
        dividas: { dividas: [{ id: 'd', nome: 'Carro', saldo: 1 }] },
        saude: {
          indicadores: { fluxo: { rendaMensal: 1 } },
          config: { multReserva: 3 },
          fontes: {},
        },
        sonhos: { objetivos: [{ id: 'o', nome: 'Viagem' }] },
      },
      new Date(2026, 8, 10),
    );
    expect(ctx.hoje).toBe('2026-09-10');
    expect(ctx.mesAtual).toBe('setembro');
    expect((ctx.carteira as Record<string, unknown>).distribuicao).toEqual({
      acoes: { valor: 100, percentual: 100 },
    });
    expect((ctx.carteira as { posicoes: Record<string, unknown> }).posicoes.acoes).toBeDefined();
    expect(ctx.mesAtualResumo).toEqual({
      mes: 'setembro',
      entradas: 0,
      despesas: 0,
      sobra: 0,
      despesasPorGrupo: {},
    });
    expect(ctx.fluxoDeCaixa).toEqual([]);
    expect(ctx.linhasDoFluxo).toEqual({ Entradas: ['Salário'] });
    expect((ctx.orcamento as { categorias: unknown[] }).categorias).toEqual([
      { nome: 'Lazer', metaMensal: 100, realAnual: { lancado: 50 } },
    ]);
    expect(ctx.dividas).toEqual([{ nome: 'Carro', saldo: 1 }]);
    expect(ctx.saudeFinanceira).toEqual({
      indicadores: { fluxo: { rendaMensal: 1 } },
      config: { multReserva: 3 },
    });
    expect(ctx.objetivos).toEqual([{ nome: 'Viagem' }]);
  });
});

describe('montarContexto — ativos planejados', () => {
  const base = {
    ano: 2026,
    resumo: null,
    posicoes: {},
    cashflow: null,
    orcamento: null,
    dividas: null,
    saude: null,
    sonhos: null,
  };
  it('lista os planejados numa chave própria da carteira, fora das posições', () => {
    const ctx = montarContexto(
      {
        ...base,
        planejados: [
          { aba: 'Ações', ativo: 'VALE3', objetivoPercentualDaAba: 10, secao: 'growth' },
        ],
      },
      new Date('2026-09-16T12:00:00Z'),
    ) as { carteira: Record<string, unknown> };
    expect(ctx.carteira.ativosPlanejadosSemPosicao).toEqual([
      { aba: 'Ações', ativo: 'VALE3', objetivoPercentualDaAba: 10, secao: 'growth' },
    ]);
  });
  it('sem planejados a chave nem aparece', () => {
    const ctx = montarContexto(base, new Date('2026-09-16T12:00:00Z')) as {
      carteira: Record<string, unknown>;
    };
    expect(ctx.carteira).not.toHaveProperty('ativosPlanejadosSemPosicao');
  });
});

describe('compactProventos (dividendos, JCP e rendimentos recebidos)', () => {
  const hoje = new Date('2026-09-16T12:00:00Z');
  const bruto = {
    proventos: [
      { data: '2026-09-05', symbol: 'ITSA4', tipo: 'Dividendo', valor: 10.5, status: 'realizado' },
      { data: '2026-08-20', symbol: 'ITSA4', tipo: 'JCP', valor: 4.25, status: 'realizado' },
      { data: '2026-08-15', symbol: 'HGLG11', tipo: 'Rendimento', valor: 30, status: 'realizado' },
      { data: '2025-12-10', symbol: 'ITSA4', tipo: 'Dividendo', valor: 100, status: 'realizado' },
      { data: '2026-10-01', symbol: 'ITSA4', tipo: 'Dividendo', valor: 99, status: 'a_receber' },
    ],
    kpis: {
      rendaAcumulada: { lifetime: 144.75, ult12m: 144.75 },
      mediaMensal: { ult12m: 12.06 },
      aReceber: { esseMes: 0, next12Months: { sum: 99 } },
    },
  };

  it('resume totais por período, tipo, ano, mês e ativo só com o que foi RECEBIDO', () => {
    const r = compactProventos(bruto, hoje)!;
    expect(r.totalDesdeOInicio).toBe(144.75);
    expect(r.anoAtual).toEqual({
      ano: 2026,
      total: 44.75,
      porTipo: { Dividendo: 10.5, JCP: 4.25, Rendimento: 30 },
    });
    expect(r.mesAtual).toEqual({ mes: '2026-09', total: 10.5 });
    expect(r.porAno).toEqual({ '2025': 100, '2026': 44.75 });
    expect(r.porMesUltimos12).toEqual({ '2026-09': 10.5, '2026-08': 34.25, '2025-12': 100 });
    expect(r.porAtivoNoAno).toEqual({ HGLG11: 30, ITSA4: 14.75 });
    expect(r.ultimosPagamentos[0]).toEqual({
      data: '2026-09-05',
      ativo: 'ITSA4',
      tipo: 'Dividendo',
      valor: 10.5,
    });
    expect(r.aReceber).toEqual({ esteMes: 0, proximos12Meses: 99 });
  });

  it('sem proventos devolve null (a chave some do contexto)', () => {
    expect(compactProventos({ proventos: [] }, hoje)).toBeNull();
    expect(compactProventos(null, hoje)).toBeNull();
  });

  it('classifica o tipo textual em Dividendo / JCP / Rendimento', () => {
    expect(familiaProvento('Juros sobre capital próprio')).toBe('JCP');
    expect(familiaProvento('jcp')).toBe('JCP');
    expect(familiaProvento('Rendimento')).toBe('Rendimento');
    expect(familiaProvento('DIVIDENDO')).toBe('Dividendo');
    expect(familiaProvento(undefined)).toBe('Dividendo');
  });
});
