import { describe, it, expect } from 'vitest';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  compararLinhas,
  consultarQuadro,
  ehCompleta,
  facetasDe,
  filtrarLinhas,
  frescorCotacao,
} from '../consultaQuadro';
import type { LinhaQuadroApi, QuadroParams } from '@/types/analiseAtivosApi';

const API = LINHAS_FIXTURE.map(paraLinhaQuadroApi);
const por = (t: string) => API.find((l) => l.ticker === t)!;
const tickers = (ls: LinhaQuadroApi[]) => ls.map((l) => l.ticker);

function consultar(
  params: QuadroParams,
  extra: Partial<Parameters<typeof consultarQuadro>[0]> = {},
) {
  return consultarQuadro({
    params,
    linhas: API,
    versao: 'v1',
    dataRef: '2026-09-29',
    hoje: '2026-09-30',
    ...extra,
  });
}

describe('consultaQuadro · filtros', () => {
  const acoes = API.filter((l) => l.classe === 'acao' && l.noQuadro);
  const fiis = API.filter((l) => l.classe === 'fii' && l.noQuadro);

  it('só linhas do Quadro (CEDO4 fora) e contagens por classe', () => {
    const r = consultar({ classe: 'acao' });
    expect(tickers(r.itens)).not.toContain('CEDO4');
    expect(r.contagens).toEqual({ acao: acoes.length, fii: fiis.length });
    expect(r.total).toBe(acoes.length);
  });

  it('lucroConsistente = 5+ anos de lucro seguidos (AURE3 sai)', () => {
    const r = tickers(filtrarLinhas(acoes, { lucroConsistente: true }));
    expect(r).toContain('WEGE3');
    expect(r).not.toContain('AURE3');
  });

  it('dyMin: ausente/n/a nunca passa', () => {
    const r = tickers(filtrarLinhas(acoes, { dyMin: 4 }));
    expect(r).toContain('ITUB4');
    expect(r).not.toContain('WEGE3'); // 3,98%
    expect(r).not.toContain('TGMA3'); // DY ausente
  });

  it('pvpMax e tipo (FIIs)', () => {
    expect(tickers(filtrarLinhas(fiis, { pvpMax: 1 })).sort()).toEqual(
      ['HCTR11', 'HFOF11', 'HGLG11'].sort(),
    );
    expect(tickers(filtrarLinhas(fiis, { tipo: 'papel' }))).toEqual(['HCTR11']);
  });

  it('setor (ações) e segmento CVM (FIIs)', () => {
    expect(tickers(filtrarLinhas(acoes, { setor: 'Financeiro' }))).toEqual(['ITUB4']);
    expect(tickers(filtrarLinhas(fiis, { segmento: 'Multicategoria' }))).toEqual(['HGLG11']);
  });

  it('naCarteira usa o conjunto do usuário', () => {
    const r = filtrarLinhas(acoes, { naCarteira: true }, new Set(['WEGE3', 'ITUB4']));
    expect(tickers(r).sort()).toEqual(['ITUB4', 'WEGE3']);
    expect(filtrarLinhas(acoes, { naCarteira: true })).toEqual([]);
  });

  it('somenteCompletos tira incompleto, sem Índice e fora do Índice; zero pela regra fica', () => {
    const r = tickers(filtrarLinhas([...acoes, ...fiis], { somenteCompletos: true }));
    expect(r).toContain('AURE3');
    expect(r).not.toContain('TGMA3');
    expect(r).not.toContain('HCTR11');
    expect(r).not.toContain('HFOF11');
    expect(ehCompleta(por('WEGE3'))).toBe(true);
  });

  it('filtros combinam (AND)', () => {
    const r = filtrarLinhas(acoes, { lucroConsistente: true, dyMin: 4, setor: 'Financeiro' });
    expect(tickers(r)).toEqual(['ITUB4']);
    expect(filtrarLinhas(acoes, { dyMin: 4, setor: 'Bens Industriais' })).toEqual([]);
  });
});

