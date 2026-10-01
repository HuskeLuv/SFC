import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  watchlist: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  ASSET_WHERE_BASE_POR_CATEGORIA,
  filtrarDaCategoria,
  wherePortfolioDaCategoria,
  whereWatchlistDaCategoria,
} from '../categoriaAba';
import {
  absorverPlanejadoNaCompra,
  abaDoAssetPlanejado,
  listarPlanejados,
  subtipoFundoPlanejado,
  type PlanejadoComAsset,
} from '../ativosPlanejados';
import { CATEGORIAS_MOVIVEIS, categoriaDaAba, type CategoriaMovivel } from '@/lib/carteiraMover';

type AssetRow = { symbol: string; type: string; currency: string | null; name: string };
type Row = { id: string; userId: string; categoriaOverride: string | null; asset: AssetRow };

// ── Avaliador mínimo do subconjunto de where que as rotas usam ────────────────

type Escalar = string | null;
const casaCampo = (valor: Escalar, filtro: unknown): boolean => {
  if (filtro === undefined) return true;
  if (filtro === null || typeof filtro === 'string') return valor === filtro;
  const f = filtro as { in?: string[]; notIn?: string[] };
  if (f.in) return valor !== null && f.in.includes(valor);
  // SQL NOT IN: NULL não casa
  if (f.notIn) return valor !== null && !f.notIn.includes(valor);
  throw new Error(`filtro não suportado: ${JSON.stringify(filtro)}`);
};

const casaAsset = (asset: AssetRow, w: Prisma.AssetWhereInput | undefined): boolean =>
  !w || (casaCampo(asset.type, w.type) && casaCampo(asset.currency, w.currency));

const casaWhere = (row: Row, w: Prisma.PortfolioWhereInput): boolean => {
  if (w.userId !== undefined && row.userId !== w.userId) return false;
  if (!casaCampo(row.categoriaOverride, w.categoriaOverride)) return false;
  if (w.asset && !casaAsset(row.asset, w.asset as Prisma.AssetWhereInput)) return false;
  if (w.OR) return (w.OR as Prisma.PortfolioWhereInput[]).some((r) => casaWhere(row, r));
  return true;
};

const asset = (symbol: string, type: string, currency: string | null = 'BRL', name = symbol) => ({
  symbol,
  type,
  currency,
  name,
});

const ATIVOS: AssetRow[] = [
  asset('B3SA3', 'stock'),
  asset('AAPL34', 'bdr'),
  asset('HGLG11', 'fii'),
  asset('IVVB11', 'etf'),
  asset('HGLG11', 'fund', 'BRL', 'CSHG Logística FII'),
  asset('CVM-123', 'multimercado'),
  asset('PLUGGY-FUNDO-1', 'fund'),
  asset('ABCD11', 'etf-cvm'),
  asset('VOO', 'etf', 'USD'),
  asset('AAPL', 'stock', 'USD'),
  asset('O', 'reit', 'USD'),
  asset('TAEE11', 'stock'),
  asset('TESOURO-1', 'tesouro-direto'),
  asset('BTC', 'crypto'),
];

const OVERRIDES: (string | null)[] = [null, ...CATEGORIAS_MOVIVEIS, 'rendaFixaFundos', 'lixo'];

const abasOnde = (row: Row): CategoriaMovivel[] =>
  CATEGORIAS_MOVIVEIS.filter(
    (cat) =>
      casaWhere(row, wherePortfolioDaCategoria('u-1', cat)) &&
      filtrarDaCategoria([row], cat).length === 1,
  );

describe('wherePortfolioDaCategoria / whereWatchlistDaCategoria', () => {
  it('forma do where: 3 ramos com a base da rota', () => {
    expect(wherePortfolioDaCategoria('u-1', 'fiis')).toEqual({
      userId: 'u-1',
      OR: [
        { categoriaOverride: 'fiis' },
        { categoriaOverride: null, asset: { type: 'fii' } },
        { categoriaOverride: { notIn: [...CATEGORIAS_MOVIVEIS] }, asset: { type: 'fii' } },
      ],
    });
    expect(whereWatchlistDaCategoria('u-1', 'stocks')).toEqual(
      wherePortfolioDaCategoria('u-1', 'stocks'),
    );
  });

  it('aceita a base da rota por parâmetro', () => {
    const w = wherePortfolioDaCategoria('u-1', 'acoes', { type: 'stock' });
    expect((w.OR as Prisma.PortfolioWhereInput[])[1]).toEqual({
      categoriaOverride: null,
      asset: { type: 'stock' },
    });
  });

  it('base idêntica aos where atuais das rotas', () => {
    expect(ASSET_WHERE_BASE_POR_CATEGORIA.acoes).toEqual({
      type: { in: ['stock', 'bdr', 'brd'] },
    });
    expect(ASSET_WHERE_BASE_POR_CATEGORIA.stocks).toEqual({ type: 'stock', currency: 'USD' });
    expect(ASSET_WHERE_BASE_POR_CATEGORIA.etfs).toEqual({ type: { in: ['etf', 'etf-cvm'] } });
  });

  it.each(ATIVOS.map((a) => [`${a.symbol}/${a.type}/${a.currency}`, a] as const))(
    '%s: nunca em duas abas, qualquer que seja o override; aba = categoriaDaAba',
    (_nome, a) => {
      for (const override of OVERRIDES) {
        const row: Row = { id: 'p-1', userId: 'u-1', categoriaOverride: override, asset: a };
        const abas = abasOnde(row);
        expect(abas.length).toBeLessThanOrEqual(1);
        expect(abas[0] ?? null).toBe(categoriaDaAba(a, override));
      }
    },
  );

  it('sem override, cada ativo movível aparece exatamente na sua aba base', () => {
    const esperado: Record<string, CategoriaMovivel | null> = {
      'B3SA3/stock': 'acoes',
      'AAPL34/bdr': 'acoes',
      'HGLG11/fii': 'fiis',
      'IVVB11/etf': 'etfs',
      'HGLG11/fund': 'fimFia',
      'CVM-123/multimercado': 'fimFia',
      'PLUGGY-FUNDO-1/fund': 'fimFia',
      'ABCD11/etf-cvm': 'etfs',
      'VOO/etf': 'etfs',
      'AAPL/stock': 'stocks',
      'O/reit': 'reits',
      'TAEE11/stock': null,
      'TESOURO-1/tesouro-direto': null,
      'BTC/crypto': null,
    };
    for (const a of ATIVOS) {
      const abas = abasOnde({ id: 'p', userId: 'u-1', categoriaOverride: null, asset: a });
      expect(abas[0] ?? null).toBe(esperado[`${a.symbol}/${a.type}`]);
    }
  });

  it('override igual à base (catálogo mudou): só o ramo 1 pega o item', () => {
    const row: Row = {
      id: 'p',
      userId: 'u-1',
      categoriaOverride: 'fiis',
      asset: asset('HGLG11', 'fii'),
    };
    const ramos = wherePortfolioDaCategoria('u-1', 'fiis').OR as Prisma.PortfolioWhereInput[];
    expect(ramos.map((r) => casaWhere(row, r))).toEqual([true, false, false]);
  });

  it('outro usuário nunca casa', () => {
    const row: Row = { id: 'p', userId: 'u-2', categoriaOverride: null, asset: ATIVOS[2] };
    expect(casaWhere(row, wherePortfolioDaCategoria('u-1', 'fiis'))).toBe(false);
  });
});

