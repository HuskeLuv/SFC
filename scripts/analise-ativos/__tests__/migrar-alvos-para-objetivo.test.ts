import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    planningAssetTarget: { findMany: vi.fn() },
    analiseQuadroLinha: { findMany: vi.fn() },
    portfolio: { findFirst: vi.fn(), update: vi.fn() },
    watchlist: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    $disconnect: vi.fn(),
  },
}));
vi.mock('../../../src/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { migrarAlvosParaObjetivo, tipoCvmDaLinha } from '../migrar-alvos-para-objetivo';

const asset = (id: string, symbol: string, type: string) => ({
  id,
  symbol,
  type,
  currency: 'BRL',
  name: symbol,
  source: 'brapi',
});
const alvo = (userId: string, a: ReturnType<typeof asset>, targetPct: number | string) => ({
  userId,
  assetId: a.id,
  targetPct,
  asset: a,
});

const WEGE = asset('a-wege', 'WEGE3', 'stock');
const ITUB = asset('a-itub', 'ITUB4', 'stock');
const AFHI = asset('a-afhi', 'AFHI11', 'fii');
const HGLG = asset('a-hglg', 'HGLG11', 'fii');
const KNCR = asset('a-kncr', 'KNCR11', 'fii');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.planningAssetTarget.findMany.mockResolvedValue([
    alvo('u1', WEGE, '6.000'), // posição sem objetivo → grava
    alvo('u1', ITUB, 3), // posição com objetivo 15 → CONFLITO
    alvo('u1', AFHI, 10), // nada → cria planejado (papel → tvm)
    alvo('u1', HGLG, 4), // nada → cria planejado (tijolo)
    alvo('u1', KNCR, 2), // planejado com objetivo 0 → atualiza
  ]);
  mocks.prisma.analiseQuadroLinha.findMany.mockResolvedValue([
    { symbol: 'AFHI11', classe: 'fii', fiiTipo: 'papel', perfilCriterios: 'fii_papel' },
    { symbol: 'HGLG11', classe: 'fii', fiiTipo: 'tijolo', perfilCriterios: null },
  ]);
  mocks.prisma.portfolio.findFirst.mockImplementation(
    async ({ where }: { where: { assetId: string } }) =>
      ({
        'a-wege': { id: 'pf-wege', objetivo: 0 },
        'a-itub': { id: 'pf-itub', objetivo: 15 },
      })[where.assetId] ?? null,
  );
  mocks.prisma.watchlist.findFirst.mockImplementation(
    async ({ where }: { where: { assetId: string } }) =>
      where.assetId === 'a-kncr' ? { id: 'wl-kncr', objetivo: 0, secao: 'tvm' } : null,
  );
});

describe('migrar-alvos-para-objetivo', () => {
  it('dry-run (padrão): relatório completo e NADA gravado', async () => {
    const r = await migrarAlvosParaObjetivo({ aplicar: false });
    expect(r.map((l) => [l.ticker, l.resultado, l.targetPct])).toEqual([
      ['WEGE3', 'posicao_atualizada', 6],
      ['ITUB4', 'conflito', 3],
      ['AFHI11', 'planejado_criado', 10],
      ['HGLG11', 'planejado_criado', 4],
      ['KNCR11', 'planejado_atualizado', 2],
    ]);
    expect(r.find((l) => l.ticker === 'AFHI11')?.detalhe).toBe('aba fii, seção tvm');
    expect(r.find((l) => l.ticker === 'HGLG11')?.detalhe).toBe('aba fii, seção tijolo');
    expect(mocks.prisma.portfolio.update).not.toHaveBeenCalled();
    expect(mocks.prisma.watchlist.update).not.toHaveBeenCalled();
    expect(mocks.prisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('--apply: grava posição/planejado/criação e NUNCA sobrescreve objetivo existente', async () => {
    await migrarAlvosParaObjetivo({ aplicar: true });
    expect(mocks.prisma.portfolio.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: 'pf-wege' },
      data: { objetivo: 6 },
    });
    expect(mocks.prisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'wl-kncr' },
      data: { objetivo: 2 },
    });
    expect(mocks.prisma.watchlist.create.mock.calls.map((c) => c[0].data)).toEqual([
      { userId: 'u1', assetId: 'a-afhi', objetivo: 10, secao: 'tvm', notes: null },
      { userId: 'u1', assetId: 'a-hglg', objetivo: 4, secao: 'tijolo', notes: null },
    ]);
  });

  it('--usuario filtra a consulta', async () => {
    await migrarAlvosParaObjetivo({ aplicar: false, usuario: 'u9' });
    expect(mocks.prisma.planningAssetTarget.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u9',
    });
  });

  it('tipoCvmDaLinha: fof bruto → perfil → tipo CVM', () => {
    expect(tipoCvmDaLinha('fof', 'fii_tijolo')).toBe('fof');
    expect(tipoCvmDaLinha('hibrido', 'fii_tijolo')).toBe('tijolo');
    expect(tipoCvmDaLinha('hibrido', null)).toBe('hibrido');
    expect(tipoCvmDaLinha(null, null)).toBeNull();
  });
});
