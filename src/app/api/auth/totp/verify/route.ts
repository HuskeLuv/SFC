/**
 * POST /api/auth/totp/verify — confirma o código TOTP e ativa o 2FA.
 *
 * Cenário primário: chamado logo após /setup com o primeiro código que
 * o app autenticador exibiu. Ativa `totpEnabled=true`. A partir daqui
 * o login passa a exigir TOTP.
 *
 * O cliente espera receber { ok: true } em sucesso ou erro 400 quando
 * o código não confere (clock drift coberto por window=1).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySync } from 'otplib';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const me = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  if (!me.totpSecret) {
    return NextResponse.json(
      { error: 'Configure o 2FA primeiro via /api/auth/totp/setup' },
      { status: 400 },
    );
  }

  // epochTolerance=1 aceita ±30s pra cobrir drift entre relógios.
  const result = verifySync({ secret: me.totpSecret, token: parsed.data.code, epochTolerance: 1 });
  if (!result.valid) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { totpEnabled: true },
  });
  return NextResponse.json({ ok: true });
});
