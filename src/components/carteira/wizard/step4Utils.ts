export const parseDecimalValue = (rawValue: string): number | null => {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }
  const normalizedValue = trimmedValue.replace(/\s/g, '');
  const hasComma = normalizedValue.includes(',');
  const cleanedValue = hasComma
    ? normalizedValue.replace(/\./g, '').replace(',', '.')
    : normalizedValue;
  const numericValue = Number.parseFloat(cleanedValue.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const DECIMAL_INPUT_PROPS = {
  type: 'text' as const,
  inputMode: 'decimal' as const,
  pattern: '[0-9]*[.,]?[0-9]*',
};

export const INTEGER_INPUT_PROPS = {
  type: 'text' as const,
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
};
