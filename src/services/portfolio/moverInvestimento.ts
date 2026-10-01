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
 * Erros saem como ApiError (400/404/409) para o withErrorHandler da rota.
 */
import type { Asset, Portfolio, Watchlist } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import {
  AVISO_OBJETIVO_ZERA,
  CAMPO_SUBGRUPO_PORTFOLIO,
  SUBGRUPOS_POR_CATEGORIA,
  abaIdDaCategoria,
  avisoRegraIR,
  categoriaBaseDaAba,
  categoriaDaAba,
  destinoPermitido,
  destinosPermitidos,
  isSubgrupoValido,
  modeloDePreco,
  motivoNaoMovivel,
  mudaRegraIR,
  overrideEfetivo,
  rotuloCategoria,
  rotuloSubgrupo,
  subgrupoPadrao,
  subgrupoSugerido,
  type CategoriaAtivoResponse,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
  type MoverPosicaoAba,
  type MoverSnapshotEstado,
  type SubgrupoCtx,
  type TipoItemMover,
} from '@/lib/carteiraMover';
import { categorizarAsset, type CategoriaCarteira } from '@/services/portfolio/itemValuation';
import { movidoInfoPorEntidade, originalPorEntidade } from '@/services/portfolio/movidoInfo';
import { subtipoFundoPlanejado } from '@/services/portfolio/ativosPlanejados';

// ── Carregamento ─────────────────────────────────────────────────────────────

export const MSG_NAO_ENCONTRADO = 'Investimento não encontrado';
export const MSG_JA_NO_ORIGINAL = 'Este investimento já está na classificação original';

type NotesCompra = SubgrupoCtx['notes'];

export type ItemMover =
  | {
      tipo: 'posicao';
      row: Portfolio;
      asset: Asset;
      temRendaFixa: boolean;
      notes: NotesCompra;
    }
  | {
      tipo: 'planejado';
      row: Watchlist;
      asset: Asset;
      temRendaFixa: boolean;
      notes: NotesCompra;
    };

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
 * Linha (Portfolio ou Watchlist) do usuário com o Asset, a pista de renda fixa
 * (modelo de preço) e as notes da última compra (fallback de subgrupo).
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

  const [fixedIncome, ultimaCompra] = await Promise.all([
    prisma.fixedIncomeAsset.findFirst({
      where: { userId, assetId: row.assetId },
      select: { id: true },
    }),
    tipo === 'posicao'
      ? prisma.stockTransaction.findFirst({
          where: { userId, assetId: row.assetId, type: 'compra' },
          orderBy: { date: 'desc' },
          select: { notes: true },
        })
      : Promise.resolve(null),
  ]);
  const base = {
    asset,
    temRendaFixa: Boolean(fixedIncome),
    notes: parseNotes(ultimaCompra?.notes),
  };
  return tipo === 'posicao'
    ? { tipo, row: rest as Portfolio, ...base }
    : { tipo, row: rest as Watchlist, ...base };
}

// ── Estado atual (aba + subgrupo) ────────────────────────────────────────────

/** Contexto de subgrupo do item para a aba `categoria` (colunas, secao, notes). */
const subgrupoCtxDe = (item: ItemMover, categoria: CategoriaMovivel): SubgrupoCtx => {
  if (item.tipo === 'posicao') {
    const { estrategia, tipoFii, regiaoEtf, tipoFundo } = item.row;
    return { asset: item.asset, estrategia, tipoFii, regiaoEtf, tipoFundo, notes: item.notes };
  }
  // Planejado: a secao só vale para a aba em que ele está.
  const atual = categoriaDaAba(item.asset, item.row.categoriaOverride);
  if (atual !== categoria || !item.row.secao) return { asset: item.asset };
  return { asset: item.asset, [CAMPO_SUBGRUPO_PORTFOLIO[categoria]]: item.row.secao };
};

/** Subgrupo em que a linha aparece hoje na aba (o mesmo fallback da rota). */
export const subgrupoAtualDe = (item: ItemMover, categoria: CategoriaMovivel): string => {
  if (item.tipo === 'planejado' && categoria === 'fimFia') {
    return subtipoFundoPlanejado({ ...item.row, assetId: item.asset.id, asset: item.asset });
  }
  return subgrupoPadrao(categoria, subgrupoCtxDe(item, categoria));
};

export interface EstadoAtual {
  /** Aba onde a linha aparece (null = item de aba fixa). */
  categoria: CategoriaMovivel | null;
  base: CategoriaMovivel | null;
  subgrupo: string | null;
  override: boolean;
}

