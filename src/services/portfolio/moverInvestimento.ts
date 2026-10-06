/**
 * Mover investimentos entre abas e seções da Carteira (out/2026) — serviço do
 * servidor por trás de GET/POST /api/carteira/mover e GET /api/carteira/mover/categoria.
 *
 * Regras (fonte única em src/lib/carteiraMover.ts; decisões em
 * docs/carteira-mover/decisoes.md):
 * - Asset.type do catálogo NUNCA muda. A aba escolhida vai em
 *   `categoriaOverride`, gravado só quando o destino ≠ aba base; voltar à base
 *   grava null. Troca só de seção não mexe no override.
 * - O subgrupo vai na coluna da aba destino (`CAMPO_SUBGRUPO_PORTFOLIO`) — as
 *   colunas das outras abas ficam como estão — ou em `Watchlist.secao`.
 * - Posição que troca de ABA tem o objetivo (%) zerado (decisão 2); planejado
 *   mantém o objetivo; troca só de seção mantém.
 * - IR não muda (decisão 3). Valor e quantidade não mudam: sem recalc nem
 *   invalidação de snapshots de patrimônio. O Fluxo de Caixa (aportes/resgates
 *   por linha) e o histórico por classe são derivados na LEITURA a partir do
 *   override (decisões 4 e 5) — não há nada gravado para migrar aqui.
 *
 * FASE 2 (out/2026, atrás de MOVER_CAIXA_RF_HABILITADO — docs/carteira-mover/
 * fase2-decisoes.md): Reserva de Emergência, Reserva de Oportunidade e Renda
 * Fixa trocam entre si (saldo sem título só entre as Reservas; bolsa/fundos e
 * planejados ficam de fora). A aba base do Tesouro de catálogo vem do `BaseCtx`
 * (reservaDestinoPorAsset — 1ª compra marcada por data). Sem coluna de
 * subgrupo: Reservas não têm seção e a da RF é derivada do título
 * (secaoRendaFixa). Chave desligada: tudo como na fase 1, e destino do trio →
 * 409 MSG_ABA_FORA_DA_FASE.
 *
 * Erros saem como ApiError (400/404/409) para o withErrorHandler da rota.
 */
import type { Asset, Portfolio, Watchlist } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import {
  AVISO_LIQUIDEZ_RESERVA,
  AVISO_OBJETIVO_ZERA,
  AVISO_SAUDE_RESERVA,
  CAMPO_SUBGRUPO_PORTFOLIO,
  MOTIVO_PLANEJADO_RV,
  SUBGRUPOS_POR_CATEGORIA,
  SUBGRUPO_EDITAVEL,
  abaIdDaCategoria,
  avisoRegraIR,
  categoriaBaseDaAba,
  categoriaDaAba,
  destinoPermitido,
  destinosPermitidos,
  envolveReservaEmergencia,
  grupoDaCategoria,
  isCategoriaCaixaRf,
  isSubgrupoValido,
  modeloDePreco,
  motivoNaoMovivel,
  mudaRegraIR,
  overrideEfetivo,
  precisaAvisoLiquidez,
  rotuloCategoria,
  rotuloSubgrupo,
  secaoAutomaticaDe,
  subgrupoPadrao,
  subgrupoSugerido,
  type AssetMovivelLike,
  type BaseCtx,
  type CategoriaAtivoResponse,
  type CategoriaMovivel,
  type DestinoOpcao,
  type DestinoPermitido,
  type ModeloPreco,
  type MoverOpcoesResponse,
  type MoverPosicaoAba,
  type MoverSnapshotEstado,
  type SubgrupoCtx,
  type TipoItemMover,
} from '@/lib/carteiraMover';
import { moverCaixaRfHabilitado } from '@/lib/carteiraMoverConfig';
import { secaoDoTituloTesouro, secaoRendaFixa, tituloTesouroDoNome } from '@/lib/rendaFixaSecao';
import { fundoSubtipoFromAssetType, isFundoCatchAllType, isFundoSubtipo } from '@/lib/fundoTypes';
import {
  categorizarAsset,
  valuatePortfolioItem,
  type CategoriaCarteira,
} from '@/services/portfolio/itemValuation';
import { movidoInfoPorEntidade, originalPorEntidade } from '@/services/portfolio/movidoInfo';
import { subtipoFundoPlanejado } from '@/services/portfolio/ativosPlanejados';
import { reservaDestinoPorAsset, type TesouroDestino } from '@/services/portfolio/tesouroDestino';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';
import { buildSaudeFinanceira } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type { TipoRendaFixa } from '@/types/rendaFixa';
import type { ResumoDestinos } from '@/lib/pluggyDestinos';

// ── Carregamento ─────────────────────────────────────────────────────────────

export const MSG_NAO_ENCONTRADO = 'Investimento não encontrado';
export const MSG_JA_NO_ORIGINAL = 'Este investimento já está na classificação original';
/** Chave da fase 2 desligada e destino Reserva/RF (mesmo texto da bandeja da fase 1). */
export const MSG_ABA_FORA_DA_FASE = 'Ainda não dá para mover ativos para esta aba';
/** Destino com seção escolhida à mão e corpo sem `subgrupo`. */
export const MSG_ESCOLHA_SECAO = 'Escolha a seção';

