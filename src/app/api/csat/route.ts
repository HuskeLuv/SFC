import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { CSAT_COMENTARIO_MAX } from '@/lib/csat/regras';
import {
  decidirExibicaoCsat,
  registrarAdiamentoCsat,
  registrarRespostaCsat,
} from '@/services/csat/csat';

/**
 * Pesquisa de satisfação no app (ClickUp 86e3vmyv7).
 *
 * GET  /api/csat — { mostrar } para o cartão "De 1 a 5…" (regras em src/lib/csat/regras.ts).
 * POST /api/csat — { acao: 'responder', nota 1–5, comentario? } ou { acao: 'adiar' } ("Agora não").
 *
 * Sempre do próprio usuário: com consultor agindo por cliente, GET responde mostrar=false e POST 403
 * (a opinião é de quem usa, não do consultor). LGPD: finalidade em src/services/csat/csat.ts.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await requireAuthWithActing(request);
  const decisao = await decidirExibicaoCsat({
    userId: payload.id,
    role: payload.role,
    personificando: Boolean(actingClient),
  });
  return NextResponse.json({ mostrar: decisao.mostrar }, { headers: NO_STORE });
});

const postSchema = z.discriminatedUnion('acao', [
  z.object({
    acao: z.literal('responder'),
    nota: z.number().int().min(1).max(5),
    comentario: z.string().trim().max(CSAT_COMENTARIO_MAX).optional().nullable(),
  }),
  z.object({ acao: z.literal('adiar') }),
]);

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await requireAuthWithActing(request);
  if (actingClient) {
    return NextResponse.json(
      { error: 'A pesquisa de satisfação é respondida pelo próprio cliente' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  // Mesmas regras do GET: evita resposta duplicada (duas abas, clique repetido, script).
  const decisao = await decidirExibicaoCsat({
    userId: payload.id,
    role: payload.role,
    personificando: false,
  });
  if (!decisao.mostrar) {
    return NextResponse.json(
      { error: 'Pesquisa indisponível no momento' },
      { status: 409, headers: NO_STORE },
    );
  }

  if (parsed.data.acao === 'adiar') {
    await registrarAdiamentoCsat(payload.id);
  } else {
    const comentario = parsed.data.comentario ? parsed.data.comentario : null;
    await registrarRespostaCsat(payload.id, parsed.data.nota, comentario);
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
});
