import { describe, it, expect } from 'vitest';
import {
  utcMidnight,
  todayUtcMidnight,
  monthKeyUtc,
  yearKeyUtc,
  dropCurrentDayUtc,
} from '../utcDay';

describe('utcMidnight', () => {
  it('converte o dia-calendário local em meia-noite UTC do mesmo dia', () => {
    // new Date(2026, 5, 1) = 01/06/2026 00:00 LOCAL (03:00Z em UTC-3)
    const localMidnight = new Date(2026, 5, 1);
    expect(utcMidnight(localMidnight)).toBe(Date.UTC(2026, 5, 1));
  });

  it('ignora o horário — qualquer hora do dia local mapeia pro mesmo dia UTC', () => {
    const evening = new Date(2026, 5, 15, 23, 59, 59, 999);
    const morning = new Date(2026, 5, 15, 0, 0, 0, 0);
    expect(utcMidnight(evening)).toBe(Date.UTC(2026, 5, 15));
    expect(utcMidnight(morning)).toBe(Date.UTC(2026, 5, 15));
  });

  it('a borda gerada NÃO exclui o ponto UTC-midnight do próprio dia (filtro >=)', () => {
    // Cenário do bug: série tem ponto em 01/06 00:00Z; borda local 01/06 00:00
    // (03:00Z) + filtro >= excluía o ponto-âncora. Com utcMidnight, inclui.
    const seriesPoint = Date.UTC(2026, 5, 1);
    const border = utcMidnight(new Date(2026, 5, 1));
    expect(seriesPoint >= border).toBe(true);
  });
});

describe('todayUtcMidnight', () => {
  it('é a meia-noite UTC do dia-calendário local de hoje', () => {
    const now = new Date();
    expect(todayUtcMidnight()).toBe(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  });
});

describe('monthKeyUtc', () => {
  it('mantém o ponto de dia 1º 00:00Z no mês certo (não desloca pro mês anterior)', () => {
    // Em UTC-3, getMonth() local de 01/06 00:00Z devolveria maio — o bug original.
    const firstOfJune = Date.UTC(2026, 5, 1);
    expect(monthKeyUtc(firstOfJune)).toBe(Date.UTC(2026, 5, 1));
  });

  it('agrupa dias do meio do mês no dia 1º daquele mês', () => {
    expect(monthKeyUtc(Date.UTC(2026, 5, 17))).toBe(Date.UTC(2026, 5, 1));
    expect(monthKeyUtc(Date.UTC(2025, 11, 31))).toBe(Date.UTC(2025, 11, 1));
  });
});

describe('yearKeyUtc', () => {
  it('mantém 1º de janeiro 00:00Z no ano certo', () => {
    // Local getFullYear() em UTC-3 devolveria o ano anterior (sintoma: "2025" duplicado).
    const firstOfYear = Date.UTC(2026, 0, 1);
    expect(yearKeyUtc(firstOfYear)).toBe(Date.UTC(2026, 0, 1));
  });

  it('agrupa qualquer dia do ano em 1º de janeiro', () => {
    expect(yearKeyUtc(Date.UTC(2025, 6, 15))).toBe(Date.UTC(2025, 0, 1));
  });
});

describe('dropCurrentDayUtc', () => {
  const today = todayUtcMidnight();
  const DAY = 24 * 60 * 60 * 1000;

  it('remove o ponto do dia corrente e preserva os fechados', () => {
    const series = [
      { date: today - 2 * DAY, value: 1 },
      { date: today - DAY, value: 2 },
      { date: today, value: 3 },
    ];
    expect(dropCurrentDayUtc(series)).toEqual([
      { date: today - 2 * DAY, value: 1 },
      { date: today - DAY, value: 2 },
    ]);
  });

  it('devolve vazio quando só existe o ponto de hoje (padrão)', () => {
    expect(dropCurrentDayUtc([{ date: today }])).toEqual([]);
  });

  it('keepIfOnlyToday preserva a série quando só há pontos de hoje', () => {
    const series = [{ date: today }];
    expect(dropCurrentDayUtc(series, true)).toEqual(series);
  });

  it('série vazia permanece vazia mesmo com keepIfOnlyToday', () => {
    expect(dropCurrentDayUtc([], true)).toEqual([]);
  });
});
