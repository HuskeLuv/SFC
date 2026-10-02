/**
 * Selo "movido" e "Voltar ao original" do mover na Carteira (out/2026),
 * calculados a partir do Histórico de alterações (UserChangeLog) — sem colunas
 * novas (decisão 10: só na troca de ABA).
 *
 * Eventos considerados: section 'carteira', actions MOVER_ACTIONS, undoneAt
 * null (desfazer apaga o efeito sozinho). Cada evento tem snapshot
 * `MoverChangeSnapshot` com o estado antes (`data`) e depois (`meta.after`).
 *
 * "Sequência fora da base": os últimos eventos (do mais novo para trás) que
 * deixam o item com categoriaOverride ≠ null. O item está movido quando o
 * último evento o deixou fora da base; o original é o estado ANTES do primeiro
 * evento da sequência (ou seja, onde ele estava ao sair da aba base). Um
 * 'restaurar' — ou um mover de volta à base — fecha a sequência.
 *
 * Quem usa (rotas das abas, GET /api/carteira/mover) deve ainda conferir que a
 * linha tem categoriaOverride != null: se o histórico for apagado, o selo some
 * e o item continua onde está (pergunta 14).
 */
import prisma from '@/lib/prisma';
import {
  CAMPO_SUBGRUPO_PORTFOLIO,
  MOVER_ACTIONS_LIST,
  MOVER_SECTION,
  categoriaDaAba,
  isAcaoRestaurar,
  overrideEfetivo,
  type AssetMovivelLike,
  type BaseCtx,
  type CategoriaMovivel,
  type MoverSnapshotEstado,
  type TipoItemMover,
} from '@/lib/carteiraMover';

export interface EventoMover {
  entityId: string | null;
  action: string;
  createdAt: Date;
  viaConsultant: boolean;
  snapshot: unknown;
}

export interface MovidoInfo {
  movido: boolean;
  /** ISO do evento que trocou a aba (o mais recente da sequência). */
  em: string | null;
  viaConsultant: boolean;
}

export interface OriginalInfo {
  /** Aba de onde saiu (normalmente a aba base). null = asset não movível. */
  categoria: CategoriaMovivel | null;
  /** Subgrupo antes de sair; null = fallback da rota (ex.: FII sem tipoFii → FOF). */
  subgrupo: string | null;
  /** Estado allowlisted antes do 1º mover da sequência (para o restaurar). */
  antes: MoverSnapshotEstado;
}

/**
 * Opções dos resumos. `baseCtx` (fase 2): reserva do Tesouro de catálogo
 * (`reservaDestinoPorAsset`) — sem ele a base de um Tesouro de reserva seria a
 * Renda Fixa e o "original" sairia errado.
 */
export interface ResumoOpts {
  asset?: AssetMovivelLike | null;
  tipo?: TipoItemMover;
  baseCtx?: BaseCtx;
}

const NAO_MOVIDO: MovidoInfo = { movido: false, em: null, viaConsultant: false };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const estadoDe = (v: unknown): MoverSnapshotEstado | null => {
  if (!isRecord(v)) return null;
  const override = v.categoriaOverride;
  return {
    ...(v as Partial<MoverSnapshotEstado>),
    categoriaOverride: typeof override === 'string' ? override : null,
  };
};

const antesDe = (e: EventoMover): MoverSnapshotEstado | null =>
  isRecord(e.snapshot) ? estadoDe(e.snapshot.data) : null;

const depoisDe = (e: EventoMover): MoverSnapshotEstado | null =>
  isRecord(e.snapshot) && isRecord(e.snapshot.meta) ? estadoDe(e.snapshot.meta.after) : null;

/** O evento deixou o item fora da aba base? (restaurar e snapshot inválido: não) */
const deixouForaDaBase = (e: EventoMover): boolean =>
  !isAcaoRestaurar(e.action) && depoisDe(e)?.categoriaOverride != null;

const trocouAba = (e: EventoMover): boolean =>
  (antesDe(e)?.categoriaOverride ?? null) !== (depoisDe(e)?.categoriaOverride ?? null);

/** Eventos (em ordem cronológica, não desfeitos) da sequência fora da base atual. */
export function sequenciaForaDaBase(eventosAsc: readonly EventoMover[]): EventoMover[] {
  let inicio = eventosAsc.length;
  while (inicio > 0 && deixouForaDaBase(eventosAsc[inicio - 1])) inicio -= 1;
  return eventosAsc.slice(inicio);
}

