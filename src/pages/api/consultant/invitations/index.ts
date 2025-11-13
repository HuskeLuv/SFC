import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { ConsultantInviteStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticateConsultant } from '@/pages/api/consultant/[...params]';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const consultant = await authenticateConsultant(req);

  const invitations = await prisma.consultantInvite.findMany({
    where: { consultantId: consultant.consultantId },
    orderBy: { createdAt: 'desc' },
    include: {
      invitedUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  res.status(200).json({
    invitations: invitations.map((invite) => ({
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
    })),
  });
};

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const consultant = await authenticateConsultant(req);

  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'E-mail do cliente é obrigatório.' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const existingInvite = await prisma.consultantInvite.findFirst({
    where: {
      consultantId: consultant.consultantId,
      email: normalizedEmail,
      status: ConsultantInviteStatus.pending,
    },
  });

  if (existingInvite) {
    res.status(409).json({ error: 'Já existe um convite pendente para este e-mail.' });
    return;
  }

  const invitedUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!invitedUser) {
    res.status(404).json({ error: 'Nenhum usuário encontrado com este e-mail.' });
    return;
  }

  if (invitedUser.role === UserRole.consultant) {
    res.status(400).json({ error: 'Consultores não podem receber convites de consultoria.' });
    return;
  }

  if (invitedUser.role !== UserRole.user) {
    res.status(400).json({ error: 'Apenas usuários finais podem receber convites de consultoria.' });
    return;
  }

  const existingClientLink = await prisma.clientConsultant.findFirst({
    where: {
      consultantId: consultant.consultantId,
      clientId: invitedUser.id,
    },
  });

  if (existingClientLink) {
    res.status(409).json({ error: 'Este cliente já está vinculado à consultoria.' });
    return;
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
    res.status(404).json({ error: 'Perfil de consultor não encontrado.' });
    return;
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

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    },
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      await handleGet(req, res);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      const message = (error as { message?: string }).message ?? 'Erro ao listar convites.';
      res.status(status).json({ error: message });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      await handlePost(req, res);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      const message = (error as { message?: string }).message ?? 'Erro ao criar convite.';
      res.status(status).json({ error: message });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não permitido.' });
}

