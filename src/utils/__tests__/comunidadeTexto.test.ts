import { describe, it, expect } from 'vitest';
import { separarLinks, tempoRelativo } from '../comunidadeTexto';

describe('tempoRelativo', () => {
  const agora = new Date('2026-09-23T15:00:00Z');

  it('usa minutos, horas e dias até uma semana', () => {
    expect(tempoRelativo('2026-09-23T14:59:30Z', agora)).toBe('agora');
    expect(tempoRelativo('2026-09-23T14:55:00Z', agora)).toBe('há 5 min');
    expect(tempoRelativo('2026-09-23T12:00:00Z', agora)).toBe('há 3 h');
    expect(tempoRelativo('2026-09-21T15:00:00Z', agora)).toBe('há 2 d');
  });

  it('mostra a data depois de uma semana', () => {
    expect(tempoRelativo('2026-09-01T15:00:00Z', agora)).toBe('01/09/2026');
  });
});

describe('separarLinks', () => {
  it('isola links http(s) e deixa a pontuação final fora', () => {
    expect(separarLinks('veja https://exemplo.com/a?b=1. ok')).toEqual([
      { tipo: 'texto', valor: 'veja ' },
      { tipo: 'link', valor: 'https://exemplo.com/a?b=1' },
      { tipo: 'texto', valor: '. ok' },
    ]);
  });

  it('não transforma javascript: nem texto sem esquema', () => {
    expect(separarLinks('javascript:alert(1) exemplo.com')).toEqual([
      { tipo: 'texto', valor: 'javascript:alert(1) exemplo.com' },
    ]);
  });

  it('aceita link entre parênteses', () => {
    expect(separarLinks('(http://a.com)')).toEqual([
      { tipo: 'texto', valor: '(' },
      { tipo: 'link', valor: 'http://a.com' },
      { tipo: 'texto', valor: ')' },
    ]);
  });
});
