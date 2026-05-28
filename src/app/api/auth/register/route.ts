import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { registerSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { BCRYPT_ROUNDS } from '@/utils/passwordHashing';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { email, password, name, termsVersion, privacyVersion } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Usuário já existe' }, { status: 409 });
  }

  // LGPD Fase 2: extrai IP+UA pra rastrear o consentimento. Cabe em
  // ConsultantImpersonationLog (Art. 8º §1º LGPD pede comprovação).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent') || null;

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
      role: 'user',
      // Cria os dois registros de consentimento no mesmo transaction commit
      // do user. Se a inserção falhar, o user inteiro é desfeito — evita
      // user órfão sem consentimento.
      consents: {
        create: [
          {
            documentType: 'terms-of-use',
            documentVersion: termsVersion,
            ipAddress: ip,
            userAgent,
          },
          {
            documentType: 'privacy-policy',
            documentVersion: privacyVersion,
            ipAddress: ip,
            userAgent,
          },
        ],
      },
    },
  });

  // Sem clone de templates: o read path do cashflow combina templates (userId=null)
  // com overrides do usuário sob demanda. Personalização materializa rows só quando
  // o usuário de fato edita algo (clone-on-write em cashflowPersonalization.ts).

  // LGPD ATENÇÃO: claims mínimos (id + role). Email saiu pra reduzir PII
  // no payload base64-decodificável do JWT.
  // Sessão de cadastro = 1 dia (mesmo default do login). User pode marcar
  // "manter-me logado" no próximo login se quiser 7 dias.
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: '1d',
  });
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day
    path: '/',
  });
  return response;
});