type NotesCompra = SubgrupoCtx['notes'];

/** benchmark/debentureTipo das notes de RF/reserva (seção de itens sem FI). */
export type NotesRf = { benchmark: string | null; debentureTipo: string | null } | null;

/** FixedIncomeAsset do par (userId, assetId): liquidez, vencimento, tipo e valoração. */
export type FiMover = FixedIncomeAssetWithAsset;

interface ItemMoverComum {
  asset: Asset;
  temRendaFixa: boolean;
  notes: NotesCompra;
  /** Fase 2: reserva do Tesouro de catálogo (aba base). `{}` com a chave desligada. */
  baseCtx: BaseCtx;
  fi: FiMover | null;
  notesRf: NotesRf;
}

export type ItemMover =
  | ({ tipo: 'posicao'; row: Portfolio } & ItemMoverComum)
  | ({ tipo: 'planejado'; row: Watchlist } & ItemMoverComum);

const parseNotes = (raw: string | null | undefined): NotesCompra => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { estrategiaReit, tipoFundo } = parsed as Record<string, unknown>;
    return { estrategiaReit, tipoFundo };
  } catch {
    return null;
  }
};

/**
 * Cada campo vem da compra mais recente QUE O TENHA (mesma regra das rotas /reit e /fim-fia):
 * um aporte sem estrategiaReit/tipoFundo não muda a seção atual. Compras em ordem decrescente.
 */
const notesDasCompras = (compras: { notes: string | null }[]): NotesCompra => {
  let algum = false;
  let estrategiaReit: unknown;
  let tipoFundo: unknown;
  for (const compra of compras) {
    const notes = parseNotes(compra.notes);
    if (!notes) continue;
    algum = true;
    if (estrategiaReit === undefined && notes.estrategiaReit) estrategiaReit = notes.estrategiaReit;
    if (tipoFundo === undefined && isFundoSubtipo(notes.tipoFundo)) tipoFundo = notes.tipoFundo;
  }
  return algum ? { estrategiaReit, tipoFundo } : null;
};

const CAMPOS_METADATA_RF = [
  'cotizacaoResgate',
  'liquidacaoResgate',
  'benchmark',
  'observacoes',
  'debentureTipo',
] as const;

/**
 * benchmark/debentureTipo da compra mais recente com metadados de RF/reserva —
 * a mesma escolha do metadataMap da rota renda-fixa. Compras em ordem decrescente.
 */
const notesRfDasCompras = (compras: { notes: string | null }[]): NotesRf => {
  for (const compra of compras) {
    if (!compra.notes) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(compra.notes);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const n = parsed as Record<string, unknown>;
    if (!CAMPOS_METADATA_RF.some((c) => Boolean(n[c]))) continue;
    return {
      benchmark: typeof n.benchmark === 'string' ? n.benchmark : null,
      debentureTipo: typeof n.debentureTipo === 'string' ? n.debentureTipo : null,
    };
  }
  return null;
};

/** Reserva do Tesouro de catálogo — só tesouro-direto e só com a chave ligada. */
const baseCtxDe = async (
  userId: string,
  asset: { id: string; type?: string | null },
  caixaRfLiberado: boolean,
): Promise<BaseCtx> => {
  if (!caixaRfLiberado || asset.type !== 'tesouro-direto') return {};
  const porAsset = await reservaDestinoPorAsset(userId, [asset.id]);
  return { reservaDestino: porAsset.get(asset.id) ?? null };
};

/**
 * Linha (Portfolio ou Watchlist) do usuário com o Asset, o FixedIncomeAsset
 * (modelo de preço, liquidez e seção da RF), as notes das compras (fallback de
 * subgrupo/seção) e o BaseCtx do Tesouro de catálogo.
 * null = não existe ou é de outro usuário (a rota responde 404 nos dois casos).
 */
export async function carregarItemMover(
  userId: string,
  tipo: TipoItemMover,
  id: string,
): Promise<ItemMover | null> {
  const row =
    tipo === 'posicao'
      ? await prisma.portfolio.findFirst({ where: { id, userId }, include: { asset: true } })
      : await prisma.watchlist.findFirst({ where: { id, userId }, include: { asset: true } });
  if (!row?.asset || !row.assetId) return null;
  const { asset, ...rest } = row;

  const [fixedIncome, compras, baseCtx] = await Promise.all([
    prisma.fixedIncomeAsset.findFirst({
      where: { userId, assetId: row.assetId },
      include: { asset: true },
    }),
    tipo === 'posicao'
      ? prisma.stockTransaction.findMany({
          where: { userId, assetId: row.assetId, type: 'compra' },
          orderBy: { date: 'desc' },
          select: { notes: true },
        })
      : Promise.resolve([] as { notes: string | null }[]),
    // Planejado nunca está nas abas de Reservas/RF: a base dele é a da fase 1.
    tipo === 'posicao'
      ? baseCtxDe(userId, asset, moverCaixaRfHabilitado())
      : Promise.resolve<BaseCtx>({}),
  ]);
  const base: ItemMoverComum = {
    asset,
    temRendaFixa: Boolean(fixedIncome),
    notes: notesDasCompras(compras),
    baseCtx,
    fi: (fixedIncome as FiMover | null) ?? null,
    notesRf: notesRfDasCompras(compras),
  };
  return tipo === 'posicao'
    ? { tipo, row: rest as Portfolio, ...base }
    : { tipo, row: rest as Watchlist, ...base };
}

