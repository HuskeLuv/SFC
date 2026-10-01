/**
 * Mover investimentos entre abas e seções da Carteira (out/2026) — FONTE ÚNICA
 * das regras. Puro: roda no cliente e no servidor (sem Prisma, sem fetch).
 *
 * Modelo: o Asset.type do catálogo NUNCA muda. A aba escolhida pelo usuário
 * fica em `Portfolio.categoriaOverride` / `Watchlist.categoriaOverride`, gravada
 * SÓ quando o destino é diferente da aba base (`categoriaBaseDaAba`); voltar à
 * base grava null. O subgrupo (seção) vai na coluna da aba destino
 * (`CAMPO_SUBGRUPO_PORTFOLIO`) ou em `Watchlist.secao` para planejados.
 * Decisões do Wellington: docs/carteira-mover/decisoes.md.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATOS HTTP (fatias A-E). Todas as rotas usam withErrorHandler +
 * requireAuthWithActing (posse por targetUserId; consultor agindo pode mover —
 * fica viaConsultant no histórico). Mutações passam pelo CSRF do middleware: o
 * cliente chama com csrfFetch e, no sucesso, invalidatePortfolioDerivedQueries.
 *
 * 1) GET /api/carteira/mover?tipo=posicao|planejado&id=<id>      (Fatia A)
 *    query: `moverOpcoesQuerySchema` → 200 `MoverOpcoesResponse`
 *    - atual.categoria = categoriaDaAba(asset, override) (para item fixo, a
 *      categoria de categorizarAsset); `original` só quando o item está movido
 *      (movidoInfo/originalPorEntidade); `destinos` = `destinosPermitidos` com
 *      subgrupos, `subgrupoSugerido` e avisos por destino.
 *    - 400 query inválida · 404 item de outro usuário / inexistente.
 *
 * 2) GET /api/carteira/mover/categoria?assetId=<id>               (Fatia A)
 *    query: `categoriaAtivoQuerySchema` → 200 `CategoriaAtivoResponse`
 *    Consulta leve para a prévia de caixa do wizard (Fatia D). Sem posição nem
 *    planejado: categoria = categoriaBaseDaAba(asset), override=false.
 *
 * 3) POST /api/carteira/mover                                       (Fatia A)
 *    body: `moverInvestimentoSchema` (discriminado por `acao`):
 *      { acao:'mover', tipo, id, categoria, subgrupo } | { acao:'restaurar', tipo, id }
 *    Validações, em ordem: zod 400 → posse 404 → origem movível 409
 *    (motivoNaoMovivel) → destino ∈ destinosPermitidos 409 {error: motivo} →
 *    isSubgrupoValido 400 → 'restaurar' sem item movido 409.
 *    Nada muda → 200 `{ ok:true, noop:true }`, sem histórico.
 *    Posição: { categoriaOverride: destino===base ? null : destino,
 *               [CAMPO_SUBGRUPO_PORTFOLIO[destino]]: subgrupo,
 *               ...(trocouAba ? { objetivo: 0 } : {}), lastUpdate }
 *    Planejado: { categoriaOverride: idem, secao: subgrupo } (objetivo mantido).
 *    Restaurar: categoriaOverride=null + colunas de subgrupo do snapshot do 1º
 *    mover da sequência (`originalPorEntidade`).
 *    → 200 `MoverResponse`. Histórico: section MOVER_SECTION, action em
 *    MOVER_ACTIONS, entity 'portfolio'|'watchlist', snapshot `MoverChangeSnapshot`.
 *    Não há recalc nem invalidação de snapshots de patrimônio (valor e
 *    quantidade não mudam); invalidarContextoUsuario(targetUserId).
 *
 * 4) GETs das abas (acoes, stocks, fii, etf, reit, fim-fia)         (Fatia B)
 *    Mesmo formato de hoje + campos opcionais por linha: `LinhaMovidaCampos`.
 *    Listagem: wherePortfolioDaCategoria/whereWatchlistDaCategoria
 *    (src/services/portfolio/categoriaAba.ts) + filtrarDaCategoria.
 *
 * Cliente (Fatia D/E): tipos de UI em src/types/carteiraMover.ts;
 * queryKeys.carteiraMover.{all, opcoes(tipo,id), categoria(assetId)}; a linha
 * otimista troca `CAMPO_SECAO_NA_LINHA[categoria]`; cache da aba =
 * queryKeys.assets.type(CATEGORIA_API_PATH[categoria]).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { CARTEIRA_CLASS_TABS } from '@/components/carteira/carteiraTabsConfig';
import {
  FUNDO_SUBTIPO_LABEL,
  FUNDO_SUBTIPO_ORDER,
  FUNDO_TYPES_AGRUPADOS,
  fundoSubtipoFromAssetType,
  isFundoCatchAllType,
  isFundoSubtipo,
  isFundoType,
} from '@/lib/fundoTypes';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';
import type { AbaPlanejavel } from '@/services/portfolio/ativosPlanejados';

// ── Categorias movíveis ──────────────────────────────────────────────────────

/** Abas que entram na fase 1 do mover, na ordem da barra de abas. */
export const CATEGORIAS_MOVIVEIS = ['fimFia', 'fiis', 'acoes', 'stocks', 'reits', 'etfs'] as const;

