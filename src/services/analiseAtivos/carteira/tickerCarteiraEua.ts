/**
 * Ticker de Stocks e REITs (EUA) entre a Análise de Ativos e a Carteira (feature stocks-reits,
 * fatia D). A Carteira não tem catálogo EUA: cada compra pelo wizard cria um Asset MANUAL
 * ('AAPL-<timestamp>-<rnd>', type stock|reit, currency USD, source manual) e o safeSymbol de
 * /api/carteira/operacao tira a pontuação — BRK-B e BRK.B viram 'BRKB-…'. A Análise usa a forma
 * da SEC com ponto (BRK.B). Para casar os dois lados, os dois são normalizados SEM pontuação
 * (normalizarTickerEua: 'BRK-B' | 'BRK.B' | 'brkb' → 'BRKB').
 *
 * - chaveCarteira(ticker): chave do overlay (/api/analise-ativos/carteira) e das abas da Carteira.
 *   Ticker da B3 (só letras e dígitos) não muda: 'PETR4' → 'PETR4'.
 * - tickerDeAssetEua(asset): ticker normalizado de um Asset manual EUA; null para o resto (ETF em
 *   USD não vira stock; ação da B3 em BRL também não).
 * - encontrarAssetManualEmPosicao / encontrarAssetManualPlanejado: o Asset manual do usuário para o
 *   ticker (Portfolio com quantidade > 0 / linha planejada). A recompra pela Análise manda o id
 *   desse Asset para não criar outro.
 * - usuarioTemAssetManual: validação de posse do ramo novo do POST /api/carteira/operacao.
 *
 * Sem `import` de valor do Prisma: o módulo roda no cliente (as chaves) e no servidor (as consultas
 * recebem o cliente do banco como parâmetro).
 */
import type { Prisma } from '@prisma/client';
import { normalizarTickerEua } from '@/types/analiseAtivosEua';

/** Asset.type dos ativos EUA da Carteira (aba Stocks = stock em USD; aba REIT's = reit). */
export const TIPOS_ASSET_EUA = ['stock', 'reit'] as const;
export type TipoAssetEua = (typeof TIPOS_ASSET_EUA)[number];

export function ehTipoAssetEua(v: unknown): v is TipoAssetEua {
  return typeof v === 'string' && (TIPOS_ASSET_EUA as readonly string[]).includes(v);
}

/** Maiúsculas sem pontuação ('BRK-B' → 'BRKB'), a mesma regra do safeSymbol da operação. */
export const normalizarTicker = normalizarTickerEua;

/**
 * Chave do ticker no overlay e nas linhas das abas da Carteira. B3 = o próprio ticker; EUA = sem
 * pontuação (o Asset manual 'BRKB-…' e a página 'BRK.B' caem na mesma chave).
 */
export function chaveCarteira(ticker: string): string {
  return normalizarTicker(ticker);
}

/**
 * Ticker de um symbol manual ('AAPL-1712345678901-abc' → 'AAPL'), igual ao extrairTicker de
 * /api/carteira/stocks. Symbol sem o formato manual volta inteiro.
 */
export function extrairTickerManual(symbol: string): string {
  const parte = symbol.trim().split('-')[0];
  return parte && /^[A-Za-z]/.test(parte) ? parte : symbol.trim();
}

export interface AssetEuaLike {
  symbol: string;
  type: string | null;
  currency: string | null;
  source?: string | null;
}

/** Asset manual EUA da Carteira: type stock|reit, USD e source manual. */
export function ehAssetManualEua(asset: AssetEuaLike | null | undefined): boolean {
  return (
    !!asset &&
    ehTipoAssetEua(asset.type) &&
    (asset.currency ?? '').toUpperCase() === 'USD' &&
    asset.source === 'manual'
  );
}

/** Ticker normalizado de um Asset manual EUA ('BRKB-…' → 'BRKB'); null fora desse grupo. */
export function tickerDeAssetEua(asset: AssetEuaLike | null | undefined): string | null {
  if (!asset || !ehAssetManualEua(asset)) return null;
  const t = normalizarTicker(extrairTickerManual(asset.symbol));
  return t || null;
}

/** Prefixo do symbol manual do ticker ('BRK.B' → 'BRKB-'), como o da compra e do planejado. */
export function prefixoSymbolManualEua(ticker: string): string {
  return `${normalizarTicker(ticker).substring(0, 10)}-`;
}

type Tipos = TipoAssetEua | readonly TipoAssetEua[];
const listaTipos = (t: Tipos): TipoAssetEua[] => (typeof t === 'string' ? [t] : [...t]);

const whereAssetManual = (tipos: Tipos, ticker: string): Prisma.AssetWhereInput => ({
  type: { in: listaTipos(tipos) },
  source: 'manual',
  currency: 'USD',
  symbol: { startsWith: prefixoSymbolManualEua(ticker) },
});

