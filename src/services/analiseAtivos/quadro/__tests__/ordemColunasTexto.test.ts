import { describe, expect, it } from 'vitest';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { compararLinhas } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { AnaliseQuadroLinha } from '@prisma/client';

const api = (symbol: string, over: Partial<AnaliseQuadroLinha>) =>
  paraLinhaQuadroApi(linhaQuadroDb({ symbol, ...over }));
const ordenar = (linhas: ReturnType<typeof api>[], ...args: Parameters<typeof compararLinhas>) =>
  [...linhas].sort(compararLinhas(...args)).map((l) => l.ticker);

describe('ordem das colunas do HTML do Pedro (23/10)', () => {
  it('setor: A–Z pelo rótulo (pt-BR), sem dado no fim nas duas direções', () => {
    const linhas = [
      api('CCCC3', { setor: 'Utilidade Pública' }),
      api('AAAA3', { setor: null }),
      api('BBBB3', { setor: 'Bens Industriais' }),
      api('DDDD3', { setor: 'Saúde' }),
    ];
    expect(ordenar(linhas, 'setor', 'asc')).toEqual(['BBBB3', 'DDDD3', 'CCCC3', 'AAAA3']);
    expect(ordenar(linhas, 'setor', 'desc')).toEqual(['CCCC3', 'DDDD3', 'BBBB3', 'AAAA3']);
  });

  it('imóveis: imóveis + CRIs do informe; sem os dois no fim', () => {
    const linhas = [
      api('AAAA11', { classe: 'fii', nImoveisCvm: 3, nCri: null }),
      api('BBBB11', { classe: 'fii', nImoveisCvm: null, nCri: null }),
      api('CCCC11', { classe: 'fii', nImoveisCvm: null, nCri: 40 }),
    ];
    expect(ordenar(linhas, 'imoveis', 'desc')).toEqual(['CCCC11', 'AAAA11', 'BBBB11']);
  });

  it('na carteira: posição, depois planejado, depois o resto (A–Z dentro de cada grupo)', () => {
    const linhas = ['EEEE3', 'DDDD3', 'CCCC3', 'BBBB3', 'AAAA3'].map((s) => api(s, {}));
    const carteira = { posicoes: new Set(['DDDD3', 'BBBB3']), planejados: new Set(['CCCC3']) };
    expect(ordenar(linhas, 'naCarteira', 'desc', carteira)).toEqual([
      'BBBB3',
      'DDDD3',
      'CCCC3',
      'AAAA3',
      'EEEE3',
    ]);
    // sem a carteira carregada, a ordem cai no A–Z
    expect(ordenar(linhas, 'naCarteira', 'desc')).toEqual([
      'AAAA3',
      'BBBB3',
      'CCCC3',
      'DDDD3',
      'EEEE3',
    ]);
  });
});
