/**
 * Histórico de alterações do MOVER na Carteira (out/2026). Quatro actions, todas
 * desfazíveis (undo/handlers/carteira.ts):
 *   investimento.mover · planejado.mover · investimento.restaurar · planejado.restaurar
 * entity 'portfolio' | 'watchlist'; entityId = id da linha (o mesmo que o selo
 * "movido" usa em movidoInfoPorEntidade). snapshot = MoverChangeSnapshot
 * ({data: antes, meta: {after}}) — o desfazer reaplica `data` se a linha ainda
 * estiver igual a `meta.after`.
 */
import type { NextRequest } from 'next/server';
import {
  MOVER_ACTIONS,
  MOVER_SECTION,
  rotuloCategoria,
  rotuloSubgrupo,
  type MoverAction,
  type MoverChangeSnapshot,
  type MoverPosicaoAba,
  type MoverSnapshotEstado,
  type TipoItemMover,
} from '@/lib/carteiraMover';
import { recordChange, type RecordChangeParams } from './recordChange';
import { assetEntityLabel } from './carteiraHelpers';
import type { ChangeSnapshot, FieldChange } from './types';

type Auth = RecordChangeParams['auth'];
type AssetLabel = { symbol?: string | null; name?: string | null; source?: string | null } | null;

export const MOVER_SNAPSHOT_KIND = 'mover';

export const MOVER_ENTITY: Record<TipoItemMover, 'portfolio' | 'watchlist'> = {
  posicao: 'portfolio',
  planejado: 'watchlist',
};

export interface MoverRegistro {
  tipo: TipoItemMover;
  id: string;
  asset: AssetLabel;
  origem: MoverPosicaoAba;
  destino: MoverPosicaoAba;
  objetivoZerado: boolean;
  antes: MoverSnapshotEstado;
  depois: MoverSnapshotEstado;
}

const rotuloPosicao = (p: MoverPosicaoAba) => ({
  aba: rotuloCategoria(p.categoria),
  subgrupo: rotuloSubgrupo(p.categoria, p.subgrupo) ?? p.subgrupo,
});

/**
 * Pares legíveis: Aba (se mudou), Subgrupo (se mudou ou a aba mudou) e
 * Objetivo, só quando foi zerado.
 */
export function moverChanges(
  r: Pick<MoverRegistro, 'origem' | 'destino' | 'objetivoZerado' | 'antes'>,
): FieldChange[] {
  const de = rotuloPosicao(r.origem);
  const para = rotuloPosicao(r.destino);
  const trocouAba = r.origem.categoria !== r.destino.categoria;
  const changes: FieldChange[] = [];
  if (trocouAba) changes.push({ field: 'aba', label: 'Aba', before: de.aba, after: para.aba });
  // Reservas não têm seção (fase 2): sem linha "Subgrupo: — → —" no Histórico.
  const algumSubgrupo = de.subgrupo != null || para.subgrupo != null;
  if (algumSubgrupo && (trocouAba || de.subgrupo !== para.subgrupo)) {
    changes.push({
      field: 'subgrupo',
      label: 'Subgrupo',
      before: de.subgrupo ?? null,
      after: para.subgrupo ?? null,
    });
  }
  if (r.objetivoZerado) {
    changes.push({
      field: 'objetivo',
      label: 'Objetivo',
      before: r.antes.objetivo ?? null,
      after: 0,
      format: 'percent',
    });
  }
  return changes;
}

export function buildMoverSnapshot(
  antes: MoverSnapshotEstado,
  depois: MoverSnapshotEstado,
): ChangeSnapshot {
  const snap: MoverChangeSnapshot = {
    v: 1,
    kind: MOVER_SNAPSHOT_KIND,
    data: antes,
    meta: { after: depois },
  };
  return snap as unknown as ChangeSnapshot;
}

async function recordMover(
  request: NextRequest,
  auth: Auth,
  action: MoverAction,
  r: MoverRegistro,
): Promise<string | null> {
  const id = await recordChange({
    request,
    auth,
    section: MOVER_SECTION,
    action,
    entity: MOVER_ENTITY[r.tipo],
    entityId: r.id,
    entityLabel: assetEntityLabel(r.asset),
    changes: moverChanges(r),
    snapshot: buildMoverSnapshot(r.antes, r.depois),
  });
  return id ?? null;
}

/** 'investimento.mover' — posição trocou de aba e/ou seção. Devolve o id do log. */
export const recordInvestimentoMovido = (request: NextRequest, auth: Auth, r: MoverRegistro) =>
  recordMover(request, auth, MOVER_ACTIONS.investimentoMover, r);

/** 'planejado.mover' — ativo planejado trocou de aba e/ou seção. */
export const recordPlanejadoMovido = (request: NextRequest, auth: Auth, r: MoverRegistro) =>
  recordMover(request, auth, MOVER_ACTIONS.planejadoMover, r);

/** 'investimento.restaurar' | 'planejado.restaurar' — "Voltar ao original". */
export const recordRestaurado = (request: NextRequest, auth: Auth, r: MoverRegistro) =>
  recordMover(
    request,
    auth,
    r.tipo === 'posicao' ? MOVER_ACTIONS.investimentoRestaurar : MOVER_ACTIONS.planejadoRestaurar,
    r,
  );
