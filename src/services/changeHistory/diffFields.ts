import type { FieldChange, FieldLabelEntry, FieldLabelMap } from './types';

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

const resolveLabel = (entry: FieldLabelEntry): { label: string; format?: FieldChange['format'] } =>
  typeof entry === 'string' ? { label: entry } : entry;

/**
 * Computa os pares antes/depois entre dois estados de um registro.
 *
 * Itera SOMENTE as chaves de `fieldLabels` — o mapa funciona como allowlist,
 * então campos sensíveis (senha, hash, segredo TOTP) nunca são emitidos por
 * construção: basta não incluí-los no mapa.
 *
 * `undefined` em `after` significa "campo não enviado na edição" e é tratado
 * como inalterado. Retorna `[]` quando nada mudou (edição no-op).
 *
 * Para registrar uma CRIAÇÃO com os valores iniciais, passe `{}` como
 * `before` — cada campo presente vira um par com `before: null`.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldLabels: FieldLabelMap,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, entry] of Object.entries(fieldLabels)) {
    if (after[field] === undefined) continue;

    const normalizedBefore = normalize(before[field]);
    const normalizedAfter = normalize(after[field]);

    if (!isEqual(normalizedBefore, normalizedAfter)) {
      const { label, format } = resolveLabel(entry);
      changes.push({
        field,
        label,
        before: normalizedBefore,
        after: normalizedAfter,
        ...(format ? { format } : {}),
      });
    }
  }

  return changes;
}

/**
 * Converte o estado final de uma entidade em pares com `after: null` —
 * usado em EXCLUSÕES para registrar "valores no momento da exclusão".
 * Campos vazios (null/'') são omitidos. Mesma allowlist do diffFields.
 */
export function finalStateChanges(
  entity: Record<string, unknown>,
  fieldLabels: FieldLabelMap,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, entry] of Object.entries(fieldLabels)) {
    const value = normalize(entity[field]);
    if (value === null || value === '') continue;

    const { label, format } = resolveLabel(entry);
    changes.push({ field, label, before: value, after: null, ...(format ? { format } : {}) });
  }

  return changes;
}