// ── Seção da Renda Fixa (derivada) ───────────────────────────────────────────

/**
 * Seção do item NA Renda Fixa — secaoRendaFixa, a mesma regra da rota
 * renda-fixa. `movidoParaRf` = o item está (ou vai) na RF por override, vindo de
 * uma Reserva: aí o tipo do título (tesouroBondType) vence o indexador padrão do
 * FI de reserva. Default: a aba base dele não é a RF.
 */
export const secaoRendaFixaDoItem = (
  item: ItemMover,
  movidoParaRf: boolean = categoriaBaseDaAba(item.asset, item.baseCtx) !== 'rendaFixaFundos',
): { secao: TipoRendaFixa; via: 'indexador' | 'titulo' } => {
  // Sem FI (Tesouro legacy): o tipo vem do nome do Asset, como a rota renda-fixa.
  const tesouroBondType = item.fi
    ? (item.fi.tesouroBondType ?? null)
    : tituloTesouroDoNome(item.asset);
  const secao = secaoRendaFixa({
    fiType: item.fi?.type ?? null,
    indexer: item.fi?.indexer ?? null,
    tesouroBondType,
    debentureTipo: item.notesRf?.debentureTipo ?? null,
    benchmark: item.notesRf?.benchmark ?? null,
    movidoParaRf,
  });
  const peloTitulo = movidoParaRf && secaoDoTituloTesouro(tesouroBondType) === secao;
  return { secao, via: peloTitulo ? 'titulo' : 'indexador' };
};

// ── Estado atual (aba + subgrupo) ────────────────────────────────────────────

/** Contexto de subgrupo do item para a aba `categoria` (colunas, secao, notes). */
const subgrupoCtxDe = (item: ItemMover, categoria: CategoriaMovivel): SubgrupoCtx => {
  if (item.tipo === 'posicao') {
    const { estrategia, tipoFii, regiaoEtf, tipoFundo } = item.row;
    return {
      asset: item.asset,
      estrategia,
      tipoFii,
      regiaoEtf,
      tipoFundo,
      notes: item.notes,
      ...(categoria === 'rendaFixaFundos'
        ? { secaoRendaFixa: secaoRendaFixaDoItem(item).secao }
        : {}),
    };
  }
  // Planejado: a secao só vale para a aba em que ele está.
  const atual = categoriaDaAba(item.asset, item.row.categoriaOverride);
  const campo = CAMPO_SUBGRUPO_PORTFOLIO[categoria];
  if (atual !== categoria || !item.row.secao || !campo) return { asset: item.asset };
  return { asset: item.asset, [campo]: item.row.secao };
};

/**
 * Subgrupo em que a linha aparece hoje na aba (o mesmo fallback da rota).
 * null = aba sem seção (Reservas).
 */
export const subgrupoAtualDe = (item: ItemMover, categoria: CategoriaMovivel): string | null => {
  if (SUBGRUPOS_POR_CATEGORIA[categoria].length === 0) return null;
  if (item.tipo === 'planejado' && categoria === 'fimFia') {
    return subtipoFundoPlanejado({ ...item.row, assetId: item.asset.id, asset: item.asset });
  }
  return subgrupoPadrao(categoria, subgrupoCtxDe(item, categoria));
};

/**
 * Seção que o item TERÁ no destino quando ela não é escolhida à mão
 * (SUBGRUPO_EDITAVEL false): RF = derivada do título; Reservas = null.
 */
const subgrupoAutomaticoNo = (
  item: ItemMover,
  destino: CategoriaMovivel,
  base: CategoriaMovivel | null,
): string | null =>
  destino === 'rendaFixaFundos'
    ? secaoRendaFixaDoItem(item, base !== 'rendaFixaFundos').secao
    : null;

export interface EstadoAtual {
  /** Aba onde a linha aparece (null = item de aba fixa). */
  categoria: CategoriaMovivel | null;
  base: CategoriaMovivel | null;
  subgrupo: string | null;
  override: boolean;
}

export const estadoAtualDe = (item: ItemMover): EstadoAtual => {
  const base = categoriaBaseDaAba(item.asset, item.baseCtx);
  // Planejados (Watchlist) não entram nas abas de Reservas/RF (decisão 2 da fase 2).
  if (item.tipo === 'planejado' && base && isCategoriaCaixaRf(base)) {
    return { categoria: null, base: null, subgrupo: null, override: false };
  }
  const categoria = categoriaDaAba(item.asset, item.row.categoriaOverride, item.baseCtx);
  return {
    categoria,
    base,
    subgrupo: categoria ? subgrupoAtualDe(item, categoria) : null,
    override: overrideEfetivo(item.asset, item.row.categoriaOverride, item.baseCtx) != null,
  };
};

