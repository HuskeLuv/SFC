import { NextRequest } from 'next/server';

/**
 * Conversão de ?range= em meses pra cap do histórico. Compartilhado entre
 * endpoints que servem séries históricas (/api/ativos/[id], /api/carteira/
 * resumo, /api/analises/*). MAX = sem cap (retorna null).
 *
 * Bug raiz dos #15/#16/#17/#18 do checklist mai/28: caps hardcoded em 24-36
 * meses no backend faziam "MAX" do client filtrar sobre dados truncados.
 * Histórico de 10 anos (F2 de 2026-05-27) ficava invisível em telas onde o
 * filtro de tempo não chegava ao backend.
 */
export const RANGE_TO_MONTHS: Record<string, number | null> = {
  '12M': 12,
  '24M': 24,
  '2A': 24,
  '36M': 36,
  '3A': 36,
  '5A': 60,
  '10A': 120,
  MAX: null,
};

/**
 * Parseia ?range= e devolve o número de meses (ou null pra MAX).
 *
 * @param defaultMonths fallback usado quando o param está ausente OU inválido.
 *   Endpoints históricos podem optar por null (MAX) ou um cap conservador (24).
 */
export const parseRangeMonths = (
  request: NextRequest,
  defaultMonths: number | null = 24,
): number | null => {
  const raw = request.nextUrl.searchParams.get('range');
  if (!raw) return defaultMonths;
  const key = raw.toUpperCase();
  return key in RANGE_TO_MONTHS ? RANGE_TO_MONTHS[key] : defaultMonths;
};
