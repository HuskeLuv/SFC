import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockLinhas = vi.hoisted(() => ({ obterLinhasQuadroApi: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { montarParesAtivo, obterParesAtivo, selecionarParesAtivo } from '../paresAtivo';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { AnaliseQuadroLinha } from '@prisma/client';

// paraLinhaQuadroApi é pura; o mock acima só troca a leitura do banco.
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return { ...real, obterLinhasQuadroApi: mockLinhas.obterLinhasQuadroApi };
});

const acao = (symbol: string, over: Partial<AnaliseQuadroLinha> = {}) =>
  paraLinhaQuadroApi(
    linhaQuadroDb({
      symbol,
      segmento: 'Motores, Compressores e Outros',
      subsetor: 'Máquinas e Equipamentos',
      ...over,
    }),
  );
const fii = (symbol: string, over: Partial<AnaliseQuadroLinha> = {}) =>
  paraLinhaQuadroApi(
    linhaQuadroDb({ symbol, classe: 'fii', fiiTipo: 'tijolo', segmentoCvm: 'Logística', ...over }),
  );
const vm = (v: string) => new Prisma.Decimal(v);

describe('paresAtivo', () => {
  beforeEach(() => mockLinhas.obterLinhasQuadroApi.mockReset());

  it('ações: mesmo segmento por valor de mercado, completado pelo subsetor; próprio ativo primeiro', () => {
    const alvo = acao('WEGE3', { valorMercado: vm('200') });
    const linhas = [
      alvo,
      acao('SHUL4', { valorMercado: vm('5') }),
      acao('ROMI3', { segmento: 'Máq. e Equip. Industriais', valorMercado: vm('3') }),
      acao('KEPL3', { segmento: 'Máq. e Equip. Industriais', valorMercado: vm('8') }),
      acao('TASA4', { segmento: 'Armas e Munições', valorMercado: vm('4') }),
      acao('OUTR3', { segmento: 'Bancos', subsetor: 'Intermediários Financeiros' }),
      acao('FORA3', { noQuadro: false, foraDoQuadroMotivo: 'sem_negociacao_30' }),
    ];
    expect(selecionarParesAtivo(alvo, linhas)).toEqual(['SHUL4', 'KEPL3', 'TASA4', 'ROMI3']);
    const r = montarParesAtivo(alvo, linhas);
    expect(r.itens.map((l) => l.ticker)).toEqual(['WEGE3', 'SHUL4', 'KEPL3', 'TASA4', 'ROMI3']);
    expect(r.criterio).toBe(TEXTOS_TELA.ativo.criterioParesAcao);
  });

  it('usa os pares gravados pelo job quando existem (e só os que estão no Quadro), no máximo 5', () => {
    const alvo = acao('ITUB4', {
      pares: ['BBDC4', 'FORA3', 'BBAS3', 'SANB11', 'BPAC11', 'ABCB4', 'BRSR6'],
    });
    const linhas = [
      alvo,
      ...['BBDC4', 'BBAS3', 'SANB11', 'BPAC11', 'ABCB4', 'BRSR6'].map((t) => acao(t)),
      acao('FORA3', { noQuadro: false }),
    ];
    expect(selecionarParesAtivo(alvo, linhas)).toEqual([
      'BBDC4',
      'BBAS3',
      'SANB11',
      'BPAC11',
      'ABCB4',
    ]);
  });

  it('FIIs: mesmo segmento CVM e tipo, por patrimônio', () => {
    const alvo = fii('HGLG11', { patrimonio: vm('7000') });
    const linhas = [
      alvo,
      fii('BTLG11', { patrimonio: vm('4000') }),
      fii('XPLG11', { patrimonio: vm('3000') }),
      fii('VILG11', { patrimonio: vm('1900') }),
      fii('KNCR11', { fiiTipo: 'papel', patrimonio: vm('9000') }),
      fii('HSML11', { segmentoCvm: 'Shoppings', patrimonio: vm('9000') }),
    ];
    const r = montarParesAtivo(alvo, linhas);
    expect(r.itens.map((l) => l.ticker)).toEqual(['HGLG11', 'BTLG11', 'XPLG11', 'VILG11']);
    expect(r.criterio).toBe(TEXTOS_TELA.ativo.criterioParesFii);
  });

  it('sem pares: só o próprio ativo', () => {
    const alvo = acao('SOLO3', { segmento: 'Único', subsetor: 'Único' });
    expect(
      montarParesAtivo(alvo, [alvo, acao('OUTR3', { segmento: 'X', subsetor: 'Y' })]).itens,
    ).toEqual([alvo]);
    const semSegmento = fii('ABCD11', { segmentoCvm: null });
    expect(selecionarParesAtivo(semSegmento, [semSegmento, fii('EFGH11')])).toEqual([]);
  });

  it('obterParesAtivo: ticker fora da área = null; lê as linhas em memória (inclusive fora do Quadro)', async () => {
    const alvo = acao('WEGE3');
    mockLinhas.obterLinhasQuadroApi.mockResolvedValue([alvo, acao('SHUL4')]);
    expect(await obterParesAtivo('XXXX3')).toBeNull();
    const r = await obterParesAtivo('wege3');
    expect(r?.itens.map((l) => l.ticker)).toEqual(['WEGE3', 'SHUL4']);
    expect(mockLinhas.obterLinhasQuadroApi).toHaveBeenCalledWith(undefined, {
      incluirForaDoQuadro: true,
    });
  });
});
