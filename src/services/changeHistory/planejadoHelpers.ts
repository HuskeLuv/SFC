/**
 * Histórico de alterações dos ATIVOS PLANEJADOS (sem posição, 16/09/2026).
 * Ver services/portfolio/ativosPlanejados.ts. Três ações, todas desfazíveis
 * (undo/handlers/carteira.ts): `planejado.adicionar`, `planejado.editar`,
 * `planejado.remover`. `entityId` = Watchlist.id (o mesmo que a UI usa).
 */
import type { NextRequest } from 'next/server';
import type { Asset, Watchlist } from '@prisma/client';
import { recordChange, type RecordChangeParams } from './recordChange';
import { diffFields, finalStateChanges } from './diffFields';
import { PLANEJADO_FIELD_LABELS } from './labels';
import type { ChangeSnapshot } from './types';
import { assetEntityLabel } from './carteiraHelpers';

export const PLANEJADO_SNAPSHOT_KIND = 'planejado';

/** Campos "de usuário" do planejado, com os nomes da API (notes → observacoes). */
export function camposDoPlanejado(row: Pick<Watchlist, 'objetivo' | 'secao' | 'notes'>) {
  return {
    objetivo: row.objetivo,
    secao: row.secao ?? null,
    observacoes: row.notes ?? null,
  };
}

/** Snapshot para recriar o planejado (mesmo id) no desfazer da remoção. */
export function buildPlanejadoSnapshot(row: Watchlist): ChangeSnapshot {
  return {
    v: 1,
    kind: PLANEJADO_SNAPSHOT_KIND,
    data: {
      id: row.id,
      assetId: row.assetId,
      objetivo: row.objetivo,
      secao: row.secao,
      categoriaOverride: row.categoriaOverride ?? null,
      notes: row.notes,
      addedAt: row.addedAt ? new Date(row.addedAt).toISOString() : undefined,
    },
  };
}

/** `data` do snapshot de planejado (buildPlanejadoSnapshot). */
export interface PlanejadoSnapshotData {
  id: string;
  assetId: string;
  objetivo: number;
  secao: string | null;
  categoriaOverride?: string | null;
  notes: string | null;
  addedAt?: string;
}

/**
 * Compra (operacao.registrar) que ABSORVEU um planejado (absorverPlanejadoNaCompra):
 * o snapshot da entrada carrega a linha apagada para o desfazer da compra recriá-la.
 * Sem outro snapshot → o próprio snapshot de planejado; com o do Caixa para Investir
 * → vai em `meta.planejadoAbsorvido` (o `data` do caixa fica intacto).
 */
export function comPlanejadoAbsorvido(
  snapshot: ChangeSnapshot | undefined,
  linha: Watchlist | null | undefined,
): ChangeSnapshot | undefined {
  if (!linha) return snapshot;
  const planejado = buildPlanejadoSnapshot(linha);
  if (!snapshot) return planejado;
  return { ...snapshot, meta: { ...snapshot.meta, planejadoAbsorvido: planejado.data } };
}

/** Inverso de comPlanejadoAbsorvido. Entradas antigas (sem o planejado) → null. */
export function planejadoAbsorvidoDoSnapshot(
  snapshot: ChangeSnapshot | null | undefined,
): PlanejadoSnapshotData | null {
  if (!snapshot) return null;
  const data =
    snapshot.kind === PLANEJADO_SNAPSHOT_KIND ? snapshot.data : snapshot.meta?.planejadoAbsorvido;
  if (!data || typeof data !== 'object') return null;
  const planejado = data as Partial<PlanejadoSnapshotData>;
  return planejado.id && planejado.assetId ? (planejado as PlanejadoSnapshotData) : null;
}

type Auth = RecordChangeParams['auth'];
type AssetLabel = Pick<Asset, 'symbol' | 'name' | 'source'> | null | undefined;

export function planejadoEntityLabel(asset: AssetLabel): string | undefined {
  return assetEntityLabel(asset) ?? undefined;
}

export async function recordPlanejadoAdicionado(
  request: NextRequest,
  auth: Auth,
  row: Watchlist,
  asset: AssetLabel,
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'planejado.adicionar',
    entity: 'planejado',
    entityId: row.id,
    entityLabel: planejadoEntityLabel(asset),
    changes: diffFields({}, camposDoPlanejado(row), PLANEJADO_FIELD_LABELS),
  });
}

export async function recordPlanejadoEditado(
  request: NextRequest,
  auth: Auth,
  antes: Watchlist,
  depois: Watchlist,
  asset: AssetLabel,
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'planejado.editar',
    entity: 'planejado',
    entityId: depois.id,
    entityLabel: planejadoEntityLabel(asset),
    changes: diffFields(
      camposDoPlanejado(antes),
      camposDoPlanejado(depois),
      PLANEJADO_FIELD_LABELS,
    ),
  });
}

export async function recordPlanejadoRemovido(
  request: NextRequest,
  auth: Auth,
  row: Watchlist,
  asset: AssetLabel,
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'planejado.remover',
    entity: 'planejado',
    entityId: row.id,
    entityLabel: planejadoEntityLabel(asset),
    changes: finalStateChanges(camposDoPlanejado(row), PLANEJADO_FIELD_LABELS),
    snapshot: buildPlanejadoSnapshot(row),
  });
}
