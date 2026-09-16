import type { Asset, Prisma, Watchlist } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  FUNDO_SUBTIPO_ORDER,
  FUNDO_TYPES_AGRUPADOS,
  fundoSubtipoFromAssetType,
  isFundoCatchAllType,
  isFundoSubtipo,
  type FundoSubtipo,
} from '@/lib/fundoTypes';

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
 * objetivo migra para `Portfolio.objetivo` e a linha é apagada.
 *
 * Fase 1: ativos do catálogo (ações/BDRs, FIIs, ETFs, moedas/cripto).
 * Fase 2: Stocks, REITs, Fundos e Previdência. Stocks, REITs e fundos manuais
 * não têm catálogo — o Asset nasce na compra com símbolo único por operação
 * (`TICKER-<timestamp>-<rnd>`). Para planejar, o Asset é criado aqui no
 * mesmo formato e, na compra, a rota de operação REAPROVEITA esse Asset
 * quando o ticker/nome digitado bate (`encontrarPlanejadoManual`), em vez de
 * criar outro — assim a absorção por assetId funciona.
 */

/** Tipos de `Asset.type` que cada aba aceita como planejado. */
export const TIPOS_ATIVO_PLANEJAVEIS = {
  acoes: ['stock', 'bdr', 'brd'],
  fii: ['fii'],
  etf: ['etf', 'etf-cvm'],
  'moedas-criptos': ['crypto', 'currency', 'metal', 'commodity'],
  // Fase 2
  stocks: ['stock'], // + currency USD (ações B3 também são type 'stock')
  reits: ['reit'],
  'fim-fia': [...FUNDO_TYPES_AGRUPADOS],
  'previdencia-seguros': ['previdencia'],
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
  stock: 'stocks',
  reit: 'reits',
  fundo: 'fim-fia',
  previdencia: 'previdencia-seguros',
};

/** Seções válidas por aba (o que vai em `Watchlist.secao`). */
export const SECOES_POR_ABA: Record<AbaPlanejavel, readonly string[]> = {
  acoes: ['value', 'growth', 'risk'],
  fii: ['fofi', 'tvm', 'tijolo', 'infra'],
  etf: ['brasil', 'estados_unidos'],
  'moedas-criptos': [], // seção vem do Asset.type (cripto/moeda/metal)
  stocks: ['value', 'growth', 'risk'],
  reits: ['value', 'growth', 'risk'],
  'fim-fia': [...FUNDO_SUBTIPO_ORDER],
  'previdencia-seguros': [], // seção vem do Asset.type (previdencia × insurance)
};

/**
 * Tipos de operação cujo Asset NÃO vem de catálogo: ao planejar, o Asset é
 * criado aqui (`criarAssetPlanejadoManual`) a partir do ticker/nome digitado.
 */
export const TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS = ['stock', 'reit', 'fundo'] as const;

const ALL_PLANEJAVEL_TYPES = new Set<string>(Object.values(TIPOS_ATIVO_PLANEJAVEIS).flat());

export const isTipoAssetPlanejavel = (assetType: string | null | undefined): boolean =>
  !!assetType && ALL_PLANEJAVEL_TYPES.has(assetType);

export type PlanejadoComAsset = Watchlist & { assetId: string; asset: Asset };

/**
 * Planejados do usuário cujo Asset.type está em `assetTypes`, exceto os que
 * já viraram posição (defesa: importação Pluggy/undo criam Portfolio sem
 * passar pela operação; a linha planejada ficaria duplicada até a limpeza).
 * `filtro` refina por Asset (ex.: Stocks = currency USD; Ações = ticker B3).
 */
