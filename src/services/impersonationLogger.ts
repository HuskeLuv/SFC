import type { NextApiRequest } from 'next';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { readConsultantActingCookie } from '@/utils/consultantActing';

type RequestWithHeaders = NextApiRequest | NextRequest;

interface LogConsultantActionParams {
  consultantId: string;
  clientId: string;
  action: string;
  details: Record<string, unknown>;
  request: RequestWithHeaders;
}

/**
 * Extrai o IP address do request
 */
const getIpAddress = (request: RequestWithHeaders): string | null => {
  if ('headers' in request) {
    // NextApiRequest
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const forwarded = headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    const realIp = headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    const nextApiRequest = request as { socket?: { remoteAddress?: string } };
    return nextApiRequest.socket?.remoteAddress ?? null;
  } else {
    // NextRequest
    const nextRequest = request as NextRequest;
    const forwarded = nextRequest.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = nextRequest.headers.get('x-real-ip');
    if (realIp) {
      return realIp;
    }
    return null;
  }
};

/**
 * Extrai o User-Agent do request
 */
const getUserAgent = (request: RequestWithHeaders): string | null => {
  if ('headers' in request) {
    // NextApiRequest
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const userAgent = headers['user-agent'];
    return userAgent ? (Array.isArray(userAgent) ? userAgent[0] : userAgent) : null;
  } else {
    // NextRequest
    const nextRequest = request as NextRequest;
    return nextRequest.headers.get('user-agent');
  }
};

/**
 * Registra uma ação realizada por um consultor durante personificação
 * 
 * Esta função nunca deve lançar erros para não interromper operações do sistema.
 * Todos os erros são capturados e logados no console.
 */
export const logConsultantAction = async ({
  consultantId,
  clientId,
  action,
  details,
  request,
}: LogConsultantActionParams): Promise<void> => {
  try {
    const ipAddress = getIpAddress(request);
    const userAgent = getUserAgent(request);

    await prisma.consultantImpersonationLog.create({
      data: {
        consultantId,
        clientId,
        action,
        details: details as object,
        ipAddress,
        userAgent,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    // Nunca interromper operações por falha de log
    console.error('[ImpersonationLogger] Erro ao registrar log:', error);
  }
};

/**
 * Verifica se a requisição atual está dentro de uma sessão de personificação
 * 
 * @param request - Request (NextApiRequest ou NextRequest)
 * @param currentUserId - ID do usuário autenticado
 * @returns Objeto com informações sobre personificação ou null
 */
export const isConsultantImpersonating = async (
  request: RequestWithHeaders,
  currentUserId: string,
): Promise<{ consultantId: string; clientId: string } | null> => {
  try {
    const actingClientId = readConsultantActingCookie(request);
    
    if (!actingClientId) {
      return null;
    }

    // Verificar se o usuário atual é um consultor e se tem permissão
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user || user.role !== 'consultant') {
      return null;
    }

    // Verificar se existe relação ativa entre consultor e cliente
    const consultant = await prisma.consultant.findUnique({
      where: { userId: currentUserId },
      select: { id: true },
    });

    if (!consultant) {
      return null;
    }

    const assignment = await prisma.clientConsultant.findFirst({
      where: {
        consultantId: consultant.id,
        clientId: actingClientId,
        status: 'active',
      },
    });

    if (!assignment) {
      return null;
    }

    return {
      consultantId: currentUserId,
      clientId: actingClientId,
    };
  } catch (error) {
    console.error('[ImpersonationLogger] Erro ao verificar personificação:', error);
    return null;
  }
};

/**
 * Helper para registrar logs automaticamente em endpoints sensíveis
 * Usa requireAuthWithActing para detectar personificação
 */
export const logSensitiveEndpointAccess = async (
  request: RequestWithHeaders,
  payload: { id: string; role: string },
  targetUserId: string,
  actingClient: { id: string; name: string; email: string } | null,
  endpoint: string,
  method: string,
  queryParams?: Record<string, unknown>,
): Promise<void> => {
  if (!actingClient || payload.role !== 'consultant') {
    return;
  }

  await logConsultantAction({
    consultantId: payload.id,
    clientId: actingClient.id,
    action: 'ACCESS_SENSITIVE_ENDPOINT',
    details: {
      endpoint,
      method,
      queryParams: queryParams ?? {},
      timestamp: new Date().toISOString(),
    },
    request,
  });
};

/**
 * Helper para registrar logs de operações de edição de dados
 */
export const logDataUpdate = async (
  request: RequestWithHeaders,
  payload: { id: string; role: string },
  targetUserId: string,
  actingClient: { id: string; name: string; email: string } | null,
  endpoint: string,
  method: string,
  payloadData: unknown,
  result: { success: boolean; error?: string },
): Promise<void> => {
  if (!actingClient || payload.role !== 'consultant') {
    return;
  }

  await logConsultantAction({
    consultantId: payload.id,
    clientId: actingClient.id,
    action: 'UPDATE_DATA',
    details: {
      endpoint,
      method,
      payload: payloadData,
      result,
      timestamp: new Date().toISOString(),
    },
    request,
  });
};

