import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { verifySync } from 'otplib';
import { loginSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { email, password, rememberMe, totpCode } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  // LGPD #12: se 2FA ativo, exige TOTP válido antes de emitir token.
  // Sinaliza `totpRequired` quando senha confere mas falta TOTP — UI
  // mostra o campo. Quando TOTP inválido, mantém `totpRequired=true`
  // pra não revelar diferenciação entre "sem código" e "código errado".
  if (user.totpEnabled && user.totpSecret) {
    if (!totpCode) {
      return NextResponse.json(
        { error: 'Código de autenticação em duas etapas é obrigatório', totpRequired: true },
        { status: 401 },
      );
    }
    const totpResult = verifySync({
      secret: user.totpSecret,
      token: totpCode,
      epochTolerance: 1,
    });
    if (!totpResult.valid) {
      return NextResponse.json(
        { error: 'Código de autenticação inválido', totpRequired: true },
        { status: 401 },
      );
    }
  }

  // Se rememberMe for true, token expira em 7 dias (1 semana), senão em 1 dia
  const expiresIn = rememberMe ? '7d' : '1d';
  const maxAge = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 24; // 7 dias ou 1 dia

  // LGPD ATENÇÃO: email saiu dos claims do JWT pra reduzir PII no payload
  // base64-decodificável. Endpoints que precisam de e-mail buscam pelo `id`.
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn,
  });
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
  return response;
});
