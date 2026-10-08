import { describe, expect, it } from 'vitest';
import { encontrarPalavrasProibidasBlocoD } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { montarResumo, textosResumo, type EntradaResumo } from '../resumo';

const ativo = (
  ticker: string,
  valor: number | null,
  estado: EntradaResumo['indice']['estado'],
  at: number | null,
  ap: number | null,
  conf: string[] = [],
): EntradaResumo => ({
  ticker,
  indice: { valor, estado, criteriosAtendidos: at, criteriosAplicaveis: ap },
  emConferencia: conf,
});

const SLOTS = [
  ativo('WEGE3', 8.3, 'incompleto', 4, 5, ['DY 12m', 'Payout']),
  ativo('ITUB4', 7.6, 'incompleto', 3, 4, ['DY 12m']),
  ativo('TAEE11', 8.0, 'calculado', 3, 5),
];

describe('resumo numérico (decisão 9: sem placar)', () => {
  it('mantém a ordem dos slots mesmo com valores fora de ordem', () => {
    const r = montarResumo(SLOTS);
    expect(r.indices.map((i) => i.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    expect(r.criteriosAtendidos.map((i) => i.ticker)).toEqual(['WEGE3', 'ITUB4', 'TAEE11']);
    const t = textosResumo(r);
    expect(t.indice).toBe(
      'Índice MF, na ordem dos ativos acima: WEGE3 8,3* · ITUB4 7,6* · TAEE11 8,0',
    );
    expect(t.criterios).toBe('Critérios atendidos: WEGE3 4 de 5 · ITUB4 3 de 4 · TAEE11 3 de 5');
    expect(t.emConferencia).toBe('Em conferência: WEGE3 (DY 12m, Payout) · ITUB4 (DY 12m)');
  });

  it('incompleto marcado com * e legenda só quando há incompleto', () => {
    expect(textosResumo(montarResumo(SLOTS)).legendaIncompleto).toMatch(/^\* /);
    const sem = textosResumo(montarResumo([ativo('A', 5, 'calculado', 1, 2)]));
    expect(sem.legendaIncompleto).toBeNull();
    expect(sem.emConferencia).toBeNull();
    expect(sem.indice).not.toContain('*');
  });

  it('sem Índice (fora do índice / sem score) mostra —', () => {
    const t = textosResumo(montarResumo([ativo('HFOF11', 6, 'fora_do_indice', null, null)]));
    expect(t.indice).toContain('HFOF11 —');
    expect(t.criterios).toBeNull();
  });

  it('nenhuma frase com "maior", contagem de ★ ou palavra proibida', () => {
    const t = textosResumo(montarResumo(SLOTS));
    const frases = Object.values(t).filter((x): x is string => typeof x === 'string');
    for (const f of frases) {
      expect(f).not.toMatch(/maior|★|estrela|\bvence/i);
      expect(encontrarPalavrasProibidasBlocoD(f)).toEqual([]);
    }
    expect(t.responsabilidade).toContain('Não indicam qual ativo escolher');
  });
});
