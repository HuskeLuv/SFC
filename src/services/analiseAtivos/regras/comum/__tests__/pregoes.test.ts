import { describe, expect, it } from 'vitest';
import {
  ehPregaoB3,
  pregaoAnterior,
  pregoesEntre,
  proximoPregaoOuMesmo,
} from '@/services/analiseAtivos/regras/comum/pregoes';

describe('calendário de pregões B3', () => {
  it('pregaoAnterior(2024-05-03) = 2024-05-02 (PETR4: data ex 03/05, data-com real 02/05)', () => {
    expect(pregaoAnterior('2024-05-03')).toBe('2024-05-02');
  });

  it('pregaoAnterior pula o feriado de 1º de maio', () => {
    expect(pregaoAnterior('2024-05-02')).toBe('2024-04-30');
  });

  it('pregaoAnterior de segunda = sexta', () => {
    expect(pregaoAnterior('2026-09-28')).toBe('2026-09-25');
  });

  it('20/11/2024 (Consciência Negra) e o Carnaval não são pregão', () => {
    expect(ehPregaoB3('2024-11-20')).toBe(false);
    expect(ehPregaoB3('2024-02-12')).toBe(false);
    expect(ehPregaoB3('2024-02-13')).toBe(false);
    // quarta de cinzas abre (à tarde)
    expect(ehPregaoB3('2024-02-14')).toBe(true);
    // antes de 2024, 20/11 não era feriado nacional
    expect(ehPregaoB3('2023-11-20')).toBe(true);
  });

  it('24/12 e 31/12 não têm pregão', () => {
    expect(ehPregaoB3('2025-12-24')).toBe(false);
    expect(ehPregaoB3('2025-12-31')).toBe(false);
    expect(ehPregaoB3('2025-12-30')).toBe(true);
  });

  it('proximoPregaoOuMesmo(sábado) = segunda; em pregão devolve o mesmo dia', () => {
    expect(proximoPregaoOuMesmo('2026-09-26')).toBe('2026-09-28');
    expect(proximoPregaoOuMesmo('2026-09-30')).toBe('2026-09-30');
  });

  it('pregoesEntre é inclusivo e ignora fim de semana/feriado', () => {
    expect(pregoesEntre('2024-11-18', '2024-11-22')).toEqual([
      '2024-11-18',
      '2024-11-19',
      '2024-11-21',
      '2024-11-22',
    ]);
    expect(pregoesEntre('2024-11-23', '2024-11-24')).toEqual([]);
    expect(pregoesEntre('2024-11-22', '2024-11-18')).toEqual([]);
  });

  it('data inválida lança', () => {
    expect(() => ehPregaoB3('2024-02-30')).toThrow();
    expect(() => pregaoAnterior('03/05/2024')).toThrow();
  });
});
