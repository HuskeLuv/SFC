import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { carregarApuracaoRendaVariavel } from '@/services/ir/rendaVariavelLoader';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre operações de renda variável (ações BR / FII / ETF BR).
 *
 * Carrega todas as StockTransaction do usuário, categoriza cada uma e roda o
 * serviço puro `apurarRendaVariavel` (tudo em `@/services/ir/rendaVariavelLoader`,
 * compartilhado com a fonte `ir` da Agenda). Retorna meses cronológicos com IR a
 * recolher por categoria + saldos atuais de prejuízo a compensar.
 *
 * Stocks US, criptos, fundos e previdência ficam de fora desta apuração — cada
 * um tem regras próprias (Fases 3, 4 e 5).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const apuracao = await carregarApuracaoRendaVariavel(targetUserId);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
