import { describe, it, expect } from 'vitest';
import { inicioUltimosNMeses, inicioDoAno, inicioDoMes, toISODate } from '@/utils/periodWindow';

describe('periodWindow', () => {
  // Referência fixa: 08/06/2026 (mesmo cenário do print do Kinvo).
  const ref = new Date(2026, 5, 8, 14, 30, 0); // mês 5 = junho

  describe('inicioUltimosNMeses', () => {
    it('24 meses → 01/07/2024 (dia 1º, conta o mês corrente), igual ao Kinvo', () => {
      expect(toISODate(inicioUltimosNMeses(24, ref))).toBe('2024-07-01');
    });

    it('12 meses → 01/07/2025', () => {
      expect(toISODate(inicioUltimosNMeses(12, ref))).toBe('2025-07-01');
    });

    it('36 meses → 01/07/2023', () => {
      expect(toISODate(inicioUltimosNMeses(36, ref))).toBe('2023-07-01');
    });

    it('1 mês → dia 1º do mês corrente', () => {
      expect(toISODate(inicioUltimosNMeses(1, ref))).toBe('2026-06-01');
    });

    it('sempre ancora no dia 1º, independente do dia de referência', () => {
      const refFimDeMes = new Date(2026, 5, 30, 23, 59);
      expect(inicioUltimosNMeses(24, refFimDeMes).getDate()).toBe(1);
    });

    it('cruza a virada de ano corretamente (120 meses = 10 anos)', () => {
      expect(toISODate(inicioUltimosNMeses(120, ref))).toBe('2016-07-01');
    });
  });

  describe('inicioDoAno', () => {
    it('retorna 1º de janeiro do ano corrente', () => {
      expect(toISODate(inicioDoAno(ref))).toBe('2026-01-01');
    });
  });

  describe('inicioDoMes', () => {
    it('retorna dia 1º do mês corrente', () => {
      expect(toISODate(inicioDoMes(ref))).toBe('2026-06-01');
    });
  });

  describe('toISODate', () => {
    it('formata a partir de componentes locais (sem pulo de dia por TZ)', () => {
      expect(toISODate(new Date(2024, 6, 1, 0, 0, 0))).toBe('2024-07-01');
    });
  });
});
