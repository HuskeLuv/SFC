import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/utils/auth';
import { notificationsPatchSchema } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
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

export const GET = withErrorHandler(async (request: NextRequest) => {
  let payload;
  try {
    payload = requireAuth(request);
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const notifications = await fetchNotifications(payload.id);
  return NextResponse.json({
    notifications: notifications.map(mapNotification),
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  let payload;
  try {
    payload = requireAuth(request);
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = notificationsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nenhum identificador informado.' }, { status: 400 });
  }
  const { ids } = parsed.data;

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

  return new NextResponse(null, { status: 204 });
});
