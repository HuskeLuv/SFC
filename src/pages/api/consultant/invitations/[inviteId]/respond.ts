import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ConsultantClientStatus,
  ConsultantInviteStatus,
  UserRole,
} from '@prisma/client';
import prisma from '@/lib/prisma';
import { ApiAuthError, authenticateApiUser } from '@/utils/apiAuth';

const parseInviteId = (raw: string | string[] | undefined) => {
  if (!raw) {
    return null;
  }

  return Array.isArray(raw) ? raw[0] ?? null : raw;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  let payload;
  try {
    payload = authenticateApiUser(req);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }

    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  if (payload.role !== UserRole.user) {
    res.status(403).json({ error: 'Apenas usuários finais podem responder convites.' });
    return;
  }

  const inviteId = parseInviteId(req.query.inviteId);
  if (!inviteId) {
    res.status(400).json({ error: 'Convite não informado.' });
    return;
  }

  const { action, notificationId } = req.body as {
    action?: 'accept' | 'reject';
    notificationId?: string;
  };

  if (!action || !['accept', 'reject'].includes(action)) {
    res.status(400).json({ error: 'Ação inválida.' });
    return;
  }

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
    res.status(404).json({ error: 'Convite não encontrado.' });
    return;
  }

  if (invite.status !== ConsultantInviteStatus.pending) {
    res.status(409).json({ error: 'Este convite já foi respondido.' });
    return;
  }

  if (invite.invitedUser?.role && invite.invitedUser.role !== UserRole.user) {
    res.status(400).json({ error: 'Convites destinados a consultores não podem ser aceitos.' });
    return;
  }

  if (invite.invitedUserId && invite.invitedUserId !== payload.id) {
    res.status(403).json({ error: 'Você não tem permissão para responder este convite.' });
    return;
  }

  if (!invite.invitedUserId && invite.email !== payload.email.toLowerCase()) {
    res.status(403).json({ error: 'Este convite não foi enviado para o seu usuário.' });
    return;
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

  res.status(200).json({
    invitation: {
      id: updatedInvite.id,
      status: updatedInvite.status,
      respondedAt: updatedInvite.respondedAt?.toISOString() ?? null,
    },
  });
}

