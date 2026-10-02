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
 *      { acao:'mover', tipo, id, categoria, subgrupo? } | { acao:'restaurar', tipo, id }
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
 *
 * ─── FASE 2 (out/2026): Reservas + Renda Fixa ───────────────────────────────
 * Decisões: docs/carteira-mover/fase2-decisoes.md. Atrás da chave
 * MOVER_CAIXA_RF_HABILITADO (`moverCaixaRfHabilitado`, src/lib/carteiraMoverConfig.ts),
 * DESLIGADA por padrão. Chave desligada = TUDO como na fase 1: as regras abaixo
 * devolvem o resultado de antes (categoriaBaseDaAba null para RF/Reservas,
 * destinosPermitidos com as 6, override de caixa/RF ignorado) e nenhuma rota
 * muda de payload (campos novos só com a chave ligada).
 *
 * Fonte de verdade: SÓ Portfolio.categoriaOverride ('reservaEmergencia' |
 * 'reservaOportunidade' | 'rendaFixaFundos'), gravado só quando ≠ base. NUNCA
 * muda Asset.type, símbolo, notes, tesouroDestino nem FixedIncomeAsset. "Onde
 * aparece" segue o override; "como vale" (valor, IR, recalc, liveTotals) segue o
 * tipo. Aba base do Tesouro de catálogo = 1ª compra marcada por data
 * (`reservaDestinoPorAsset`, src/services/portfolio/tesouroDestino.ts) → `BaseCtx`.
 *
 * 5) GET /api/carteira/mover (mesma rota de 1)                     (Fatia A)
 *    Chave ligada: `destinos` com as 9 (CATEGORIAS_MOVIVEIS_TODAS) via
 *    destinosPermitidos(asset, {temRendaFixa, atual, tipo, baseCtx}); modelo
 *    'curva' para o trio; DestinoOpcao.subgrupoEditavel (SUBGRUPO_EDITAVEL) e
 *    secaoAutomatica (secaoRendaFixa, só RF); avisos AVISO_LIQUIDEZ_RESERVA
 *    (precisaAvisoLiquidez), AVISO_SAUDE_RESERVA (envolveReservaEmergencia) e
 *    AVISO_OBJETIVO_ZERA; item.valorAtualBRL (valuatePortfolioItem) e grupo.
 *    `original` via originalPorEntidade(..., { baseCtx }). Chave desligada:
 *    resposta idêntica à fase 1 (sem os campos opcionais).
 *
 * 6) POST /api/carteira/mover (mesma rota de 3)                    (Fatia A)
 *    zod: categoria z.enum(CATEGORIAS_MOVIVEIS_TODAS), subgrupo opcional. Chave desligada + destino do
 *    trio → 409 MOTIVO_ABA_FORA_DA_FASE. Subgrupo exigido só se
 *    SUBGRUPO_EDITAVEL[destino] (400 'Escolha a seção'); no trio é ignorado.
 *    Mesma aba e seção não editável → noop. Grava { categoriaOverride:
 *    destino===base(ctx) ? null : destino, ...(trocouAba ? {objetivo:0} : {}) }
 *    SEM coluna de subgrupo (CAMPO_SUBGRUPO_PORTFOLIO null). MoverResponse
 *    .destino.subgrupo = seção derivada (RF) ou null (Reservas). Mesmos
 *    MOVER_ACTIONS e MoverChangeSnapshot v1; Desfazer e "Voltar ao original"
 *    sem lógica nova. Compra de Tesouro com override (operacao/route.ts): grava
 *    o marcador da base vigente, não o destino recebido (base não muda).
 *
 * 7) GETs de reserva-emergencia, reserva-oportunidade e renda-fixa  (Fatia B)
 *    Mesmo formato de hoje + `LinhaMovidaCampos` por linha. Chave ligada:
 *    findMany(wherePortfolioGrupoCaixaRf) + reservaDestinoPorAsset +
 *    filtrarDaCategoria(rows, cat, ctxDe) — "um item, uma aba" ('cash' só na
 *    Oportunidade); valor com FI = getFixedIncomeCurrentValue (= pizza);
 *    metadados do FI (vencimento, liquidez, benchmark) sem defaults falsos;
 *    seção RF = secaoRendaFixa. Chave desligada: código de hoje + linhas com
 *    `naoMovivelMotivo` (sem alça).
 *
 * 8) Consumidores (Fatia C) e UI (Fatias D/E)
 *    categoriaEfetiva/valuatePortfolioItem já seguem o override (pizza, Saúde);
 *    Fluxo, caixa, histórico por classe e planejamento passam o BaseCtx. UI:
 *    bandeja só com as outras abas do trio (sem chip travado; FII/Ações iguais à
 *    fase 1), confirmação com calcularEfeitosMover (src/lib/moverEfeitos.ts),
 *    alvoDaLinha com seção null e secaoDropIdSintetico (CarteiraDnd.tsx).
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
import { moverCaixaRfHabilitado } from '@/lib/carteiraMoverConfig';
import { ROTULO_SECAO_RENDA_FIXA, SECOES_RENDA_FIXA } from '@/lib/rendaFixaSecao';
import { HORIZONTE_LIQUIDEZ_DIAS } from '@/services/saudeFinanceira/indicadores';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';
import type { AbaPlanejavel } from '@/services/portfolio/ativosPlanejados';
import type { TipoRendaFixa } from '@/types/rendaFixa';

