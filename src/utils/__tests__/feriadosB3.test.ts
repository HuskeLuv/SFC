import { describe, it, expect } from 'vitest';
import { feriadosB3, isHolidayB3, isNonBusinessDayB3, nextBusinessDayB3 } from '@/utils/feriadosB3';

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('feriadosB3', () => {
  it('inclui os 8 feriados fixos para 2025', () => {
    const set = feriadosB3(2025);
    expect(set.has(utc(2025, 1, 1))).toBe(true); // Confraternização
    expect(set.has(utc(2025, 4, 21))).toBe(true); // Tiradentes
    expect(set.has(utc(2025, 5, 1))).toBe(true); // Trabalho
    expect(set.has(utc(2025, 9, 7))).toBe(true); // Independência
    expect(set.has(utc(2025, 10, 12))).toBe(true); // Padroeira
    expect(set.has(utc(2025, 11, 2))).toBe(true); // Finados
    expect(set.has(utc(2025, 11, 15))).toBe(true); // República
    expect(set.has(utc(2025, 12, 25))).toBe(true); // Natal
  });

  it('calcula corretamente os feriados móveis 2024 (Páscoa em 31/03)', () => {
    // Páscoa 2024: 31/03 → Sexta Santa: 29/03, Carnaval: 12-13/02, Corpus: 30/05
    const set = feriadosB3(2024);
    expect(set.has(utc(2024, 3, 29))).toBe(true); // Sexta-feira Santa
    expect(set.has(utc(2024, 2, 12))).toBe(true); // Carnaval segunda
    expect(set.has(utc(2024, 2, 13))).toBe(true); // Carnaval terça
    expect(set.has(utc(2024, 5, 30))).toBe(true); // Corpus Christi
  });

  it('calcula corretamente os feriados móveis 2025 (Páscoa em 20/04)', () => {
    // Páscoa 2025: 20/04 → Sexta Santa: 18/04, Carnaval: 03-04/03, Corpus: 19/06
    const set = feriadosB3(2025);
    expect(set.has(utc(2025, 4, 18))).toBe(true); // Sexta-feira Santa
    expect(set.has(utc(2025, 3, 3))).toBe(true); // Carnaval segunda
    expect(set.has(utc(2025, 3, 4))).toBe(true); // Carnaval terça
    expect(set.has(utc(2025, 6, 19))).toBe(true); // Corpus Christi
  });

  it('calcula corretamente os feriados móveis 2020 (Páscoa em 12/04)', () => {
    // Páscoa 2020: 12/04 → Sexta Santa: 10/04, Carnaval: 24-25/02, Corpus: 11/06
    const set = feriadosB3(2020);
    expect(set.has(utc(2020, 4, 10))).toBe(true);
    expect(set.has(utc(2020, 2, 24))).toBe(true);
    expect(set.has(utc(2020, 2, 25))).toBe(true);
    expect(set.has(utc(2020, 6, 11))).toBe(true);
  });

  it('cada ano tem exatamente 12 feriados', () => {
    [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027].forEach((year) => {
      expect(feriadosB3(year).size).toBe(12);
    });
  });
});

describe('isHolidayB3', () => {
  it('detecta feriado fixo (Tiradentes 2026)', () => {
    expect(isHolidayB3(new Date(utc(2026, 4, 21)))).toBe(true);
  });

  it('detecta feriado móvel (Corpus Christi 2025: 19/06)', () => {
    expect(isHolidayB3(new Date(utc(2025, 6, 19)))).toBe(true);
  });

  it('retorna false em dia útil regular', () => {
    expect(isHolidayB3(new Date(utc(2025, 6, 18)))).toBe(false); // Wed
    expect(isHolidayB3(new Date(utc(2025, 7, 15)))).toBe(false); // Tue regular
  });

  it('aceita timestamp e Date intercambiável', () => {
    expect(isHolidayB3(utc(2025, 4, 21))).toBe(true);
    expect(isHolidayB3(new Date(utc(2025, 4, 21)))).toBe(true);
  });
});

describe('isNonBusinessDayB3', () => {
  it('true em sábado', () => {
    expect(isNonBusinessDayB3(new Date(utc(2025, 1, 4)))).toBe(true); // Sat
  });

  it('true em domingo', () => {
    expect(isNonBusinessDayB3(new Date(utc(2025, 1, 5)))).toBe(true); // Sun
  });

  it('true em feriado em dia da semana', () => {
    expect(isNonBusinessDayB3(new Date(utc(2025, 4, 21)))).toBe(true); // Mon Tiradentes
  });

  it('false em dia útil regular', () => {
    expect(isNonBusinessDayB3(new Date(utc(2025, 1, 7)))).toBe(false); // Tue
  });
});

describe('nextBusinessDayB3', () => {
  it('retorna o próprio dia se já for útil', () => {
    const d = utc(2025, 1, 7); // Tue
    expect(nextBusinessDayB3(d)).toBe(d);
  });

  it('avança de sábado pra segunda', () => {
    const sat = utc(2025, 1, 4);
    const mon = utc(2025, 1, 6);
    expect(nextBusinessDayB3(sat)).toBe(mon);
  });

  it('avança feriado pra próximo BD', () => {
    // 21/04/2025 é segunda-feira, Tiradentes → próximo BD é terça 22/04
    const tiradentes = utc(2025, 4, 21);
    const tue = utc(2025, 4, 22);
    expect(nextBusinessDayB3(tiradentes)).toBe(tue);
  });

  it('avança sábado-domingo seguidos por feriado pra próximo BD', () => {
    // 19/04/2025 é sábado, 20/04 domingo, 21/04 feriado → 22/04 (terça)
    const sat = utc(2025, 4, 19);
    const tue = utc(2025, 4, 22);
    expect(nextBusinessDayB3(sat)).toBe(tue);
  });

  it('Carnaval 2025: domingo→quarta-feira de cinzas', () => {
    // Domingo 02/03/25, Carnaval seg 03/03, Carnaval ter 04/03 → quarta 05/03
    const sun = utc(2025, 3, 2);
    const wed = utc(2025, 3, 5);
    expect(nextBusinessDayB3(sun)).toBe(wed);
  });
});
