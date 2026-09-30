import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  problemasCriterio,
  scoringParamsSchema,
  type ScoringParams,
} from '@/services/analiseAtivos/params/scoringParamsSchema';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { ErroParams, obterScoringParams } from '@/services/analiseAtivos/params/obterScoringParams';

const clonar = (): ScoringParams => structuredClone(SCORING_PARAMS_V1);

describe('ScoringParams v1', () => {
  it('SCORING_PARAMS_V1 passa no schema', () => {
    const r = scoringParamsSchema.safeParse(SCORING_PARAMS_V1);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('chave extra falha (schema estrito), inclusive aninhada', () => {
    expect(scoringParamsSchema.safeParse({ ...clonar(), extra: 1 }).success).toBe(false);
    const p = clonar() as unknown as { indice: Record<string, unknown> };
    p.indice.pesoExtra = 0.1;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);
  });

  it('peso fora de [0,1] falha', () => {
    const p = clonar();
    p.indice.pesos.lucro = 1.2;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);
    p.indice.pesos.lucro = -0.1;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);
  });

  it('soma dos pesos = 1 (e soma ≠ 1 falha)', () => {
    const soma = Object.values(SCORING_PARAMS_V1.indice.pesos).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 12);
    const p = clonar();
    p.indice.pesos.preco = 0.2;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);
  });

  it('faixas de semáforo coerentes em todas as réguas', () => {
    const todos = [
      ...SCORING_PARAMS_V1.acao.semaforo,
      ...SCORING_PARAMS_V1.fii.tijolo.semaforo,
      ...SCORING_PARAMS_V1.fii.papel.semaforo,
    ];
    for (const c of todos) expect(problemasCriterio(c)).toEqual([]);
    for (const c of todos.filter((x) => x.direcao === 'menor_melhor')) {
      expect(c.atende as number).toBeLessThanOrEqual(c.parcial as number);
    }
  });

  it('semáforo incoerente falha (menor_melhor com atende > parcial; faixa não contida)', () => {
    const p = clonar();
    const endiv = p.acao.semaforo.find((c) => c.codigo === 'endividamento')!;
    endiv.atende = 7;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);

    const q = clonar();
    const pvp = q.fii.papel.semaforo.find((c) => c.codigo === 'preco_vp')!;
    pvp.parcial = [0.95, 1.15];
    expect(scoringParamsSchema.safeParse(q).success).toBe(false);
  });

  it('faixas de cor fora de ordem falham', () => {
    const p = clonar();
    p.indice.faixasCor.azul = 9;
    expect(scoringParamsSchema.safeParse(p).success).toBe(false);
  });

  it('valores-chave batem com a spec e as decisões', () => {
    const p = SCORING_PARAMS_V1;
    expect(p.versao).toBe(1);
    expect(p.acao.componentes.preco.piso).toBe(60);
    expect(p.acao.componentes.preco.teto).toBe(-30);
    expect(p.acao.componentes.lucro).toMatchObject({ piso: 0, teto: 10 });
    expect(p.acao.componentes.divida).toMatchObject({ piso: 6, teto: 0 });
    expect(p.fii.papel.componentes.div.piso).toBe(6);
    expect(p.fii.papel.componentes.div.teto).toBe(13);
    expect(p.ranking.m).toBe(20);
    expect(p.ranking.pesoContaNova).toBe(0.5); // decisão 22
    expect(p.fii.tijolo.componentes.rent.ativo).toBe(false); // decisão 6
    expect(p.universo.fiiQuadroPregoes).toBe(30); // decisão 14
    expect(p.sanidade.b3.liquidezPregoes).toBe(21); // decisão 15
    expect(p.sanidade.acoes.payoutSeloPct).toBe(150); // decisão 11
    expect(p.financeiras.segmentosBanco).toEqual(['Bancos']);
    expect(p.financeiras.holdingsFinanceirasRaiz).toEqual(['ITSA']);
    expect(p.sanidade.proventos.camposPorFonte.YAHOO).toEqual({
      dataEx: 'date',
      dataPagamento: null,
    });
  });
});

describe('obterScoringParams', () => {
  const criarPrisma = (linha: unknown) =>
    ({
      scoringParams: {
        findFirst: vi.fn().mockResolvedValue(linha),
        findUnique: vi.fn().mockResolvedValue(linha),
      },
    }) as unknown as PrismaClient;

  it('devolve a maior versão ativa (validFrom ≤ agora) validada', async () => {
    const prisma = criarPrisma({ version: 1, params: SCORING_PARAMS_V1 });
    const r = await obterScoringParams(prisma);
    expect(r.versao).toBe(1);
    expect(r.params.ranking.m).toBe(20);
    const arg = (prisma.scoringParams.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.orderBy).toEqual({ version: 'desc' });
    expect(arg.where.validFrom.lte).toBeInstanceOf(Date);
  });

  it('sem versão ativa ⇒ ErroParams sem_versao_ativa', async () => {
    await expect(obterScoringParams(criarPrisma(null))).rejects.toMatchObject({
      codigo: 'sem_versao_ativa',
    });
  });

  it('versão pedida inexistente ⇒ ErroParams versao_inexistente', async () => {
    await expect(obterScoringParams(criarPrisma(null), { versao: 7 })).rejects.toMatchObject({
      codigo: 'versao_inexistente',
    });
  });

  it('JSON inválido no banco ⇒ ErroParams json_invalido', async () => {
    const prisma = criarPrisma({ version: 2, params: { ...SCORING_PARAMS_V1, extra: true } });
    const erro = await obterScoringParams(prisma).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroParams);
    expect((erro as ErroParams).codigo).toBe('json_invalido');
  });
});
