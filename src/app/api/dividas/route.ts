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
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import { dividaCreateSchema, validationError } from '@/utils/validation-schemas';
import { resumoDivida, type ResumoDivida } from '@/services/dividas/amortizacao';
import { accruedIndexFactor, isIndexadorCorrigivel } from '@/services/dividas/indexacaoDivida';
import { syncDividaRecordToCashflow } from '@/services/dividas/dividaCashflowSync';
import { recordChange, diffFields, DIVIDA_FIELD_LABELS } from '@/services/changeHistory';
import { serializeDivida, toCalcInput, toPagamentoInputs } from './_lib/serializer';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const rows = await prisma.divida.findMany({
    where: { userId: targetUserId },
    include: { pagamentos: true },
    orderBy: { createdAt: 'desc' },
  });

  const dividas = await Promise.all(
    rows.map(async (d) => {
      const resumo: ResumoDivida = resumoDivida(toCalcInput(d), toPagamentoInputs(d.pagamentos));
      // Contrato indexado: saldo e próxima parcela corrigidos pelo índice já
      // realizado (fator cacheado 1h — ver indexacaoDivida.ts).
      if (d.modalidade === 'financiamento' && isIndexadorCorrigivel(d.indexador)) {
        const fator = await accruedIndexFactor(d.indexador, d.primeiroVencimento);
        resumo.fatorIndexacao = fator;
        resumo.saldoCorrigido = Math.round(resumo.saldoDevedor * fator * 100) / 100;
        if (resumo.proximaParcela) {
          resumo.proximaParcelaCorrigida =
            Math.round(resumo.proximaParcela.parcela * fator * 100) / 100;
        }
      }
      return serializeDivida(d, { resumo });
    }),
  );

  return NextResponse.json({ dividas });
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
            // CET informativo (não acrui no saldo — análise/ranking apenas).
            taxaAm: d.taxaAm ?? null,
            taxaUnidadeEntrada: d.taxaUnidadeEntrada,
          }),
    },
  });

  // Espelha as parcelas do financiamento no fluxo de caixa (grupo "Dívidas").
  await syncDividaRecordToCashflow(targetUserId, created);
  // O resumo da carteira embute totalDividas/patrimonioLiquido (TTL cache).
  deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

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
