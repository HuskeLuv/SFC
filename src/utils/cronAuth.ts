import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { ApiError } from '@/utils/apiErrorHandler';

/**
 * Autentica requests de cron (Authorization: Bearer CRON_SECRET).
 *
 * Comparação em tempo constante — SHA-256 dos dois lados + timingSafeEqual,
 * que exige buffers do mesmo tamanho (auditoria 29/08/2026, achado 4.3).
 * Lança ApiError; as rotas cron rodam sob withErrorHandler, que converte
 * para a mesma resposta JSON que os blocos inline retornavam (503/401).
 */
export function requireCronSecret(request: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new ApiError(503, 'CRON_SECRET não configurado');
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  const provided = createHash('sha256').update(auth).digest();
  if (!timingSafeEqual(expected, provided)) {
    throw new ApiError(401, 'Não autorizado');
  }
}
