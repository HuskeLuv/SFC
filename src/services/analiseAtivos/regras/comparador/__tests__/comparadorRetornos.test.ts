/**
 * A6 (item 5, fatia F): 'Retorno 12 meses' e 'Retorno 5 anos (a.a.)' (antes 'Variação') no grupo Preço do Comparador
 * (ação e FII), só com ANALISE_ATIVOS_RETORNOS_HABILITADO. Desligada, o catálogo e a resposta são os
 * de hoje; ligada, duas linhas a mais no fim do grupo Preço, formato com sinal (cor neutra: a célula
 * só pinta 'pct'), sem ganhador; ativo sem linha em asset_retornos_cotacao = 'sem dado'.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { infoCelula } from '@/components/analiseAtivos/comparador/CelulaComparador';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { paraRetornosApi } from '@/services/analiseAtivos/leitura/ativo/retornosAtivo';
import {
  montarComparadorPuro,
  type AtivoEntrada,
} from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  GRUPOS_ACAO,
  GRUPOS_ACAO_RETORNOS,
  GRUPOS_FII,
  GRUPOS_FII_ALAV_ATIVO,
  GRUPOS_FII_ALAV_ATIVO_RETORNOS,
  GRUPOS_FII_RETORNOS,
  GRUPOS_REIT,
  GRUPOS_STOCK,
  catalogoComparador,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import { LINHA_HGLG11, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { AnaliseQuadroLinha } from '@prisma/client';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type { FlagRetorno, RetornosCalculados } from '@/types/analiseAtivosComplementos';

function calculados(
  symbol: string,
  classe: 'acao' | 'fii',
  r12: number | null,
  r5a: number | null,
  flags: FlagRetorno[] = [],
): RetornosCalculados {
  return {
    symbol,
    classe,
    asOf: '2026-10-16',
    preco: 50,
    ret1mPct: 1.2,
    ret12mPct: r12,
    ret5aAaPct: r5a,
    ret10aAaPct: 9,
    precoMaxAjustado: 60,
    distMaxPct: -16.7,
    dataMax: '2025-02-10',
    inicioSerie: '2015-01-02',
    pregoes: 2700,
    flags,
  };
}

function ativo(
  base: AnaliseQuadroLinha,
  ticker: string,
  retornos: RetornosCalculados | null | undefined,
): AtivoEntrada {
  const linha = paraLinhaQuadroApi({ ...base, symbol: ticker });
  const classe = base.classe as 'acao' | 'fii';
  return {
    dados: {
      linha,
      atual: { divLiqPl: null, pReceita: null, rend12m: 13, vpCota: 160, naoSeAplica: [] },
      trimestre: null,
      cnpjEmConferencia: false,
      regua: classe === 'fii' ? 'fii_tijolo' : 'acao',
      ...(retornos === undefined
        ? {}
        : { retornos: retornos ? paraRetornosApi(retornos, classe) : null }),
    },
    flags: [],
    motivos: [],
    serie: [],
    criterios: null,
  };
}

const montar = (classe: ClasseQuadro, ativos: AtivoEntrada[], retornos?: boolean) =>
  montarComparadorPuro({
    classe,
    hoje: '2026-10-19',
    janela: 5,
    params: CRITERIA_PARAMS_V3,
    ativos,
    ...(retornos === undefined ? {} : { retornos }),
  });

const preco = (r: ReturnType<typeof montar>) => r.grupos.find((g) => g.codigo === 'preco')!;

describe('catálogo', () => {
  it('desligada: o de hoje; ligada: + Retorno 12 meses e 5 anos (a.a.) no fim do Preço', () => {
    expect(catalogoComparador('acao')).toBe(GRUPOS_ACAO);
    expect(catalogoComparador('acao', { retornos: false })).toBe(GRUPOS_ACAO);
    expect(catalogoComparador('fii')).toBe(GRUPOS_FII);
    expect(catalogoComparador('fii', { alavAtivo: true })).toBe(GRUPOS_FII_ALAV_ATIVO);
    expect(catalogoComparador('acao', { retornos: true })).toBe(GRUPOS_ACAO_RETORNOS);
    expect(catalogoComparador('fii', { retornos: true })).toBe(GRUPOS_FII_RETORNOS);
    expect(catalogoComparador('fii', { retornos: true, alavAtivo: true })).toBe(
      GRUPOS_FII_ALAV_ATIVO_RETORNOS,
    );
    // stock e REIT ignoram a chave (sem cotação EUA no Comparador)
    expect(catalogoComparador('stock', { retornos: true })).toBe(GRUPOS_STOCK);
    expect(catalogoComparador('reit', { retornos: true })).toBe(GRUPOS_REIT);

    for (const [hoje, ligado] of [
      [GRUPOS_ACAO, GRUPOS_ACAO_RETORNOS],
      [GRUPOS_FII, GRUPOS_FII_RETORNOS],
      [GRUPOS_FII_ALAV_ATIVO, GRUPOS_FII_ALAV_ATIVO_RETORNOS],
    ]) {
      const p0 = hoje.find((g) => g.codigo === 'preco')!;
      const p1 = ligado.find((g) => g.codigo === 'preco')!;
      expect(p1.linhas.slice(0, p0.linhas.length)).toEqual(p0.linhas);
      const novas = p1.linhas.slice(p0.linhas.length);
      expect(novas.map((l) => [l.codigo, l.rotulo, l.formato])).toEqual([
        ['variacao12m', 'Retorno 12 meses', 'pctSinal'],
        ['variacao5a', 'Retorno 5 anos (a.a.)', 'pctSinal'],
      ]);
      for (const l of novas) {
        expect(l.sub).toContain('proventos reinvestidos');
        expect(encontrarProibidasV2(`${l.rotulo} ${l.sub}`)).toEqual([]);
      }
      // os outros grupos não mudam
      expect(ligado.filter((g) => g.codigo !== 'preco')).toEqual(
        hoje.filter((g) => g.codigo !== 'preco'),
      );
    }
  });
});

describe('montarComparadorPuro', () => {
  it('desligada: resposta idêntica à de hoje (sem as linhas de variação)', () => {
    const ativos = [
      ativo(LINHA_WEGE3, 'WEGE3', calculados('WEGE3', 'acao', 4.6, 12.3)),
      ativo(LINHA_WEGE3, 'PETR4', undefined),
    ];
    const hoje = montar('acao', ativos);
    expect(montar('acao', ativos, false)).toEqual(hoje);
    expect(preco(hoje).linhas.map((l) => l.codigo)).toEqual(['pl', 'pvp', 'pReceita']);
  });

  it('ligada (ação): valores com sinal, sem cor e sem ganhador; sem linha = sem dado', () => {
    const r = montar(
      'acao',
      [
        ativo(LINHA_WEGE3, 'WEGE3', calculados('WEGE3', 'acao', -4.6, 12.3)),
        ativo(LINHA_WEGE3, 'PETR4', null),
      ],
      true,
    );
    const p = preco(r);
    expect(p.linhas.map((l) => l.codigo)).toEqual([
      'pl',
      'pvp',
      'pReceita',
      'variacao12m',
      'variacao5a',
    ]);
    const v12 = p.linhas.find((l) => l.codigo === 'variacao12m')!;
    const v5 = p.linhas.find((l) => l.codigo === 'variacao5a')!;
    expect(v12.valores.WEGE3).toEqual({ estado: 'ok', valor: -4.6 });
    expect(v5.valores.WEGE3).toEqual({ estado: 'ok', valor: 12.3 });
    expect(v12.valores.PETR4).toMatchObject({ estado: 'ausente' });
    expect(v5.valores.PETR4).toMatchObject({ estado: 'ausente' });
    expect(v12.conferencia).toEqual({ WEGE3: null, PETR4: null });

    // cor neutra: o negativo da variação não pinta a célula; o texto leva o sinal
    expect(infoCelula(v12, 'WEGE3')).toMatchObject({ texto: '−4,6%', negativo: false });
    expect(infoCelula(v5, 'WEGE3')).toMatchObject({ texto: '+12,3%', negativo: false });
    expect(infoCelula(v12, 'PETR4').texto).toBe(formatarEstado(v12.valores.PETR4, 'pctSinal'));
    expect(infoCelula(v12, 'PETR4').texto).toBe('—');

    expect(JSON.stringify(p)).not.toMatch(/ganhador|vencedor|destaque|"cor|melhor|indice/i);
  });

  it('ligada (FII): mesma regra; evento não confirmado e série curta ficam sem dado', () => {
    const r = montar(
      'fii',
      [
        ativo(LINHA_HGLG11, 'HGLG11', calculados('HGLG11', 'fii', 2.1, -1.4)),
        ativo(LINHA_HGLG11, 'XPLG11', calculados('XPLG11', 'fii', 3, 4, ['evento_nao_confirmado'])),
        ativo(LINHA_HGLG11, 'GARE11', calculados('GARE11', 'fii', 5, null, ['serie_curta_5a'])),
      ],
      true,
    );
    const p = preco(r);
    expect(p.linhas.map((l) => l.codigo)).toEqual([
      'pvpFii',
      'vpCota',
      'variacao12m',
      'variacao5a',
    ]);
    const v12 = p.linhas.find((l) => l.codigo === 'variacao12m')!;
    const v5 = p.linhas.find((l) => l.codigo === 'variacao5a')!;
    expect(v12.valores.HGLG11).toEqual({ estado: 'ok', valor: 2.1 });
    expect(v5.valores.HGLG11).toEqual({ estado: 'ok', valor: -1.4 });
    expect(v12.valores.XPLG11).toMatchObject({
      estado: 'ausente',
      motivo: 'evento_nao_confirmado',
    });
    expect(v5.valores.XPLG11).toMatchObject({ estado: 'ausente', motivo: 'evento_nao_confirmado' });
    expect(v12.valores.GARE11).toEqual({ estado: 'ok', valor: 5 });
    expect(v5.valores.GARE11).toMatchObject({ estado: 'ausente', motivo: 'serie_curta' });
    expect(infoCelula(v5, 'HGLG11')).toMatchObject({ texto: '−1,4%', negativo: false });
  });

  it('ligada sem retornos lidos (dados sem o campo): sem dado, nada quebra', () => {
    const r = montar('acao', [ativo(LINHA_WEGE3, 'WEGE3', undefined)], true);
    const v12 = preco(r).linhas.find((l) => l.codigo === 'variacao12m')!;
    expect(v12.valores.WEGE3).toMatchObject({ estado: 'ausente' });
  });
});
