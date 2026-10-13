import { describe, expect, it } from 'vitest';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import { montarLeitura, textoContagens, textosResumo } from '../resumo';

const SLOTS = [
  { ticker: 'WEGE3', criterios: { n: 5, de: 6 } },
  { ticker: 'BBAS3', criterios: { n: 2, de: 3 } },
  { ticker: 'TAEE11', criterios: { n: 1, de: 6 } },
];

describe('Leitura dos dados (v2.4: só contagens, sem placar)', () => {
  it('mantém a ordem dos slots, sem ordenar por contagem', () => {
    const l = montarLeitura(5, SLOTS);
    expect(l.contagens).toEqual([
      { ticker: 'WEGE3', n: 5, de: 6 },
      { ticker: 'BBAS3', n: 2, de: 3 },
      { ticker: 'TAEE11', n: 1, de: 6 },
    ]);
    expect(textoContagens(l)).toBe(
      'WEGE3: 5 de 6 critérios em 5 anos · BBAS3: 2 de 3 critérios em 5 anos · TAEE11: 1 de 6 critérios em 5 anos',
    );
  });

  it('o texto é o literal registrado (data-texto-legal na tela)', () => {
    expect(montarLeitura(3, SLOTS).texto).toBe(LEITURA_DOS_DADOS.texto);
  });

  it('ativo sem avaliação entra com n/de null e "sem avaliação"', () => {
    const l = montarLeitura(10, [{ ticker: 'HGLG11', criterios: null }, SLOTS[0]]);
    expect(l.contagens[0]).toEqual({ ticker: 'HGLG11', n: null, de: null });
    expect(textoContagens(l)).toBe('HGLG11: sem avaliação · WEGE3: 5 de 6 critérios em 10 anos');
  });

  it('nenhuma frase com palavra proibida, "mais", "maior" ou ★', () => {
    const t = textoContagens(montarLeitura(5, SLOTS));
    expect(encontrarProibidasV2(t)).toEqual([]);
    expect(t).not.toMatch(/\bmais\b|maior|★|vence/i);
    expect(encontrarProibidasV2(LEITURA_DOS_DADOS.texto, { ignorarLiterais: true })).toEqual([]);
  });

  it('legado do ResumoNumerico (até a F): sem indicador composto e sem placar', () => {
    const t = textosResumo({
      indices: [{ ticker: 'A', valor: 8, incompleto: true }],
      criteriosAtendidos: [{ ticker: 'A', atende: 4, total: 6 }],
      emConferencia: [],
      responsabilidade: 'x',
    });
    expect(t.indice).toBe('');
    expect(t.legendaIncompleto).toBeNull();
    expect(t.criterios).toBe('Critérios atendidos: A 4 de 6');
    for (const f of Object.values(t)) {
      if (typeof f === 'string') expect(encontrarProibidasV2(f)).toEqual([]);
    }
  });
});
