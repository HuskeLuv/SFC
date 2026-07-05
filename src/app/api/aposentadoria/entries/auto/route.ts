/**
 * Simulador de Aposentadoria — acompanhamento mensal AUTOMÁTICO.
 *
 * GET  /api/aposentadoria/entries/auto
 *   Preview dos valores derivados (aporte líquido + patrimônio de snapshot) por
 *   mês já iniciado. Usado para sugerir valores no form sem digitação.
 *
 * POST /api/aposentadoria/entries/auto
 *   Preenche os meses que ainda NÃO têm registro com os valores derivados
 *   (só meses com snapshot). Não sobrescreve registros manuais existentes —
 *   coerente com o modelo híbrido (manual vence auto). Retorna o plano atualizado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { deriveAcompanhamentoEntries } from '@/services/planejamento/acompanhamentoAuto';
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
      entries: { select: { off: true } },
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
  const existing = new Set(plano.entries.map((e) => e.off));
  const fillable = derived.filter((d) => d.hasData && !existing.has(d.off)).length;

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

  const derived = await deriveAcompanhamentoEntries(targetUserId, plano);
  const existing = new Set(plano.entries.map((e) => e.off));
  const toCreate = derived
    .filter((d) => d.hasData && !existing.has(d.off))
    .map((d) => ({
      planoId: plano.id,
      off: d.off,
      year: d.year,
      month: d.month,
      aporteReal: d.aporteReal,
      patFinal: d.patFinal as number,
    }));

  if (toCreate.length > 0) {
    await prisma.aposentadoriaPlanoEntry.createMany({ data: toCreate, skipDuplicates: true });

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

  return NextResponse.json({ plano: serializePlano(updated), filled: toCreate.length });
});
