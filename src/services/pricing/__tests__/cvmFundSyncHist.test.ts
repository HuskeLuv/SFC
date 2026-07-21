import { describe, it, expect } from 'vitest';
import { splitMonthsForCvmFetch, CVM_MONTHLY_SINCE } from '../cvmFundSync';

describe('splitMonthsForCvmFetch', () => {
  it('janela recente fica toda no formato mensal', () => {
    const r = splitMonthsForCvmFetch(['202607', '202606', '202605']);
    expect(r.monthly).toEqual(['202607', '202606', '202605']);
    expect(r.histYears).toEqual([]);
    expect(r.histMonths.size).toBe(0);
  });

  it('meses < 2021-01 caem no HIST anual, deduplicados por ano', () => {
    const r = splitMonthsForCvmFetch(['202102', '202101', '202012', '202011', '201907', '201906']);
    expect(r.monthly).toEqual(['202102', '202101']);
    expect(r.histYears).toEqual(['2020', '2019']); // mais recente primeiro
    expect(r.histMonths).toEqual(new Set(['202012', '202011', '201907', '201906']));
  });

  it('fronteira exata: 202101 é mensal, 202012 é HIST', () => {
    expect(CVM_MONTHLY_SINCE).toBe('202101');
    const r = splitMonthsForCvmFetch(['202101', '202012']);
    expect(r.monthly).toEqual(['202101']);
    expect(r.histYears).toEqual(['2020']);
  });

  it('ano parcial no HIST mantém só os meses pedidos no filtro', () => {
    const r = splitMonthsForCvmFetch(['202006', '202005']);
    expect(r.histYears).toEqual(['2020']);
    expect(r.histMonths.has('202006')).toBe(true);
    expect(r.histMonths.has('202001')).toBe(false);
  });
});
