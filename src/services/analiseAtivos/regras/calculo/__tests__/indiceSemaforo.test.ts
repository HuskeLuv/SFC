/**
 * Índice MF e semáforo com os casos da Fase A (regras-spec.md §2) e da revisão da Fase 0.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  calcularIndiceComParams,
  componentesIndiceAcao,
  componentesIndiceFii,
  faixaIndice,
  type EntradaIndiceAcao,
  type EntradaIndiceFii,
} from '@/services/analiseAtivos/regras/calculo/indiceMf';
import { interpolar } from '@/services/analiseAtivos/regras/calculo/interpolacao';
import { medianaReferencia, selecionarPares } from '@/services/analiseAtivos/regras/calculo/pares';
import { semaforo } from '@/services/analiseAtivos/regras/calculo/semaforo';
import { ausente, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { listarEmissores } from '@/services/analiseAtivos/repositorio/universo';
import type { PrismaClient } from '@prisma/client';
import { P } from './helpers';

const WEGE3: EntradaIndiceAcao = {
  anosLucroConsecutivos: ok(10),
  lucroUltimoFy: ok(6376.2e6),
  ehFinanceira: false,
  dividaLiquida: ok(-1500e6),
  ebitda: ok(8900e6),
  roePct: ok(29.4),
  plControladora: ok(17417.2e6),
  dy12mPct: ok(1.6),
  plVsMedia10aPct: ok(40),
};

function nota(c: { estado: string; nota?: number }) {
  return c.estado === 'nao_se_aplica' ? null : c.nota;
}

describe('interpolação', () => {
  it('piso ⇒ 0, teto ⇒ 10, limitado; funciona com piso > teto', () => {
    expect(interpolar(0, 0, 10)).toBe(0);
    expect(interpolar(15, 0, 10)).toBe(10);
    expect(interpolar(3, 6, 0)).toBe(5);
    expect(interpolar(-2, 6, 0)).toBe(10);
    expect(interpolar(40, 60, -30)).toBeCloseTo(2.2222, 4);
  });
});

describe('Índice MF — ações', () => {
  it('WEGE3: componentes 10/10/10/2,0/2,22 ⇒ 8,02 (P/L 31,2 vs 22,3 = +40%; DY 1,6%)', () => {
    const comps = componentesIndiceAcao(WEGE3, P);
    expect(nota(comps.lucro)).toBe(10);
    expect(nota(comps.divida)).toBe(10);
    expect(nota(comps.rent)).toBe(10);
    expect(nota(comps.div)).toBeCloseTo(2.0, 10);
    expect(nota(comps.preco)).toBeCloseTo(2.22, 2);
    const r = calcularIndiceComParams(comps, 'acao', P);
    expect(r.indice).toEqual(ok(8.02));
    expect(r.incompleto).toBe(false);
    expect(faixaIndice(8.02, P)).toBe('verde');
  });

  it('BBAS3 (financeira): dívida n/a, pesos efetivos ÷ 0,8, sem "incompleto"', () => {
    const comps = componentesIndiceAcao(
      {
        ...WEGE3,
        ehFinanceira: true,
        ebitda: naoSeAplica('financeira'),
        dividaLiquida: naoSeAplica('financeira'),
        roePct: ok(14.7),
      },
      P,
    );
    expect(comps.divida).toEqual({ estado: 'nao_se_aplica', motivo: 'financeira' });
    const r = calcularIndiceComParams(comps, 'acao_financeira', P);
    expect(r.pesosEfetivos.lucro).toBeCloseTo(0.35 / 0.8, 12);
    expect(r.pesosEfetivos.rent).toBeCloseTo(0.2 / 0.8, 12);
    expect(r.pesosEfetivos.divida).toBeUndefined();
    expect(r.incompleto).toBe(false);
    const esperado = (0.35 * 10 + 0.2 * (14.7 / 25) * 10 + 0.15 * 2 + 0.1 * (20 / 9)) / 0.8;
    expect(r.indice.estado === 'ok' && r.indice.valor).toBeCloseTo(esperado, 2);
  });

  it('prejuízo no último FY ⇒ C_lucro 0 e C_preço zero_regra, sem "incompleto"', () => {
    const comps = componentesIndiceAcao(
      {
        ...WEGE3,
        lucroUltimoFy: ok(-499e6),
        anosLucroConsecutivos: ok(0),
        plVsMedia10aPct: naoSeAplica('base_nao_positiva'),
      },
      P,
    );
    expect(comps.lucro).toEqual({ estado: 'zero_regra', nota: 0, motivo: 'prejuizo' });
    expect(comps.preco).toEqual({ estado: 'zero_regra', nota: 0, motivo: 'prejuizo' });
    expect(calcularIndiceComParams(comps, 'acao', P).incompleto).toBe(false);
  });

  it('não financeira sem DL/EBITDA ⇒ C_dívida 0 + incompleto', () => {
    const comps = componentesIndiceAcao({ ...WEGE3, ebitda: ausente('sem_dado_fonte', 'ebit') }, P);
    expect(comps.divida).toMatchObject({ estado: 'ausente', nota: 0 });
    const r = calcularIndiceComParams(comps, 'acao', P);
    expect(r.incompleto).toBe(true);
    expect(r.motivosIncompleto).toEqual(['divida:sem_dado_fonte']);
    expect(r.indice).toEqual(ok(6.02));
  });

  it('EBITDA negativo com dívida líquida positiva ⇒ C_dívida 0 (nunca 10 por razão negativa); com caixa líquido ⇒ 10', () => {
    const divida = componentesIndiceAcao(
      { ...WEGE3, ebitda: ok(-100), dividaLiquida: ok(500) },
      P,
    ).divida;
    expect(divida).toEqual({ estado: 'zero_regra', nota: 0, motivo: 'ebitda_nao_positivo' });
    const caixa = componentesIndiceAcao(
      { ...WEGE3, ebitda: ok(-100), dividaLiquida: ok(-500) },
      P,
    ).divida;
    expect(nota(caixa)).toBe(10);
  });

  it('PL negativo com prejuízo ⇒ C_rent 0 (nunca ROE positivo de −/−)', () => {
    const comps = componentesIndiceAcao(
      { ...WEGE3, lucroUltimoFy: ok(-50), plControladora: ok(-200), roePct: ok(25) },
      P,
    );
    expect(comps.rent).toEqual({ estado: 'zero_regra', nota: 0, motivo: 'pl_nao_positivo' });
  });

  it('histórico de P/L curto ⇒ C_preço ausente + incompleto', () => {
    const comps = componentesIndiceAcao(
      { ...WEGE3, plVsMedia10aPct: ausente('historico_curto') },
      P,
    );
    expect(comps.preco).toMatchObject({ estado: 'ausente', motivo: 'historico_curto' });
  });
});

const PAPEL_NULO: EntradaIndiceFii = {
  mesesComRendimento: ausente('sem_dado_fonte'),
  obrigacoesPlPct: ausente('sem_dado_fonte'),
  vacanciaFisicaCvmPct: ausente('sem_dado_fonte'),
  dy12mPct: ausente('sem_dado_fonte'),
  pvp: ausente('sem_preco'),
  maiorCriPct: ausente('sem_dado_fonte'),
  nCri: ausente('sem_dado_fonte'),
};

describe('Índice MF — FIIs', () => {
  it('tijolo v1: C_rent n/a (vacância desligada, decisão 6) ⇒ pesos ÷ 0,8', () => {
    const comps = componentesIndiceFii(
      {
        mesesComRendimento: ok(120),
        obrigacoesPlPct: ok(9),
        vacanciaFisicaCvmPct: ok(2.4),
        dy12mPct: ok(8.4),
        pvp: ok(0.97),
        maiorCriPct: ausente('sem_dado_fonte'),
        nCri: ok(8),
      },
      'fii_tijolo',
      P,
    );
    expect(comps.rent).toEqual({ estado: 'nao_se_aplica', motivo: 'criterio_desligado' });
    const r = calcularIndiceComParams(comps, 'fii_tijolo', P);
    expect(r.pesosEfetivos.lucro).toBeCloseTo(0.35 / 0.8, 12);
    expect(r.incompleto).toBe(false);
    const esperado =
      (0.35 * 10 +
        0.2 * interpolar(9, 30, 0) +
        0.15 * interpolar(8.4, 4, 10) +
        0.1 * interpolar(0.97, 1.3, 0.85)) /
      0.8;
    expect(r.indice.estado === 'ok' && r.indice.valor).toBeCloseTo(esperado, 2);
  });

  it('papel com todos os dados nulos ⇒ índice 0 + incompleto (nunca "atende" por null)', () => {
    const comps = componentesIndiceFii(PAPEL_NULO, 'fii_papel', P);
    const r = calcularIndiceComParams(comps, 'fii_papel', P);
    expect(r.indice).toEqual(ok(0));
    expect(r.incompleto).toBe(true);
    expect(r.motivosIncompleto).toHaveLength(5);
  });

  it('papel: nº de CRIs = 0 ⇒ ausente; distância de P/VP 1,00 como C_preço', () => {
    const comps = componentesIndiceFii(
      { ...PAPEL_NULO, pvp: ok(1.05), nCri: ok(0), maiorCriPct: ok(100) },
      'fii_papel',
      P,
    );
    expect(comps.rent).toMatchObject({ estado: 'ausente' });
    expect(comps.divida).toMatchObject({ estado: 'ausente' });
    expect(nota(comps.preco)).toBeCloseTo(interpolar(0.05, 0.25, 0), 10);
  });

  it('FoF e PL ≤ 0 (PABY11) ⇒ fora do Índice', () => {
    const fof = calcularIndiceComParams(
      componentesIndiceFii(PAPEL_NULO, 'fora_do_indice', P),
      'fora_do_indice',
      P,
    );
    expect(fof.indice).toEqual(naoSeAplica('fof'));
    expect(fof.incompleto).toBe(false);
    const paby = calcularIndiceComParams(
      componentesIndiceFii(PAPEL_NULO, 'fora_do_indice', P, 'base_nao_positiva'),
      'fora_do_indice',
      P,
      'base_nao_positiva',
    );
    expect(paby.indice).toEqual(naoSeAplica('base_nao_positiva'));
  });
});

describe('semáforo', () => {
  const metricasWege = {
    anosLucroConsecutivos: ok(10),
    divLiqEbitda: ok(-0.17),
    roePct: ok(29.4),
    plVsMedia10aPct: ok(40),
    dy12mPct: ok(1.6),
  };

  it('WEGE3: 3 de 5 (preço vs. histórico e dividendos parciais)', () => {
    const r = semaforo(
      { metricas: metricasWege, ebitda: ok(8900), dividaLiquida: ok(-1500) },
      'acao',
      P,
    );
    expect(r.aplicaveis).toBe(5);
    expect(r.atendidos).toBe(3);
    expect(r.checks.find((c) => c.codigo === 'preco_historico')?.status).toBe('parcial');
    expect(r.checks.find((c) => c.codigo === 'dividendos')?.status).toBe('parcial');
  });

  it('BBAS3 (financeira): endividamento n/a ⇒ "n de 4"', () => {
    const r = semaforo(
      {
        metricas: { ...metricasWege, divLiqEbitda: naoSeAplica('financeira') },
        ehFinanceira: true,
      },
      'acao_financeira',
      P,
    );
    expect(r.aplicaveis).toBe(4);
    expect(r.checks.find((c) => c.codigo === 'endividamento')).toMatchObject({
      status: 'nao_se_aplica',
      motivo: 'financeira',
    });
  });

  it('EBITDA ≤ 0 com dívida líquida positiva ⇒ endividamento não atende', () => {
    const r = semaforo(
      {
        metricas: { ...metricasWege, divLiqEbitda: naoSeAplica('base_nao_positiva') },
        ebitda: ok(-100),
        dividaLiquida: ok(500),
      },
      'acao',
      P,
    );
    expect(r.checks.find((c) => c.codigo === 'endividamento')?.status).toBe('nao_atende');
  });

  it('P/L negativo ⇒ preço vs. histórico não atende; PL ≤ 0 ⇒ rentabilidade não atende', () => {
    const r = semaforo(
      {
        metricas: {
          ...metricasWege,
          plVsMedia10aPct: naoSeAplica('base_nao_positiva'),
          roePct: ok(30),
        },
        plControladora: ok(-10),
        plNaoPositivo: true,
      },
      'acao',
      P,
    );
    expect(r.checks.find((c) => c.codigo === 'preco_historico')?.status).toBe('nao_atende');
    expect(r.checks.find((c) => c.codigo === 'rentabilidade')?.status).toBe('nao_atende');
  });

  it('FII de papel com LTV/inadimplência nulos: inadimplência n/a, nunca "atende"; tudo nulo ⇒ 0 de 4', () => {
    const r = semaforo({ metricas: {} }, 'fii_papel', P);
    expect(r.checks.find((c) => c.codigo === 'inadimplencia')?.status).toBe('nao_se_aplica');
    expect(r.checks.some((c) => c.status === 'atende')).toBe(false);
    expect(r.aplicaveis).toBe(4);
    expect(r.atendidos).toBe(0);
    expect(r.checks.filter((c) => c.status === 'sem_dado')).toHaveLength(4);
    expect(r.checks.find((c) => c.codigo === 'concentracao_cri')?.provisorio).toBe(true);
  });

  it('FII tijolo v1: vacância e diversificação desligadas ⇒ "n de 3"', () => {
    const r = semaforo(
      {
        metricas: {
          dy12mPct: ok(8.4),
          obrigacoesPlPct: ok(9),
          pvp: ok(0.97),
          vacanciaFisicaCvmPct: ok(2.4),
          nImoveisCvm: ok(37),
        },
      },
      'fii_tijolo',
      P,
    );
    expect(r.aplicaveis).toBe(3);
    expect(r.atendidos).toBe(3);
  });

  it('papel: P/VP em faixa [0,90; 1,05] atende; [0,80; 1,15] parcial', () => {
    const st = (pvp: number) =>
      semaforo({ metricas: { pvp: ok(pvp) } }, 'fii_papel', P).checks.find(
        (c) => c.codigo === 'preco_vp',
      )?.status;
    expect(st(0.95)).toBe('atende');
    expect(st(1.1)).toBe('parcial');
    expect(st(0.7)).toBe('nao_atende');
  });

  it('régua fora do índice ⇒ sem checks', () => {
    expect(semaforo({ metricas: {} }, 'fora_do_indice', P)).toEqual({
      checks: [],
      aplicaveis: 0,
      atendidos: 0,
    });
  });
});

describe('financeiras por segmento B3 (repositorio.listarEmissores + params)', () => {
  it('SIMH3 (holding operacional) NÃO é financeira; ITSA4 é (holdingsFinanceirasRaiz); BBAS3 é banco', async () => {
    const prisma = {
      cvmCompany: {
        findMany: vi.fn().mockResolvedValue([
          { cnpj: 'S', nome: 'SIMPAR', mesFimExercicio: 12, layoutFinanceiro: false },
          { cnpj: 'I', nome: 'ITAUSA', mesFimExercicio: 12, layoutFinanceiro: false },
          { cnpj: 'B', nome: 'BANCO DO BRASIL', mesFimExercicio: 12, layoutFinanceiro: true },
        ]),
      },
      cvmCompanyTicker: {
        findMany: vi.fn().mockResolvedValue([
          { symbol: 'SIMH3', cnpj: 'S' },
          { symbol: 'ITSA4', cnpj: 'I' },
          { symbol: 'BBAS3', cnpj: 'B' },
        ]),
      },
      assetSetorB3: {
        findMany: vi.fn().mockResolvedValue([
          {
            raiz: 'SIMH',
            setor: 'Financeiro',
            subsetor: 'Holdings Diversificadas',
            segmento: 'Holdings Diversificadas',
            segmentoListagem: 'Novo Mercado',
          },
          {
            raiz: 'ITSA',
            setor: 'Financeiro',
            subsetor: 'Holdings Diversificadas',
            segmento: 'Holdings Diversificadas',
            segmentoListagem: 'N1',
          },
          {
            raiz: 'BBAS',
            setor: 'Financeiro',
            subsetor: 'Intermediários Financeiros',
            segmento: 'Bancos',
            segmentoListagem: 'Novo Mercado',
          },
        ]),
      },
    } as unknown as PrismaClient;
    const em = await listarEmissores(prisma, undefined, P);
    const por = new Map(em.map((e) => [e.nome, e]));
    expect(por.get('SIMPAR')?.ehFinanceira).toBe(false);
    expect(por.get('ITAUSA')?.ehFinanceira).toBe(true);
    expect(por.get('ITAUSA')?.ehBanco).toBe(false);
    expect(por.get('BANCO DO BRASIL')).toMatchObject({
      ehFinanceira: true,
      ehBanco: true,
      escopoPreferido: 'ind',
    });
  });
});

describe('pares e referência (decisão 16)', () => {
  const universo = [
    { symbol: 'A', segmento: 'Seg', subsetor: 'Sub', valorMercado: 10 },
    { symbol: 'B', segmento: 'Seg', subsetor: 'Sub', valorMercado: 30 },
    { symbol: 'C', segmento: 'Outro', subsetor: 'Sub', valorMercado: 50 },
    { symbol: 'D', segmento: 'Outro', subsetor: 'Sub', valorMercado: 5 },
    { symbol: 'E', segmento: 'X', subsetor: 'Y', valorMercado: 100 },
  ];

  it('mesmo segmento primeiro, completa com o subsetor por valor de mercado', () => {
    expect(selecionarPares({ symbol: 'A', segmento: 'Seg', subsetor: 'Sub' }, universo, 5)).toEqual(
      ['B', 'C', 'D'],
    );
  });

  it('mediana com mínimo de 3 pares', () => {
    expect(medianaReferencia([ok(1), ok(3), ok(2)], 3)).toEqual(ok(2));
    expect(medianaReferencia([ok(1), ok(3), ok(2), ok(10)], 3)).toEqual(ok(2.5));
    expect(medianaReferencia([ok(1), ausente('sem_preco'), ok(2)], 3).estado).toBe('ausente');
  });
});
