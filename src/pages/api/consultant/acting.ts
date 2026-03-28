import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { serialize } from 'cookie';
import prisma from '@/lib/prisma';
import { assertClientOwnership, authenticateConsultant } from '@/pages/api/consultant/[...params]';
import {
  CONSULTANT_ACTING_COOKIE,
  readConsultantActingCookie,
  resolveSessionToken,
} from '@/utils/consultantActing';
import { logConsultantAction } from '@/services/impersonationLogger';
import { consultantActingSchema } from '@/utils/validation-schemas';

const COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30 minutos

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const consultant = await authenticateConsultant(req);

    if (req.method === 'DELETE') {
      // Resolve the session token to get the clientId for logging
      const sessionToken = readConsultantActingCookie(req);
      if (sessionToken) {
        const sessionData = await resolveSessionToken(sessionToken);
        if (sessionData) {
          // Mark session as ended
          await prisma.impersonationSession.updateMany({
            where: {
              sessionToken,
              endedAt: null,
            },
            data: {
              endedAt: new Date(),
            },
          });

          await logConsultantAction({
            consultantId: consultant.userId,
            clientId: sessionData.clientId,
            action: 'END_IMPERSONATION',
            details: {
              sessionToken,
              timestamp: new Date().toISOString(),
            },
            request: req,
            sessionToken,
          });
        }
      }

      res.setHeader(
        'Set-Cookie',
        serialize(CONSULTANT_ACTING_COOKIE, '', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 0,
        }),
      );
      res.status(204).end();
      return;
    }

    const parsed = consultantActingSchema.safeParse(
      req.body?.clientId ? req.body : { clientId: req.query?.clientId },
    );
    if (!parsed.success) {
      res.status(400).json({ error: 'Cliente não informado' });
      return;
    }
    const { clientId } = parsed.data;

    await assertClientOwnership(consultant.consultantId, clientId);

    const clientProfile = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Generate opaque session token
    const sessionToken = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COOKIE_MAX_AGE_SECONDS * 1000);

    // Store session mapping server-side
    await prisma.impersonationSession.create({
      data: {
        sessionToken,
        consultantId: consultant.userId,
        clientId,
        createdAt: now,
        expiresAt,
      },
    });

    // Log impersonation start with session token
    await logConsultantAction({
      consultantId: consultant.userId,
      clientId,
      action: 'START_IMPERSONATION',
      details: {
        clientName: clientProfile?.name ?? null,
        clientEmail: clientProfile?.email ?? null,
        sessionToken,
        timestamp: now.toISOString(),
      },
      request: req,
      sessionToken,
    });

    // Cookie contains only the opaque token, not the clientId
    res.setHeader(
      'Set-Cookie',
      serialize(CONSULTANT_ACTING_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      }),
    );

    res.status(200).json({
      actingClient: clientProfile
        ? {
            id: clientProfile.id,
            name: clientProfile.name ?? 'Cliente',
            email: clientProfile.email ?? '',
          }
        : null,
    });
  } catch (error) {
    console.error('[Consultant Acting] Error:', error);
    const status = (error as { status?: number }).status ?? 500;
    const message = (error as { message?: string }).message ?? 'Erro interno do servidor';
    res.status(status).json({ error: message });
  }
}
