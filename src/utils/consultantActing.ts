import type { NextApiRequest } from 'next';
import type { NextRequest } from 'next/server';
import { ConsultantClientStatus, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

export const CONSULTANT_ACTING_COOKIE = 'consultant-acting';

type RequestWithCookies = NextRequest | NextApiRequest;

const readFromNextRequest = (cookies: NextRequest['cookies'], name: string): string | null => {
  const value = cookies.get(name);
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.value ?? null;
};

const readFromApiRequest = (cookies: NextApiRequest['cookies'], name: string): string | null => {
  if (!cookies) {
    return null;
  }
  const raw = cookies[name];
  if (!raw) {
    return null;
  }
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
};

export const readConsultantActingCookie = (req: RequestWithCookies): string | null => {
  const cookies = (req as NextRequest).cookies;
  if (cookies && typeof cookies.get === 'function') {
    return readFromNextRequest(cookies, CONSULTANT_ACTING_COOKIE);
  }

  const apiCookies = (req as NextApiRequest).cookies;
  return readFromApiRequest(apiCookies, CONSULTANT_ACTING_COOKIE);
};

/**
 * Resolves an opaque session token from the cookie to the actual clientId
 * by looking up the ImpersonationSession table.
 * Returns null if the token is invalid, expired, or the session has ended.
 */
export const resolveSessionToken = async (
  sessionToken: string,
): Promise<{ clientId: string; consultantId: string } | null> => {
  const session = await prisma.impersonationSession.findUnique({
    where: { sessionToken },
  });

  if (!session) {
    return null;
  }

  // Check if session has been explicitly ended
  if (session.endedAt) {
    return null;
  }

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    return null;
  }

  return {
    clientId: session.clientId,
    consultantId: session.consultantId,
  };
};

export interface ActingClientInfo {
  id: string;
  name: string;
  email: string;
}

export interface ActingContext {
  targetUserId: string;
  actingClient: ActingClientInfo | null;
}

export const resolveActingContext = async (
  req: RequestWithCookies,
  currentUser: { id: string; role: UserRole },
): Promise<ActingContext> => {
  if (!currentUser.id || currentUser.role !== UserRole.consultant) {
    return {
      targetUserId: currentUser.id,
      actingClient: null,
    };
  }

  const sessionToken = readConsultantActingCookie(req);
  if (!sessionToken) {
    return {
      targetUserId: currentUser.id,
      actingClient: null,
    };
  }

  // Resolve opaque token to clientId via server-side session lookup
  const sessionData = await resolveSessionToken(sessionToken);
  if (!sessionData) {
    return {
      targetUserId: currentUser.id,
      actingClient: null,
    };
  }

  const actingClientId = sessionData.clientId;

  const assignment = await prisma.clientConsultant.findFirst({
    where: {
      clientId: actingClientId,
      status: ConsultantClientStatus.active,
      consultant: {
        userId: currentUser.id,
      },
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!assignment?.client) {
    return {
      targetUserId: currentUser.id,
      actingClient: null,
    };
  }

  return {
    targetUserId: assignment.client.id,
    actingClient: {
      id: assignment.client.id,
      name: assignment.client.name ?? 'Cliente',
      email: assignment.client.email ?? '',
    },
  };
};
