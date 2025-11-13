import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { ApiAuthError, authenticateApiUser } from '@/utils/apiAuth';

const fetchNotifications = async (userId: string) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      invite: {
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
        },
      },
    },
  });
};

const mapNotification = (notification: Awaited<ReturnType<typeof fetchNotifications>>[number]) => ({
  id: notification.id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  metadata: notification.metadata,
  readAt: notification.readAt ? notification.readAt.toISOString() : null,
  createdAt: notification.createdAt.toISOString(),
  invite: notification.invite
    ? {
        id: notification.invite.id,
        status: notification.invite.status,
        consultant: notification.invite.consultant
          ? {
              id: notification.invite.consultant.id,
              userId: notification.invite.consultant.userId,
              name: notification.invite.consultant.user?.name ?? null,
              email: notification.invite.consultant.user?.email ?? null,
            }
          : null,
      }
    : null,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  if (req.method === 'GET') {
    const notifications = await fetchNotifications(payload.id);
    res.status(200).json({
      notifications: notifications.map(mapNotification),
    });
    return;
  }

  if (req.method === 'PATCH') {
    const { ids } = req.body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Nenhum identificador informado.' });
      return;
    }

    await prisma.notification.updateMany({
      where: {
        userId: payload.id,
        id: {
          in: ids,
        },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'GET, PATCH');
  res.status(405).json({ error: 'Método não permitido.' });
}

