import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

// Standard error response shape
interface ApiErrorResponse {
  [campo: string]: unknown;
  error: string;
  details?: Record<string, string[]>;
}

// Custom API error class
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, string[]>,
    /**
     * Campos extras no corpo JSON, ao lado de `error` (aditivo; ex.: assinaturas
     * {codigo: 'plano_insuficiente', need, plano}). Não sobrescrevem `error` nem `details`.
     */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// Common errors (Portuguese — this is a Brazilian platform)
export const Errors = {
  unauthorized: () => new ApiError(401, 'Não autorizado'),
  forbidden: () => new ApiError(403, 'Acesso negado'),
  notFound: (resource: string) => new ApiError(404, `${resource} não encontrado(a)`),
  badRequest: (message: string) => new ApiError(400, message),
  internal: () => new ApiError(500, 'Erro interno do servidor'),
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context?: any) => Promise<NextResponse>;

// Wrapper that catches all errors and returns standardized responses
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        const { error: _error, details: _details, ...extra } = error.extra ?? {};
        const body: ApiErrorResponse = { ...extra, error: error.message };
        if (error.details) body.details = error.details;
        return NextResponse.json(body, { status: error.statusCode });
      }

      // Auth errors from requireAuth
      if (error instanceof Error && error.message === 'Não autorizado') {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      logger.error('Unhandled API error:', error);
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
  };
}
