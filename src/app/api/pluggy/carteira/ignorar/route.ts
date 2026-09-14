import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { ignorarInvestimento } from '@/services/pluggy/importarCarteira';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';

/** POST /api/pluggy/carteira/ignorar { id } — não importar esta posição. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ id: z.string().uuid() });

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'id inválido');
  const ok = await ignorarInvestimento(user.id, parsed.data.id);
  if (!ok) throw new ApiError(404, 'Posição não encontrada ou já importada');
  return NextResponse.json({ ok: true });
});
