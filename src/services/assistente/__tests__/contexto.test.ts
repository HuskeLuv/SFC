import { describe, expect, it } from 'vitest';
import {
  classesComPosicao,
  compactCashflow,
  compactClasse,
  montarContexto,
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
        linhas: [{ linha: 'Aluguel', totalAno: 2000.5, meses: { jan: 1000, fev: 1000.5 } }],
      },
    ]);
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
        cashflow: { groups: [] },
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
    expect(ctx.fluxoDeCaixa).toEqual([]);
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
