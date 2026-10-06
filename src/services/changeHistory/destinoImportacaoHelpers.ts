/**
 * Histórico da escolha do destino na importação Open Finance (out/2026).
 *
 * action 'investimento.destinoImportacao' (ACAO_DESTINO_IMPORTACAO), entity
 * 'portfolio', entityId = id da posição. changes/snapshot no MESMO formato do
 * mover (moverChanges + buildMoverSnapshot, kind 'mover'), para o desfazer
 * reusar a lógica de moverDesfazer (undo/handlers/carteira.ts) e ainda zerar
 * BankInvestment.destinoConfirmadoEm: o item volta à sugestão E à fila.
 *
 * A action fica FORA de MOVER_ACTIONS_LIST: a escolha na importação não gera o
 * selo "movido" (movidoInfo só lê as actions do mover). Rótulo no Histórico:
 * "Escolheu onde fica <ativo>, importado do banco" (renderChange.ts).
 */
import type { NextRequest } from 'next/server';
import { MOVER_SECTION } from '@/lib/carteiraMover';
import { ACAO_DESTINO_IMPORTACAO } from '@/lib/pluggyDestinos';
import { recordChange, type RecordChangeParams } from './recordChange';
import { assetEntityLabel } from './carteiraHelpers';
import { buildMoverSnapshot, moverChanges, type MoverRegistro } from './moverHelpers';

type Auth = RecordChangeParams['auth'];

/** Grava a escolha de uma posição importada. Devolve o id do log (null se falhou). */
export async function recordDestinoImportacao(
  request: NextRequest,
  auth: Auth,
  r: MoverRegistro,
): Promise<string | null> {
  const id = await recordChange({
    request,
    auth,
    section: MOVER_SECTION,
    action: ACAO_DESTINO_IMPORTACAO,
    entity: 'portfolio',
    entityId: r.id,
    entityLabel: assetEntityLabel(r.asset),
    changes: moverChanges(r),
    snapshot: buildMoverSnapshot(r.antes, r.depois),
  });
  return id ?? null;
}
