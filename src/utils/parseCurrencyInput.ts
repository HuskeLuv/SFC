/**
 * Parser de input monetário em pt-BR (2.15, auditoria jul/2026).
 *
 * O parser antigo removia TODOS os pontos antes da vírgula
 * (`.replace(/\./g, '')`), então digitar "1.5" salvava **15**.
 *
 * Heurística:
 * - Se há vírgula, ela é o separador decimal → pontos são milhar
 *   ("1.234,56" → 1234.56, "1,5" → 1.5).
 * - Se NÃO há vírgula e há UM ponto com 1–2 dígitos depois, o ponto é
 *   decimal em formato en-US ("1.5" → 1.5, "1234.56" → 1234.56).
 * - Caso contrário, pontos são milhar ("1.234" → 1234, "1.234.567" → 1234567).
 *
 * Retorna `null` para entrada vazia ou não numérica.
 */
export function parseCurrencyInput(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  // Mantém só dígitos, ponto, vírgula e sinal (remove "R$", espaços etc.)
  let normalized = trimmed.replace(/[^\d.,-]/g, '');
  if (!normalized) {
    return null;
  }

  if (normalized.includes(',')) {
    // Vírgula decimal: tudo antes da ÚLTIMA vírgula é parte inteira (pontos e
    // eventuais vírgulas extras são separadores de milhar/typo).
    const lastComma = normalized.lastIndexOf(',');
    const integerPart = normalized.slice(0, lastComma).replace(/[.,]/g, '');
    const decimalPart = normalized.slice(lastComma + 1);
    normalized = `${integerPart}.${decimalPart}`;
  } else {
    const dotCount = (normalized.match(/\./g) ?? []).length;
    if (dotCount === 1) {
      const decimals = normalized.split('.')[1] ?? '';
      const isDecimalDot = decimals.length >= 1 && decimals.length <= 2;
      if (!isDecimalDot) {
        // "1.234" (3 dígitos) ou "1." → ponto de milhar/ruído
        normalized = normalized.replace(/\./g, '');
      }
    } else if (dotCount > 1) {
      // "1.234.567" → todos são milhar
      normalized = normalized.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
