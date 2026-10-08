import { describe, expect, it } from 'vitest';
import {
  adicionarTicker,
  lerEstadoComparador,
  queryComparador,
  removerTicker,
  urlCompartilhavel,
} from '../useEstadoComparadorUrl';

const ler = (q: string) => lerEstadoComparador(new URLSearchParams(q));

describe('estado do Comparador na URL', () => {
  it('?t= é a fonte: maiúsculas, dedupe, formato inválido fora, ordem preservada', () => {
    expect(ler('t=wege3,ITUB4,WEGE3,x;y,,TAEE11')).toEqual({
      tickers: ['WEGE3', 'ITUB4', 'TAEE11'],
      classe: null,
    });
    expect(ler('')).toEqual({ tickers: [], classe: null });
  });

  it('aba sem tickers em ?c=', () => {
    expect(ler('c=fii').classe).toBe('fii');
    expect(ler('c=outra').classe).toBeNull();
  });

  it('query: tickers com vírgula literal; sem tickers, c=fii ou vazio (trocar de aba limpa)', () => {
    expect(queryComparador({ tickers: ['WEGE3', 'ITUB4'], classe: 'fii' })).toBe('t=WEGE3,ITUB4');
    expect(queryComparador({ tickers: [], classe: 'fii' })).toBe('c=fii');
    expect(queryComparador({ tickers: [], classe: 'acao' })).toBe('');
  });

  it('adicionar respeita o limite de 4 e não repete; remover tira só o pedido', () => {
    expect(adicionarTicker(['A1111', 'B2222'], 'c3333')).toEqual(['A1111', 'B2222', 'C3333']);
    expect(adicionarTicker(['A1111'], 'A1111')).toEqual(['A1111']);
    const cheio = ['AAAA1', 'BBBB1', 'CCCC1', 'DDDD1'];
    expect(adicionarTicker(cheio, 'EEEE1')).toEqual(cheio);
    expect(removerTicker(cheio, 'BBBB1')).toEqual(['AAAA1', 'CCCC1', 'DDDD1']);
  });

  it('link compartilhável absoluto', () => {
    expect(
      urlCompartilhavel('https://app.x', '/analise-ativos/comparador', ['HGLG11', 'XPLG11']),
    ).toBe('https://app.x/analise-ativos/comparador?t=HGLG11,XPLG11');
  });
});
