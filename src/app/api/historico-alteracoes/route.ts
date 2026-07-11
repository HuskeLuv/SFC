import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, Errors } from '@/utils/apiErrorHandler';
import { parsePaginationParams, paginatedResponse, DEFAULT_LIMIT } from '@/utils/pagination';
import { CHANGE_SECTIONS, type ChangeSection } from '@/services/changeHistory';
import { annotateCanUndo } from '@/services/changeHistory/undo';

/**
 * GET /api/historico-alteracoes — histórico de alterações do usuário,
 * paginado, mais recente primeiro. Filtros opcionais: ?section=, ?from=, ?to=.
 * Sob impersonation, retorna o histórico do cliente (targetUserId) — o
 * consultor vê a trilha da conta em que está atuando.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const pagination = parsePaginationParams(request) ?? {
    page: 1,
    limit: DEFAULT_LIMIT,
    skip: 0,
    take: DEFAULT_LIMIT,
  };

  const { searchParams } = request.nextUrl;

  const section = searchParams.get('section');
  if (section && !CHANGE_SECTIONS.includes(section as ChangeSection)) {
    throw Errors.badRequest(`Seção inválida. Valores aceitos: ${CHANGE_SECTIONS.join(', ')}`);
  }

  const parseDate = (param: string): Date | undefined => {
    const raw = searchParams.get(param);
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw Errors.badRequest(`Parâmetro "${param}" deve ser uma data válida (ISO 8601)`);
    }
    return date;
  };

  const from = parseDate('from');
  const to = parseDate('to');

  const where = {
    userId: targetUserId,
    ...(section ? { section } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.userChangeLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.userChangeLog.count({ where }),
  ]);

  const canUndoById = await annotateCanUndo(entries, targetUserId);

  // `snapshot` NUNCA sai na resposta: é payload interno do undo (estado
  // pré-mutação) e pode carregar mais campos que o diff exibido.
  const data = entries.map(({ snapshot: _snapshot, ...entry }) => ({
    ...entry,
    canUndo: canUndoById.get(entry.id) ?? false,
  }));

  return NextResponse.json(paginatedResponse(data, total, pagination.page, pagination.limit));
});