export const estadoAtualDe = (item: ItemMover): EstadoAtual => {
  const base = categoriaBaseDaAba(item.asset);
  const categoria = categoriaDaAba(item.asset, item.row.categoriaOverride);
  return {
    categoria,
    base,
    subgrupo: categoria ? subgrupoAtualDe(item, categoria) : null,
    override: overrideEfetivo(item.asset, item.row.categoriaOverride) != null,
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

const labelOriginal = (categoria: CategoriaMovivel, subgrupo: string | null): string => {
  const sub = rotuloSubgrupo(categoria, subgrupo);
  return sub ? `${rotuloCategoria(categoria)} › ${sub}` : rotuloCategoria(categoria);
};

export async function obterOpcoesMover(
  userId: string,
  tipo: TipoItemMover,
  id: string,
): Promise<MoverOpcoesResponse | null> {
  const item = await carregarItemMover(userId, tipo, id);
  if (!item) return null;

  const { asset, row } = item;
  const atual = estadoAtualDe(item);
  const modelo = modeloDePreco(asset, { temRendaFixa: item.temRendaFixa });
  const categoriaFixa = categoriaFixaDe(item);
  const categoriaExibida: CategoriaCarteira = atual.categoria ?? categoriaFixa;

  const response: MoverOpcoesResponse = {
    item: {
      tipo,
      id: row.id,
      assetId: asset.id,
      ticker: asset.symbol,
      nome: asset.name,
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
    movivel: modelo !== 'fixo' && atual.categoria !== null,
    destinos: [],
    avisos: [],
  };

  if (!response.movivel || !atual.categoria || !atual.base) {
    response.motivo = motivoNaoMovivel(categoriaFixa);
    return response;
  }

  const origem = atual.categoria;
  const base = atual.base;
  const objetivo = item.tipo === 'posicao' ? item.row.objetivo : 0;
  response.destinos = destinosPermitidos(asset, {
    temRendaFixa: item.temRendaFixa,
    atual: origem,
  }).map((d): DestinoOpcao => {
    const mesmaAba = d.categoria === origem;
    const sugerido = mesmaAba
      ? (atual.subgrupo ?? subgrupoPadrao(d.categoria, { asset }))
      : subgrupoSugerido(asset, d.categoria, subgrupoCtxDe(item, d.categoria));
    const avisos: string[] = [];
    if (!mesmaAba && d.permitido) {
      if (mudaRegraIR(base, d.categoria, asset.currency)) avisos.push(avisoRegraIR(base));
      if (item.tipo === 'posicao' && objetivo > 0) avisos.push(AVISO_OBJETIVO_ZERA);
    }
    return {
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
  });

  // Selo e "Voltar ao original": só com a linha fora da aba base (decisão 10).
  if (atual.override) {
    const [info, original] = await Promise.all([
      movidoInfoPorEntidade(userId, [row.id]),
      originalPorEntidade(userId, row.id, { asset, tipo }),
    ]);
    const movido = info.get(row.id);
    if (movido?.movido && movido.em) {
      response.movido = { em: movido.em, viaConsultant: movido.viaConsultant };
    }
    const categoriaOriginal = original?.categoria ?? base;
    const subgrupoOriginal = original ? original.subgrupo : null;
    response.original = {
      categoria: categoriaOriginal,
      subgrupo: subgrupoOriginal,
      label: labelOriginal(
        categoriaOriginal,
        subgrupoOriginal ?? subgrupoPadrao(categoriaOriginal, { asset }),
      ),
    };
  }
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
  const posicao = await prisma.portfolio.findFirst({
    where: { userId, assetId },
    select: { categoriaOverride: true },
  });
  const planejado = posicao
    ? null
    : await prisma.watchlist.findFirst({
        where: { userId, assetId },
        select: { categoriaOverride: true },
      });
  const override = posicao?.categoriaOverride ?? planejado?.categoriaOverride ?? null;
  return {
    categoria: categoriaDaAba(asset, override),
    override: overrideEfetivo(asset, override) != null,
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

async function exigirItemMovivel(userId: string, tipo: TipoItemMover, id: string) {
  const item = await carregarItemMover(userId, tipo, id);
  if (!item) throw new ApiError(404, MSG_NAO_ENCONTRADO);
  const atual = estadoAtualDe(item);
  const modelo = modeloDePreco(item.asset, { temRendaFixa: item.temRendaFixa });
  if (modelo === 'fixo' || !atual.categoria || !atual.base) {
    throw new ApiError(409, motivoNaoMovivel(categoriaFixaDe(item)));
  }
  return {
    item,
    atual: atual as EstadoAtual & { categoria: CategoriaMovivel; base: CategoriaMovivel },
  };
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

/**
 * Move uma posição ou planejado para `categoria` › `subgrupo`. Validações em
 * ordem: posse 404 → origem movível 409 → destino permitido 409 (motivo) →
 * subgrupo válido 400. Nada muda → `{ noop: true }`.
 */
export async function moverInvestimento(
  userId: string,
  input: { tipo: TipoItemMover; id: string; categoria: CategoriaMovivel; subgrupo: string },
): Promise<MoverOuNoop> {
  const { item, atual } = await exigirItemMovivel(userId, input.tipo, input.id);
  const destino = input.categoria;

  const permitido = destinoPermitido(item.asset, destino, {
    temRendaFixa: item.temRendaFixa,
    atual: atual.categoria,
  });
  if (!permitido.permitido) {
    throw new ApiError(409, permitido.motivo ?? 'Este investimento não pode ir para esta aba');
  }
  if (!isSubgrupoValido(destino, input.subgrupo)) {
    throw new ApiError(400, `Seção inválida para ${rotuloCategoria(destino)}`);
  }

  const trocouAba = destino !== atual.categoria;
  if (!trocouAba && input.subgrupo === atual.subgrupo) return { noop: true };

  const objetivoZerado = trocouAba && item.tipo === 'posicao' && item.row.objetivo !== 0;
  const antes = estadoSnapshotDe(item.tipo, item.row);
  const depois = await gravar(item, {
    categoriaOverride: destino === atual.base ? null : destino,
    subgrupos: { [CAMPO_SUBGRUPO_PORTFOLIO[destino]]: input.subgrupo },
    secao: input.subgrupo,
    zerarObjetivo: objetivoZerado,
  });

  return {
    noop: false,
    item,
    origem: { categoria: atual.categoria, subgrupo: atual.subgrupo },
    destino: { categoria: destino, subgrupo: input.subgrupo },
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

  const original = await originalPorEntidade(userId, item.row.id, { asset: item.asset, tipo });
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

  // Estado novo: a linha volta à aba base; o subgrupo é o que a rota exibirá.
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