// ── Categorias movíveis ──────────────────────────────────────────────────────

/**
 * Abas da FASE 1 do mover (renda variável e fundos), na ordem da barra de abas.
 * Continua com as 6 e o mesmo nome: a UI da fase 1 (bandeja, DestinoAbaList)
 * percorre esta lista e NÃO pode mudar com a chave da fase 2 desligada.
 */
export const CATEGORIAS_MOVIVEIS = ['fimFia', 'fiis', 'acoes', 'stocks', 'reits', 'etfs'] as const;

export type CategoriaRendaVariavel = (typeof CATEGORIAS_MOVIVEIS)[number];

/**
 * Abas da FASE 2 (out/2026), atrás de MOVER_CAIXA_RF_HABILITADO
 * (`moverCaixaRfHabilitado`). Trocam só entre si (decisão 1 da fase 2).
 */
export const CATEGORIAS_CAIXA_RF = [
  'reservaEmergencia',
  'reservaOportunidade',
  'rendaFixaFundos',
] as const;

export type CategoriaCaixaRf = (typeof CATEGORIAS_CAIXA_RF)[number];

/** As 9 abas movíveis, na ordem da barra de abas (reservas, RF, fundos, FIIs, ações…). */
export const CATEGORIAS_MOVIVEIS_TODAS = [...CATEGORIAS_CAIXA_RF, ...CATEGORIAS_MOVIVEIS] as const;

/** União das 9 (os Records abaixo são completos). */
export type CategoriaMovivel = CategoriaRendaVariavel | CategoriaCaixaRf;

/** Uma das 6 abas da FASE 1 (comportamento de antes; não depende da chave). */
export const isCategoriaMovivel = (value: unknown): value is CategoriaRendaVariavel =>
  typeof value === 'string' && (CATEGORIAS_MOVIVEIS as readonly string[]).includes(value);

export const isCategoriaCaixaRf = (value: unknown): value is CategoriaCaixaRf =>
  typeof value === 'string' && (CATEGORIAS_CAIXA_RF as readonly string[]).includes(value);

/** Uma das 9 abas (sem olhar a chave). */
export const isCategoriaMovivelTodas = (value: unknown): value is CategoriaMovivel =>
  isCategoriaMovivel(value) || isCategoriaCaixaRf(value);

/** Grupo de troca: 'rv' (as 6 da fase 1) e 'caixaRf' (as 3 da fase 2) nunca se misturam. */
export type GrupoMover = 'rv' | 'caixaRf';

export const grupoDaCategoria = (c: CategoriaMovivel): GrupoMover =>
  isCategoriaCaixaRf(c) ? 'caixaRf' : 'rv';

export const categoriasDoGrupo = (c: CategoriaMovivel): readonly CategoriaMovivel[] =>
  isCategoriaCaixaRf(c) ? CATEGORIAS_CAIXA_RF : CATEGORIAS_MOVIVEIS;

/**
 * Valores de categoriaOverride que valem AGORA: as 6 com a chave desligada, as
 * 9 com ela ligada. Override de caixa/RF gravado com a chave ligada é ignorado
 * quando ela desliga (o item volta à aba de origem sem perder o dado).
 */