/**
 * Puro: resumo de um item a partir dos seus eventos em ordem cronológica.
 * `_opts` existe para o contrato da fase 2 (o selo depende só dos eventos; quem
 * chama confere o override efetivo da linha com o mesmo baseCtx).
 */
export function resumirMovido(
  eventosAsc: readonly EventoMover[],
  _opts: ResumoOpts = {},
): MovidoInfo {
  const seq = sequenciaForaDaBase(eventosAsc);
  if (seq.length === 0) return NAO_MOVIDO;
  const marco = [...seq].reverse().find(trocouAba) ?? seq[0];
  return { movido: true, em: marco.createdAt.toISOString(), viaConsultant: marco.viaConsultant };
}

/** Puro: estado antes de sair da base (null quando o item não está movido). */
export function resumirOriginal(
  eventosAsc: readonly EventoMover[],
  opts: ResumoOpts = {},
): OriginalInfo | null {
  const seq = sequenciaForaDaBase(eventosAsc);
  if (seq.length === 0) return null;
  const antesDoEvento = antesDe(seq[0]) ?? { categoriaOverride: null };
  // O "Voltar" sempre leva à aba BASE (o restaurar grava categoriaOverride = null). Se o 1º
  // evento registrado já começou fora da base (planejado movido e depois comprado, ou começo
  // da sequência expurgado), o original é a aba base — não a aba de onde aquele evento saiu.
  // A secao do planejado era de outra aba: não vale na base (fica o padrão da rota).
  const comecouForaDaBase =
    overrideEfetivo(opts.asset, antesDoEvento.categoriaOverride, opts.baseCtx) !== null;
  const antes: MoverSnapshotEstado = comecouForaDaBase
    ? {
        ...antesDoEvento,
        categoriaOverride: null,
        ...(opts.tipo === 'planejado' ? { secao: null } : {}),
      }
    : antesDoEvento;
  const categoria = categoriaDaAba(opts.asset, antes.categoriaOverride, opts.baseCtx);
  let subgrupo: string | null = null;
  if (opts.tipo === 'planejado') subgrupo = antes.secao ?? null;
  else if (categoria) {
    // Fase 2: Reservas/RF não têm coluna de subgrupo → null (a seção da RF é derivada).
    const campo = CAMPO_SUBGRUPO_PORTFOLIO[categoria];
    subgrupo = campo ? (antes[campo] ?? null) : null;
  }
  return { categoria, subgrupo, antes };
}

async function eventosPorEntidade(
  userId: string,
  entityIds: readonly string[],
): Promise<Map<string, EventoMover[]>> {
  const porEntidade = new Map<string, EventoMover[]>();
  if (entityIds.length === 0) return porEntidade;
  const logs = await prisma.userChangeLog.findMany({
    where: {
      userId,
      section: MOVER_SECTION,
      action: { in: [...MOVER_ACTIONS_LIST] },
      entityId: { in: [...new Set(entityIds)] },
      undoneAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, action: true, createdAt: true, viaConsultant: true, snapshot: true },
  });
  for (const log of logs) {
    if (!log.entityId) continue;
    const lista = porEntidade.get(log.entityId) ?? [];
    lista.push(log);
    porEntidade.set(log.entityId, lista);
  }
  return porEntidade;
}

/**
 * id da linha (Portfolio ou Watchlist) → selo. Só entram ids com algum evento;
 * ausente no Map = não movido.
 */
export async function movidoInfoPorEntidade(
  userId: string,
  entityIds: readonly string[],
  optsDe?: (entityId: string) => ResumoOpts,
): Promise<Map<string, MovidoInfo>> {
  const eventos = await eventosPorEntidade(userId, entityIds);
  const out = new Map<string, MovidoInfo>();
  for (const [id, lista] of eventos) out.set(id, resumirMovido(lista, optsDe?.(id)));
  return out;
}

/** Original de um item movido (para "Voltar ao original" e o restaurar). */
export async function originalPorEntidade(
  userId: string,
  entityId: string,
  opts: ResumoOpts = {},
): Promise<OriginalInfo | null> {
  const eventos = await eventosPorEntidade(userId, [entityId]);
  return resumirOriginal(eventos.get(entityId) ?? [], opts);
}
