import { useMemo, useState } from 'react';
import { toISODate } from '@/utils/periodWindow';

export type ReportPeriodValue =
  | 'current-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'last-12-months'
  | 'current-year'
  | 'custom';

export const REPORT_PERIOD_OPTIONS: Array<{ value: ReportPeriodValue; label: string }> = [
  { value: 'current-month', label: 'Mês atual' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'last-6-months', label: 'Últimos 6 meses' },
  { value: 'last-12-months', label: 'Últimos 12 meses' },
  { value: 'current-year', label: 'Ano atual' },
  { value: 'custom', label: 'Personalizado' },
];

const normalizeStart = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const normalizeEnd = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

export const useReportPeriod = () => {
  const [selected, setSelected] = useState<ReportPeriodValue>('current-month');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);

  const { startDate, endDate, label } = useMemo(() => {
    const now = new Date();
    if (selected === 'current-month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: normalizeStart(start), endDate: normalizeEnd(now), label: 'Mês atual' };
    }
    if (selected === 'last-3-months') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return {
        startDate: normalizeStart(start),
        endDate: normalizeEnd(now),
        label: 'Últimos 3 meses',
      };
    }
    if (selected === 'last-6-months') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return {
        startDate: normalizeStart(start),
        endDate: normalizeEnd(now),
        label: 'Últimos 6 meses',
      };
    }
    if (selected === 'last-12-months') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      return {
        startDate: normalizeStart(start),
        endDate: normalizeEnd(now),
        label: 'Últimos 12 meses',
      };
    }
    if (selected === 'current-year') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: normalizeStart(start), endDate: normalizeEnd(now), label: 'Ano atual' };
    }

    const start = customStart ? normalizeStart(customStart) : null;
    const end = customEnd ? normalizeEnd(customEnd) : null;
    return { startDate: start, endDate: end, label: 'Personalizado' };
  }, [selected, customStart, customEnd]);

  // ISO a partir dos componentes LOCAIS (toISODate), sem passar por toISOString:
  // endDate é 23:59:59.999 local, que em UTC-3 vira dia+1 02:59Z — o split("T")[0]
  // devolvia o DIA SEGUINTE e o relatório vazava 1 dia.
  const startDateISO = startDate ? toISODate(startDate) : undefined;
  const endDateISO = endDate ? toISODate(endDate) : undefined;

  return {
    selected,
    setSelected,
    startDate,
    endDate,
    startDateISO,
    endDateISO,
    label,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
  };
};
