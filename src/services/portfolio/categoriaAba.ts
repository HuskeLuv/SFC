/**
 * `where` das rotas de aba com o override do mover (out/2026).
 *
 * Um item aparece na aba `cat` quando:
 *   1. o usuário o moveu para ela (categoriaOverride = cat); ou
 *   2. não foi movido (categoriaOverride null) e o Asset bate na base da aba; ou
 *   3. o override é lixo (não é categoria movível) e o Asset bate na base.
 *
 * Como o override só é gravado quando ≠ aba base, um item nunca aparece em duas
 * abas. Defesa extra: se o catálogo mudar e o override ficar igual à base, o
 * ramo 1 pega o item e o ramo 2 não (exige null).
 *
 * O `where` da base é o mesmo de hoje em cada rota (`ASSET_WHERE_BASE_POR_CATEGORIA`).
 * Ações ainda filtra o ticker em JS (B3_ACAO_RE): use `filtrarDaCategoria`
 * depois do findMany — ele aplica a regra completa (`categoriaDaAba`).
 */
import type { Prisma } from '@prisma/client';
import { FUNDO_TYPES_AGRUPADOS } from '@/lib/fundoTypes';
import {
  CATEGORIAS_MOVIVEIS,
  categoriaDaAba,
  type AssetMovivelLike,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';

/** `asset` do where de cada rota de aba, idêntico ao de antes do mover. */
export const ASSET_WHERE_BASE_POR_CATEGORIA: Record<CategoriaMovivel, Prisma.AssetWhereInput> = {
  acoes: { type: { in: ['stock', 'bdr', 'brd'] } },
  stocks: { type: 'stock', currency: 'USD' },
  fiis: { type: 'fii' },
  etfs: { type: { in: ['etf', 'etf-cvm'] } },
  reits: { type: 'reit' },
  fimFia: { type: { in: [...FUNDO_TYPES_AGRUPADOS] } },
};

const ramosDaCategoria = (cat: CategoriaMovivel, base: Prisma.AssetWhereInput) => [
  { categoriaOverride: cat },
  { categoriaOverride: null, asset: base },
  { categoriaOverride: { notIn: [...CATEGORIAS_MOVIVEIS] }, asset: base },
];

export function wherePortfolioDaCategoria(
  userId: string,
  cat: CategoriaMovivel,
  baseAssetWhere: Prisma.AssetWhereInput = ASSET_WHERE_BASE_POR_CATEGORIA[cat],
): Prisma.PortfolioWhereInput {
  return { userId, OR: ramosDaCategoria(cat, baseAssetWhere) };
}

export function whereWatchlistDaCategoria(
  userId: string,
  cat: CategoriaMovivel,
  baseAssetWhere: Prisma.AssetWhereInput = ASSET_WHERE_BASE_POR_CATEGORIA[cat],
): Prisma.WatchlistWhereInput {
  return { userId, OR: ramosDaCategoria(cat, baseAssetWhere) };
}

/**
 * Pós-filtro em JS: mantém só as linhas cuja aba (override efetivo ?? base) é
 * `cat`. Cobre o que o where não expressa (ticker B3 da aba Ações) e descarta
 * override apontando para a aba de um item fixo.
 */
export function filtrarDaCategoria<
  T extends { categoriaOverride?: string | null; asset: AssetMovivelLike | null },
>(rows: readonly T[], cat: CategoriaMovivel): T[] {
  return rows.filter((r) => categoriaDaAba(r.asset, r.categoriaOverride) === cat);
}