/** Estado allowlisted da linha para o snapshot do Histórico. */
export const estadoSnapshotDe = (
  tipo: TipoItemMover,
  row: Pick<Portfolio, 'categoriaOverride' | 'objetivo'> &
    Partial<Pick<Portfolio, 'estrategia' | 'tipoFii' | 'regiaoEtf' | 'tipoFundo'>> &
    Partial<Pick<Watchlist, 'secao'>>,
): MoverSnapshotEstado =>
  tipo === 'posicao'
    ? {
        categoriaOverride: row.categoriaOverride ?? null,
        estrategia: row.estrategia ?? null,
        tipoFii: row.tipoFii ?? null,
        regiaoEtf: row.regiaoEtf ?? null,
        tipoFundo: row.tipoFundo ?? null,
        objetivo: row.objetivo,
      }
    : { categoriaOverride: row.categoriaOverride ?? null, secao: row.secao ?? null };

// ── GET /api/carteira/mover ──────────────────────────────────────────────────

const categoriaFixaDe = (item: ItemMover): CategoriaCarteira => categorizarAsset(item.asset);

/** Motivo de "não movível" (planejado de Reserva/RF tem texto próprio). */
const motivoNaoMovivelDe = (item: ItemMover): string => {
  if (item.tipo === 'planejado') {
    const base = categoriaBaseDaAba(item.asset, item.baseCtx);
    if (base && isCategoriaCaixaRf(base)) return MOTIVO_PLANEJADO_RV;
  }
  return motivoNaoMovivel(categoriaFixaDe(item));
};

const labelOriginal = (categoria: CategoriaMovivel, subgrupo: string | null): string => {
  const sub = rotuloSubgrupo(categoria, subgrupo);
  return sub ? `${rotuloCategoria(categoria)} › ${sub}` : rotuloCategoria(categoria);
};

/**
 * Valor atual do item em BRL — valuatePortfolioItem com o FI na curva, o mesmo
 * número da pizza e da Saúde (prévia numérica da fase 2). undefined = falhou
 * (a confirmação cai na frase fixa).
 */
async function valorAtualDe(userId: string, item: ItemMover): Promise<number | undefined> {
  if (item.tipo !== 'posicao') return undefined;
  try {
    const { row, asset, fi } = item;
    const pricer = fi
      ? await createFixedIncomePricer(userId, {
          preloadedAssets: [{ ...fi, qty: fi.qty ?? row.quantity }],
        })
      : null;
    const { valorAtualBRL } = valuatePortfolioItem({
      item: row,
      asset,
      fixedIncome: fi,
      tesouroReservaDestino: item.baseCtx.reservaDestino ?? undefined,
      fiGetCurrentValue: pricer?.getCurrentValue,
    });
    return Number.isFinite(valorAtualBRL) ? valorAtualBRL : undefined;
  } catch {
    return undefined;
  }
}

/** Tempo máximo da Saúde no GET (ela é pesada); estourou → null (frase fixa). */
export const SAUDE_PREVIA_TIMEOUT_MS = 6000;

/**
 * Reserva de emergência atual e necessária pela Saúde Financeira (decisão 3 da
 * fase 2). null = erro ou demora: a confirmação usa AVISO_SAUDE_RESERVA.
 */
async function saudePreviaDe(userId: string): Promise<MoverOpcoesResponse['saudePrevia']> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const saude = await Promise.race([
      buildSaudeFinanceira(userId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SAUDE_PREVIA_TIMEOUT_MS);
      }),
    ]);
    const reserva = saude?.indicadores?.benchmarks?.reservaEmergencia;
    if (!reserva || !Number.isFinite(reserva.atual)) return null;
    return { reservaAtual: reserva.atual, necessario: reserva.necessario ?? null };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ObterOpcoesMoverOpts {
  /**
   * Inclui a prévia da Saúde Financeira (saudePrevia). Pesada (monta a Saúde inteira: fluxo,
   * TWR, cotações) — por isso é opcional (`?saude=1` no GET): as opções da bandeja, do popover
   * e do diálogo não esperam por ela; a confirmação busca a Saúde à parte, só quando o destino
   * escolhido envolve a Reserva de Emergência (useEfeitosMover).
   */
  comSaude?: boolean;
}

// ── Regra de destinos (pura) ─────────────────────────────────────────────────

/** Miolo da regra de destinos de um item (sem I/O), compartilhado pelo GET e pelo resumo. */
interface AnaliseDestinos {
  atual: EstadoAtual;
  modelo: ModeloPreco;
  /** Aba exibida: a atual ou, para item fixo, a de categorizarAsset. */
  categoriaExibida: CategoriaCarteira;
  movivel: boolean;
  /** Preenchido quando o item não tem destinos (não movível). */
  motivo?: string;
  /** destinosPermitidos ([] quando não movível). */
  permitidos: DestinoPermitido[];
  caixaRfLiberado: boolean;
}

