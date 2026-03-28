import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { authenticateConsultant } from '@/pages/api/consultant/[...params]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const consultant = await authenticateConsultant(req);

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

    res.status(200).json({ sessions });
  } catch (error) {
    console.error('[Consultant Active Sessions] Error:', error);
    const status = (error as { status?: number }).status ?? 500;
    const message = (error as { message?: string }).message ?? 'Erro interno do servidor';
    res.status(status).json({ error: message });
  }
}
