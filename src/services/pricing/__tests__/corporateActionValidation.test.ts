import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assetPriceHistory: { findMany: vi.fn() },
  assetCorporateAction: { findMany: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

beforeEach(() => vi.clearAllMocks());

import { classifyCorporateActionViaPrice } from '../corporateActionValidation';

const DAY = 86_400_000;
// série de preço diária: `level` por dia entre dias relativos [from, to] da data ex
const serie = (ev: number, ...segs: Array<[number, number, number]>) => {
  const rows: { date: Date; price: number }[] = [];
  for (const [from, to, price] of segs) {
    for (let d = from; d <= to; d++) rows.push({ date: new Date(ev + d * DAY), price });
  }
  return rows;
};

describe('classifyCorporateActionViaPrice', () => {
  const ev = new Date('2020-06-15T00:00:00Z');
  const evMs = ev.getTime();

  it('REAL quando o preço cru saltou ~1/fator (split 10:1: 95 → 9.5)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue(
      serie(evMs, [-20, -4, 95], [4, 20, 9.5]),
    );
    expect(await classifyCorporateActionViaPrice('MXRF11', ev, 10)).toBe('real');
  });

  it('REAL pra grupamento (0.2: 5 → 25)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue(serie(evMs, [-20, -4, 5], [4, 20, 25]));
    expect(await classifyCorporateActionViaPrice('XPTO11', ev, 0.2)).toBe('real');
  });

  it('ESPÚRIO quando o preço fica contínuo apesar de fator grande (10:1 falso)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue(
      serie(evMs, [-20, -4, 6.0], [4, 20, 6.1]),
    );
    expect(await classifyCorporateActionViaPrice('HFOF11', ev, 10)).toBe('spurious');
  });

  it('UNKNOWN pra fator pequeno (bonificação ~3% indistinguível do ruído)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue(
      serie(evMs, [-20, -4, 10], [4, 20, 10]),
    );
    expect(await classifyCorporateActionViaPrice('PETR4', ev, 1.03)).toBe('unknown');
  });

  it('UNKNOWN quando não há preço em torno do evento', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
    expect(await classifyCorporateActionViaPrice('NOVO11', ev, 10)).toBe('unknown');
  });

  it('UNKNOWN quando o movimento é ambíguo (queda de 30%, nem 1/fator nem contínuo)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue(serie(evMs, [-20, -4, 10], [4, 20, 7]));
    expect(await classifyCorporateActionViaPrice('AMBI3', ev, 10)).toBe('unknown');
  });
});
