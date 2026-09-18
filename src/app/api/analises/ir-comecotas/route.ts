import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { carregarComecotas } from '@/services/ir/comecotasLoader';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Projeção da próxima cobrança de come-cotas para fundos do usuário.
 *
 * Posições e inferência de tipo de fundo ficam em
 * `@/services/ir/comecotasLoader`, compartilhado com a fonte `ir` da Agenda.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const apuracao = await carregarComecotas(targetUserId);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