export type CategoriaMovivel = (typeof CATEGORIAS_MOVIVEIS)[number];

export const isCategoriaMovivel = (value: unknown): value is CategoriaMovivel =>
  typeof value === 'string' && (CATEGORIAS_MOVIVEIS as readonly string[]).includes(value);

// ── Regex únicas de ticker (rotas, categorizarAsset e as regras abaixo) ─────

/** Ação B3: 4 caracteres + dígito (PETR4, B3SA3). Exclui units, fracionários e BDRs. */
export const B3_ACAO_RE = /^[A-Z][A-Z0-9]{3}[0-9]$/;
/** Unit B3 (TAEE11, KLBN11) — mesma forma de FII/ETF. */
export const B3_UNIT_RE = /^[A-Z][A-Z0-9]{3}11$/;
/** Qualquer ticker de bolsa BRL (PETR4, HGLG11, AAPL34, PETR4F). */
export const B3_COTADO_RE = /^[A-Z][A-Z0-9]{3}\d{1,2}[A-Z]?$/;

/**
 * Units B3 cadastradas como 'stock' (TAEE11…) contam como ação? Decisão 11 do
 * Wellington (01/10/2026): FORA desta feature — continuam fora das abas.
 */
export const INCLUIR_UNITS_EM_ACOES = false;

/**
 * ETF em dólar ↔ Stocks/REIT's (decisão 8): bloqueado "em validação" até
 * conferir preço médio e rentabilidade com uma carteira real.
 */
export const ETF_USD_ACOES_EUA_EM_VALIDACAO = true;

/** Ticker que a aba Ações lista como ação (B3_ACAO_RE, + units se aprovadas). */
export const isTickerAcaoB3 = (symbol: string | null | undefined): boolean => {
  const s = (symbol ?? '').toUpperCase();
  return B3_ACAO_RE.test(s) || (INCLUIR_UNITS_EM_ACOES && B3_UNIT_RE.test(s));
};

// ── Subgrupos (seções) ───────────────────────────────────────────────────────

export interface SubgrupoDef {
  id: string;
  label: string;
}

const ESTRATEGIAS: readonly SubgrupoDef[] = [
  { id: 'value', label: 'Value' },
  { id: 'growth', label: 'Growth' },
  { id: 'risk', label: 'Risk' },
];

export const SUBGRUPOS_POR_CATEGORIA: Record<CategoriaMovivel, readonly SubgrupoDef[]> = {
  acoes: ESTRATEGIAS,
  stocks: ESTRATEGIAS,
  reits: ESTRATEGIAS,
  fiis: [
    { id: 'fofi', label: 'FOF (Fundos de Fundos)' },
    { id: 'tvm', label: 'TVM' },
    { id: 'tijolo', label: 'Tijolo' },
    { id: 'infra', label: 'Infra' },
  ],
  etfs: [
    { id: 'brasil', label: 'Brasil' },
    { id: 'estados_unidos', label: 'EUA' },
  ],
  fimFia: FUNDO_SUBTIPO_ORDER.map((id) => ({ id, label: FUNDO_SUBTIPO_LABEL[id] })),
};