export const categoriasComOverrideValido = (): readonly CategoriaMovivel[] =>
  moverCaixaRfHabilitado() ? CATEGORIAS_MOVIVEIS_TODAS : CATEGORIAS_MOVIVEIS;

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
  // Fase 2: as Reservas não têm seções; a RF tem as 3 seções DERIVADAS do título
  // (secaoRendaFixa em src/lib/rendaFixaSecao.ts) — não editáveis.
  reservaEmergencia: [],
  reservaOportunidade: [],
  rendaFixaFundos: SECOES_RENDA_FIXA.map((id) => ({ id, label: ROTULO_SECAO_RENDA_FIXA[id] })),
};

/**
 * O usuário escolhe a seção ao mover? false nas 3 da fase 2: Reservas não têm
 * seção e a da RF vem do título (o serviço ignora o `subgrupo` recebido).
 */
export const SUBGRUPO_EDITAVEL: Record<CategoriaMovivel, boolean> = {
  acoes: true,
  stocks: true,
  reits: true,
  fiis: true,
  etfs: true,
  fimFia: true,
  reservaEmergencia: false,
  reservaOportunidade: false,
  rendaFixaFundos: false,
};

export const isSubgrupoValido = (categoria: CategoriaMovivel, subgrupo: unknown): boolean =>
  typeof subgrupo === 'string' && SUBGRUPOS_POR_CATEGORIA[categoria].some((s) => s.id === subgrupo);

export const rotuloSubgrupo = (
  categoria: CategoriaMovivel,
  subgrupo: string | null | undefined,
): string | null =>
  SUBGRUPOS_POR_CATEGORIA[categoria].find((s) => s.id === subgrupo)?.label ?? null;

/**
 * Coluna do Portfolio que guarda o subgrupo de cada aba. null nas 3 da fase 2:
 * nada é gravado (Reservas sem seção; seção da RF derivada do título).
 */
export const CAMPO_SUBGRUPO_PORTFOLIO = {
  acoes: 'estrategia',
  stocks: 'estrategia',
  reits: 'estrategia',
  fiis: 'tipoFii',
  etfs: 'regiaoEtf',
  fimFia: 'tipoFundo',
  reservaEmergencia: null,
  reservaOportunidade: null,
  rendaFixaFundos: null,
} as const satisfies Record<CategoriaMovivel, string | null>;

export type CampoSubgrupoPortfolio = NonNullable<
  (typeof CAMPO_SUBGRUPO_PORTFOLIO)[CategoriaMovivel]
>;

/**
 * Campo da linha (JSON da rota da aba) que diz em que seção ela está. RF: 'tipo'
 * (pos-fixada/prefixada/hibrida); Reservas: null (sem seção — `alvoDaLinha`
 * devolve secaoAtual '').
 */
export const CAMPO_SECAO_NA_LINHA = {
  acoes: 'estrategia',
  stocks: 'estrategia',
  reits: 'estrategia',
  fiis: 'tipo',
  etfs: 'regiao',
  fimFia: 'tipo',
  reservaEmergencia: null,
  reservaOportunidade: null,
  rendaFixaFundos: 'tipo',
} as const satisfies Record<CategoriaMovivel, string | null>;

// ── Mapas de categoria → aba/rota ────────────────────────────────────────────

/**
 * Segmento da rota `/api/carteira/<path>`. Nas 6 da fase 1 é também a chave de
 * queryKeys.assets.type; RF usa queryKeys.assets.type('renda-fixa') e as
 * Reservas usam queryKeys.reserva.* (a fatia D escolhe a chave por categoria).
 */
export const CATEGORIA_API_PATH = {
  acoes: 'acoes',
  stocks: 'stocks',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reit',
  fimFia: 'fim-fia',
  reservaEmergencia: 'reserva-emergencia',
  reservaOportunidade: 'reserva-oportunidade',
  rendaFixaFundos: 'renda-fixa',
} as const satisfies Record<CategoriaMovivel, string>;

/**
 * Categoria → aba de planejados (`TIPOS_ATIVO_PLANEJAVEIS`). Parcial: planejados
 * (Watchlist) não entram nas 3 abas da fase 2 (decisão 2).
 */
export const CATEGORIA_TO_ABA_PLANEJAVEL: Readonly<
  Partial<Record<CategoriaMovivel, AbaPlanejavel>>
> = {
  acoes: 'acoes',
  stocks: 'stocks',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reits',
  fimFia: 'fim-fia',
};

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

/** Reserva onde um Tesouro de CATÁLOGO foi comprado (1ª compra marcada por data). */
export type ReservaDestino = 'emergencia' | 'oportunidade';

