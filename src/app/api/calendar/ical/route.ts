/**
 * GET /api/calendar/ical?token=… → feed .ics da Agenda do usuário.
 *
 * Rota PÚBLICA de propósito: o Google Agenda e o Apple Calendário buscam a URL
 * sem cookie nenhum, então o token da query É a credencial. Por isso:
 *  - o token é aleatório de 32 bytes e some do banco quando o usuário revoga;
 *  - o feed vai SEM VALORES (decisão do plano — ver services/calendario/ical.ts);
 *  - a resposta é `private, no-store`, para nenhum proxy guardar cópia.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { montarAgenda } from '@/services/calendario/agenda';
import { gerarIcs, periodoDoFeed } from '@/services/calendario/ical';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token || token.length < 20) {
    throw new ApiError(404, 'Feed não encontrado.');
  }

  const pref = await prisma.agendaPreferencia.findUnique({
    where: { icalToken: token },
    select: { userId: true },
  });
  // 404 (e não 401) para não confirmar a existência de um token parecido.
  if (!pref) throw new ApiError(404, 'Feed não encontrado.');

  const agora = new Date();
  const { eventos } = await montarAgenda(pref.userId, periodoDoFeed(agora));

  return new NextResponse(gerarIcs(eventos, agora), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda-myfinance.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
});
