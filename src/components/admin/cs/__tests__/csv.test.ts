import { describe, it, expect } from 'vitest';
import { campoCsv, gerarCsv } from '../csv';

describe('csv do painel de CS', () => {
  it('escapa separador, aspas e quebra de linha', () => {
    expect(campoCsv('Silva; João')).toBe('"Silva; João"');
    expect(campoCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(campoCsv('a\nb')).toBe('"a\nb"');
    expect(campoCsv(null)).toBe('');
    expect(campoCsv(true)).toBe('Sim');
    expect(campoCsv(3)).toBe('3');
  });

  it('neutraliza fórmula no início do texto', () => {
    expect(campoCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(campoCsv('-5')).toBe("'-5");
    expect(campoCsv(-5)).toBe('-5');
  });

  it('gera com BOM, ; e CRLF', () => {
    expect(gerarCsv(['Nome', 'Ativos'], [['Ana', 2]])).toBe('﻿Nome;Ativos\r\nAna;2\r\n');
  });
});
