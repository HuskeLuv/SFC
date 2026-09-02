import { describe, it, expect } from 'vitest';
import {
  parsePrazoDias,
  liquidezTotalDias,
  pickLiquidezDeclarada,
  LIQUIDEZ_NAO_INFORMADA,
} from '../liquidezResgate';

describe('parsePrazoDias', () => {
  it('reconhece D+N nas grafias comuns', () => {
    expect(parsePrazoDias('D+0')).toBe(0);
    expect(parsePrazoDias('d+1')).toBe(1);
    expect(parsePrazoDias('D + 30')).toBe(30);
    expect(parsePrazoDias('D360')).toBe(360);
    expect(parsePrazoDias('+4')).toBe(4);
  });

  it('reconhece "Imediata" e "N dias"', () => {
    expect(parsePrazoDias('Imediata')).toBe(0);
    expect(parsePrazoDias('imediato')).toBe(0);
    expect(parsePrazoDias('30 dias')).toBe(30);
    expect(parsePrazoDias('5 dias úteis')).toBe(5);
    expect(parsePrazoDias('45')).toBe(45);
  });

  it('devolve null pra não informado ou texto livre', () => {
    expect(parsePrazoDias(null)).toBeNull();
    expect(parsePrazoDias('')).toBeNull();
    expect(parsePrazoDias(LIQUIDEZ_NAO_INFORMADA)).toBeNull();
    expect(parsePrazoDias('a combinar')).toBeNull();
  });
});

describe('liquidezTotalDias', () => {
  it('soma cotização + liquidação', () => {
    expect(liquidezTotalDias('D+30', 'D+1')).toBe(31);
    expect(liquidezTotalDias('D+0', 'Imediata')).toBe(0);
  });

  it('usa só o lado reconhecível quando o outro falta', () => {
    expect(liquidezTotalDias('D+4', '')).toBe(4);
    expect(liquidezTotalDias(null, 'D+2')).toBe(2);
  });

  it('null quando nenhum dos dois foi informado', () => {
    expect(liquidezTotalDias('', null)).toBeNull();
    expect(liquidezTotalDias('—', '—')).toBeNull();
  });
});

describe('pickLiquidezDeclarada', () => {
  it('pega cada campo da compra mais recente que o tenha', () => {
    const notes = [
      { operation: { action: 'aporte' } },
      { cotizacaoResgate: 'D+30' },
      { cotizacaoResgate: 'D+0', liquidacaoResgate: 'D+2' },
    ];
    expect(pickLiquidezDeclarada(notes)).toEqual({
      cotizacaoResgate: 'D+30',
      liquidacaoResgate: 'D+2',
    });
  });

  it('ignora notes nulas, malformadas e strings vazias', () => {
    expect(pickLiquidezDeclarada([null, 'x', { cotizacaoResgate: '  ' }])).toEqual({});
  });
});