type DbPortfolio = { portfolio: Pick<Prisma.TransactionClient['portfolio'], 'findMany'> };
type DbWatchlist = { watchlist: Pick<Prisma.TransactionClient['watchlist'], 'findMany'> };

/** Os campos de Asset que a Análise usa (mesmo formato de AssetAlvo em objetivoAtivo.ts). */
export interface AssetManualEua {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  source: string;
  categoria: string | null;
  subcategoria: string | null;
}

const SELECT_ASSET = {
  id: true,
  symbol: true,
  name: true,
  type: true,
  currency: true,
  source: true,
  categoria: true,
  subcategoria: true,
} as const;

/**
 * Asset manual EUA do usuário COM posição (Portfolio com quantidade > 0) para o ticker. Ignora
 * Asset de outro usuário (o filtro é pelo Portfolio do usuário) e posição zerada. Com duas linhas
 * do mesmo ticker (recompras antigas pelo wizard), fica a de atualização mais antiga.
 */
export async function encontrarAssetManualEmPosicao(
  db: DbPortfolio,
  userId: string,
  tipos: Tipos,
  ticker: string,
): Promise<{ asset: AssetManualEua; portfolioId: string } | null> {
  const alvo = normalizarTicker(ticker);
  if (!alvo) return null;
  const rows = await db.portfolio.findMany({
    where: { userId, quantity: { gt: 0 }, asset: whereAssetManual(tipos, alvo) },
    select: { id: true, asset: { select: SELECT_ASSET } },
    orderBy: { lastUpdate: 'asc' },
  });
  for (const r of rows as Array<{ id: string; asset: AssetManualEua | null }>) {
    if (r.asset && tickerDeAssetEua(r.asset) === alvo) return { asset: r.asset, portfolioId: r.id };
  }
  return null;
}

/** Linha PLANEJADA (Watchlist) do usuário com Asset manual EUA do ticker. */
export async function encontrarAssetManualPlanejado(
  db: DbWatchlist,
  userId: string,
  tipos: Tipos,
  ticker: string,
): Promise<{ asset: AssetManualEua; watchlistId: string } | null> {
  const alvo = normalizarTicker(ticker);
  if (!alvo) return null;
  const rows = await db.watchlist.findMany({
    where: { userId, asset: whereAssetManual(tipos, alvo) },
    select: { id: true, asset: { select: SELECT_ASSET } },
    orderBy: { addedAt: 'asc' },
  });
  for (const r of rows as Array<{ id: string; asset: AssetManualEua | null }>) {
    if (r.asset && tickerDeAssetEua(r.asset) === alvo) return { asset: r.asset, watchlistId: r.id };
  }
  return null;
}

type DbPosse = {
  portfolio: Pick<Prisma.TransactionClient['portfolio'], 'findFirst'>;
  watchlist: Pick<Prisma.TransactionClient['watchlist'], 'findFirst'>;
};

/**
 * O Asset manual é do usuário: há Portfolio ou linha planejada dele com esse Asset. Asset manual
 * não tem dono na tabela Asset; a posse é a do vínculo.
 */
export async function usuarioTemAssetManual(
  db: DbPosse,
  userId: string,
  assetId: string,
): Promise<boolean> {
  const [p, w] = await Promise.all([
    db.portfolio.findFirst({ where: { userId, assetId }, select: { id: true } }),
    db.watchlist.findFirst({ where: { userId, assetId }, select: { id: true } }),
  ]);
  return !!p || !!w;
}

/**
 * Item do overlay (/api/analise-ativos/carteira) para o ticker da tela. O overlay usa o ticker da
 * Análise ('BRK.B') quando o cadastro da SEC o resolve e o ticker sem pontuação ('BRKB') quando
 * não; aqui as duas formas valem. B3: só a forma do próprio ticker.
 */
export function noOverlay<T>(mapa: Record<string, T> | undefined, ticker: string): T | undefined {
  if (!mapa) return undefined;
  const t = ticker.trim().toUpperCase();
  return mapa[t] ?? mapa[chaveCarteira(t)];
}

/** Chave que o ticker JÁ ocupa no overlay (posição ou plano); sem nenhuma, o ticker da tela. */
export function chaveNoOverlay(
  overlay: { posicoes: Record<string, unknown>; planejados: Record<string, unknown> } | undefined,
  ticker: string,
): string {
  const t = ticker.trim().toUpperCase();
  const c = chaveCarteira(t);
  if (!overlay) return t;
  if (t in overlay.posicoes || t in overlay.planejados) return t;
  if (c in overlay.posicoes || c in overlay.planejados) return c;
  return t;
}