export const isSubgrupoValido = (categoria: CategoriaMovivel, subgrupo: unknown): boolean =>
  typeof subgrupo === 'string' && SUBGRUPOS_POR_CATEGORIA[categoria].some((s) => s.id === subgrupo);

export const rotuloSubgrupo = (
  categoria: CategoriaMovivel,
  subgrupo: string | null | undefined,
): string | null =>
  SUBGRUPOS_POR_CATEGORIA[categoria].find((s) => s.id === subgrupo)?.label ?? null;

/** Coluna do Portfolio que guarda o subgrupo de cada aba. */
export const CAMPO_SUBGRUPO_PORTFOLIO = {
  acoes: 'estrategia',
  stocks: 'estrategia',
  reits: 'estrategia',
  fiis: 'tipoFii',
  etfs: 'regiaoEtf',
  fimFia: 'tipoFundo',
} as const satisfies Record<CategoriaMovivel, string>;

export type CampoSubgrupoPortfolio = (typeof CAMPO_SUBGRUPO_PORTFOLIO)[CategoriaMovivel];

/** Campo da linha (JSON da rota da aba) que diz em que seção ela está. */
export const CAMPO_SECAO_NA_LINHA = {
  acoes: 'estrategia',
  stocks: 'estrategia',
  reits: 'estrategia',
  fiis: 'tipo',
  etfs: 'regiao',
  fimFia: 'tipo',
} as const satisfies Record<CategoriaMovivel, string>;

// ── Mapas de categoria → aba/rota ────────────────────────────────────────────

/** Segmento da rota `/api/carteira/<path>` — também a chave de queryKeys.assets.type. */
export const CATEGORIA_API_PATH = {
  acoes: 'acoes',
  stocks: 'stocks',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reit',
  fimFia: 'fim-fia',
} as const satisfies Record<CategoriaMovivel, string>;

/** Categoria → aba de planejados (`TIPOS_ATIVO_PLANEJAVEIS`). */
export const CATEGORIA_TO_ABA_PLANEJAVEL = {
  acoes: 'acoes',
  stocks: 'stocks',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reits',
  fimFia: 'fim-fia',
} as const satisfies Record<CategoriaMovivel, AbaPlanejavel>;

const TAB_POR_CATEGORIA = new Map(
  CARTEIRA_CLASS_TABS.filter((t) => t.categoria).map((t) => [t.categoria as string, t]),
);

/** Id da aba na /carteira (`?aba=`), ex.: 'fiis', 'fim-fia', 'reit'. */
export const abaIdDaCategoria = (categoria: CategoriaCarteira): string =>
  TAB_POR_CATEGORIA.get(categoria)?.id ?? categoria;

/** Rótulo visível da aba (o mesmo da barra de abas): "FII's", 'Fundos', "REIT's"… */
export const rotuloCategoria = (categoria: CategoriaCarteira): string =>
  TAB_POR_CATEGORIA.get(categoria)?.label ?? categoria;

// ── Aba base, override efetivo e modelo de preço ─────────────────────────────

export type AssetMovivelLike = {
  symbol: string;
  type?: string | null;
  currency?: string | null;
  name?: string | null;
};

/**
 * Em que aba a rota lista o ativo HOJE (sem override) — espelha os `where` das
 * rotas de aba. null = fora das abas movíveis (Renda Fixa, Reservas, Imóveis,
 * Moedas/Cripto, Previdência, Opções e units B3 enquanto fora de escopo).
 */
