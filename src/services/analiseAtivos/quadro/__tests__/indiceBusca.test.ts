import { describe, it, expect } from 'vitest';
import { LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  filtrarBusca,
  montarIndiceBusca,
  normalizarBusca,
  trechoDestacado,
  type LinhaParaBusca,
} from '../indiceBusca';

const extra: LinhaParaBusca[] = [
  {
    symbol: 'PETR4',
    nome: 'Petróleo Brasileiro S.A. Petrobras',
    classe: 'acao',
    noQuadro: true,
    indiceMf: 7.1,
    estadoIndice: 'calculado',
    fiiTipo: null,
    foraDoQuadroMotivo: null,
  },
  {
    symbol: 'PETR3',
    nome: 'Petróleo Brasileiro S.A. Petrobras',
    classe: 'acao',
    noQuadro: true,
    indiceMf: 7,
    estadoIndice: 'calculado',
    fiiTipo: null,
    foraDoQuadroMotivo: null,
  },
  {
    symbol: 'ITSA4',
    nome: 'Itaúsa S.A.',
    classe: 'acao',
    noQuadro: true,
    indiceMf: 8,
    estadoIndice: 'calculado',
    fiiTipo: null,
    foraDoQuadroMotivo: null,
  },
  {
    symbol: 'HGPO11',
    nome: 'CSHG Prime Offices',
    classe: 'fii',
    noQuadro: false,
    indiceMf: 5,
    estadoIndice: 'calculado',
    fiiTipo: 'tijolo',
    foraDoQuadroMotivo: 'sem_negociacao_30',
  },
  {
    symbol: 'WEGX3',
    nome: 'Outra Weg',
    classe: 'acao',
    noQuadro: true,
    indiceMf: 1,
    estadoIndice: 'calculado',
    fiiTipo: null,
    foraDoQuadroMotivo: null,
  },
];

const INDICE = montarIndiceBusca([...LINHAS_FIXTURE, ...extra]);
const busca = (q: string) => filtrarBusca(INDICE, q).map((r) => r.item.t);

describe('indiceBusca', () => {
  it('monta o índice compacto com TODAS as linhas, inclusive fora do Quadro', () => {
    const cedo = INDICE.find((i) => i.t === 'CEDO4');
    expect(cedo).toMatchObject({ c: 'acao', q: false, m: 'sem_negociacao_30' });
    const hctr = INDICE.find((i) => i.t === 'HCTR11');
    expect(hctr).toMatchObject({ c: 'fii', q: true, i: null, e: 'sem_score', f: 'papel', m: null });
    expect(INDICE.find((i) => i.t === 'HFOF11')?.i).toBeNull();
    expect(INDICE.find((i) => i.t === 'WEGE3')?.i).toBe(9.01);
  });

  it("'weg': prefixo do ticker primeiro", () => {
    const r = busca('weg');
    expect(r[0]).toBe('WEGE3');
    expect(r).toContain('WEGX3');
  });

  it("'itau': nome sem acento (Itaú) por prefixo de palavra", () => {
    const r = busca('itau');
    expect(r).toContain('ITUB4');
    expect(r).toContain('ITSA4');
    expect(busca('ITAÚ')).toEqual(r);
  });

  it("'hglg': ticker do FII", () => {
    expect(busca('hglg')).toEqual(['HGLG11']);
  });

  it("'petr': os dois tickers, em ordem", () => {
    expect(busca('petr')).toEqual(['PETR3', 'PETR4']);
  });

  it('relevância: prefixo do ticker > prefixo de palavra > substring; Quadro antes', () => {
    const r = filtrarBusca(INDICE, 'hg');
    expect(r.every((x) => x.relevancia === 0)).toBe(true);
    expect(r.map((x) => x.item.t).indexOf('HGLG11')).toBeLessThan(
      r.map((x) => x.item.t).indexOf('HGPO11'),
    );
    expect(filtrarBusca(INDICE, 'brasileiro')[0].relevancia).toBe(1);
    expect(filtrarBusca(INDICE, 'robras')[0].relevancia).toBe(2);
  });

  it('no máximo 8 e vazio sem consulta ou sem resultado', () => {
    expect(filtrarBusca(INDICE, 'a').length).toBeLessThanOrEqual(8);
    expect(filtrarBusca(INDICE, '   ')).toEqual([]);
    expect(filtrarBusca(INDICE, 'AAPL')).toEqual([]);
  });

  it('normaliza e destaca o trecho no texto original', () => {
    expect(normalizarBusca('  Itaú ')).toBe('itau');
    expect(trechoDestacado('Itaú Unibanco', 'itau')).toEqual([0, 4]);
    expect(trechoDestacado('WEGE3', 'ge')).toEqual([2, 4]);
    expect(trechoDestacado('WEGE3', 'xx')).toBeNull();
  });
});
