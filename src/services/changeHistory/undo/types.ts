import type { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';
import type { FieldChange } from '../types';

/**
 * Estratégia de reversão de uma action:
 * - delete-created: criação → excluir a entidade criada
 * - restore-fields: edição → reaplicar os valores `before` do diff
 * - recreate-from-snapshot: exclusão → recriar a entidade do snapshot
 * - custom: fluxos com semântica própria (upserts, override layer, células)
 */
export type UndoStrategy =
  | 'delete-created'
  | 'restore-fields'
  | 'recreate-from-snapshot'
  | 'custom';

/** Mesmo subconjunto estrutural de auth usado pelo recordChange. */
export interface UndoAuth {
  payload: { id: string };
  targetUserId: string;
  actingClient: { id: string } | null;
}

export interface UndoContext {
  request: NextRequest;
  auth: UndoAuth;
  entry: UserChangeLog;
}

export interface UndoOutcome {
  /** Diff invertido — vira o `changes` da entrada `<action>.desfazer`. */
  changes?: FieldChange[];
  entityLabel?: string;
}

/** Pré-requisitos checáveis olhando só a row do log (usados pelo canUndo). */
export interface UndoRequires {
  entityId?: boolean;
  changes?: boolean;
  snapshot?: boolean;
}

export interface UndoDefinition {
  strategy: UndoStrategy;
  requires: UndoRequires;
  /**
   * Checagem extra barata sobre a própria row (sem tocar o banco) — ex.:
   * perfil.editar só é reversível quando o diff contém `name`. Opcional.
   */
  precheck?: (entry: UserChangeLog) => boolean;
  /** Executa a mutação inversa + efeitos colaterais. Lança UndoError(400|409). */
  execute(ctx: UndoContext): Promise<UndoOutcome>;
}

export type UndoErrorCode =
  | 'UNDO_NOT_SUPPORTED'
  | 'UNDO_MISSING_DATA'
  | 'UNDO_CONFLICT'
  | 'ALREADY_UNDONE';

export class UndoError extends Error {
  constructor(
    public readonly status: 400 | 409,
    message: string,
    public readonly code: UndoErrorCode = 'UNDO_CONFLICT',
  ) {
    super(message);
    this.name = 'UndoError';
  }
}

/** Mensagem padrão quando o estado atual não bate mais com o `after` do diff. */
export const STATE_MISMATCH_MESSAGE =
  'O estado atual não corresponde mais a esta alteração — ela pode ter sido modificada por outra ação.';
