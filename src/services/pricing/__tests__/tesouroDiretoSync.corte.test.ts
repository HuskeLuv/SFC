import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { calcularCorte } from '../tesouroDiretoSync';

// Datas locais (o corte usa setHours, como o resto do sync).
const d = (ano: number, mes: number, dia: number, hora = 0) => new Date(ano, mes - 1, dia, hora);

describe('calcularCorte', () => {
  const hoje = d(2026, 10, 24, 6);

  it('fonte em dia: últimos N dias', () => {
    expect(calcularCorte(hoje, 3, d(2026, 10, 23))).toEqual(d(2026, 10, 21));
  });

  it('banco vazio: últimos N dias', () => {
    expect(calcularCorte(hoje, 3, null)).toEqual(d(2026, 10, 21));
  });

  it('fonte parada (último gravado 15/10): recupera desde o último dia gravado', () => {
    expect(calcularCorte(hoje, 3, d(2026, 10, 15))).toEqual(d(2026, 10, 15));
  });

  it('parada longa: limita a 120 dias', () => {
    expect(calcularCorte(hoje, 3, d(2025, 1, 1))).toEqual(d(2026, 6, 26));
  });
});
