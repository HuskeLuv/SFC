import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  diffRaizes,
  parseClassifSetorial,
} from '@/services/analiseAtivos/regras/b3/classifSetorial';

// Trechos REAIS do ClassifSetorial.xlsx (30/09/2026) convertidos com sheet_to_json({ header: 1 }):
// cabeçalho em 2 linhas mescladas + início do bloco de Petróleo, bloco de Bens Industriais até a WEG
// e o bloco Financeiro inteiro até SIMPAR.
const LINHAS = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'classif_setorial_trechos.json'), 'utf8'),
) as unknown[][];

const porRaiz = () => new Map(parseClassifSetorial(LINHAS).map((s) => [s.raiz, s]));

describe('parseClassifSetorial', () => {
  it('WEGE ⇒ Bens Industriais › Máquinas e Equipamentos › Motores, Compressores e Outros (setor herdado de célula mesclada)', () => {
    expect(porRaiz().get('WEGE')).toEqual({
      raiz: 'WEGE',
      nomePregao: 'WEG',
      setor: 'Bens Industriais',
      subsetor: 'Máquinas e Equipamentos',
      segmento: 'Motores, Compressores e Outros',
      segmentoListagem: 'Novo Mercado',
    });
  });

  it('ITUB ⇒ Financeiro › Intermediários Financeiros › Bancos (Nível 1)', () => {
    expect(porRaiz().get('ITUB')).toMatchObject({
      setor: 'Financeiro',
      subsetor: 'Intermediários Financeiros',
      segmento: 'Bancos',
      segmentoListagem: 'Nível 1',
    });
  });

  it('SIMH ⇒ Holdings Diversificadas (não é financeira pelos params)', () => {
    const simh = porRaiz().get('SIMH')!;
    expect(simh).toMatchObject({
      setor: 'Financeiro',
      subsetor: 'Holdings Diversificadas',
      segmento: 'Holdings Diversificadas',
    });
    expect(SCORING_PARAMS_V1.financeiras.segmentosFinanceiros).not.toContain(simh.segmento);
  });

  it("'Outros Intermediarios Financeiros' sem acento, como no arquivo (chave de params.financeiras)", () => {
    const fige = porRaiz().get('FIGE')!;
    expect(fige.segmento).toBe('Outros Intermediarios Financeiros');
    expect(fige.subsetor).toBe('Intermediários Financeiros');
    expect(SCORING_PARAMS_V1.financeiras.segmentosFinanceiros).toContain(fige.segmento);
  });

  it('subsetor novo zera o segmento herdado; setor do 1º bloco (cabeçalho em 2 linhas) também sai', () => {
    const m = porRaiz();
    expect(m.get('BRAV')).toMatchObject({
      setor: 'Petróleo, Gás e Biocombustíveis',
      segmento: 'Exploração, Refino e Distribuição',
    });
    expect(m.get('BBSE')).toMatchObject({
      subsetor: 'Previdência e Seguros',
      segmento: 'Seguradoras',
    });
    expect(m.get('EMBJ')).toMatchObject({ subsetor: 'Material de Transporte' });
  });

  it('só raízes de 4 caracteres; cabeçalhos repetidos não viram linha', () => {
    const r = parseClassifSetorial(LINHAS);
    expect(r.every((s) => /^[A-Z0-9]{4}$/.test(s.raiz))).toBe(true);
    expect(r.find((s) => s.setor.startsWith('SETOR'))).toBeUndefined();
    expect(r.length).toBeGreaterThan(60);
  });

  it('sem cabeçalho (layout mudou) ⇒ ErroLayoutFonte', () => {
    expect(() => parseClassifSetorial(LINHAS.slice(2))).toThrow(ErroLayoutFonte);
    expect(() => parseClassifSetorial([])).toThrow(ErroLayoutFonte);
    const semCodigo = LINHAS.map((l) =>
      l.map((c) => (String(c).toUpperCase().includes('CÓDIGO') ? 'TICKER' : c)),
    );
    expect(() => parseClassifSetorial(semCodigo)).toThrow(ErroLayoutFonte);
  });

  it('diffRaizes: raiz nova e raiz sumida', () => {
    expect(diffRaizes(['WEGE', 'ITUB', 'OIBR'], ['WEGE', 'ITUB', 'NOVA'])).toEqual({
      novas: ['NOVA'],
      sumidas: ['OIBR'],
    });
  });
});