export const categoriaBaseDaAba = (
  asset: AssetMovivelLike | null | undefined,
): CategoriaMovivel | null => {
  if (!asset) return null;
  const tipo = asset.type ?? '';
  switch (tipo) {
    case 'stock':
      if (asset.currency === 'USD') return 'stocks';
      return isTickerAcaoB3(asset.symbol) ? 'acoes' : null;
    case 'bdr':
    case 'brd':
      return 'acoes';
    case 'fii':
      return 'fiis';
    case 'etf':
    case 'etf-cvm':
      return 'etfs';
    case 'reit':
      return 'reits';
    default:
      return (FUNDO_TYPES_AGRUPADOS as readonly string[]).includes(tipo) ? 'fimFia' : null;
  }
};

/**
 * O override vale só se o item é movível, o valor é uma categoria movível e é
 * DIFERENTE da aba base. Override igual à base (catálogo mudou) ou inválido →
 * null: o item segue a regra de sempre.
 */
export const overrideEfetivo = (
  asset: AssetMovivelLike | null | undefined,
  override: string | null | undefined,
): CategoriaMovivel | null => {
  if (!isCategoriaMovivel(override)) return null;
  const base = categoriaBaseDaAba(asset);
  if (!base || base === override) return null;
  return override;
};

/** Aba onde o item aparece: override efetivo ?? aba base. */
export const categoriaDaAba = (
  asset: AssetMovivelLike | null | undefined,
  override: string | null | undefined,
): CategoriaMovivel | null => overrideEfetivo(asset, override) ?? categoriaBaseDaAba(asset);

/**
 * Como o valor do item é calculado — decide para onde ele pode ir:
 * - 'b3-brl': cotação de bolsa em reais → Ações, FII's, ETF's, Fundos;
 * - 'usd': cotação em dólar → Stocks, REIT's, ETF's;
 * - 'fundo': cota CVM/curva (sem cotação em bolsa) → só subgrupo na aba base;
 * - 'fixo': aba fora da fase (Renda Fixa, Reservas, Imóveis…) → nada.
 */
export type ModeloPreco = 'b3-brl' | 'usd' | 'fundo' | 'fixo';

export const modeloDePreco = (
  asset: AssetMovivelLike | null | undefined,
  ctx: { temRendaFixa?: boolean } = {},
): ModeloPreco => {
  const base = categoriaBaseDaAba(asset);
  if (!asset || !base) return 'fixo';
  const tipo = asset.type ?? '';
  const fundo = isFundoType(tipo);
  if (!fundo && (asset.currency === 'USD' || base === 'reits')) return 'usd';
  const emReais = asset.currency == null || asset.currency === 'BRL';
  if (
    emReais &&
    !ctx.temRendaFixa &&
    tipo !== 'etf-cvm' &&
    B3_COTADO_RE.test(asset.symbol.toUpperCase())
  ) {
    return 'b3-brl';
  }
  return 'fundo';
};

// ── Matriz de compatibilidade ────────────────────────────────────────────────

export const MOTIVO_EM_DOLAR = 'Em dólar — esta aba é em reais';
export const MOTIVO_EM_REAIS = 'Em reais — esta aba é em dólar';
export const MOTIVO_SEM_COTACAO = 'Sem cotação em bolsa: o valor vem da cota/curva';
export const MOTIVO_EM_VALIDACAO =
  "Em validação — ETF em dólar ainda não troca com Stocks e REIT's";

/** Frase para item de aba fora da fase (sem ponto final; a UI decide). */
export const motivoNaoMovivel = (categoria: CategoriaCarteira | null | undefined): string =>
  `${categoria ? rotuloCategoria(categoria) : 'Esta aba'} ainda não pode ser movida para outra aba`;

const DESTINOS_POR_MODELO: Record<Exclude<ModeloPreco, 'fixo' | 'fundo'>, CategoriaMovivel[]> = {
  'b3-brl': ['acoes', 'fiis', 'etfs', 'fimFia'],
  usd: ['stocks', 'reits', 'etfs'],
};

export interface DestinoPermitido {
  categoria: CategoriaMovivel;
  permitido: boolean;
  motivo?: string;
}