const analisarDestinos = (item: ItemMover): AnaliseDestinos => {
  const caixaRfLiberado = moverCaixaRfHabilitado();
  const atual = estadoAtualDe(item);
  const modelo: ModeloPreco = atual.categoria
    ? modeloDePreco(item.asset, { temRendaFixa: item.temRendaFixa, baseCtx: item.baseCtx })
    : 'fixo';
  const categoriaExibida: CategoriaCarteira = atual.categoria ?? categoriaFixaDe(item);
  const movivel = modelo !== 'fixo' && atual.categoria !== null;
  const analise: AnaliseDestinos = {
    atual,
    modelo,
    categoriaExibida,
    movivel,
    permitidos: [],
    caixaRfLiberado,
  };
  if (!movivel || !atual.categoria || !atual.base) {
    analise.motivo = motivoNaoMovivelDe(item);
    return analise;
  }
  analise.permitidos = destinosPermitidos(item.asset, {
    temRendaFixa: item.temRendaFixa,
    atual: atual.categoria,
    tipo: item.tipo,
    baseCtx: item.baseCtx,
    caixaRfLiberado,
  });
  return analise;
};

/**
 * Resumo da regra do mover para um item já carregado: aba atual, se é movível e
 * os destinos com permitido/motivo — o miolo de obterOpcoesMover, sem I/O e sem
 * valor/Saúde/original. Base de `revisavelDoResumo` (destino na importação).
 */
export function resumoDestinos(item: ItemMover): ResumoDestinos {
  const a = analisarDestinos(item);
  return {
    movivel: a.movivel,
    ...(a.motivo ? { motivo: a.motivo } : {}),
    atual: {
      categoria: a.categoriaExibida,
      base: a.atual.base,
      subgrupo: a.atual.subgrupo,
      override: a.atual.override,
    },
    destinos: a.permitidos.map((d) => ({
      categoria: d.categoria,
      permitido: d.permitido,
      ...(d.motivo ? { motivo: d.motivo } : {}),
      subgrupoEditavel: SUBGRUPO_EDITAVEL[d.categoria],
      qtdSubgrupos: SUBGRUPOS_POR_CATEGORIA[d.categoria].length,
    })),
  };
}

export async function obterOpcoesMover(
  userId: string,
  tipo: TipoItemMover,
  id: string,
  { comSaude = false }: ObterOpcoesMoverOpts = {},
): Promise<MoverOpcoesResponse | null> {
  const item = await carregarItemMover(userId, tipo, id);
  if (!item) return null;

  const { atual, modelo, categoriaExibida, permitidos, caixaRfLiberado, ...analise } =
    analisarDestinos(item);
  const { asset, row } = item;

  const response: MoverOpcoesResponse = {
    item: {
      tipo,
      id: row.id,
      assetId: asset.id,
      ticker: asset.symbol,
      // Trio (chave ligada): o nome que as abas mostram — descrição do FI, como a Renda Fixa.
      nome:
        (caixaRfLiberado && isCategoriaCaixaRf(categoriaExibida) && item.fi?.description) ||
        asset.name,
      moeda: asset.currency ?? null,
    },
    atual: {
      categoria: categoriaExibida,
      abaId: abaIdDaCategoria(categoriaExibida),
      subgrupo: atual.subgrupo,
      subgrupoLabel: atual.categoria ? rotuloSubgrupo(atual.categoria, atual.subgrupo) : null,
      override: atual.override,
    },
    movido: null,
    original: null,
    modelo,
    movivel: analise.movivel,
    destinos: [],
    avisos: [],
  };

  if (!response.movivel || !atual.categoria || !atual.base) {
    response.motivo = analise.motivo;
    return response;
  }

  const origem = atual.categoria;
  const base = atual.base;
  const grupoCaixaRf = isCategoriaCaixaRf(origem);
  const objetivo = item.tipo === 'posicao' ? item.row.objetivo : 0;
  response.destinos = permitidos.map((d): DestinoOpcao => {
    const mesmaAba = d.categoria === origem;
    const sugerido = mesmaAba
      ? (atual.subgrupo ?? subgrupoPadrao(d.categoria, { asset }))
      : subgrupoSugerido(asset, d.categoria, subgrupoCtxDe(item, d.categoria));
    const avisos: string[] = [];
    if (!mesmaAba && d.permitido) {
      if (mudaRegraIR(base, d.categoria, asset.currency)) avisos.push(avisoRegraIR(base));
      if (caixaRfLiberado) {
        if (precisaAvisoLiquidez(d.categoria, item.fi)) avisos.push(AVISO_LIQUIDEZ_RESERVA);
        if (envolveReservaEmergencia(origem, d.categoria)) avisos.push(AVISO_SAUDE_RESERVA);
      }
      if (item.tipo === 'posicao' && objetivo > 0) avisos.push(AVISO_OBJETIVO_ZERA);
    }
    const opcao: DestinoOpcao = {
      categoria: d.categoria,
      abaId: abaIdDaCategoria(d.categoria),
      label: rotuloCategoria(d.categoria),
      permitido: d.permitido,
      ...(d.motivo ? { motivo: d.motivo } : {}),
      subgrupos: SUBGRUPOS_POR_CATEGORIA[d.categoria].map((s) => ({
        ...s,
        atual: mesmaAba && s.id === atual.subgrupo,
      })),
      subgrupoSugerido: sugerido,
      avisos,
    };
    // Campos da fase 2 só com a chave ligada (desligada = payload da fase 1).
    if (caixaRfLiberado) {
      opcao.subgrupoEditavel = SUBGRUPO_EDITAVEL[d.categoria];
      if (grupoCaixaRf && d.categoria === 'rendaFixaFundos') {
        const s = secaoRendaFixaDoItem(item, base !== 'rendaFixaFundos');
        const auto = secaoAutomaticaDe('rendaFixaFundos', s.secao, s.via);
        if (auto) opcao.secaoAutomatica = auto;
      }
    }
    return opcao;
  });

  const extras: Promise<void>[] = [];
  if (caixaRfLiberado) {
    response.grupo = grupoDaCategoria(origem);
    if (grupoCaixaRf && item.tipo === 'posicao') {
      extras.push(
        valorAtualDe(userId, item).then((v) => {
          if (v !== undefined) response.item.valorAtualBRL = v;
        }),
      );
      const envolveEmergencia =
        origem === 'reservaEmergencia' ||
        permitidos.some((d) => d.permitido && d.categoria === 'reservaEmergencia');
      if (comSaude && envolveEmergencia) {
        extras.push(
          saudePreviaDe(userId).then((s) => {
            response.saudePrevia = s;
          }),
        );
      }
    }
  }

  // Selo e "Voltar ao original": só com a linha fora da aba base (decisão 10).
  if (atual.override) {
    const [info, original] = await Promise.all([
      movidoInfoPorEntidade(userId, [row.id]),
      originalPorEntidade(userId, row.id, { asset, tipo, baseCtx: item.baseCtx }),
    ]);
    const movido = info.get(row.id);
    if (movido?.movido && movido.em) {
      response.movido = { em: movido.em, viaConsultant: movido.viaConsultant };
    }
    const categoriaOriginal = original?.categoria ?? base;
    // Reservas/RF: a seção não fica gravada — a do original é a derivada na base.
    const subgrupoOriginal = isCategoriaCaixaRf(categoriaOriginal)
      ? subgrupoAutomaticoNo(item, categoriaOriginal, base)
      : original
        ? original.subgrupo
        : null;
    response.original = {
      categoria: categoriaOriginal,
      subgrupo: subgrupoOriginal,
      label: labelOriginal(
        categoriaOriginal,
        subgrupoOriginal ??
          (isCategoriaCaixaRf(categoriaOriginal)
            ? null
            : subgrupoPadrao(categoriaOriginal, { asset })),
      ),
    };
  }
  await Promise.all(extras);
  return response;
}

