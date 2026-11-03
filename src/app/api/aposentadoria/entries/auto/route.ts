/**
 * Simulador de Aposentadoria — acompanhamento mensal AUTOMÁTICO.
 *
 * GET  /api/aposentadoria/entries/auto
 *   Preview dos valores derivados (aporte líquido + patrimônio de snapshot) por
 *   mês já iniciado. `fillable` = meses que o automático ainda gravaria/atualizaria.
 *
 * POST /api/aposentadoria/entries/auto
 *   Força a gravação do acompanhamento automático (o mesmo que acontece sozinho
 *   ao ler o plano em GET /api/aposentadoria): cria os meses sem registro e
 *   atualiza os registros 'auto'. Registros digitados ('manual') nunca são
 *   sobrescritos. Retorna o plano atualizado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  deriveAcompanhamentoEntries,
  planejarSync,
  sincronizarAcompanhamentoAuto,
} from '@/services/planejamento/acompanhamentoAuto';
import { recordChange } from '@/services/changeHistory';
import { serializePlano } from '../../_lib/serializer';

async function loadPlanoTrack(userId: string) {
  return prisma.aposentadoriaPlano.findUnique({
    where: { userId },
    select: {
      id: true,
      trackStartMonth: true,
      trackStartYear: true,
      idade: true,
      apos: true,
      entries: {
        select: {
          id: true,
          off: true,
          year: true,
          month: true,
          aporteReal: true,
          patFinal: true,
          origem: true,
        },
      },
    },
  });
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const plano = await loadPlanoTrack(targetUserId);
  if (!plano) {
    return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
  }

  const derived = await deriveAcompanhamentoEntries(targetUserId, plano);
  const { criar, atualizar } = planejarSync(derived, plano.entries);
  const fillable = criar.length + atualizar.length;

  return NextResponse.json({ asOf: new Date().toISOString(), derived, fillable });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const plano = await loadPlanoTrack(targetUserId);
  if (!plano) {
    return NextResponse.json(
      { error: 'Plano de aposentadoria não encontrado. Salve os parâmetros antes.' },
      { status: 404 },
    );
  }

  const r = await sincronizarAcompanhamentoAuto(targetUserId, plano);
  const filled = r.criados + r.atualizados;

  if (filled > 0) {
    await recordChange({
      request,
      auth,
      section: 'planejamento',
      action: 'aposentadoria-aporte.auto',
      entity: 'aposentadoria',
      entityId: plano.id,
    });
  }

  const updated = await prisma.aposentadoriaPlano.findUniqueOrThrow({
    where: { id: plano.id },
    include: { entries: true },
  });

  return NextResponse.json({ plano: serializePlano(updated), filled });
});
