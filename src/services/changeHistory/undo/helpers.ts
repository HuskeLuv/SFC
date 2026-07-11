import type { UserChangeLog } from '@prisma/client';
import type { ChangeSnapshot, FieldChange } from '../types';
import { UndoError, STATE_MISMATCH_MESSAGE } from './types';

/** Diff gravado na entrada (JSON → tipado); [] quando ausente/malformado. */
export function getChanges(entry: UserChangeLog): FieldChange[] {
  const raw = entry.changes;
  if (!Array.isArray(raw)) return [];
  return raw as unknown as FieldChange[];
}

/** Snapshot gravado na entrada; null quando ausente/malformado. */
export function getSnapshot(entry: UserChangeLog): ChangeSnapshot | null {
  const raw = entry.snapshot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const snap = raw as unknown as ChangeSnapshot;
  if (snap.v !== 1 || typeof snap.kind !== 'string' || typeof snap.data !== 'object') return null;
  return snap;
}

/** Diff invertido (antes ↔ depois) — gravado na entrada `<action>.desfazer`. */
export function invertChanges(changes: FieldChange[]): FieldChange[] {
  return changes.map((c) => ({ ...c, before: c.after, after: c.before }));
}

const NUMBER_TOLERANCE = 1e-6;

const normalize = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
};

/**
 * Compara valor atual (Prisma) com valor gravado no diff (JSON), com
 * tolerância para floats/Decimal e normalização Date→ISO — a mesma do
 * diffFields, senão um undo legítimo leva 409 por ruído de precisão.
 */
export function valuesMatch(current: unknown, recorded: unknown): boolean {
  const a = normalize(current);
  const b = normalize(recorded);
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= NUMBER_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
  }
  // Datas: comparar só o instante (ISO completo) já coberto pelo ===; aqui
  // trata string-data × Date normalizada.
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Checagem otimista das estratégias restore: o estado ATUAL da entidade deve
 * bater com o `after` de cada par do diff. Se outra mutação (não-logada ou
 * fora do LIFO) alterou o campo, aborta com 409 legível.
 */
export function assertCurrentMatchesAfter(
  current: Record<string, unknown>,
  changes: FieldChange[],
): void {
  for (const change of changes) {
    if (!valuesMatch(current[change.field], change.after)) {
      throw new UndoError(409, STATE_MISMATCH_MESSAGE);
    }
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Converte um valor `before` do diff de volta pro tipo aceito pelo Prisma:
 * strings ISO viram Date quando o campo é sabidamente temporal.
 */
export function reviveValue(value: unknown, dateFields: Set<string>, field: string): unknown {
  if (dateFields.has(field) && typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value);
  }
  return value;
}

/** Monta o objeto de update com os valores `before` do diff. */
export function restoreData(
  changes: FieldChange[],
  dateFields: Set<string> = new Set(),
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const change of changes) {
    data[change.field] = reviveValue(change.before, dateFields, change.field);
  }
  return data;
}

/** Erro P2002 (unique violation) do Prisma — recriação com id original já existe. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
