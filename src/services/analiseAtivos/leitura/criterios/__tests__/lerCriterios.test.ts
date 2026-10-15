import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FONTE_CRITERIOS,
  limparCacheCriterios,
  montarCriteriosAtivo,
  obterCriteriosAtivo,
  obterCriteriosVarios,
  projetarCriteriosCompactos,
  uniaoFontes,
  type PrismaCriterios,
} from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import {
  compactarAvaliacao,
  linhasCriteriaEval,
  marcaDoSql,
} from '@/services/analiseAtivos/repositorio/criterios';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { AvaliacaoAtivo, PerfilCriterio } from '@/types/analiseAtivosCriterios';

const P = CRITERIA_PARAMS_V1;
const serie = (inicio: number, valores: number[]) =>
  Object.fromEntries(valores.map((v, i) => [inicio + i, v]));

function avaliacao(symbol: string, perfil: PerfilCriterio): AvaliacaoAtivo {
  return avaliarAtivo(
    {
      symbol,
      classe: perfil.startsWith('fii') ? 'fii' : 'acao',
      perfil,
      anoFim: 2025,
      series: {
        revenue: serie(2015, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        net_debt_ebitda: serie(2016, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
        income_per_share: serie(2020, [1, 2, 3, 4, 5, 6]),
      },
      meses: null,
    },
    P,
    1,
  );
}

function linhas(a: AvaliacaoAtivo, cnpj = 'C-1') {
  return linhasCriteriaEval({ symbol: a.symbol, cnpj, avaliacao: a }, new Date('2026-10-13'));
}

function prismaFake(dados: ReturnType<typeof linhas>, fiiTipo: string | null = null) {
  const criteriaEval = {
    findMany: vi.fn(
      async ({ where }: { where: { symbol: string | { in: string[] }; janela?: number } }) =>
        dados.filter(
          (l) =>
            (typeof where.symbol === 'string'
              ? l.symbol === where.symbol
              : where.symbol.in.includes(l.symbol)) &&
            (where.janela === undefined || l.janela === where.janela),
        ),
    ),
  };
  const criteriaParams = {
    findUnique: vi.fn(async () => ({ version: 1, params: P })),
  };
  const analiseQuadroLinha = { findUnique: vi.fn(async () => ({ fiiTipo })) };
  return {
    prisma: { criteriaEval, criteriaParams, analiseQuadroLinha } as unknown as PrismaCriterios,
    criteriaEval,
  };
}

beforeEach(() => limparCacheCriterios());

describe('montarCriteriosAtivo (pura)', () => {
  it('3 janelas com rótulo, definição, formato e unidade do params', () => {
    const a = avaliacao('WEGE3', 'acao');
    const c = montarCriteriosAtivo(linhas(a), P, null)!;
    expect(c).toMatchObject({
      perfil: 'acao',
      fonte: FONTE_CRITERIOS.acao,
      anoFim: 2025,
      paramsVersion: 1,
      observacaoPerfil: null,
    });
    expect(Object.keys(c.janelas).sort()).toEqual(['10', '3', '5']);
    const rec = c.janelas['5'].itens.find((i) => i.id === 'rec')!;
    expect(rec).toMatchObject({
      rotulo: 'Receita crescente',
      formato: 'n',
      unidade: 'R$ mi',
      estado: 'atende',
      n: 5,
      de: 5,
    });
    expect(rec.serie).toHaveLength(6);
    expect(c.janelas['5']).toMatchObject({ anoInicio: 2021, anoFim: 2025, aplicaveis: 6 });
    // contrato sem nota: nenhuma chave com indice/semaforo/destaque/nota/score
    expect(JSON.stringify(c)).not.toMatch(
      /"[^"]*(indice|semaforo|destaque|nota|rating|score)[^"]*":/i,
    );
  });

  it('FII pela regra de composição traz a nota de perfil; sem linhas = null', () => {
    const a = avaliacao('HFOF11', 'fii_papel');
    const c = montarCriteriosAtivo(linhas(a), P, 'fof')!;
    expect(c.fonte).toBe(FONTE_CRITERIOS.fii);
    expect(c.observacaoPerfil).toBe(TEXTOS_CRITERIOS.perfil.fof);
    expect(montarCriteriosAtivo([], P, null)).toBeNull();
  });
});

describe('obterCriteriosAtivo / obterCriteriosVarios', () => {
  it('lê criteria_eval + params da versão, com cache por símbolo', async () => {
    const { prisma, criteriaEval } = prismaFake(linhas(avaliacao('WEGE3', 'acao')));
    const c1 = await obterCriteriosAtivo(prisma, 'wege3');
    const c2 = await obterCriteriosAtivo(prisma, 'WEGE3');
    expect(c1?.perfil).toBe('acao');
    expect(c2).toBe(c1);
    expect(criteriaEval.findMany).toHaveBeenCalledTimes(1);
    limparCacheCriterios();
    await obterCriteriosAtivo(prisma, 'WEGE3');
    expect(criteriaEval.findMany).toHaveBeenCalledTimes(2);
  });

  it('ativo sem avaliação = null (também em cache)', async () => {
    const { prisma, criteriaEval } = prismaFake([]);
    expect(await obterCriteriosAtivo(prisma, 'NOVA3')).toBeNull();
    expect(await obterCriteriosAtivo(prisma, 'NOVA3')).toBeNull();
    expect(criteriaEval.findMany).toHaveBeenCalledTimes(1);
  });

  it('FII lê o tipo da linha do Quadro para a nota de perfil', async () => {
    const { prisma } = prismaFake(linhas(avaliacao('HGLG11', 'fii_tijolo')), 'hibrido');
    const c = await obterCriteriosAtivo(prisma, 'HGLG11');
    expect(c?.observacaoPerfil).toBe(
      'híbrido: avaliado com os critérios de tijolo (regra de composição)',
    );
  });

  it('uma janela de vários ativos; quem não tem avaliação fica fora do Map', async () => {
    const dados = [
      ...linhas(avaliacao('WEGE3', 'acao')),
      ...linhas(avaliacao('ITUB4', 'acao_financeira')),
    ];
    const { prisma } = prismaFake(dados);
    const m = await obterCriteriosVarios(prisma, ['WEGE3', 'itub4', 'NOVA3'], 5);
    expect([...m.keys()].sort()).toEqual(['ITUB4', 'WEGE3']);
    expect(m.get('ITUB4')).toMatchObject({ janela: 5, perfil: 'acao_financeira', de: 3 });
    expect(m.get('WEGE3')?.marcas.map((x) => x.id)).toEqual([
      'rec',
      'luc',
      'ebitda',
      'mg',
      'dl',
      'fcl',
    ]);
    expect((await obterCriteriosVarios(prisma, [], 5)).size).toBe(0);
  });
});

describe('v2.5 — fonte e obs na leitura', () => {
  /** Avaliação v2 com origens (como o job grava): lucro em fallback + um ano incompleto do provedor. */
  function avaliacaoV2(): AvaliacaoAtivo {
    const origem = (fonte: string, incompleto = false) => ({
      fonte,
      serieUsada: 'revenue' as const,
      fallback: false,
      incompleto,
    });
    return avaliarAtivo(
      {
        symbol: 'WEGE3',
        classe: 'acao',
        perfil: 'acao',
        anoFim: 2025,
        series: {
          revenue: serie(2015, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
          net_income: serie(2015, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        },
        origens: {
          revenue: Object.fromEntries(
            Array.from({ length: 11 }, (_, i) => [
              2015 + i,
              origem(i === 10 ? 'provedor_x' : 'cvm', i === 3),
            ]),
          ),
          net_income: Object.fromEntries(
            Array.from({ length: 11 }, (_, i) => [2015 + i, origem('cvm')]),
          ),
        },
        meses: null,
      },
      CRITERIA_PARAMS_V2,
      2,
    );
  }

  it('itens com fonte/obs; CriteriosAtivo com a união das fontes (provedor antes) e o selo', () => {
    const c = montarCriteriosAtivo(linhas(avaliacaoV2()), CRITERIA_PARAMS_V2, null)!;
    const luc = c.janelas['5'].itens.find((i) => i.id === 'luc')!;
    expect(luc).toMatchObject({ obs: ['lucro_sem_descontado'], fonte: ['cvm'] });
    expect(c.janelas['5'].itens.find((i) => i.id === 'rec')?.fonte).toEqual(['provedor_x', 'cvm']);
    expect(c.fontes).toEqual(['provedor_x', 'cvm']);
    // janela 10 pega o ano incompleto (2018) da receita
    expect(c.janelas['10'].itens.find((i) => i.id === 'rec')?.obs).toEqual(['dados_incompletos']);
    expect(c.dadosIncompletos).toBe(true);
    expect(uniaoFontes([['cvm'], ['b', 'cvm'], ['a']])).toEqual(['b', 'a', 'cvm']);
  });

  it('avaliação v1 (sem fonte/obs no JSON) segue igual: nenhum campo novo', () => {
    const c = montarCriteriosAtivo(linhas(avaliacao('WEGE3', 'acao')), P, null)!;
    expect(c.fontes).toBeUndefined();
    expect(c.dadosIncompletos).toBeUndefined();
    expect(c.janelas['5'].itens.every((i) => i.obs === undefined)).toBe(true);
  });

  it('marcas (leitura direta e compacta) carregam a obs; a compacta só tem o 4º elemento com obs', async () => {
    const a = avaliacaoV2();
    const compactos = compactarAvaliacao(a);
    const m5 = compactos['5']!.m;
    expect(m5.find((x) => x[0] === 'luc')).toEqual([
      'luc',
      'atende',
      expect.any(String),
      ['lucro_sem_descontado'],
    ]);
    expect(m5.find((x) => x[0] === 'rec')).toHaveLength(3);
    const { prisma } = prismaFake(linhas(a));
    for (const j of [3, 5, 10] as const) {
      const projetada = projetarCriteriosCompactos(compactos, j, 'acao');
      const lida = (await obterCriteriosVarios(prisma, ['WEGE3'], j)).get('WEGE3');
      expect(projetada).toEqual(lida);
    }
    expect(projetarCriteriosCompactos(compactos, 5, 'acao')?.marcas[1].obs).toEqual([
      'lucro_sem_descontado',
    ]);
    // marca vinda do SQL com lixo no 4º elemento: só obs válidas ficam
    expect(marcaDoSql(['luc', 'atende', 'f', ['lucro_sem_descontado', 'xyz']])).toEqual([
      'luc',
      'atende',
      'f',
      ['lucro_sem_descontado'],
    ]);
    expect(marcaDoSql(['luc', 'atende', 'f', null])).toEqual(['luc', 'atende', 'f']);
  });

  it('contrato sem nota também com fonte/obs', () => {
    const c = montarCriteriosAtivo(linhas(avaliacaoV2()), CRITERIA_PARAMS_V2, null)!;
    expect(JSON.stringify(c)).not.toMatch(
      /"[^"]*(indice|semaforo|destaque|nota|rating|score)[^"]*":/i,
    );
  });
});

describe('cópia compacta ↔ projeção', () => {
  it('compactarAvaliacao e projetarCriteriosCompactos dão a mesma linha que a leitura direta', async () => {
    const a = avaliacao('WEGE3', 'acao');
    const compactos = compactarAvaliacao(a);
    const { prisma } = prismaFake(linhas(a));
    for (const j of [3, 5, 10] as const) {
      const projetada = projetarCriteriosCompactos(compactos, j, 'acao');
      const lida = (await obterCriteriosVarios(prisma, ['WEGE3'], j)).get('WEGE3');
      expect(projetada).toEqual(lida);
    }
  });
});
