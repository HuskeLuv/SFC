import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { precosParaGravar } from '../tesouroDiretoSync';

// baseDate e asset_price_history.date são meia-noite UTC.
const dia = (iso: string) => ({ baseDate: new Date(`${iso}T00:00:00Z`) });
const historico = (...isos: string[]) =>
  new Set(isos.map((iso) => new Date(`${iso}T00:00:00Z`).toISOString()));
const datas = (precos: { baseDate: Date }[]) =>
  precos.map((p) => p.baseDate.toISOString().slice(0, 10));

describe('precosParaGravar', () => {
  it('histórico em dia: só o mais recente (o PU do dia pode ser republicado)', () => {
    const precos = [dia('2026-10-26'), dia('2026-10-27')];
    expect(datas(precosParaGravar(precos, historico('2026-10-26', '2026-10-27')))).toEqual([
      '2026-10-27',
    ]);
  });

  it('fonte voltou depois da parada (out/2026): preenche os dias que faltam', () => {
    const precos = ['15', '16', '19', '20', '21', '22', '23', '26', '27'].map((d) =>
      dia(`2026-10-${d}`),
    );
    expect(
      datas(precosParaGravar(precos, historico('2026-10-15', '2026-10-26', '2026-10-27'))),
    ).toEqual([
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-27',
    ]);
  });

  it('ativo sem histórico: grava a janela toda', () => {
    const precos = [dia('2026-10-23'), dia('2026-10-26')];
    expect(datas(precosParaGravar(precos, historico()))).toEqual(['2026-10-23', '2026-10-26']);
  });

  it('sem preços: nada', () => {
    expect(precosParaGravar([], historico('2026-10-27'))).toEqual([]);
  });
});
