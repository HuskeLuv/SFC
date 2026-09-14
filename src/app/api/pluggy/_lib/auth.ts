import type { NextRequest } from 'next/server';
import { requireAuthWithActing, type JWTPayload } from '@/utils/auth';
import { ApiError } from '@/utils/apiErrorHandler';
import { pluggyHabilitado } from '@/lib/pluggyConfig';

/**
 * Conexões bancárias são do próprio cliente: o consultor NÃO cria, exclui,
 * atualiza nem lê o extrato bruto por impersonação (decisão de produto
 * 14/09/2026, enquanto não há parecer sobre "repasse a terceiro" no Open
 * Finance). Ele continua vendo as células agregadas do fluxo.
 */
export async function requireProprioUsuarioPluggy(request: NextRequest): Promise<JWTPayload> {
  if (!pluggyHabilitado()) throw new ApiError(503, 'Integração bancária desabilitada');
  const auth = await requireAuthWithActing(request);
  if (auth.actingClient) {
    throw new ApiError(403, 'Conexões bancárias só podem ser acessadas pelo próprio cliente');
  }
  return auth.payload;
}