/**
 * Contexto da aba base que o Asset sozinho não diz: o Tesouro de catálogo é
 * compartilhado e a reserva fica em `notes.tesouroDestino` da compra —
 * `reservaDestinoPorAsset` (src/services/portfolio/tesouroDestino.ts).
 */
export type BaseCtx = { reservaDestino?: ReservaDestino | null };

/** Aceita 'reserva-emergencia' | 'emergencia' | 'emergency' (e o equivalente de oportunidade). */
export const normalizarReservaDestino = (v: unknown): ReservaDestino | null => {
  if (v === 'reserva-emergencia' || v === 'emergencia' || v === 'emergency') return 'emergencia';
  if (v === 'reserva-oportunidade' || v === 'oportunidade' || v === 'opportunity') {
    return 'oportunidade';
  }
  return null;
};

const RE_SIMBOLO_EMERG = /^(RESERVA-EMERG|CONTA-CORRENTE-EMERG|POUPANCA-EMERG)|-RESERVA-EMERG/;
const RE_SIMBOLO_OPORT = /^(RESERVA-OPORT|CONTA-CORRENTE-OPORT|POUPANCA-OPORT)|-RESERVA-OPORT/;
/** Saldo em conta (sem título): conta corrente, poupança e a reserva manual sem FI. */
const RE_SIMBOLO_SALDO = /^(RESERVA-(EMERG|OPORT)|CONTA-CORRENTE-|POUPANCA-)/;

/** Tesouro de catálogo ou Tesouro manual (TESOURO-*, inclusive o comprado como reserva). */
export const isTesouroAsset = (asset: AssetMovivelLike | null | undefined): boolean =>
  asset?.type === 'tesouro-direto' || (asset?.symbol ?? '').toUpperCase().startsWith('TESOURO-');

