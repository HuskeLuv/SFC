import type { FieldChange } from './types';

/**
 * Normaliza valores para comparação e armazenamento em JSON:
 * Date → ISO string, Decimal do Prisma/bigint → number.
 */
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

const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

/**
 * Computa os pares antes/depois entre dois estados de um registro.
 *
 * Itera SOMENTE as chaves de `fieldLabels` — o mapa funciona como allowlist,
 * então campos sensíveis (senha, hash, segredo TOTP) nunca são emitidos por
 * construção: basta não incluí-los no mapa.
 *
 * `undefined` em `after` significa "campo não enviado na edição" e é tratado
 * como inalterado. Retorna `[]` quando nada mudou (edição no-op).
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldLabels: Record<string, string>,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, label] of Object.entries(fieldLabels)) {
    if (after[field] === undefined) continue;

    const normalizedBefore = normalize(before[field]);
    const normalizedAfter = normalize(after[field]);

    if (!isEqual(normalizedBefore, normalizedAfter)) {
      changes.push({ field, label, before: normalizedBefore, after: normalizedAfter });
    }
  }

  return changes;
}
