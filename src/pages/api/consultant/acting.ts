import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import prisma from '@/lib/prisma';
import {
  assertClientOwnership,
  authenticateConsultant,
} from '@/pages/api/consultant/[...params]';
import { CONSULTANT_ACTING_COOKIE } from '@/utils/consultantActing';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2; // 2 horas

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const consultant = await authenticateConsultant(req);

    if (req.method === 'DELETE') {
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

    const clientId = req.body?.clientId ?? req.query?.clientId;
    if (!clientId || typeof clientId !== 'string') {
      res.status(400).json({ error: 'Cliente não informado' });
      return;
    }

    await assertClientOwnership(consultant.consultantId, clientId);

    const clientProfile = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    res.setHeader(
      'Set-Cookie',
      serialize(CONSULTANT_ACTING_COOKIE, clientId, {
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

