import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { categoriaAtivoQuerySchema } from '@/lib/carteiraMover';
import { obterCategoriaAtivo } from '@/services/portfolio/moverInvestimento';

/**
 * GET /api/carteira/mover/categoria?assetId= → CategoriaAtivoResponse
 *
 * Aba efetiva do ativo para o usuário (com o override do mover). Consulta leve
 * para a prévia "usa o caixa de <aba>" do wizard. Sem posição nem planejado:
 * a aba base do Asset, override=false.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const { searchParams } = new URL(request.url);
  const parsed = categoriaAtivoQuerySchema.safeParse({
    assetId: searchParams.get('assetId') ?? undefined,
  });
  if (!parsed.success) return validationError(parsed);

  const resposta = await obterCategoriaAtivo(targetUserId, parsed.data.assetId);
  if (!resposta) throw new ApiError(404, 'Ativo não encontrado');
  return NextResponse.json(resposta);
});