// ── GET /api/carteira/mover/categoria ────────────────────────────────────────

/** Aba efetiva de um Asset para o usuário (posição > planejado > base). null = asset inexistente. */
export async function obterCategoriaAtivo(
  userId: string,
  assetId: string,
): Promise<CategoriaAtivoResponse | null> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { symbol: true, type: true, currency: true, name: true },
  });
  if (!asset) return null;
  const [posicao, baseCtx] = await Promise.all([
    prisma.portfolio.findFirst({
      where: { userId, assetId },
      select: { categoriaOverride: true },
    }),
    baseCtxDe(userId, { id: assetId, type: asset.type }, moverCaixaRfHabilitado()),
  ]);
  const planejado = posicao
    ? null
    : await prisma.watchlist.findFirst({
        where: { userId, assetId },
        select: { categoriaOverride: true },
      });
  const override = posicao?.categoriaOverride ?? planejado?.categoriaOverride ?? null;
  return {
    categoria: categoriaDaAba(asset, override, baseCtx),
    override: overrideEfetivo(asset, override, baseCtx) != null,
  };
}

// ── POST /api/carteira/mover ─────────────────────────────────────────────────

export interface MoverResultado {
  noop: false;
  item: ItemMover;
  origem: MoverPosicaoAba;
  destino: MoverPosicaoAba;
  objetivoZerado: boolean;
  antes: MoverSnapshotEstado;
  depois: MoverSnapshotEstado;
}

export type MoverOuNoop = MoverResultado | { noop: true };

export const MSG_SECAO_SEGUE_CVM = 'A seção deste fundo segue a classificação da CVM';

/**
 * Planejado na aba base Fundos com Asset classificado pela CVM (fia, multimercado, fidc…): a
 * aba exibe a seção da CVM (subtipoFundoPlanejado), e a secao do planejado só vale com
 * override. Trocar só a seção gravaria algo que a aba nunca mostra — recusa com o motivo.
 */
const secaoSegueCvm = (item: ItemMover, atual: EstadoAtual): boolean =>
  item.tipo === 'planejado' &&
  atual.categoria === 'fimFia' &&
  !atual.override &&
  !isFundoCatchAllType(item.asset.type) &&
  fundoSubtipoFromAssetType(item.asset.type) !== null;

/** Estado de um item movível (aba atual e base definidas). */
export type EstadoMovivel = EstadoAtual & { categoria: CategoriaMovivel; base: CategoriaMovivel };

