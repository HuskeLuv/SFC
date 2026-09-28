import { describe, expect, it } from 'vitest';
import { cellColorLabel, normalizeCellColor } from '../cellColor';

describe('normalizeCellColor', () => {
  it('hex da legenda em qualquer caixa', () => {
    expect(normalizeCellColor('#FF0000')).toBe('red');
    expect(normalizeCellColor('#ff0000')).toBe('red');
    expect(normalizeCellColor('#76933c')).toBe('green');
    expect(normalizeCellColor('#0000FF')).toBe('blue');
    expect(normalizeCellColor('#9E8A58')).toBe('yellow');
    expect(normalizeCellColor(' #000000 ')).toBe('black');
  });

  it('hex curto', () => {
    expect(normalizeCellColor('#f00')).toBe('red');
    expect(normalizeCellColor('#000')).toBe('black');
  });

  it('tokens antigos', () => {
    expect(normalizeCellColor('red')).toBe('red');
    expect(normalizeCellColor('GREEN')).toBe('green');
  });

  it('vazio ou fora da legenda → null', () => {
    expect(normalizeCellColor(null)).toBeNull();
    expect(normalizeCellColor(undefined)).toBeNull();
    expect(normalizeCellColor('')).toBeNull();
    expect(normalizeCellColor('#16a34a')).toBeNull();
    expect(normalizeCellColor('purple')).toBeNull();
  });
});

describe('cellColorLabel', () => {
  it('rótulo da legenda', () => {
    expect(cellColorLabel('#FF0000')).toBe('Pago');
    expect(cellColorLabel('green')).toBe('Recebido');
    expect(cellColorLabel('#0000ff')).toBe('Lançamento Futuro');
    expect(cellColorLabel('#9E8A58')).toBe('Cartão crédito');
    expect(cellColorLabel('#000000')).toBe('Pagar/Receber');
  });
  it('fora da legenda → null', () => {
    expect(cellColorLabel('#123456')).toBeNull();
    expect(cellColorLabel(null)).toBeNull();
  });
});
