import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ConsultantInviteStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticateConsultant } from '@/utils/consultantAuth';
import { consultantInvitationSchema } from '@/utils/validation-schemas';
import { parsePaginationParams, paginatedResponse } from '@/utils/pagination';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const inviteInclude = {
  invitedUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapInvite = (invite: any) => ({
  id: invite.id,
  email: invite.email,
  status: invite.status,
  createdAt: invite.createdAt.toISOString(),
  respondedAt: invite.respondedAt ? invite.respondedAt.toISOString() : null,
  invitedUser: invite.invitedUser
    ? {
        id: invite.invitedUser.id,
        name: invite.invitedUser.name,
        email: invite.invitedUser.email,
      }
    : null,
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);
  const pagination = parsePaginationParams(request);

  if (pagination) {
    const where = { consultantId: consultant.consultantId };
    const [invitations, count] = await Promise.all([
      prisma.consultantInvite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: inviteInclude,
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.consultantInvite.count({ where }),
    ]);

    return NextResponse.json(
      paginatedResponse(invitations.map(mapInvite), count, pagination.page, pagination.limit),
    );
  }

  const invitations = await prisma.consultantInvite.findMany({
    where: { consultantId: consultant.consultantId },
    orderBy: { createdAt: 'desc' },
    include: inviteInclude,
  });

  return NextResponse.json({
    invitations: invitations.map(mapInvite),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);

  const body = await request.json().catch(() => ({}));
  const parsed = consultantInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'E-mail do cliente é obrigatório.' }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const existingInvite = await prisma.consultantInvite.findFirst({
    where: {
      consultantId: consultant.consultantId,
      email: normalizedEmail,
      status: ConsultantInviteStatus.pending,
    },
  });

  if (existingInvite) {
    return NextResponse.json(
      { error: 'Já existe um convite pendente para este e-mail.' },
      { status: 409 },
    );
  }

  const invitedUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!invitedUser) {
    return NextResponse.json(
      { error: 'Nenhum usuário encontrado com este e-mail.' },
      { status: 404 },
    );
  }

  if (invitedUser.role === UserRole.consultant) {
    return NextResponse.json(
      { error: 'Consultores não podem receber convites de consultoria.' },
      { status: 400 },
    );
  }

  if (invitedUser.role !== UserRole.user) {
    return NextResponse.json(
      { error: 'Apenas usuários finais podem receber convites de consultoria.' },
      { status: 400 },
    );
  }

  const existingClientLink = await prisma.clientConsultant.findFirst({
    where: {
      consultantId: consultant.consultantId,
      clientId: invitedUser.id,
    },
  });

  if (existingClientLink) {
    return NextResponse.json(
      { error: 'Este cliente já está vinculado à consultoria.' },
      { status: 409 },
    );
  }

  const consultantProfile = await prisma.consultant.findUnique({
    where: { id: consultant.consultantId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!consultantProfile) {
    return NextResponse.json({ error: 'Perfil de consultor não encontrado.' }, { status: 404 });
  }

  const invitation = await prisma.consultantInvite.create({
    data: {
      consultantId: consultant.consultantId,
      invitedUserId: invitedUser.id,
      email: normalizedEmail,
      token: randomUUID(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: invitedUser.id,
      title: 'Convite de consultoria',
      message: `${consultantProfile.user?.name ?? 'Consultor'} convidou você para compartilhar seus dados financeiros.`,
      type: 'consultant_invite',
      inviteId: invitation.id,
      metadata: {
        inviteId: invitation.id,
        consultantId: consultant.consultantId,
        consultantName: consultantProfile.user?.name ?? 'Consultor',
        consultantEmail: consultantProfile.user?.email ?? null,
      },
    },
  });

  return NextResponse.json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        createdAt: invitation.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
});
