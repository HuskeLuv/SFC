import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { CAIXA_ABA_KEYS, distribuirCaixaLivre } from '@/services/portfolio/caixaParaInvestir';
import { recordCaixaDistribuido } from '@/services/changeHistory';
import { formatBRL } from '@/utils/format';

/**
 * POST /api/carteira/caixa/distribuir — move o caixa LIVRE para as reservas
 * das abas conforme o plano que a Alocação mostrou (`planejarDistribuicao`).
 * O total não muda. Body: `{ porAba: { acoes: 1000, fii: 500, ... } }`.
 */
const valor = z.number().finite().min(0).max(1e12);
const distribuirSchema = z.object({
  porAba: z
    .object(Object.fromEntries(CAIXA_ABA_KEYS.map((aba) => [aba, valor.optional()])))
    .strict(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const parsed = distribuirSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  const porAba = parsed.data.porAba as Partial<Record<(typeof CAIXA_ABA_KEYS)[number], number>>;
  if (!Object.values(porAba).some((v) => (v ?? 0) > 0)) {
    return NextResponse.json({ error: 'Nada a distribuir' }, { status: 400 });
  }

  const result = await distribuirCaixaLivre(auth.targetUserId, porAba);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          `O caixa livre mudou (agora ${formatBRL(Math.max(0, result.livre))}). ` +
          'Recarregue a página e confira a distribuição de novo.',
        code: result.code,
        livre: result.livre,
      },
      { status: 409 },
    );
  }

  await recordCaixaDistribuido(request, auth, result);
  return NextResponse.json({ success: true, porAba: result.porAba });
});
