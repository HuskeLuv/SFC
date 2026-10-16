import { describe, expect, it } from 'vitest';
import {
  criteriosAnteriorDoMarco,
  montarLinhasDaLista,
} from '@/services/analiseAtivos/salvos/linhasDaLista';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';

const QUADRO_ACAO = LINHAS_FIXTURE.filter((l) => l.classe === 'acao' && l.noQuadro).map(
  paraLinhaQuadroApi,
);
const salvoEm = new Date('2026-10-10T12:00:00Z');

describe('criteriosAnteriorDoMarco', () => {
  const marco = (mudouEm: string) => ({
    atendidos: 5,
    aplicaveis: 6,
    anterior: { atendidos: 4, aplicaveis: 6 },
    mudouEm,
  });

  it('só quando a mudança é DEPOIS de o item ter sido salvo', () => {
    expect(criteriosAnteriorDoMarco(marco('2026-10-16T11:10:00Z'), salvoEm)).toEqual({
      atendidos: 4,
      aplicaveis: 6,
      mudouEm: '2026-10-16T11:10:00.000Z',
    });
    expect(criteriosAnteriorDoMarco(marco('2026-10-01T11:10:00Z'), salvoEm)).toBeUndefined();
    expect(criteriosAnteriorDoMarco(marco(salvoEm.toISOString()), salvoEm)).toBeUndefined();
  });

  it('marco ilegível, sem anterior ou sem data → nada', () => {
    expect(criteriosAnteriorDoMarco(null, salvoEm)).toBeUndefined();
    expect(criteriosAnteriorDoMarco({ atendidos: 5 }, salvoEm)).toBeUndefined();
    expect(
      criteriosAnteriorDoMarco({ anterior: { atendidos: 4, aplicaveis: 6 } }, salvoEm),
    ).toBeUndefined();
    expect(
      criteriosAnteriorDoMarco(
        { anterior: { atendidos: '4', aplicaveis: 6 }, mudouEm: '2026-10-16T00:00:00Z' },
        salvoEm,
      ),
    ).toBeUndefined();
  });
});

describe('montarLinhasDaLista', () => {
  const itens = [
    { symbol: 'WEGE3', classe: 'acao' as const, createdAt: salvoEm },
    { symbol: 'ITUB4', classe: 'acao' as const, createdAt: salvoEm },
    { symbol: 'CEDO4', classe: 'acao' as const, createdAt: salvoEm }, // fora do Quadro
    { symbol: 'HGLG11', classe: 'fii' as const, createdAt: salvoEm }, // outra classe
    { symbol: 'AAPL', classe: 'stock' as const, createdAt: salvoEm }, // reservada (bloco 4)
  ];

  it('linhas da classe em A–Z + Adicionado em; fora do Quadro e reservadas separadas', () => {
    const r = montarLinhasDaLista({
      classe: 'acao',
      itens,
      linhasQuadro: QUADRO_ACAO,
      marcos: new Map([
        ['WEGE3', { anterior: { atendidos: 4, aplicaveis: 6 }, mudouEm: '2026-10-16T11:10:00Z' }],
      ]),
    });
    expect(r.linhas.map((l) => l.ticker)).toEqual(['ITUB4', 'WEGE3']);
    expect(r.linhas.every((l) => l.adicionadoEm === salvoEm.toISOString())).toBe(true);
    expect(r.linhas.find((l) => l.ticker === 'WEGE3')?.criteriosAnterior?.atendidos).toBe(4);
    expect(r.linhas.find((l) => l.ticker === 'ITUB4')).not.toHaveProperty('criteriosAnterior');
    expect(r.foraDoQuadro).toEqual([
      {
        ticker: 'AAPL',
        classe: 'stock',
        motivo: 'classe_reservada',
        adicionadoEm: salvoEm.toISOString(),
      },
      {
        ticker: 'CEDO4',
        classe: 'acao',
        motivo: 'fora_do_quadro',
        adicionadoEm: salvoEm.toISOString(),
      },
    ]);
  });

  it('respeita a ordem pedida (ticker desc)', () => {
    const r = montarLinhasDaLista({
      classe: 'acao',
      itens,
      linhasQuadro: QUADRO_ACAO,
      marcos: new Map(),
      ordem: 'ticker',
      dir: 'desc',
    });
    expect(r.linhas.map((l) => l.ticker)).toEqual(['WEGE3', 'ITUB4']);
  });
});
