import type { Asset, Prisma, Watchlist } from '@prisma/client';
import prisma from '@/lib/prisma';

/**
 * Ativos PLANEJADOS (pedido do Wellington, 16/09/2026).
 *
 * O usuário inclui um ativo na aba da carteira SEM posição (sem quantidade
 * nem valor) só para usar as colunas Objetivo / Quanto Falta / Necessidade de
 * Aporte no planejamento dos próximos aportes.
 *
 * Decisão de arquitetura: fica na tabela `watchlists` (que nunca ganhou tela),
 * e NÃO em `Portfolio` com quantity 0 — o recálculo apaga posição sem
 * transação, e TWR, snapshots, proventos, IR, fluxo automático, undo e Pluggy
 * andam por Portfolio sem filtrar quantidade zero. Aqui nada disso enxerga
 * o planejado; ele só aparece nas rotas das abas, como uma linha zerada com
 * `planejado: true`. Na 1ª compra do ativo (`/api/carteira/operacao`) o
 * objetivo migra para `Portfolio.objetivo` e a linha some.
 *
 * Fase 1: só ativos do catálogo (com ticker): ações/BDRs, FIIs, ETFs e
 * moedas/cripto. Stocks/REITs/fundos/RF são cadastro manual (o Asset nasce
 * na compra) — fase 2.
 */

/** Tipos de `Asset.type` que cada aba aceita como planejado. */
export const TIPOS_ATIVO_PLANEJAVEIS = {
  acoes: ['stock', 'bdr', 'brd'],
  fii: ['fii'],
  etf: ['etf', 'etf-cvm'],
  'moedas-criptos': ['crypto', 'currency', 'metal', 'commodity'],
} as const;

export type AbaPlanejavel = keyof typeof TIPOS_ATIVO_PLANEJAVEIS;

/** Tipo do wizard/API de operação → aba onde o planejado aparece. */
export const ABA_POR_TIPO_OPERACAO: Record<string, AbaPlanejavel> = {
  acao: 'acoes',
  bdr: 'acoes',
  'acoes-brasil': 'acoes',
  fii: 'fii',
  etf: 'etf',
  criptoativo: 'moedas-criptos',
  moeda: 'moedas-criptos',
};

/** Seções válidas por aba (o que vai em `Watchlist.secao`). */
export const SECOES_POR_ABA: Record<AbaPlanejavel, readonly string[]> = {
  acoes: ['value', 'growth', 'risk'],
  fii: ['fofi', 'tvm', 'tijolo', 'infra'],
  etf: ['brasil', 'estados_unidos'],
  'moedas-criptos': [], // seção vem do Asset.type (cripto/moeda/metal)
};

const ALL_PLANEJAVEL_TYPES = new Set<string>(Object.values(TIPOS_ATIVO_PLANEJAVEIS).flat());

export const isTipoAssetPlanejavel = (assetType: string | null | undefined): boolean =>
  !!assetType && ALL_PLANEJAVEL_TYPES.has(assetType);

export type PlanejadoComAsset = Watchlist & { assetId: string; asset: Asset };

/**
 * Planejados do usuário cujo Asset.type está em `assetTypes`, exceto os que
 * já viraram posição (defesa: importação Pluggy/undo criam Portfolio sem
 * passar pela operação; a linha planejada ficaria duplicada até a limpeza).
 */
export async function listarPlanejados(
  userId: string,
  assetTypes: readonly string[],
  assetIdsComPosicao: Iterable<string | null | undefined> = [],
): Promise<PlanejadoComAsset[]> {
  const comPosicao = new Set<string>();
  for (const id of assetIdsComPosicao) if (id) comPosicao.add(id);

  const rows = await prisma.watchlist.findMany({
    where: { userId, asset: { type: { in: [...assetTypes] } } },
    include: { asset: true },
    orderBy: { addedAt: 'asc' },
  });
  return rows.filter(
    (r): r is PlanejadoComAsset => !!r.asset && !!r.assetId && !comPosicao.has(r.assetId),
  );
}

/**
 * Campos comuns (BaseQuantityAtivo) de uma linha planejada: tudo zerado,
 * exceto o objetivo. `quantoFalta`/`necessidadeAporte` são recalculados pela
 * rota da aba junto com os demais ativos (e de novo no front).
 */
export function linhaPlanejadaBase(row: PlanejadoComAsset, cotacaoAtual = 0) {
  return {
    id: row.id,
    planejado: true as const,
    ticker: row.asset.symbol,
    nome: row.asset.name,
    quantidade: 0,
    precoAquisicao: 0,
    valorTotal: 0,
    cotacaoAtual,
    valorAtualizado: 0,
    riscoPorAtivo: 0,
    percentualCarteira: 0,
    objetivo: row.objetivo,
    quantoFalta: row.objetivo,
    necessidadeAporte: 0,
    rentabilidade: 0,
    proventos: 0,
    observacoes: row.notes ?? undefined,
    dataUltimaAtualizacao: row.addedAt,
  };
}

type TxLike = Pick<Prisma.TransactionClient, 'watchlist'>;

/**
 * Primeira compra de um ativo que estava planejado: devolve objetivo/seção
 * guardados e apaga a linha planejada. `null` quando não havia planejado.
 * Chamar DENTRO da transação que cria/atualiza o Portfolio.
 */
export async function absorverPlanejadoNaCompra(
  tx: TxLike,
  userId: string,
  assetId: string,
): Promise<{ objetivo: number; secao: string | null } | null> {
  const planejado = await tx.watchlist.findFirst({ where: { userId, assetId } });
  if (!planejado) return null;
  await tx.watchlist.delete({ where: { id: planejado.id } });
  return { objetivo: planejado.objetivo, secao: planejado.secao };
}