export interface DestinosCtx {
  temRendaFixa?: boolean;
  /** Aba atual do item (com override). Default: aba base. */
  atual?: CategoriaMovivel | null;
  /** Categoria de categorizarAsset, só para o texto do item fixo. */
  categoriaFixa?: CategoriaCarteira | null;
}

const ACOES_EUA: readonly CategoriaMovivel[] = ['stocks', 'reits'];

const emValidacao = (origem: CategoriaMovivel, destino: CategoriaMovivel): boolean =>
  ETF_USD_ACOES_EUA_EM_VALIDACAO &&
  ((origem === 'etfs' && ACOES_EUA.includes(destino)) ||
    (ACOES_EUA.includes(origem) && destino === 'etfs'));

/**
 * As 6 abas movíveis com `permitido` e o `motivo` da recusa. A aba atual é
 * sempre permitida (troca só de subgrupo). Dentro de ETF's as duas regiões
 * ficam livres: a moeda bloqueia só a troca de ABA.
 */
export const destinosPermitidos = (
  asset: AssetMovivelLike | null | undefined,
  ctx: DestinosCtx = {},
): DestinoPermitido[] => {
  const modelo = modeloDePreco(asset, ctx);
  const base = categoriaBaseDaAba(asset);
  if (modelo === 'fixo' || !base) {
    const motivo = motivoNaoMovivel(ctx.categoriaFixa);
    return CATEGORIAS_MOVIVEIS.map((categoria) => ({ categoria, permitido: false, motivo }));
  }
  const origem = ctx.atual ?? base;
  return CATEGORIAS_MOVIVEIS.map((categoria): DestinoPermitido => {
    if (categoria === origem) return { categoria, permitido: true };
    if (modelo === 'fundo') {
      return categoria === base
        ? { categoria, permitido: true }
        : { categoria, permitido: false, motivo: MOTIVO_SEM_COTACAO };
    }
    if (!DESTINOS_POR_MODELO[modelo].includes(categoria)) {
      return {
        categoria,
        permitido: false,
        motivo: modelo === 'usd' ? MOTIVO_EM_DOLAR : MOTIVO_EM_REAIS,
      };
    }
    // Voltar à aba base nunca fica preso na validação.
    if (categoria !== base && emValidacao(origem, categoria)) {
      return { categoria, permitido: false, motivo: MOTIVO_EM_VALIDACAO };
    }
    return { categoria, permitido: true };
  });
};

export const destinoPermitido = (
  asset: AssetMovivelLike | null | undefined,
  destino: CategoriaMovivel,
  ctx: DestinosCtx = {},
): DestinoPermitido =>
  destinosPermitidos(asset, ctx).find((d) => d.categoria === destino) ?? {
    categoria: destino,
    permitido: false,
  };

// ── Subgrupo padrão e sugerido ───────────────────────────────────────────────

export interface SubgrupoCtx {
  asset?: AssetMovivelLike | null;
  estrategia?: string | null;
  tipoFii?: string | null;
  regiaoEtf?: string | null;
  tipoFundo?: string | null;
  /** notes (JSON) da última compra: estrategiaReit, tipoFundo. */
  notes?: { estrategiaReit?: unknown; tipoFundo?: unknown } | null;
}

/**
 * Subgrupo quando o usuário ainda não escolheu: o que o item já tem na coluna
 * da aba destino e, sem isso, o mesmo fallback que a rota da aba usa.
 */
export const subgrupoPadrao = (destino: CategoriaMovivel, ctx: SubgrupoCtx = {}): string => {
  switch (destino) {
    case 'acoes':
    case 'stocks':
    case 'reits':
      if (isSubgrupoValido(destino, ctx.estrategia)) return ctx.estrategia as string;
      if (isSubgrupoValido(destino, ctx.notes?.estrategiaReit)) {
        return ctx.notes!.estrategiaReit as string;
      }
      return 'value';
    case 'fiis':
      return isSubgrupoValido('fiis', ctx.tipoFii) ? (ctx.tipoFii as string) : 'fofi';
    case 'etfs':
      if (isSubgrupoValido('etfs', ctx.regiaoEtf)) return ctx.regiaoEtf as string;
      return ctx.asset?.currency === 'USD' ? 'estados_unidos' : 'brasil';
    case 'fimFia': {
      if (isFundoSubtipo(ctx.tipoFundo)) return ctx.tipoFundo;
      const tipo = ctx.asset?.type ?? null;
      const doAsset = isFundoCatchAllType(tipo) ? null : fundoSubtipoFromAssetType(tipo);
      if (doAsset) return doAsset;
      if (isFundoSubtipo(ctx.notes?.tipoFundo)) return ctx.notes!.tipoFundo as string;
      return fundoSubtipoFromAssetType(tipo) ?? 'fim';
    }
  }
};

