import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { authenticateConsultant, assertClientOwnership } from '@/utils/consultantAuth';
import {
  CONSULTANT_ACTING_COOKIE,
  readConsultantActingCookie,
  resolveSessionToken,
} from '@/utils/consultantActing';
import { logConsultantAction } from '@/services/impersonationLogger';
import { consultantActingSchema } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30 minutos

export const POST = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);

  const body = await request.json().catch(() => ({}));
  const clientIdParam = request.nextUrl.searchParams.get('clientId');
  const parsed = consultantActingSchema.safeParse(
    body?.clientId ? body : { clientId: clientIdParam },
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'Cliente não informado' }, { status: 400 });
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
    request,
    sessionToken,
  });

  // Cookie contains only the opaque token, not the clientId
  const response = NextResponse.json({
    actingClient: clientProfile
      ? {
          id: clientProfile.id,
          name: clientProfile.name ?? 'Cliente',
          email: clientProfile.email ?? '',
        }
      : null,
  });

  response.cookies.set(CONSULTANT_ACTING_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);

  // Resolve the session token to get the clientId for logging
  const sessionToken = readConsultantActingCookie(request);
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
        request,
        sessionToken,
      });
    }
  }

  const response = new NextResponse(null, { status: 204 });

  response.cookies.set(CONSULTANT_ACTING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
});
