/**
 * Dívidas (coleção).
 *
 * GET   /api/dividas   → lista dívidas do user com resumo computado
 *                        (saldo devedor, progresso, categoria de prazo)
 * POST  /api/dividas   → cria dívida (financiamento ou rotativa)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { dividaCreateSchema, validationError } from '@/utils/validation-schemas';
import { resumoDivida } from '@/services/dividas/amortizacao';
import { recordChange, diffFields, DIVIDA_FIELD_LABELS } from '@/services/changeHistory';
import { serializeDivida, toCalcInput, toPagamentoInputs } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const rows = await prisma.divida.findMany({
    where: { userId: targetUserId },
    include: { pagamentos: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    dividas: rows.map((d) =>
      serializeDivida(d, { resumo: resumoDivida(toCalcInput(d), toPagamentoInputs(d.pagamentos)) }),
    ),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const body = await request.json();
  const parsed = dividaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }

  const d = parsed.data;
  const created = await prisma.divida.create({
    data: {
      userId: targetUserId,
      nome: d.nome,
      instituicao: d.instituicao ?? null,
      tipo: d.tipo,
      modalidade: d.modalidade,
      status: d.status,
      notes: d.notes ?? null,
      ...(d.modalidade === 'financiamento'
        ? {
            principal: d.principal,
            taxaAm: d.taxaAm,
            taxaUnidadeEntrada: d.taxaUnidadeEntrada,
            prazoMeses: d.prazoMeses,
            sistema: d.sistema,
            indexador: d.indexador,
            primeiroVencimento: d.primeiroVencimento,
          }
        : {
            saldoInicial: d.saldoInicial,
            dataSaldoInicial: d.dataSaldoInicial,
          }),
    },
  });

  await recordChange({
    request,
    auth,
    section: 'dividas',
    action: 'divida.criar',
    entity: 'divida',
    entityId: created.id,
    entityLabel: created.nome,
    changes: diffFields({}, created, DIVIDA_FIELD_LABELS),
  });

  return NextResponse.json(
    { divida: serializeDivida(created, { resumo: resumoDivida(toCalcInput(created), []) }) },
    { status: 201 },
  );
});
