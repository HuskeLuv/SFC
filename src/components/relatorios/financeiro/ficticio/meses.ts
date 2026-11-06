/**
 * Meses dos corpos fictícios (desenhados desfocados sob o cadeado). Fixos: nunca vêm do relatório.
 */
export const MESES_FICTICIOS = [
  'Dez/25',
  'Jan/26',
  'Fev/26',
  'Mar/26',
  'Abr/26',
  'Mai/26',
  'Jun/26',
  'Jul/26',
  'Ago/26',
  'Set/26',
  'Out/26',
  'Nov/26',
] as const;

/** Os últimos `n` itens de uma série fixa de 12 meses. */
export function ultimos<T>(serie: readonly T[], n: number): T[] {
  return serie.slice(serie.length - n);
}
