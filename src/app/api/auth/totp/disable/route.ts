/**
 * POST /api/auth/totp/disable — desativa o 2FA (LGPD #12).
 *
 * Exige a senha atual do user — pra que comprometer o cookie de auth
 * (sem o JWT_SECRET) sozinho não permita desativar.
 *
 * Não exige TOTP atual: usuário que perdeu o dispositivo precisa
 * conseguir desativar pela senha; perder o segredo TOTP sem ter como
 * sair vira lockout total. O risco residual está coberto pela exigência
 * da senha + roteiro de incidente (#14) caso a senha vaze.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';

const schema = z.object({
  currentPassword: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const me = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, me.password);
  if (!ok) return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 });

  await prisma.user.update({
    where: { id: me.id },
    data: { totpSecret: null, totpEnabled: false },
  });
  return NextResponse.json({ ok: true });
});
