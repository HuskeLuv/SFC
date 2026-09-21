import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { listarConsentimentos, registrarConsentimento } from '@/services/pluggy/consentimento';
import { requireProprioUsuarioPluggy } from '../_lib/auth';

/**
 * GET  /api/pluggy/consentimentos → autorizações Open Finance do usuário (ativas e encerradas)
 * POST /api/pluggy/consentimentos {versao, reconexaoDe?} → registra o aceite ("Li e autorizo")
 *      e devolve o id que libera o connect token. Ver services/pluggy/consentimento.ts.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  return NextResponse.json(
    { consentimentos: await listarConsentimentos(user.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

const bodySchema = z.object({
  versao: z.string().min(1).max(50),
  reconexaoDe: z.string().uuid().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Dados inválidos');
  const c = await registrarConsentimento(request, user.id, parsed.data);
  return NextResponse.json({ consentimentoId: c.id }, { status: 201 });
});