export async function listarPlanejados(
  userId: string,
  assetTypes: readonly string[],
  assetIdsComPosicao: Iterable<string | null | undefined> = [],
  filtro?: (asset: Asset) => boolean,
): Promise<PlanejadoComAsset[]> {
  const comPosicao = new Set<string>();
  for (const id of assetIdsComPosicao) if (id) comPosicao.add(id);

  const rows = await prisma.watchlist.findMany({
    where: { userId, asset: { type: { in: [...assetTypes] } } },
    include: { asset: true },
    orderBy: { addedAt: 'asc' },
  });
  return rows.filter(
    (r): r is PlanejadoComAsset =>
      !!r.asset && !!r.assetId && !comPosicao.has(r.assetId) && (filtro ? filtro(r.asset) : true),
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

/** Linha planejada da aba Fundos (BaseFundAtivo: sem ticker/quantidade). */
export function linhaPlanejadaFundoBase(row: PlanejadoComAsset) {
  return {
    id: row.id,
    planejado: true as const,
    nome: row.asset.name,
    cotizacaoResgate: '',
    liquidacaoResgate: '',
    categoriaNivel1: row.asset.categoria || '',
    subcategoriaNivel2: row.asset.subcategoria || '',
    valorInicialAplicado: 0,
    aporte: 0,
    resgate: 0,
    valorAtualizado: 0,
    percentualCarteira: 0,
    riscoPorAtivo: 0,
    objetivo: row.objetivo,
    quantoFalta: row.objetivo,
    necessidadeAporte: 0,
    rentabilidade: 0,
    tipo: subtipoFundoPlanejado(row),
    observacoes: row.notes ?? undefined,
    isAutoUpdated: false,
  };
}

/** Seção da aba Fundos: classificação CVM do Asset vence; senão a escolhida ao planejar. */
export function subtipoFundoPlanejado(row: PlanejadoComAsset): FundoSubtipo {
  const doAsset = isFundoCatchAllType(row.asset.type)
    ? null
    : fundoSubtipoFromAssetType(row.asset.type);
  if (doAsset) return doAsset;
  if (isFundoSubtipo(row.secao)) return row.secao;
  return fundoSubtipoFromAssetType(row.asset.type) ?? 'fim';
}

// ---------------------------------------------------------------------------
// Ativos MANUAIS (stock / reit / fundo): símbolo no MESMO formato da compra
// ---------------------------------------------------------------------------

/** Mesma sanitização que `/api/carteira/operacao` usa ao criar o Asset na compra. */
export function prefixoSimboloManual(tipoOperacao: 'stock' | 'reit' | 'fundo', nome: string) {
  const limpo = nome.trim();
  if (tipoOperacao === 'fundo') {
    const safe =
      limpo
        .replace(/[^a-zA-Z0-9]/g, '-')
        .substring(0, 20)
        .toUpperCase() || 'FUNDO';
    return `FUNDO-${safe}-`;
  }
  const safe =
    limpo
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 10)
      .toUpperCase() || (tipoOperacao === 'stock' ? 'STOCK' : 'REIT');
  return `${safe}-`;
}

const ASSET_TYPE_MANUAL: Record<'stock' | 'reit' | 'fundo', { type: string; currency: string }> = {
  stock: { type: 'stock', currency: 'USD' },
  reit: { type: 'reit', currency: 'USD' },
  fundo: { type: 'fund', currency: 'BRL' },
};

/**
 * Cria o Asset de um planejado manual (stock/REIT/fundo sem catálogo), com
 * símbolo `PREFIXO-<timestamp>-<rnd>` — o mesmo formato da compra, para que
 * `extrairTicker` e as demais rotinas tratem igual. Nome limpo (sem o sufixo
 * "- R$ valor - data" da compra: não há valor).
 */
export async function criarAssetPlanejadoManual(
  tipoOperacao: 'stock' | 'reit' | 'fundo',
  nome: string,
): Promise<Asset> {
  const { type, currency } = ASSET_TYPE_MANUAL[tipoOperacao];
  const limpo = tipoOperacao === 'stock' ? nome.trim().toUpperCase() : nome.trim();
  const symbol = `${prefixoSimboloManual(tipoOperacao, limpo)}${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
  return prisma.asset.create({
    data: { symbol, name: limpo, type, currency, source: 'manual' },
  });
}

/** Aba da carteira onde um Asset planejado aparece (null = tipo fora das abas planejáveis). */
export function abaDoAssetPlanejado(asset: Pick<Asset, 'type' | 'currency' | 'symbol'>) {
  if (asset.type === 'stock') {
    return asset.currency === 'USD' ? 'stocks' : 'acoes';
  }
  for (const [aba, tipos] of Object.entries(TIPOS_ATIVO_PLANEJAVEIS)) {
    if ((tipos as readonly string[]).includes(asset.type)) return aba as AbaPlanejavel;
  }
  return null;
}

/** Rótulo da aba para textos (assistente, histórico). */
export const ROTULO_ABA: Record<AbaPlanejavel, string> = {
  acoes: 'Ações',
  fii: "FII's",
  etf: "ETF's",
  'moedas-criptos': 'Moedas e Criptos',
  stocks: 'Stocks',
  reits: "REIT's",
  'fim-fia': 'Fundos',
  'previdencia-seguros': 'Previdência e Seguros',
};

/** Todos os planejados do usuário (com Asset), para o contexto do assistente e afins. */
export async function listarTodosPlanejados(userId: string): Promise<PlanejadoComAsset[]> {
  const rows = await prisma.watchlist.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { addedAt: 'asc' },
  });
  return rows.filter((r): r is PlanejadoComAsset => !!r.asset && !!r.assetId);
}

type TxLike = Pick<Prisma.TransactionClient, 'watchlist'>;

/**
 * Planejado MANUAL do usuário cujo Asset tem o mesmo prefixo de símbolo (ou
 * seja, o mesmo ticker/nome sanitizado). Usado (1) pelo POST de planejados
 * para não duplicar e (2) pela compra, para reaproveitar o Asset em vez de
 * criar outro — sem isso a absorção por assetId nunca casaria.
 */
export async function encontrarPlanejadoManual(
  userId: string,
  tipoOperacao: 'stock' | 'reit' | 'fundo',
  nome: string,
  db: Pick<Prisma.TransactionClient, 'watchlist'> | typeof prisma = prisma,
): Promise<PlanejadoComAsset | null> {
  const { type } = ASSET_TYPE_MANUAL[tipoOperacao];
  const prefixo = prefixoSimboloManual(
    tipoOperacao,
    tipoOperacao === 'stock' ? nome.trim().toUpperCase() : nome,
  );
  const row = await db.watchlist.findFirst({
    where: { userId, asset: { type, source: 'manual', symbol: { startsWith: prefixo } } },
    include: { asset: true },
    orderBy: { addedAt: 'asc' },
  });
  return row && row.asset && row.assetId ? (row as PlanejadoComAsset) : null;
}

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
