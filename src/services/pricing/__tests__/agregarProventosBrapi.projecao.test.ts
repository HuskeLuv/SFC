import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { agregarProventosBrapi } from '../dividendService';

// Entradas como a BRAPI devolveu para CAML3 em 24/10/2026.
const entrada = (
  pag: string,
  com: string,
  valor: number,
  approvedOn: string | null,
  isin: string,
) => ({
  label: 'DIVIDENDO',
  rate: valor,
  paymentDate: `${pag}T03:00:00.000Z`,
  lastDatePrior: `${com}T03:00:00.000Z`,
  approvedOn: approvedOn ? `${approvedOn}T03:00:00.000Z` : null,
  isinCode: isin,
});

describe('agregarProventosBrapi — projeções', () => {
  const hoje = new Date('2026-10-24T12:00:00Z');
  const brapi = [
    entrada('2027-06-08', '2027-05-31', 0.07329847, null, 'CAML3'),
    entrada('2027-03-08', '2027-02-26', 0.07329847, null, 'CAML3'),
    entrada('2026-12-08', '2026-11-30', 0.19057602607, '2025-12-16', 'BRCAMLACNOR3'),
    entrada('2026-09-09', '2026-08-31', 0.07329847156, '2025-12-16', 'BRCAMLACNOR3'),
    // histórico antigo sem aprovação continua (ITUB4/BBDC4 1999, FIIs 2016 vêm assim)
    entrada('2019-09-10', '2019-09-02', 0.05, null, 'CAML3'),
  ];

  it('descarta o futuro sem aprovação e mantém o aprovado e o histórico', () => {
    const r = agregarProventosBrapi(brapi, hoje)
      .map((p) => p.dataCom?.toISOString().slice(0, 10))
      .sort();
    expect(r).toEqual(['2019-09-02', '2026-08-31', '2026-11-30']);
  });

  it('data-com hoje sem aprovação ainda entra (só o futuro é projeção)', () => {
    const r = agregarProventosBrapi([entrada('2026-11-03', '2026-10-24', 0.1, null, 'X')], hoje);
    expect(r).toHaveLength(1);
  });
});
