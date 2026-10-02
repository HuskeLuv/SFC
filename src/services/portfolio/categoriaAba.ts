/**
 * `where` das rotas de aba com o override do mover (out/2026).
 *
 * Um item aparece na aba `cat` quando:
 *   1. o usuário o moveu para ela (categoriaOverride = cat); ou
 *   2. não foi movido (categoriaOverride null) e o Asset bate na base da aba; ou
 *   3. o override é lixo (não é categoria com override válido agora) e o Asset
 *      bate na base.
 *
 * Como o override só é gravado quando ≠ aba base, um item nunca aparece em duas
 * abas. Defesa extra: se o catálogo mudar e o override ficar igual à base, o
 * ramo 1 pega o item e o ramo 2 não (exige null).
 *
 * O `where` da base é o mesmo de hoje em cada rota (`assetWhereBaseDaCategoria`).
 * Ações ainda filtra o ticker em JS (B3_ACAO_RE): use `filtrarDaCategoria`
 * depois do findMany — ele aplica a regra completa (`categoriaDaAba`).
 *
 * Fase 2 (Reservas + Renda Fixa, atrás de MOVER_CAIXA_RF_HABILITADO): a base do
 * trio não cabe num `where` (Tesouro de catálogo vai para a reserva pela 1ª
 * compra marcada). As rotas do trio buscam o GRUPO inteiro
 * (`wherePortfolioGrupoCaixaRf`) e separam em JS com
 * `filtrarDaCategoria(rows, cat, ctxDe)`, passando o `reservaDestino` de
 * `reservaDestinoPorAsset`.
 */
import type { Prisma } from '@prisma/client';
import { FUNDO_TYPES_AGRUPADOS } from '@/lib/fundoTypes';
import { moverCaixaRfHabilitado } from '@/lib/carteiraMoverConfig';
import {
  CATEGORIAS_CAIXA_RF,
  categoriaDaAba,
  categoriasComOverrideValido,
  grupoDaCategoria,
  type AssetMovivelLike,
  type BaseCtx,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';

/**
 * `asset` do where de cada rota de aba, idêntico ao de antes do mover. Nas 3 da
 * fase 2 é só o filtro por type (a reserva do Tesouro de catálogo vem do
 * BaseCtx em JS). 'cash' fica só na Oportunidade (decisão 6); com a chave
 * desligada a RF continua listando 'cash' como antes — use
 * `assetWhereBaseDaCategoria`.
 */
export const ASSET_WHERE_BASE_POR_CATEGORIA: Record<CategoriaMovivel, Prisma.AssetWhereInput> = {
  acoes: { type: { in: ['stock', 'bdr', 'brd'] } },
  stocks: { type: 'stock', currency: 'USD' },
  fiis: { type: 'fii' },
  etfs: { type: { in: ['etf', 'etf-cvm'] } },
  reits: { type: 'reit' },
  fimFia: { type: { in: [...FUNDO_TYPES_AGRUPADOS] } },
  reservaEmergencia: { type: 'emergency' },
  reservaOportunidade: { type: { in: ['opportunity', 'cash'] } },
  rendaFixaFundos: { type: { in: ['bond', 'tesouro-direto'] } },
};

/** Base da aba lida AGORA: RF + 'cash' com a chave desligada (como antes da fase 2). */
export const assetWhereBaseDaCategoria = (cat: CategoriaMovivel): Prisma.AssetWhereInput =>
  cat === 'rendaFixaFundos' && !moverCaixaRfHabilitado()
    ? { type: { in: ['bond', 'cash', 'tesouro-direto'] } }
    : ASSET_WHERE_BASE_POR_CATEGORIA[cat];

/**
 * Overrides que tiram o item da base da aba `cat`: os válidos agora e do MESMO
 * grupo (override de outro grupo é ignorado por `overrideEfetivo`, então o item
 * continua na base). Chave desligada → as 6 da fase 1, como antes.
 */
const overridesDoGrupo = (cat: CategoriaMovivel): CategoriaMovivel[] =>
  categoriasComOverrideValido().filter((c) => grupoDaCategoria(c) === grupoDaCategoria(cat));

const ramosDaCategoria = (cat: CategoriaMovivel, base: Prisma.AssetWhereInput) => [
  { categoriaOverride: cat },
  { categoriaOverride: null, asset: base },
  { categoriaOverride: { notIn: overridesDoGrupo(cat) }, asset: base },
];

export function wherePortfolioDaCategoria(
  userId: string,
  cat: CategoriaMovivel,
  baseAssetWhere: Prisma.AssetWhereInput = assetWhereBaseDaCategoria(cat),
): Prisma.PortfolioWhereInput {
  return { userId, OR: ramosDaCategoria(cat, baseAssetWhere) };
}

export function whereWatchlistDaCategoria(
  userId: string,
  cat: CategoriaMovivel,
  baseAssetWhere: Prisma.AssetWhereInput = assetWhereBaseDaCategoria(cat),
): Prisma.WatchlistWhereInput {
  return { userId, OR: ramosDaCategoria(cat, baseAssetWhere) };
}

/** Types do Asset que formam o grupo Reservas + Renda Fixa. */
export const TIPOS_GRUPO_CAIXA_RF: readonly string[] = [
  'emergency',
  'opportunity',
  'cash',
  'bond',
  'tesouro-direto',
];

/**
 * Todo o grupo Reservas + Renda Fixa do usuário (fase 2): types do trio, os
 * símbolos de reserva (defesa) e qualquer linha com override do trio. Depois do
 * findMany, `filtrarDaCategoria` com o BaseCtx de cada linha decide a aba
 * ("um item, uma aba").
 */
export function wherePortfolioGrupoCaixaRf(userId: string): Prisma.PortfolioWhereInput {
  return {
    userId,
    OR: [
      { asset: { type: { in: [...TIPOS_GRUPO_CAIXA_RF] } } },
      { asset: { symbol: { startsWith: 'RESERVA-' } } },
      { asset: { symbol: { startsWith: 'CONTA-CORRENTE-' } } },
      { asset: { symbol: { startsWith: 'POUPANCA-' } } },
      { categoriaOverride: { in: [...CATEGORIAS_CAIXA_RF] } },
    ],
  };
}

/**
 * Pós-filtro em JS: mantém só as linhas cuja aba (override efetivo ?? base) é
 * `cat`. Cobre o que o where não expressa (ticker B3 da aba Ações, reserva do
 * Tesouro de catálogo via `ctxDe`) e descarta override apontando para a aba de
 * um item fixo ou de outro grupo.
 */
export function filtrarDaCategoria<
  T extends { categoriaOverride?: string | null; asset: AssetMovivelLike | null },
>(rows: readonly T[], cat: CategoriaMovivel, ctxDe?: (row: T) => BaseCtx | undefined): T[] {
  return rows.filter((r) => categoriaDaAba(r.asset, r.categoriaOverride, ctxDe?.(r)) === cat);
}