/** Regra da FASE 1 (renda variável e fundos) — não depende da chave. */
const categoriaBaseRendaVariavel = (
  asset: AssetMovivelLike | null | undefined,
): CategoriaRendaVariavel | null => {
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
 * Regra da FASE 2 — espelha a pizza (categorizarAsset com isReserva):
 *   1. Tesouro de catálogo com reserva marcada (ctx.reservaDestino) → a reserva;
 *   2. type 'emergency' ou símbolo RESERVA-EMERG*, CONTA-CORRENTE-EMERG*,
 *      POUPANCA-EMERG*, *-RESERVA-EMERG* → Reserva de Emergência;
 *   3. 'opportunity', 'cash' ou o equivalente OPORT → Reserva de Oportunidade
 *      ('cash' fica SÓ na Oportunidade com a chave ligada — decisão 6);
 *   4. 'bond' | 'tesouro-direto' → Renda Fixa.
 */
const categoriaBaseCaixaRf = (
  asset: AssetMovivelLike,
  ctx: BaseCtx = {},
): CategoriaCaixaRf | null => {
  const tipo = (asset.type ?? '').toLowerCase();
  const symbol = (asset.symbol ?? '').toUpperCase();
  const destino = normalizarReservaDestino(ctx.reservaDestino);
  if (destino === 'emergencia') return 'reservaEmergencia';
  if (destino === 'oportunidade') return 'reservaOportunidade';
  if (tipo === 'emergency') return 'reservaEmergencia';
  if (tipo === 'opportunity' || tipo === 'cash') return 'reservaOportunidade';
  if (tipo === 'bond' || tipo === 'tesouro-direto') return 'rendaFixaFundos';
  // Símbolo de reserva com type fora do padrão (defensivo; o /operacao grava type).
  if (!categoriaBaseRendaVariavel(asset)) {
    if (RE_SIMBOLO_EMERG.test(symbol)) return 'reservaEmergencia';
    if (RE_SIMBOLO_OPORT.test(symbol)) return 'reservaOportunidade';
  }
  return null;
};

const baseDaAba = (
  asset: AssetMovivelLike | null | undefined,
  ctx: BaseCtx | undefined,
  caixaRfLiberado: boolean,
): CategoriaMovivel | null => {
  if (!asset) return null;
  if (caixaRfLiberado) {
    const caixaRf = categoriaBaseCaixaRf(asset, ctx);
    if (caixaRf) return caixaRf;
  }
  return categoriaBaseRendaVariavel(asset);
};

/**
 * Em que aba a rota lista o ativo HOJE (sem override) — espelha os `where` das
 * rotas de aba. null = fora das abas movíveis (Imóveis, Moedas/Cripto,
 * Previdência, Opções, units B3 enquanto fora de escopo e — com a chave
 * MOVER_CAIXA_RF_HABILITADO desligada — Renda Fixa e Reservas, como na fase 1).
 */
export const categoriaBaseDaAba = (
  asset: AssetMovivelLike | null | undefined,
  ctx?: BaseCtx,
): CategoriaMovivel | null => baseDaAba(asset, ctx, moverCaixaRfHabilitado());

/**
 * O override vale só se o item é movível, o valor é uma categoria com override
 * válido AGORA (`categoriasComOverrideValido`), do MESMO grupo da aba base e
 * DIFERENTE dela. Override igual à base (catálogo mudou), de outro grupo ou
 * inválido → null: o item segue a regra de sempre.
 */
export const overrideEfetivo = (
  asset: AssetMovivelLike | null | undefined,
  override: string | null | undefined,
  ctx?: BaseCtx,
): CategoriaMovivel | null => {
  if (!override || !(categoriasComOverrideValido() as readonly string[]).includes(override)) {
    return null;
  }
  const destino = override as CategoriaMovivel;
  const base = categoriaBaseDaAba(asset, ctx);
  if (!base || base === destino) return null;
  if (grupoDaCategoria(base) !== grupoDaCategoria(destino)) return null;
  return destino;
};

/** Aba onde o item aparece: override efetivo ?? aba base. */
export const categoriaDaAba = (
  asset: AssetMovivelLike | null | undefined,
  override: string | null | undefined,
  ctx?: BaseCtx,
): CategoriaMovivel | null =>
  overrideEfetivo(asset, override, ctx) ?? categoriaBaseDaAba(asset, ctx);

/**
 * Como o valor do item é calculado — decide para onde ele pode ir:
 * - 'b3-brl': cotação de bolsa em reais → Ações, FII's, ETF's, Fundos;
 * - 'usd': cotação em dólar → Stocks, REIT's, ETF's;
 * - 'fundo': cota CVM/curva (sem cotação em bolsa) → só subgrupo na aba base;
 * - 'curva' (fase 2, chave ligada): curva do título, PU do Tesouro ou valor
 *   informado → Reservas e Renda Fixa trocam entre si;
 * - 'fixo': aba fora do mover (Imóveis, Moedas, Previdência, Opções; e RF e
 *   Reservas com a chave desligada) → nada.
 */
export type ModeloPreco = 'b3-brl' | 'usd' | 'fundo' | 'curva' | 'fixo';

const modeloDaBase = (
  asset: AssetMovivelLike | null | undefined,
  base: CategoriaMovivel | null,
  ctx: { temRendaFixa?: boolean },
): ModeloPreco => {
  if (!asset || !base) return 'fixo';
  if (isCategoriaCaixaRf(base)) return 'curva';
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

export const modeloDePreco = (
  asset: AssetMovivelLike | null | undefined,
  ctx: { temRendaFixa?: boolean; baseCtx?: BaseCtx } = {},
): ModeloPreco => modeloDaBase(asset, categoriaBaseDaAba(asset, ctx.baseCtx), ctx);

/**
 * Saldo em conta (decisão 1 da fase 2): reserva SEM FixedIncomeAsset e que não
 * é Tesouro — RESERVA-*, CONTA-CORRENTE-*, POUPANCA-*, 'cash' sem FI. Só troca
 * entre as duas Reservas (não é um título de renda fixa).
 */
export const isSaldoSemTitulo = (
  asset: AssetMovivelLike | null | undefined,
  ctx: { temRendaFixa?: boolean; baseCtx?: BaseCtx } = {},
): boolean => {
  if (!asset || ctx.temRendaFixa || isTesouroAsset(asset)) return false;
  const base = baseDaAba(asset, ctx.baseCtx, true);
  if (base !== 'reservaEmergencia' && base !== 'reservaOportunidade') return false;
  const tipo = (asset.type ?? '').toLowerCase();
  return (
    tipo === 'emergency' ||
    tipo === 'opportunity' ||
    tipo === 'cash' ||
    RE_SIMBOLO_SALDO.test((asset.symbol ?? '').toUpperCase())
  );
};

// ── Matriz de compatibilidade ────────────────────────────────────────────────

export const MOTIVO_EM_DOLAR = 'Em dólar — esta aba é em reais';
export const MOTIVO_EM_REAIS = 'Em reais — esta aba é em dólar';
export const MOTIVO_SEM_COTACAO = 'Sem cotação em bolsa: o valor vem da cota/curva';
export const MOTIVO_EM_VALIDACAO =
  "Em validação — ETF em dólar ainda não troca com Stocks e REIT's";

// Fase 2 (chave ligada) — textos do protótipo (docs/carteira-mover/fase2-prototipo.html).
/** Título de Reserva/RF → abas de bolsa e fundos (decisão 2: bloqueado nos dois sentidos). */
export const MOTIVO_SEM_COTACAO_BOLSA = 'Sem cotação em bolsa: o valor vem da curva do título';
/** Saldo em conta/poupança → abas de bolsa e fundos. */
export const MOTIVO_SALDO_SEM_COTACAO_BOLSA = 'Sem cotação em bolsa: o valor é o saldo informado';
/** Item de bolsa/fundo → Reservas e RF (decisão 2). */
export const MOTIVO_COM_COTACAO =
  'Tem cotação de mercado — Reservas e Renda Fixa usam curva ou valor informado';
/** Saldo em conta/poupança → Renda Fixa (decisão 1). */
export const MOTIVO_SALDO_SEM_TITULO = 'Saldo em conta não é um título. Ele fica entre as Reservas';
/** Planejado (Watchlist) → Reservas/RF (decisão 2: planejados não entram nas 3 abas). */
export const MOTIVO_PLANEJADO_RV = 'Ativos planejados ficam nas abas de bolsa e fundos';

/** Frase para item de aba fora da fase (sem ponto final; a UI decide). */
export const motivoNaoMovivel = (categoria: CategoriaCarteira | null | undefined): string =>
  `${categoria ? rotuloCategoria(categoria) : 'Esta aba'} ainda não pode ser movida para outra aba`;

const DESTINOS_POR_MODELO: Record<'b3-brl' | 'usd', CategoriaMovivel[]> = {
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
  /** Posição ou planejado (planejado nunca vai para as 3 da fase 2). Default: posição. */
  tipo?: TipoItemMover;
  /** Reserva do Tesouro de catálogo (aba base). */
  baseCtx?: BaseCtx;
  /**
   * Fase 2 liberada? Default: `moverCaixaRfHabilitado()`. false → as 6 entradas
   * da fase 1, idênticas às de antes (a regra ignora RF/Reservas).
   */
  caixaRfLiberado?: boolean;
}

const ACOES_EUA: readonly CategoriaMovivel[] = ['stocks', 'reits'];

const emValidacao = (origem: CategoriaMovivel, destino: CategoriaMovivel): boolean =>
  ETF_USD_ACOES_EUA_EM_VALIDACAO &&
  ((origem === 'etfs' && ACOES_EUA.includes(destino)) ||
    (ACOES_EUA.includes(origem) && destino === 'etfs'));

/** Regra da fase 1 para um destino de renda variável (origem e base também RV). */
const destinoRendaVariavel = (
  categoria: CategoriaRendaVariavel,
  modelo: ModeloPreco,
  base: CategoriaMovivel,
  origem: CategoriaMovivel,
): DestinoPermitido => {
  if (categoria === origem) return { categoria, permitido: true };
  if (modelo === 'fundo') {
    return categoria === base
      ? { categoria, permitido: true }
      : { categoria, permitido: false, motivo: MOTIVO_SEM_COTACAO };
  }
  if (modelo !== 'b3-brl' && modelo !== 'usd') {
    return { categoria, permitido: false, motivo: MOTIVO_SEM_COTACAO };
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
};

/**
 * As abas movíveis com `permitido` e o `motivo` da recusa. A aba atual é sempre
 * permitida (= fica / troca só de subgrupo). Dentro de ETF's as duas regiões
 * ficam livres: a moeda bloqueia só a troca de ABA.
 *
 * - Fase 2 desligada (`caixaRfLiberado` false): as 6 entradas da fase 1, byte a byte.
 * - Fase 2 ligada: as 9 (CATEGORIAS_MOVIVEIS_TODAS). Item de Reserva/RF ('curva')
 *   troca só no trio (saldo sem título só entre as Reservas); as 6 de bolsa
 *   ficam com MOTIVO_SEM_COTACAO_BOLSA. Item de bolsa/fundo: fase 1 nas 6 e as 3
 *   com MOTIVO_COM_COTACAO. Planejado: as 3 com MOTIVO_PLANEJADO_RV.
 */
export const destinosPermitidos = (
  asset: AssetMovivelLike | null | undefined,
  ctx: DestinosCtx = {},
): DestinoPermitido[] => {
  const liberado = ctx.caixaRfLiberado ?? moverCaixaRfHabilitado();
  const planejado = ctx.tipo === 'planejado';
  // Planejado só existe nas abas de bolsa e fundos: a base dele é a da fase 1.
  const base = baseDaAba(asset, ctx.baseCtx, liberado && !planejado);
  const modelo = modeloDaBase(asset, base, ctx);
  const lista: readonly CategoriaMovivel[] = liberado
    ? CATEGORIAS_MOVIVEIS_TODAS
    : CATEGORIAS_MOVIVEIS;

  if (modelo === 'fixo' || !base) {
    const motivo = motivoNaoMovivel(ctx.categoriaFixa);
    return lista.map((categoria) => ({
      categoria,
      permitido: false,
      motivo: planejado && isCategoriaCaixaRf(categoria) ? MOTIVO_PLANEJADO_RV : motivo,
    }));
  }

  const origem = ctx.atual ?? base;

  if (modelo === 'curva') {
    const semTitulo = isSaldoSemTitulo(asset, ctx);
    return lista.map((categoria): DestinoPermitido => {
      if (categoria === origem) return { categoria, permitido: true };
      if (!isCategoriaCaixaRf(categoria)) {
        return {
          categoria,
          permitido: false,
          motivo: semTitulo ? MOTIVO_SALDO_SEM_COTACAO_BOLSA : MOTIVO_SEM_COTACAO_BOLSA,
        };
      }
      if (categoria === 'rendaFixaFundos' && semTitulo) {
        return { categoria, permitido: false, motivo: MOTIVO_SALDO_SEM_TITULO };
      }
      return { categoria, permitido: true };
    });
  }

  return lista.map((categoria): DestinoPermitido => {
    if (isCategoriaCaixaRf(categoria)) {
      return {
        categoria,
        permitido: false,
        motivo: planejado ? MOTIVO_PLANEJADO_RV : MOTIVO_COM_COTACAO,
      };
    }
    return destinoRendaVariavel(categoria, modelo, base, origem);
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

// ── Avisos da fase 2 (texto; os números ficam em src/lib/moverEfeitos.ts) ──────

export const LIQUIDEZ_CONTA_INTEIRO =
  'Mesmo assim conta inteiro como Reserva de Emergência na Saúde Financeira';

export const AVISO_LIQUIDEZ_RESERVA = `Sem liquidez diária. ${LIQUIDEZ_CONTA_INTEIRO}`;

/** Frase fixa da Saúde (também o fallback da prévia numérica quando a Saúde não carrega). */
export const AVISO_SAUDE_RESERVA =
  'A Saúde Financeira recalcula a reserva de emergência com esta mudança';

export interface FiLiquidezLike {
  liquidityType?: string | null;
  maturityDate?: Date | string | null;
}

/**
 * Aviso de liquidez (decisão 3 da fase 2; aviso, não bloqueio): destino Reserva
 * de Emergência, liquidityType ≠ 'DAILY' (inclusive vazio) e vencimento a mais
 * de HORIZONTE_LIQUIDEZ_DIAS (360) de `hoje`. Sem FI ou sem vencimento → sem aviso.
 */
export const precisaAvisoLiquidez = (
  destino: CategoriaMovivel,
  fi: FiLiquidezLike | null | undefined,
  hoje: Date = new Date(),
): boolean => {
  if (destino !== 'reservaEmergencia' || !fi) return false;
  if (fi.liquidityType === 'DAILY') return false;
  if (!fi.maturityDate) return false;
  const venc = new Date(fi.maturityDate).getTime();
  if (Number.isNaN(venc)) return false;
  const dias = (venc - hoje.getTime()) / 86_400_000;
  return dias > HORIZONTE_LIQUIDEZ_DIAS;
};

/** A troca entra ou sai da Reserva de Emergência (a Saúde muda)? */
export const envolveReservaEmergencia = (
  origem: CategoriaMovivel | null | undefined,
  destino: CategoriaMovivel,
): boolean =>
  origem !== destino && (origem === 'reservaEmergencia' || destino === 'reservaEmergencia');

/** Seção automática do destino (RF), para o selo "Pós-fixada · pelo indexador". */
export const secaoAutomaticaDe = (
  destino: CategoriaMovivel,
  secao: TipoRendaFixa | null | undefined,
  via: 'indexador' | 'titulo' = 'indexador',
): (SubgrupoDef & { via: 'indexador' | 'titulo' }) | null => {
  if (destino !== 'rendaFixaFundos' || !secao) return null;
  return { id: secao, label: ROTULO_SECAO_RENDA_FIXA[secao], via };
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
  /** Seção derivada do título (secaoRendaFixa) — destino Renda Fixa. */
  secaoRendaFixa?: TipoRendaFixa | null;
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
    // Fase 2: seção não editável. RF = a derivada do título (mesmo padrão
    // 'prefixada' da rota sem dado); Reservas não têm seção ('').
    case 'rendaFixaFundos':
      return ctx.secaoRendaFixa ?? 'prefixada';
    case 'reservaEmergencia':
    case 'reservaOportunidade':
      return '';
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

type RegraIR = 'acoes' | 'fii' | 'etf' | 'fundo' | 'exterior' | 'rendaFixa';

// As 3 da fase 2 têm a mesma regra: trocar entre elas nunca avisa de IR.
const REGRA_IR: Record<CategoriaMovivel, RegraIR> = {
  acoes: 'acoes',
  fiis: 'fii',
  etfs: 'etf',
  fimFia: 'fundo',
  stocks: 'exterior',
  reits: 'exterior',
  reservaEmergencia: 'rendaFixa',
  reservaOportunidade: 'rendaFixa',
  rendaFixaFundos: 'rendaFixa',
};

/** Rótulo do tipo do ativo no aviso de IR (o IR segue Asset.type — decisão 3). */
export const ROTULO_TIPO_IR: Record<CategoriaMovivel, string> = {
  acoes: 'ação',
  fiis: 'FII',
  etfs: 'ETF',
  fimFia: 'fundo',
  stocks: 'stock',
  reits: 'REIT',
  reservaEmergencia: 'renda fixa',
  reservaOportunidade: 'renda fixa',
  rendaFixaFundos: 'renda fixa',
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
    // As 9: o serviço decide pela chave (desligada + destino do trio → 409).
    categoria: z.enum(CATEGORIAS_MOVIVEIS_TODAS),
    // Exigido só quando SUBGRUPO_EDITAVEL[categoria] (400 'Escolha a seção'); no trio é ignorado.
    subgrupo: z.string().trim().min(1).max(32).optional(),
  }),
  z.object({
    acao: z.literal('restaurar'),
    tipo: tipoItemSchema,
    id: idSchema,
  }),
]);

export type MoverInvestimentoInput = z.infer<typeof moverInvestimentoSchema>;

/**
 * Corpo do POST no cliente: aceita as 9 categorias (o servidor decide pela
 * chave — com ela desligada, destino do trio é recusado).
 */
export type MoverInvestimentoBody = MoverInvestimentoInput;

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
  /** Avisos se o item for para esta aba (IR, objetivo zera, liquidez, Saúde). */
  avisos: string[];
  /**
   * Fase 2: o usuário escolhe a seção? (SUBGRUPO_EDITAVEL). Ausente = true
   * (fase 1 — o payload com a chave desligada não muda).
   */
  subgrupoEditavel?: boolean;
  /** Fase 2: seção derivada (RF) que o item terá no destino — selo "· pelo indexador". */
  secaoAutomatica?: SubgrupoDef & { via: 'indexador' | 'titulo' };
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
    /**
     * Fase 2: valor atual em BRL (valuatePortfolioItem — o mesmo da pizza/Saúde)
     * para a prévia numérica da Saúde (moverEfeitos). Só vem com a chave ligada.
     */
    valorAtualBRL?: number;
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
  /** Fase 2: grupo de troca do item ('rv' | 'caixaRf'). Só vem com a chave ligada. */
  grupo?: GrupoMover;
  movivel: boolean;
  motivo?: string;
  destinos: DestinoOpcao[];
  /** Avisos gerais do item (os específicos de destino ficam em destinos[].avisos). */
  avisos: string[];
  /**
   * Fase 2: números da Saúde Financeira para a prévia antes → depois (moverEfeitos
   * `SaudePrevia`). Só vem com a chave ligada e quando a Reserva de Emergência
   * está envolvida (origem ou destino permitido); null = a Saúde não carregou
   * (a confirmação cai na frase fixa AVISO_SAUDE_RESERVA).
   */
  saudePrevia?: { reservaAtual: number; necessario: number | null } | null;
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
