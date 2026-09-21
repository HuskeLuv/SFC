import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { EVENTOS_WIDGET, registrarEventoConsentimento } from '@/services/pluggy/consentimento';
import { requireProprioUsuarioPluggy } from '../../../_lib/auth';

/**
 * POST /api/pluggy/consentimentos/[id]/eventos — marco da etapa Pluggy/instituição
 * (eventos do widget). Só o nome do evento, a hora e a instituição escolhida.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  evento: z.enum(EVENTOS_WIDGET),
  em: z.string().datetime().optional(),
  instituicao: z.string().max(200).optional(),
  detalhe: z.string().max(500).optional(),
});

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireProprioUsuarioPluggy(request);
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, 'Evento inválido');
    await registrarEventoConsentimento(user.id, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
);
