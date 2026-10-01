import { describe, expect, it } from 'vitest';
import { dataPregaoReferencia, mercadoDoAtivo } from '../pregaoReferencia';

const dia = (iso: string) => dataPregaoReferencia(new Date(iso)).toISOString().slice(0, 10);
const diaEua = (iso: string) =>
  dataPregaoReferencia(new Date(iso), 'EUA').toISOString().slice(0, 10);

describe('dataPregaoReferencia (B3)', () => {
  it('cron das 07h UTC grava o fechamento no pregão anterior (caso PETR4 set/2026)', () => {
    // Terça 29/09 07:11 UTC → preço é o fechamento de segunda 28/09.
    expect(dia('2026-09-29T07:11:00Z')).toBe('2026-09-28');
  });

  it('sábado, domingo e segunda antes da abertura apontam para a sexta', () => {
    expect(dia('2026-09-26T07:11:00Z')).toBe('2026-09-25');
    expect(dia('2026-09-27T07:11:00Z')).toBe('2026-09-25');
    expect(dia('2026-09-28T07:11:00Z')).toBe('2026-09-25');
  });

  it('durante e depois do pregão usa o próprio dia', () => {
    expect(dia('2026-09-30T13:00:00Z')).toBe('2026-09-30');
    expect(dia('2026-09-30T20:04:30Z')).toBe('2026-09-30');
    expect(dia('2026-09-30T23:59:00Z')).toBe('2026-09-30');
  });

  it('noite em BRT que já é outro dia em UTC continua no pregão certo', () => {
    // 01/10 02:00 UTC = 30/09 23:00 BRT → último pregão fechado é 30/09.
    expect(dia('2026-10-01T02:00:00Z')).toBe('2026-09-30');
  });

  it('pula feriado B3 (20/11 e Natal)', () => {
    // Sexta 20/11/2026 é feriado → sábado 21 e segunda 23 cedo apontam para quinta 19.
    expect(dia('2026-11-21T07:11:00Z')).toBe('2026-11-19');
    expect(dia('2026-11-23T07:11:00Z')).toBe('2026-11-19');
    expect(dia('2026-12-26T07:11:00Z')).toBe('2026-12-24');
  });
});

describe('dataPregaoReferencia (EUA)', () => {
  it('só pula fim de semana', () => {
    expect(diaEua('2026-09-28T07:10:00Z')).toBe('2026-09-25');
    expect(diaEua('2026-09-29T13:00:00Z')).toBe('2026-09-28');
    expect(diaEua('2026-09-29T15:00:00Z')).toBe('2026-09-29');
  });
});

describe('mercadoDoAtivo', () => {
  it('classifica por tipo e moeda', () => {
    expect(mercadoDoAtivo({ type: 'stock', currency: 'BRL' })).toBe('B3');
    expect(mercadoDoAtivo({ type: 'fii', currency: null })).toBe('B3');
    expect(mercadoDoAtivo({ type: 'reit', currency: 'USD' })).toBe('EUA');
    expect(mercadoDoAtivo({ type: 'crypto', currency: 'BRL' })).toBeNull();
    expect(mercadoDoAtivo({ type: 'currency', currency: 'BRL' })).toBeNull();
  });
});
