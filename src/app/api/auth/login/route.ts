import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loginSchema, validationError } from '@/utils/validation-schemas';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { email, password, rememberMe } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Se rememberMe for true, token expira em 7 dias (1 semana), senão em 1 dia
  const expiresIn = rememberMe ? '7d' : '1d';
  const maxAge = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 24; // 7 dias ou 1 dia

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn },
  );
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
}
