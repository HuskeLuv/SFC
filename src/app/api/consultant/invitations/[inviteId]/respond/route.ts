import { NextRequest, NextResponse } from 'next/server';
import { ConsultantClientStatus, ConsultantInviteStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/utils/auth';
import { invitationRespondSchema } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ inviteId: string }> }) => {
    let payload;
    try {
      payload = requireAuth(request);
    } catch {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    if (payload.role !== UserRole.user) {
      return NextResponse.json(
        { error: 'Apenas usuários finais podem responder convites.' },
        { status: 403 },
      );
    }

    const { inviteId } = await params;
    if (!inviteId) {
      return NextResponse.json({ error: 'Convite não informado.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = invitationRespondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
    const { action, notificationId } = parsed.data;

    const invite = await prisma.consultantInvite.findUnique({
      where: { id: inviteId },
      include: {
        consultant: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        invitedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });
    }

    if (invite.status !== ConsultantInviteStatus.pending) {
      return NextResponse.json({ error: 'Este convite já foi respondido.' }, { status: 409 });
    }

    if (invite.invitedUser?.role && invite.invitedUser.role !== UserRole.user) {
      return NextResponse.json(
        { error: 'Convites destinados a consultores não podem ser aceitos.' },
        { status: 400 },
      );
    }

    if (invite.invitedUserId && invite.invitedUserId !== payload.id) {
      return NextResponse.json(
        { error: 'Você não tem permissão para responder este convite.' },
        { status: 403 },
      );
    }

    if (!invite.invitedUserId && invite.email !== payload.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Este convite não foi enviado para o seu usuário.' },
        { status: 403 },
      );
    }

    const now = new Date();

    const updateData = {
      status:
        action === 'accept' ? ConsultantInviteStatus.accepted : ConsultantInviteStatus.rejected,
      respondedAt: now,
      invitedUserId: invite.invitedUserId ?? payload.id,
    };

    const updatedInvite = await prisma.consultantInvite.update({
      where: { id: invite.id },
      data: updateData,
    });

    if (action === 'accept') {
      await prisma.clientConsultant.upsert({
        where: {
          consultantId_clientId: {
            consultantId: invite.consultantId,
            clientId: payload.id,
          },
        },
        create: {
          consultantId: invite.consultantId,
          clientId: payload.id,
          status: ConsultantClientStatus.active,
        },
        update: {
          status: ConsultantClientStatus.active,
        },
      });
    }

    if (notificationId) {
      await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId: payload.id,
        },
        data: {
          readAt: now,
        },
      });
    }

    const invitedUser =
      invite.invitedUser ??
      (await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, name: true, email: true },
      }));

    if (invite.consultant?.userId) {
      await prisma.notification.create({
        data: {
          userId: invite.consultant.userId,
          title: 'Resposta ao convite de consultoria',
          message:
            action === 'accept'
              ? `${invitedUser?.name ?? invitedUser?.email ?? 'Cliente'} aceitou seu convite de consultoria.`
              : `${invitedUser?.name ?? invitedUser?.email ?? 'Cliente'} recusou seu convite de consultoria.`,
          type: 'consultant_invite_response',
          metadata: {
            inviteId: invite.id,
            clientId: payload.id,
            clientName: invitedUser?.name ?? null,
            clientEmail: invitedUser?.email ?? null,
            action,
          },
        },
      });
    }

    return NextResponse.json({
      invitation: {
        id: updatedInvite.id,
        status: updatedInvite.status,
        respondedAt: updatedInvite.respondedAt?.toISOString() ?? null,
      },
    });
  },
);