const normalizar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pré-seleção do popover/diálogo ao trocar de aba: heurística leve pelo nome
 * (Fiagro, Infra, FIDC, FIP…) e, sem pista, `subgrupoPadrao`.
 */
export const subgrupoSugerido = (
  asset: AssetMovivelLike | null | undefined,
  destino: CategoriaMovivel,
  ctx: SubgrupoCtx = {},
): string => {
  const texto = normalizar(`${asset?.name ?? ''} ${asset?.symbol ?? ''}`);
  const infra = /infra|debenture incentivada|incentivad/.test(texto);
  if (destino === 'fimFia') {
    if (/fiagro|agro/.test(texto)) return 'fiagro';
    if (/\bfip\b/.test(texto)) return infra ? 'fip-infra' : 'fip';
    if (/fidc|direitos creditorios/.test(texto)) return 'fidc';
  }
  if (destino === 'fiis') {
    if (infra) return 'infra';
    if (/fundo de fundos|\bfof\b/.test(texto)) return 'fofi';
  }
  return subgrupoPadrao(destino, { asset, ...ctx });
};

// ── IR ───────────────────────────────────────────────────────────────────────

type RegraIR = 'acoes' | 'fii' | 'etf' | 'fundo' | 'exterior';

const REGRA_IR: Record<CategoriaMovivel, RegraIR> = {
  acoes: 'acoes',
  fiis: 'fii',
  etfs: 'etf',
  fimFia: 'fundo',
  stocks: 'exterior',
  reits: 'exterior',
};

/** Rótulo do tipo do ativo no aviso de IR (o IR segue Asset.type — decisão 3). */
export const ROTULO_TIPO_IR: Record<CategoriaMovivel, string> = {
  acoes: 'ação',
  fiis: 'FII',
  etfs: 'ETF',
  fimFia: 'fundo',
  stocks: 'stock',
  reits: 'REIT',
};

/**
 * A aba destino sugere uma tributação diferente da do tipo do ativo?
 * `origem` = aba base (o IR segue o tipo, não a aba). ETF em dólar conta como
 * exterior. Mover NUNCA muda o IR — isto só decide se o diálogo avisa.
 */
export const mudaRegraIR = (
  origem: CategoriaMovivel,
  destino: CategoriaMovivel,
  moeda?: string | null,
): boolean => {
  const regra = (c: CategoriaMovivel): RegraIR =>
    c === 'etfs' && moeda === 'USD' ? 'exterior' : REGRA_IR[c];
  return regra(origem) !== regra(destino);
};

export const avisoRegraIR = (base: CategoriaMovivel): string =>
  `A aba é só organização: o IR continua pelo tipo do ativo (${ROTULO_TIPO_IR[base]})`;

export const AVISO_OBJETIVO_ZERA = 'O objetivo (%) volta para 0 na aba nova';

// ── Histórico (UserChangeLog) ────────────────────────────────────────────────

export const MOVER_SECTION = 'carteira' as const;

export const MOVER_ACTIONS = {
  investimentoMover: 'investimento.mover',
  planejadoMover: 'planejado.mover',
  investimentoRestaurar: 'investimento.restaurar',
  planejadoRestaurar: 'planejado.restaurar',
} as const;

export type MoverAction = (typeof MOVER_ACTIONS)[keyof typeof MOVER_ACTIONS];

export const MOVER_ACTIONS_LIST: readonly MoverAction[] = Object.values(MOVER_ACTIONS);

