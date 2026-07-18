// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReportPeriod } from '../useReportPeriod';

describe('useReportPeriod — ISO sem vazar 1 dia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('endDateISO é o dia LOCAL de hoje mesmo à noite (23:59 local = dia+1 02:59Z)', () => {
    // Bug original: endDate = 23:59:59.999 local; toISOString().split("T")[0]
    // em UTC-3 devolvia o DIA SEGUINTE.
    vi.setSystemTime(new Date(2026, 6, 15, 23, 30, 0)); // 15/07/2026 23:30 local
    const { result } = renderHook(() => useReportPeriod());

    expect(result.current.endDateISO).toBe('2026-07-15');
    expect(result.current.startDateISO).toBe('2026-07-01'); // mês atual
  });

  it('período custom gera ISO do dia-calendário local escolhido', () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    const { result } = renderHook(() => useReportPeriod());

    act(() => {
      result.current.setSelected('custom');
      result.current.setCustomStart(new Date(2026, 0, 1));
      result.current.setCustomEnd(new Date(2026, 5, 30));
    });

    expect(result.current.startDateISO).toBe('2026-01-01');
    expect(result.current.endDateISO).toBe('2026-06-30');
  });

  it('ano atual começa em 1º de janeiro local', () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    const { result } = renderHook(() => useReportPeriod());

    act(() => {
      result.current.setSelected('current-year');
    });

    expect(result.current.startDateISO).toBe('2026-01-01');
    expect(result.current.endDateISO).toBe('2026-07-15');
  });
});