/** Estado atual do item; não movível → 409 com o motivo (o mesmo do GET). */
export function exigirEstadoMovivel(item: ItemMover): EstadoMovivel {
  const atual = estadoAtualDe(item);
  const modelo = atual.categoria
    ? modeloDePreco(item.asset, { temRendaFixa: item.temRendaFixa, baseCtx: item.baseCtx })
    : 'fixo';
  if (modelo === 'fixo' || !atual.categoria || !atual.base) {
    throw new ApiError(409, motivoNaoMovivelDe(item));
  }
  return atual as EstadoMovivel;
}

async function exigirItemMovivel(userId: string, tipo: TipoItemMover, id: string) {
  const item = await carregarItemMover(userId, tipo, id);
  if (!item) throw new ApiError(404, MSG_NAO_ENCONTRADO);
  return { item, atual: exigirEstadoMovivel(item) };
}

/** Grava a linha e devolve o estado depois (allowlisted). */
async function gravar(
  item: ItemMover,
  data: {
    categoriaOverride: CategoriaMovivel | null;
    subgrupos: Partial<Record<'estrategia' | 'tipoFii' | 'regiaoEtf' | 'tipoFundo', string | null>>;
    secao?: string | null;
    zerarObjetivo: boolean;
  },
): Promise<MoverSnapshotEstado> {
  if (item.tipo === 'posicao') {
    const atualizado = await prisma.portfolio.update({
      where: { id: item.row.id },
      data: {
        categoriaOverride: data.categoriaOverride,
        ...data.subgrupos,
        ...(data.zerarObjetivo ? { objetivo: 0 } : {}),
        lastUpdate: new Date(),
      },
    });
    return estadoSnapshotDe('posicao', atualizado);
  }
  const atualizado = await prisma.watchlist.update({
    where: { id: item.row.id },
    data: {
      categoriaOverride: data.categoriaOverride,
      ...(data.secao !== undefined ? { secao: data.secao } : {}),
    },
  });
  return estadoSnapshotDe('planejado', atualizado);
}

export type PlanoMover =
  | { noop: true }
  | {
      noop: false;
      destino: CategoriaMovivel;
      /** Seção no destino (null = Reservas). */
      subgrupo: string | null;
      editavel: boolean;
      trocouAba: boolean;
    };

/**
 * Validação e cálculo do mover SEM gravar (o que moverInvestimento faz antes do
 * update): chave da fase 2 409 → destino permitido 409 (motivo) → subgrupo (só
 * se a aba deixa escolher) 400 → noop → seção que segue a CVM 409.
 */
export function planejarMover(
  item: ItemMover,
  atual: EstadoMovivel,
  input: { categoria: CategoriaMovivel; subgrupo?: string },
): PlanoMover {
  const destino = input.categoria;

  if (isCategoriaCaixaRf(destino) && !moverCaixaRfHabilitado()) {
    throw new ApiError(409, MSG_ABA_FORA_DA_FASE);
  }
  const permitido = destinoPermitido(item.asset, destino, {
    temRendaFixa: item.temRendaFixa,
    atual: atual.categoria,
    tipo: item.tipo,
    baseCtx: item.baseCtx,
  });
  if (!permitido.permitido) {
    throw new ApiError(409, permitido.motivo ?? 'Este investimento não pode ir para esta aba');
  }

  const editavel = SUBGRUPO_EDITAVEL[destino];
  let subgrupo: string | null;
  if (editavel) {
    if (input.subgrupo === undefined) throw new ApiError(400, MSG_ESCOLHA_SECAO);
    if (!isSubgrupoValido(destino, input.subgrupo)) {
      throw new ApiError(400, `Seção inválida para ${rotuloCategoria(destino)}`);
    }
    subgrupo = input.subgrupo;
  } else {
    // Reservas sem seção; RF com a seção do título. O `subgrupo` recebido é ignorado.
    subgrupo = subgrupoAutomaticoNo(item, destino, atual.base);
  }

  const trocouAba = destino !== atual.categoria;
  if (!trocouAba && (!editavel || subgrupo === atual.subgrupo)) return { noop: true };
  if (!trocouAba && secaoSegueCvm(item, atual)) throw new ApiError(409, MSG_SECAO_SEGUE_CVM);
  return { noop: false, destino, subgrupo, editavel, trocouAba };
}

/**
 * Move uma posição ou planejado para `categoria` › `subgrupo`. Validações em
 * ordem: posse 404 → origem movível 409 → planejarMover (chave da fase 2 409 →
 * destino permitido 409 → subgrupo 400). Nada muda → `{ noop: true }`.
 */
export async function moverInvestimento(
  userId: string,
  input: { tipo: TipoItemMover; id: string; categoria: CategoriaMovivel; subgrupo?: string },
): Promise<MoverOuNoop> {
  const { item, atual } = await exigirItemMovivel(userId, input.tipo, input.id);
  const plano = planejarMover(item, atual, input);
  if (plano.noop) return { noop: true };
  const { destino, subgrupo, editavel, trocouAba } = plano;

  const campo = CAMPO_SUBGRUPO_PORTFOLIO[destino];
  const objetivoZerado = trocouAba && item.tipo === 'posicao' && item.row.objetivo !== 0;
  const antes = estadoSnapshotDe(item.tipo, item.row);
  const depois = await gravar(item, {
    categoriaOverride: destino === atual.base ? null : destino,
    // Fase 2: o trio não tem coluna de subgrupo (CAMPO_SUBGRUPO_PORTFOLIO null).
    subgrupos: campo && editavel ? { [campo]: subgrupo } : {},
    secao: editavel ? subgrupo : undefined,
    zerarObjetivo: objetivoZerado,
  });

  return {
    noop: false,
    item,
    origem: { categoria: atual.categoria, subgrupo: atual.subgrupo },
    destino: { categoria: destino, subgrupo },
    objetivoZerado,
    antes,
    depois,
  };
}

