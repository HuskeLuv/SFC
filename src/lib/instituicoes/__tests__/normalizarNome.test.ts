import { describe, it, expect } from 'vitest';
import { NOME_DE_CORRETORA, normalizarBusca, normalizarNomeInstituicao } from '../normalizarNome';

describe('normalizarNomeInstituicao', () => {
  it("'BANCO XP S.A.' é igual a 'Banco XP SA'", () => {
    expect(normalizarNomeInstituicao('BANCO XP S.A.')).toBe(
      normalizarNomeInstituicao('Banco XP SA'),
    );
    expect(normalizarNomeInstituicao('Banco XP SA')).toBe('banco xp');
  });
  it("tira acento, troca 'bco' por 'banco' e sufixos societários", () => {
    expect(normalizarNomeInstituicao('BCO DO BRASIL S/A')).toBe('banco do brasil');
    expect(normalizarNomeInstituicao('Itaú Unibanco S.A.')).toBe('itau unibanco');
    expect(normalizarNomeInstituicao('NU FINANCEIRA S.A. - SCFI')).toBe('nu financeira');
    expect(normalizarNomeInstituicao('Corretora Exemplo Ltda.')).toBe('corretora exemplo');
  });
  it('não come palavras que só começam com sa', () => {
    expect(normalizarNomeInstituicao('Banco Safra S.A.')).toBe('banco safra');
  });
  it('vazio', () => {
    expect(normalizarNomeInstituicao(null)).toBe('');
  });
});

describe('normalizarBusca', () => {
  it('sem acento e minúsculas', () => {
    expect(normalizarBusca('  Itaú   Unibanco ')).toBe('itau unibanco');
    expect(normalizarBusca(undefined)).toBe('');
  });
});

describe('NOME_DE_CORRETORA', () => {
  it('reconhece CTVM/DTVM/corretora', () => {
    expect(NOME_DE_CORRETORA.test(normalizarNomeInstituicao('XP INVESTIMENTOS CCTVM S/A'))).toBe(
      true,
    );
    expect(NOME_DE_CORRETORA.test(normalizarNomeInstituicao('Banco Inter S.A.'))).toBe(false);
  });
});
