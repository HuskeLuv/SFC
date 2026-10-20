/**
 * A6 (item 7, fatia E): 'Alavancagem (% do ativo)' no Comparador de FII, só com
 * ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO. Desligada, o catálogo e a resposta são os de hoje; ligada,
 * uma linha nova no grupo 'Endividamento · fonte CVM', sem cor, sem ganhador e com o valor da linha
 * do Quadro de cada fundo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import {
  montarComparadorPuro,
  type AtivoEntrada,
} from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  GRUPOS_FII,
  GRUPOS_FII_ALAV_ATIVO,
  catalogoComparador,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import { LINHA_HGLG11 } from '@/test/fixtures/analiseAtivos/linhasDb';

afterEach(() => {
  vi.unstubAllEnvs();
});

function ativo(ticker: string, obrigacoesAtivoPct: number | null): AtivoEntrada {
  vi.stubEnv('ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO', 'true');
  const linha = paraLinhaQuadroApi({ ...LINHA_HGLG11, symbol: ticker, obrigacoesAtivoPct });
  return {
    dados: {
      linha,
      atual: { divLiqPl: null, pReceita: null, rend12m: 13, vpCota: 160, naoSeAplica: [] },
      trimestre: { nImoveis: 20, areaM2: 1_000_000, nCri: null },
      cnpjEmConferencia: false,
      regua: 'fii_tijolo',
    },
    flags: [],
    motivos: [],
    serie: [],
    criterios: null,
  };
}

const endividamento = (alavAtivo: boolean | undefined, ativos: AtivoEntrada[]) =>
  montarComparadorPuro({
    classe: 'fii',
    hoje: '2026-10-19',
    janela: 5,
    params: CRITERIA_PARAMS_V3,
    ativos,
    alavAtivo,
  }).grupos.find((g) => g.codigo === 'endividamento')!;

describe('catálogo', () => {
  it('desligada: o de hoje (só Obrigações/PL); ligada: + Alavancagem (% do ativo)', () => {
    expect(catalogoComparador('fii')).toBe(GRUPOS_FII);
    expect(catalogoComparador('fii', { alavAtivo: false })).toBe(GRUPOS_FII);
    const ligado = catalogoComparador('fii', { alavAtivo: true });
    expect(ligado).toBe(GRUPOS_FII_ALAV_ATIVO);
    const e = ligado.find((g) => g.codigo === 'endividamento')!;
    expect(e.linhas.map((l) => l.rotulo)).toEqual(['Obrigações/PL', 'Alavancagem (% do ativo)']);
    expect(e.linhas[1].sub).toBe('obrigações ÷ ativo total');
    expect(encontrarProibidasV2(`${e.linhas[1].rotulo} ${e.linhas[1].sub}`)).toEqual([]);
    // os outros grupos não mudam
    expect(ligado.filter((g) => g.codigo !== 'endividamento')).toEqual(
      GRUPOS_FII.filter((g) => g.codigo !== 'endividamento'),
    );
    // ação, stock e REIT ignoram a chave
    expect(catalogoComparador('acao', { alavAtivo: true })).toBe(catalogoComparador('acao'));
  });
});

describe('montarComparadorPuro', () => {
  it('desligada: resposta idêntica à de hoje', () => {
    const ativos = [ativo('HGLG11', 12.5), ativo('XPLG11', 4)];
    const hoje = montarComparadorPuro({
      classe: 'fii',
      hoje: '2026-10-19',
      janela: 5,
      params: CRITERIA_PARAMS_V3,
      ativos,
    });
    const desligada = montarComparadorPuro({
      classe: 'fii',
      hoje: '2026-10-19',
      janela: 5,
      params: CRITERIA_PARAMS_V3,
      ativos,
      alavAtivo: false,
    });
    expect(desligada).toEqual(hoje);
    expect(endividamento(false, ativos).linhas.map((l) => l.codigo)).toEqual(['obrigacoesPl']);
  });

  it('ligada: valor de cada fundo, sem cor e sem ganhador; sem dado = ausente', () => {
    const e = endividamento(true, [ativo('HGLG11', 12.5), ativo('XPLG11', null)]);
    const l = e.linhas.find((x) => x.codigo === 'obrigacoesAtivo')!;
    expect(l).toMatchObject({ rotulo: 'Alavancagem (% do ativo)', formato: 'pct' });
    expect(l.valores.HGLG11).toEqual({ estado: 'ok', valor: 12.5 });
    expect(l.valores.XPLG11).toMatchObject({ estado: 'ausente' });
    // a linha de PL continua com o próprio valor
    expect(e.linhas.find((x) => x.codigo === 'obrigacoesPl')!.valores.HGLG11).toEqual({
      estado: 'ok',
      valor: 16.25,
    });
    expect(JSON.stringify(l)).not.toMatch(/ganhador|vencedor|destaque|cor|melhor|indice/i);
  });
});