const CAMPOS_SUBGRUPO = ['estrategia', 'tipoFii', 'regiaoEtf', 'tipoFundo'] as const;

/**
 * "Voltar ao original": categoriaOverride = null e as colunas de subgrupo (ou a
 * secao do planejado) voltam ao estado antes do 1º mover da sequência fora da
 * base. Sem histórico (expurgado), só limpa o override. É uma troca de aba:
 * o objetivo da posição volta a 0, como em qualquer troca de aba.
 */
export async function restaurarOriginal(
  userId: string,
  tipo: TipoItemMover,
  id: string,
): Promise<MoverResultado> {
  const { item, atual } = await exigirItemMovivel(userId, tipo, id);
  if (!atual.override) throw new ApiError(409, MSG_JA_NO_ORIGINAL);

  const original = await originalPorEntidade(userId, item.row.id, {
    asset: item.asset,
    tipo,
    baseCtx: item.baseCtx,
  });
  const antesOriginal = original?.antes;
  const subgrupos: Partial<Record<(typeof CAMPOS_SUBGRUPO)[number], string | null>> = {};
  if (antesOriginal) {
    for (const campo of CAMPOS_SUBGRUPO) {
      if (campo in antesOriginal) subgrupos[campo] = antesOriginal[campo] ?? null;
    }
  }
  const secao =
    antesOriginal && 'secao' in antesOriginal ? (antesOriginal.secao ?? null) : undefined;

  const objetivoZerado = item.tipo === 'posicao' && item.row.objetivo !== 0;
  const antes = estadoSnapshotDe(item.tipo, item.row);
  const depois = await gravar(item, {
    categoriaOverride: null,
    subgrupos: item.tipo === 'posicao' ? subgrupos : {},
    secao: item.tipo === 'planejado' ? secao : undefined,
    zerarObjetivo: objetivoZerado,
  });

  // Estado novo: a linha volta à aba base; o subgrupo é o que a rota exibirá
  // (Reservas: null; RF: a seção derivada do título na base).
  const restaurado: ItemMover =
    item.tipo === 'posicao'
      ? { ...item, row: { ...item.row, ...subgrupos, categoriaOverride: null } }
      : {
          ...item,
          row: {
            ...item.row,
            ...(secao !== undefined ? { secao } : {}),
            categoriaOverride: null,
          },
        };

  return {
    noop: false,
    item,
    origem: { categoria: atual.categoria, subgrupo: atual.subgrupo },
    destino: { categoria: atual.base, subgrupo: subgrupoAtualDe(restaurado, atual.base) },
    objetivoZerado,
    antes,
    depois,
  };
}

// ── Compra de Tesouro movido (/api/carteira/operacao) ────────────────────────

const MARCADOR_RESERVA: Record<'emergencia' | 'oportunidade', TesouroDestino> = {
  emergencia: 'reserva-emergencia',
  oportunidade: 'reserva-oportunidade',
};

const isMarcadorReserva = (v: unknown): v is TesouroDestino =>
  v === 'reserva-emergencia' || v === 'reserva-oportunidade';

/**
 * `notes.tesouroDestino` da compra nova de um Tesouro de catálogo. A aba base do
 * Tesouro é a 1ª compra marcada como reserva (reservaDestinoPorAsset); se a
 * posição está MOVIDA (override efetivo da fase 2), a compra nova não pode trocar
 * a base — o marcador gravado passa a ser o da base vigente:
 *   - base numa Reserva → o marcador dessa Reserva (mesmo se veio outro destino);
 *   - base na Renda Fixa → um marcador de reserva recebido é omitido (undefined);
 *     'renda-fixa-*' passa (não marca reserva).
 * Sem posição movida, chave desligada ou outro tipo → o `recebido`, como hoje.
 */
export async function tesouroDestinoDaCompra(
  userId: string,
  asset: (AssetMovivelLike & { id: string }) | null | undefined,
  recebido: string | undefined,
): Promise<string | undefined> {
  if (!recebido || !asset || asset.type !== 'tesouro-direto' || !moverCaixaRfHabilitado()) {
    return recebido;
  }
  const posicao = await prisma.portfolio.findFirst({
    where: { userId, assetId: asset.id },
    select: { categoriaOverride: true },
  });
  if (!posicao?.categoriaOverride) return recebido;
  const baseCtx = await baseCtxDe(userId, asset, true);
  if (overrideEfetivo(asset, posicao.categoriaOverride, baseCtx) == null) return recebido;
  if (baseCtx.reservaDestino) return MARCADOR_RESERVA[baseCtx.reservaDestino];
  return isMarcadorReserva(recebido) ? undefined : recebido;
}
