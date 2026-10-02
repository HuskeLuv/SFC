import { describe, expect, it } from 'vitest';
import {
  encontrarPalavrasProibidas,
  PALAVRAS_PROIBIDAS,
} from '@/services/analiseAtivos/regras/comum/linguagem';

describe('encontrarPalavrasProibidas', () => {
  it("detecta 'preço justo', 'Preço-Alvo' e 'BARATO' (sem diferenciar maiúsculas)", () => {
    expect(encontrarPalavrasProibidas('O preço justo é R$ 10')).toEqual(['preço justo']);
    expect(encontrarPalavrasProibidas('Preço-Alvo de 12 meses')).toEqual(['preço-alvo']);
    expect(encontrarPalavrasProibidas('ESTÁ BARATO!')).toEqual(['barato']);
  });

  it('ignora acentos nos dois sentidos', () => {
    expect(encontrarPalavrasProibidas('empresa saudavel')).toEqual(['saudável']);
    expect(encontrarPalavrasProibidas('preco justo')).toEqual(['preço justo']);
  });

  it("casa só a palavra inteira: 'anotação', 'notável', 'Carolina', 'bombeiro', 'vendas' passam", () => {
    for (const t of ['anotação', 'notável', 'Carolina', 'bombeiro', 'vendas']) {
      expect(encontrarPalavrasProibidas(t)).toEqual([]);
    }
  });

  it('expressão com dois espaços (ou quebra de linha) casa', () => {
    expect(encontrarPalavrasProibidas('preço  justo')).toEqual(['preço justo']);
    expect(encontrarPalavrasProibidas('preço\njusto')).toEqual(['preço justo']);
    expect(encontrarPalavrasProibidas('preço alvo')).toEqual(['preço-alvo']);
  });

  it('texto factual neutro não tem ocorrências; várias ocorrências voltam sem repetição', () => {
    expect(
      encontrarPalavrasProibidas('P/L de 8,2 contra média de 10 anos de 11,4 (fonte CVM)'),
    ).toEqual([]);
    expect(encontrarPalavrasProibidas('nota boa? nota ruim. Compre!')).toEqual([
      'ruim',
      'compre',
      'nota',
    ]);
  });

  it('lista tem as 15 expressões da spec + o plural "notas"', () => {
    expect(PALAVRAS_PROIBIDAS).toHaveLength(16);
  });

  it("'notas' (plural) também casa", () => {
    expect(encontrarPalavrasProibidas('o ranking, as notas e as teses')).toEqual(['notas']);
  });
});
