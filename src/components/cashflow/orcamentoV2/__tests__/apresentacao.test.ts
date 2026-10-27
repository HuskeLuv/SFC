import { describe, expect, it } from 'vitest';
import { textoConsumido, textoTolerancia } from '../apresentacao';

describe('textoConsumido', () => {
  const ritmo = 27 / 31; // 87,1%

  it('perto do traço (< 1 p.p.) ganha uma casa: 87,0% azul × 87,2% laranja', () => {
    expect(textoConsumido(174 / 200, ritmo)).toBe('87,0%');
    expect(textoConsumido(523 / 600, ritmo)).toBe('87,2%');
    expect(textoConsumido(0.88, ritmo)).toBe('88,0%');
  });

  it('longe do traço continua sem casas', () => {
    expect(textoConsumido(0.9, ritmo)).toBe('90%');
    expect(textoConsumido(0.85, ritmo)).toBe('85%');
  });

  it('período fechado ou futuro (ritmo 1): sem casas, mesmo perto de 100%', () => {
    expect(textoConsumido(0.996, 1)).toBe('100%');
    expect(textoConsumido(1.003, 1)).toBe('100%');
  });

  it('sem orçado → "—"', () => {
    expect(textoConsumido(null, ritmo)).toBe('—');
  });
});

describe('textoTolerancia', () => {
  it('acima do orçado sem virar estouro → explica a margem', () => {
    expect(textoTolerancia(300, 301, 'ok')).toMatch(/^R\$\s1,00 acima do orçado, dentro da margem/);
  });

  it('estouro, dentro do orçado, centavo de arredondamento ou sem orçado → null', () => {
    expect(textoTolerancia(800, 805, 'bad')).toBeNull();
    expect(textoTolerancia(300, 290, 'ok')).toBeNull();
    expect(textoTolerancia(300, 300.004, 'ok')).toBeNull();
    expect(textoTolerancia(0, 120, 'bad')).toBeNull();
  });
});