describe('consultaQuadro · ordem', () => {
  const linhas = [
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'BBB3', pl: 5, indiceMf: 6 })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'AAA3', pl: null, indiceMf: 9 })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'CCC3', pl: 12, indiceMf: null })),
    paraLinhaQuadroApi(
      linhaQuadroDb({ symbol: 'DDD3', pl: 5, naoSeAplica: ['pl'], estadoIndice: 'sem_score' }),
    ),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'EEE3', pl: 5, indiceMf: 6 })),
  ];

  it('nulos e n/a no fim nas duas direções; desempate por ticker', () => {
    expect(tickers([...linhas].sort(compararLinhas('pl', 'asc')))).toEqual([
      'BBB3',
      'EEE3',
      'CCC3',
      'AAA3',
      'DDD3',
    ]);
    expect(tickers([...linhas].sort(compararLinhas('pl', 'desc')))).toEqual([
      'CCC3',
      'BBB3',
      'EEE3',
      'AAA3',
      'DDD3',
    ]);
  });

  it('sem_score e fora_do_indice ordenam como nulos no Índice MF', () => {
    const desc = tickers([...linhas].sort(compararLinhas('indiceMf', 'desc')));
    expect(desc.slice(0, 3)).toEqual(['AAA3', 'BBB3', 'EEE3']);
    expect(desc.slice(3)).toEqual(['CCC3', 'DDD3']);
    const asc = tickers([...linhas].sort(compararLinhas('indiceMf', 'asc')));
    expect(asc.slice(3)).toEqual(['CCC3', 'DDD3']);
  });

  it('padrão: Índice MF maior primeiro; ticker asc/desc', () => {
    const r = consultar({ classe: 'fii' });
    expect(r.itens[0].ticker).toBe('HGLG11');
    expect(tickers(r.itens).slice(-2).sort()).toEqual(['HCTR11', 'HFOF11']);
    expect(tickers([...linhas].sort(compararLinhas('ticker', 'desc')))[0]).toBe('EEE3');
  });
});

describe('consultaQuadro · página, facetas e frescor', () => {
  const muitas = Array.from({ length: 60 }, (_, i) =>
    paraLinhaQuadroApi(
      linhaQuadroDb({
        symbol: `T${String(i).padStart(2, '0')}A3`,
        indiceMf: i % 7,
        setor: i % 2 ? 'Financeiro' : 'Saúde',
      }),
    ),
  );

  it('página de 25 estável e sem repetição; limite máximo 100', () => {
    const p = (offset: number) =>
      consultarQuadro({
        params: { classe: 'acao', offset },
        linhas: muitas,
        versao: 'v',
        dataRef: null,
        hoje: '2026-09-30',
      });
    const vistas = [...p(0).itens, ...p(25).itens, ...p(50).itens].map((l) => l.ticker);
    expect(p(0).itens).toHaveLength(25);
    expect(p(50).itens).toHaveLength(10);
    expect(new Set(vistas).size).toBe(60);
    expect(tickers(p(0).itens)).toEqual(tickers(p(0).itens));
    const grande = consultarQuadro({
      params: { classe: 'acao', limite: 500 },
      linhas: muitas,
      versao: 'v',
      dataRef: null,
      hoje: '2026-09-30',
    });
    expect(grande.limite).toBe(100);
  });

  it('facetas: setores (ações) / segmentos CVM e tipos (FIIs), antes dos filtros', () => {
    expect(facetasDe('acao', muitas).setores).toEqual(['Financeiro', 'Saúde']);
    const r = consultar({ classe: 'fii', tipo: 'papel' });
    expect(r.facetas.tipos).toEqual(['tijolo', 'papel', 'fof']);
    expect(r.total).toBe(1);
  });

  it('frescor da cotação em pregões', () => {
    expect(frescorCotacao(API, '2026-09-30')).toEqual({ data: '2026-09-29', status: 'em_dia' });
    // 02/10 de manhã: 30/09 e 01/10 saíram depois de 29/09; o de hoje ainda não fechou
    expect(frescorCotacao(API, '2026-10-02').status).toBe('em_dia');
    expect(frescorCotacao(API, '2026-10-05').status).toBe('atrasado');
    expect(frescorCotacao(API, '2026-10-08').status).toBe('atrasado');
    expect(frescorCotacao([], '2026-10-08')).toEqual({ data: null, status: 'sem_dado' });
  });
});
