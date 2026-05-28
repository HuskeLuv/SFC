import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { passwordPolicy, validationError } from '@/utils/validation-schemas';
import { BCRYPT_ROUNDS } from '@/utils/passwordHashing';

/**
 * GET /api/profile — dados do usuário logado (Art. 18, II — direito de
 * acesso).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(req);
  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  });
});

/**
 * PATCH /api/profile — atualiza nome, e-mail e (opcionalmente) senha do
 * próprio usuário (Art. 18, III — direito de correção).
 *
 * Para trocar senha: exige `currentPassword`. Trocar e-mail por enquanto
 * apenas atualiza o campo — verificação de e-mail novo entra na Fase 3
 * junto com SES.
 *
 * Operação fica restrita ao próprio usuário (req.payload.id), ignora
 * impersonation: consultor não pode editar perfil do cliente por aqui.
 */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().email().max(255).optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: passwordPolicy.optional(),
  })
  .refine((data) => !data.newPassword || data.currentPassword, {
    message: 'currentPassword é obrigatório pra trocar a senha',
    path: ['currentPassword'],
  });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { name, email, avatarUrl, currentPassword, newPassword } = parsed.data;

  // SEMPRE opera sobre o próprio user (payload.id), nunca acting client.
  const me = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  if (newPassword) {
    const ok = await bcrypt.compare(currentPassword!, me.password);
    if (!ok) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 403 });
    }
  }

  if (email && email !== me.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      return NextResponse.json({ error: 'E-mail já está em uso' }, { status: 409 });
    }
  }

  const update: {
    name?: string;
    email?: string;
    avatarUrl?: string | null;
    password?: string;
  } = {};
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
  if (newPassword) update.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo pra atualizar' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: update,
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    avatarUrl: updated.avatarUrl,
    role: updated.role,
  });
});

/**
 * DELETE /api/profile — anonimiza o usuário (Art. 18, IV — direito de
 * eliminação). Soft-delete por anonimização: registros transacionais
 * permanecem ligados a um ID mas sem PII identificável (nome → "Usuário
 * removido", email → "deleted-{uuid}@anonimo.local", password aleatório).
 *
 * Optamos por anonimizar em vez de hard-delete porque transações têm
 * implicações fiscais (retenção 5 anos) e auditoria de impersonation
 * deve preservar o trail mesmo após exclusão.
 *
 * Exige `currentPassword` pra confirmar a operação.
 */
const deleteSchema = z.object({
  currentPassword: z.string().min(1),
  confirm: z.literal(true),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const body = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }

  const me = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, me.password);
  if (!ok) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 });
  }

  // Senha aleatória — impede login mesmo se o email anonimizado coincidir
  // com algum outro. bcrypt cost 10 só pra ser consistente.
  const randomPassword = await bcrypt.hash(
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),
    BCRYPT_ROUNDS,
  );

  await prisma.user.update({
    where: { id: me.id },
    data: {
      name: 'Usuário removido',
      email: `deleted-${me.id}@anonimo.local`,
      avatarUrl: null,
      password: randomPassword,
    },
  });

  // Registra revogação do consentimento pra rastreabilidade.
  await prisma.userConsent.updateMany({
    where: { userId: me.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Limpa o cookie de auth da resposta.
  const response = NextResponse.json({ success: true });
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
});