// ── Planejados com override ───────────────────────────────────────────────────

const planejado = (
  id: string,
  a: AssetRow,
  over: Partial<PlanejadoComAsset> = {},
): PlanejadoComAsset =>
  ({
    id,
    userId: 'u-1',
    assetId: `asset-${id}`,
    addedAt: new Date('2026-09-20'),
    notes: null,
    objetivo: 5,
    secao: null,
    categoriaOverride: null,
    asset: { id: `asset-${id}`, ...a },
    ...over,
  }) as PlanejadoComAsset;

describe('listarPlanejados com { categoria }', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa o where com override e aplica a regra completa em JS', async () => {
    const rows = [
      planejado('1', asset('PETR4', 'stock')),
      planejado('2', asset('TAEE11', 'stock')), // unit: fora de Ações
      planejado('3', asset('AAPL', 'stock', 'USD')), // Stock: fora de Ações
      planejado('4', asset('HGLG11', 'fii'), { categoriaOverride: 'acoes', secao: 'growth' }),
      planejado('5', asset('VALE3', 'stock')), // já tem posição
    ];
    mockPrisma.watchlist.findMany.mockResolvedValue(rows);

    const out = await listarPlanejados('u-1', { categoria: 'acoes' }, ['asset-5']);

    expect(mockPrisma.watchlist.findMany).toHaveBeenCalledWith({
      where: whereWatchlistDaCategoria('u-1', 'acoes'),
      include: { asset: true },
      orderBy: { addedAt: 'asc' },
    });
    expect(out.map((r) => r.id)).toEqual(['1', '4']);
  });

  it('assinatura antiga continua igual', async () => {
    mockPrisma.watchlist.findMany.mockResolvedValue([planejado('1', asset('HGLG11', 'fii'))]);
    const out = await listarPlanejados('u-1', ['fii']);
    expect(mockPrisma.watchlist.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', asset: { type: { in: ['fii'] } } },
      include: { asset: true },
      orderBy: { addedAt: 'asc' },
    });
    expect(out).toHaveLength(1);
  });
});

describe('helpers de planejado com override', () => {
  it('abaDoAssetPlanejado respeita o override efetivo', () => {
    const fii = asset('HGLG11', 'fii');
    expect(abaDoAssetPlanejado(fii)).toBe('fii');
    expect(abaDoAssetPlanejado(fii, 'fimFia')).toBe('fim-fia');
    expect(abaDoAssetPlanejado(fii, 'fiis')).toBe('fii');
    expect(abaDoAssetPlanejado(asset('AAPL', 'stock', 'USD'), 'reits')).toBe('reits');
    expect(abaDoAssetPlanejado(asset('BTC', 'crypto'), 'acoes')).toBe('moedas-criptos');
  });

  it('subtipoFundoPlanejado: seção do mover vence quando há override', () => {
    const fiagroFii = asset('RZAG11', 'fii');
    expect(
      subtipoFundoPlanejado(
        planejado('1', fiagroFii, { categoriaOverride: 'fimFia', secao: 'fiagro' }),
      ),
    ).toBe('fiagro');
    // sem override: a classificação CVM do Asset vence
    expect(subtipoFundoPlanejado(planejado('2', asset('CVM-1', 'fidc'), { secao: 'fim' }))).toBe(
      'fidc',
    );
  });

  it('absorverPlanejadoNaCompra devolve o override', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(
      planejado('1', asset('HGLG11', 'fii'), { categoriaOverride: 'fimFia', secao: 'fiagro' }),
    );
    const tx = { watchlist: mockPrisma.watchlist } as unknown as Parameters<
      typeof absorverPlanejadoNaCompra
    >[0];
    await expect(absorverPlanejadoNaCompra(tx, 'u-1', 'asset-1')).resolves.toEqual({
      objetivo: 5,
      secao: 'fiagro',
      categoriaOverride: 'fimFia',
    });
    expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({ where: { id: '1' } });
  });
});
