import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateConsultant } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const GET = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);

  const now = new Date();

  const activeSessions = await prisma.impersonationSession.findMany({
    where: {
      consultantId: consultant.userId,
      endedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      sessionToken: true,
      clientId: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  // Enrich with client profile info
  const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
  const clients = await prisma.user.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const sessions = activeSessions.map((session) => {
    const client = clientMap.get(session.clientId);
    return {
      id: session.id,
      sessionToken: session.sessionToken,
      clientId: session.clientId,
      clientName: client?.name ?? 'Cliente',
      clientEmail: client?.email ?? '',
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  });

  return NextResponse.json({ sessions });
});
