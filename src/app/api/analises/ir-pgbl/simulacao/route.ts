import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';

/**
 * Simulação da aba PGBL do IR salva no servidor (ticket 86e2xnyrg): os campos digitados e o tipo
 * (PGBL/VGBL) e o regime de tributação de cada plano. Antes ficavam só na tela / no navegador.
 *
 * GET ?ano=2026 → { ano, campos, planos } (vazios se ainda não salvou).
 * PUT { ano, campos, planos } → grava (upsert por usuário e ano).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Campos da tela (texto como o usuário digitou, ex.: "12.500,00"). */
export const CAMPOS_SIMULACAO = [
  'rendaTributavel',
  'inss',
  'irRetido',
  'dependentes',
  'saude',
  'educacao',
  'pensaoJudicial',
  'livroCaixa',
  'doacoesIncentivadas',
  'aportesOutros',
] as const;

const anoSchema = z.coerce.number().int().min(2000).max(2100);
const planoSchema = z.object({
  tipo: z.enum(['pgbl', 'vgbl']).optional(),
  regime: z.enum(['progressivo', 'regressivo']).optional(),
});
const putSchema = z.object({
  ano: anoSchema,
  campos: z.object(
    Object.fromEntries(CAMPOS_SIMULACAO.map((c) => [c, z.string().max(30).optional()])) as Record<
      (typeof CAMPOS_SIMULACAO)[number],
      z.ZodOptional<z.ZodString>
    >,
  ),
  planos: z
    .record(z.string().min(1).max(64), planoSchema)
    .refine((p) => Object.keys(p).length <= 100, 'Planos demais'),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const ano = anoSchema.safeParse(request.nextUrl.searchParams.get('ano'));
  if (!ano.success) return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  const row = await prisma.irPgblSimulacao.findUnique({
    where: { userId_ano: { userId: targetUserId, ano: ano.data } },
    select: { campos: true, planos: true, updatedAt: true },
  });
  return NextResponse.json(
    {
      ano: ano.data,
      campos: (row?.campos as Record<string, string> | undefined) ?? {},
      planos: (row?.planos as Record<string, unknown> | undefined) ?? {},
      salvoEm: row?.updatedAt?.toISOString() ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed);
  const { ano, campos, planos } = parsed.data;
  const row = await prisma.irPgblSimulacao.upsert({
    where: { userId_ano: { userId: targetUserId, ano } },
    create: { userId: targetUserId, ano, campos, planos },
    update: { campos, planos },
    select: { updatedAt: true },
  });
  return NextResponse.json({ ok: true, salvoEm: row.updatedAt.toISOString() });
});