export const isAcaoRestaurar = (action: string): boolean => action.endsWith('.restaurar');

/** Estado allowlisted antes/depois de um mover (posição: colunas; planejado: secao). */
export interface MoverSnapshotEstado {
  categoriaOverride: string | null;
  estrategia?: string | null;
  tipoFii?: string | null;
  regiaoEtf?: string | null;
  tipoFundo?: string | null;
  objetivo?: number;
  secao?: string | null;
}

/** user_change_logs.snapshot dos 4 actions de mover/restaurar. */
export interface MoverChangeSnapshot {
  v: 1;
  kind: 'mover';
  data: MoverSnapshotEstado;
  meta: { after: MoverSnapshotEstado };
}

// ── Zod e tipos de resposta ──────────────────────────────────────────────────

export const TIPOS_ITEM_MOVER = ['posicao', 'planejado'] as const;
export type TipoItemMover = (typeof TIPOS_ITEM_MOVER)[number];

// IDs de Portfolio/Watchlist são uuid() do Prisma; sem exigir a versão do uuid.
const idSchema = z.string().trim().min(1).max(64);
const tipoItemSchema = z.enum(TIPOS_ITEM_MOVER);

export const moverInvestimentoSchema = z.discriminatedUnion('acao', [
  z.object({
    acao: z.literal('mover'),
    tipo: tipoItemSchema,
    id: idSchema,
    categoria: z.enum(CATEGORIAS_MOVIVEIS),
    subgrupo: z.string().trim().min(1).max(32),
  }),
  z.object({
    acao: z.literal('restaurar'),
    tipo: tipoItemSchema,
    id: idSchema,
  }),
]);

export type MoverInvestimentoInput = z.infer<typeof moverInvestimentoSchema>;

export const moverOpcoesQuerySchema = z.object({ tipo: tipoItemSchema, id: idSchema });
export const categoriaAtivoQuerySchema = z.object({ assetId: idSchema });

export interface SubgrupoOpcao extends SubgrupoDef {
  atual: boolean;
}

export interface DestinoOpcao {
  categoria: CategoriaMovivel;
  abaId: string;
  label: string;
  permitido: boolean;
  motivo?: string;
  subgrupos: SubgrupoOpcao[];
  subgrupoSugerido: string;
  /** Avisos se o item for para esta aba (IR, objetivo zera). */
  avisos: string[];
}

/** GET /api/carteira/mover */
export interface MoverOpcoesResponse {
  item: {
    tipo: TipoItemMover;
    id: string;
    assetId: string;
    ticker: string;
    nome: string;
    moeda: string | null;
  };
  atual: {
    categoria: CategoriaCarteira;
    abaId: string;
    subgrupo: string | null;
    subgrupoLabel: string | null;
    override: boolean;
  };
  movido: { em: string; viaConsultant: boolean } | null;
  original: { categoria: CategoriaMovivel; subgrupo: string | null; label: string } | null;
  modelo: ModeloPreco;
  movivel: boolean;
  motivo?: string;
  destinos: DestinoOpcao[];
  /** Avisos gerais do item (os específicos de destino ficam em destinos[].avisos). */
  avisos: string[];
}

/** GET /api/carteira/mover/categoria */
export interface CategoriaAtivoResponse {
  categoria: CategoriaMovivel | null;
  override: boolean;
}

export interface MoverPosicaoAba {
  categoria: CategoriaMovivel;
  subgrupo: string | null;
}

/** POST /api/carteira/mover */
export type MoverResponse =
  | { ok: true; noop: true }
  | {
      ok: true;
      noop?: false;
      origem: MoverPosicaoAba;
      destino: MoverPosicaoAba;
      objetivoZerado: boolean;
      historicoId: string | null;
    };

/** Campos opcionais por linha nos GETs das abas (Fatia B). */
export interface LinhaMovidaCampos {
  movido?: boolean;
  movidoEm?: string;
  movidoViaConsultor?: boolean;
  naoMovivelMotivo?: string;
}
