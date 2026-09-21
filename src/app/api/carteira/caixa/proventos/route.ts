import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { definirCaixaProventos, lerCaixaProventosDesde } from '@/services/portfolio/caixaProventos';

/**
 * GET  /api/carteira/caixa/proventos — a opção "proventos entram no caixa" está ligada?
 * POST /api/carteira/caixa/proventos — `{ ativo: boolean }`. Ligar vale a partir de
 * hoje (não retroativo); desligar para de creditar. Ver services/portfolio/caixaProventos.
 */
const schema = z.object({ ativo: z.boolean() });

const resposta = (desde: Date | null) =>
  NextResponse.json({ ativo: desde !== null, desde: desde?.toISOString().slice(0, 10) ?? null });

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  return resposta(await lerCaixaProventosDesde(targetUserId));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  return resposta(await definirCaixaProventos(targetUserId, parsed.data.ativo));
});
