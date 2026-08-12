/**
 * Dívidas (recurso individual).
 *
 * GET    /api/dividas/:id   → detalhe (com pagamentos + resumo computado)
 * PATCH  /api/dividas/:id   → edita campos parciais (modalidade não muda)
 * DELETE /api/dividas/:id   → remove (cascade pagamentos via FK)
 *
 * 404 sempre que a dívida não pertence ao user — vale tanto pra "não existe"
 * quanto pra "pertence a outro user", como blindagem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { dividaPatchSchema, validationError } from '@/utils/validation-schemas';
import { resumoDivida } from '@/services/dividas/amortizacao';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  DIVIDA_FIELD_LABELS,
} from '@/services/changeHistory';
import {
  decimalToNumber,
  serializeDivida,
  toCalcInput,
  toPagamentoInputs,
} from '../_lib/serializer';

async function findOwned(id: string, userId: string) {
  return prisma.divida.findFirst({
    where: { id, userId },
    include: { pagamentos: true },
  });
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const divida = await findOwned(id, targetUserId);
    if (!divida) {
      return NextResponse.json({ error: 'Dívida não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      divida: serializeDivida(divida, {
        resumo: resumoDivida(toCalcInput(divida), toPagamentoInputs(divida.pagamentos)),
        includePagamentos: true,
      }),
    });
  },
);

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const existing = await findOwned(id, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Dívida não encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = dividaPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    // Campos de cronograma só fazem sentido em financiamento; âncora de saldo
    // só em rotativa. Rejeita cruzado pra não criar estado híbrido.
    const p = parsed.data;
    if (
      existing.modalidade === 'rotativa' &&
      (p.principal !== undefined ||
        p.taxaAm !== undefined ||
        p.taxaUnidadeEntrada !== undefined ||
        p.prazoMeses !== undefined ||
        p.sistema !== undefined ||
        p.indexador !== undefined ||
        p.primeiroVencimento !== undefined)
    ) {
      return NextResponse.json(
        { error: 'Campos de cronograma não se aplicam a dívida rotativa' },
        { status: 400 },
      );
    }
    if (
      existing.modalidade === 'financiamento' &&
      (p.saldoInicial !== undefined || p.dataSaldoInicial !== undefined)
    ) {
      return NextResponse.json(
        { error: 'Campos de saldo inicial não se aplicam a financiamento' },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (p.nome !== undefined) data.nome = p.nome;
    if (p.instituicao !== undefined) data.instituicao = p.instituicao ?? null;
    if (p.tipo !== undefined) data.tipo = p.tipo;
    if (p.status !== undefined) data.status = p.status;
    if (p.notes !== undefined) data.notes = p.notes ?? null;
    if (p.principal !== undefined) data.principal = p.principal;
    if (p.taxaAm !== undefined) data.taxaAm = p.taxaAm;
    if (p.taxaUnidadeEntrada !== undefined) data.taxaUnidadeEntrada = p.taxaUnidadeEntrada;
    if (p.prazoMeses !== undefined) data.prazoMeses = p.prazoMeses;
    if (p.sistema !== undefined) data.sistema = p.sistema;
    if (p.indexador !== undefined) data.indexador = p.indexador;
    if (p.primeiroVencimento !== undefined) data.primeiroVencimento = p.primeiroVencimento;
    if (p.saldoInicial !== undefined) data.saldoInicial = p.saldoInicial;
    if (p.dataSaldoInicial !== undefined) data.dataSaldoInicial = p.dataSaldoInicial;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    const updated = await prisma.divida.update({
      where: { id },
      data,
      include: { pagamentos: true },
    });

    await recordChange({
      request,
      auth,
      section: 'dividas',
      action: 'divida.editar',
      entity: 'divida',
      entityId: updated.id,
      entityLabel: updated.nome,
      changes: diffFields(existing, data, DIVIDA_FIELD_LABELS),
    });

    return NextResponse.json({
      divida: serializeDivida(updated, {
        resumo: resumoDivida(toCalcInput(updated), toPagamentoInputs(updated.pagamentos)),
        includePagamentos: true,
      }),
    });
  },
);

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const existing = await findOwned(id, targetUserId);
    if (!existing) {
      return NextResponse.json({ error: 'Dívida não encontrada' }, { status: 404 });
    }

    // Cascade via FK onDelete:Cascade no schema → pagamentos somem juntos.
    await prisma.divida.delete({ where: { id } });

    await recordChange({
      request,
      auth,
      section: 'dividas',
      action: 'divida.excluir',
      entity: 'divida',
      entityId: id,
      entityLabel: existing.nome,
      changes: finalStateChanges(existing, DIVIDA_FIELD_LABELS),
      snapshot: {
        v: 1,
        kind: 'divida',
        data: {
          id: existing.id,
          nome: existing.nome,
          instituicao: existing.instituicao,
          tipo: existing.tipo,
          modalidade: existing.modalidade,
          principal: existing.principal == null ? null : decimalToNumber(existing.principal),
          taxaAm: existing.taxaAm == null ? null : decimalToNumber(existing.taxaAm),
          taxaUnidadeEntrada: existing.taxaUnidadeEntrada,
          prazoMeses: existing.prazoMeses,
          sistema: existing.sistema,
          indexador: existing.indexador,
          primeiroVencimento: existing.primeiroVencimento,
          saldoInicial:
            existing.saldoInicial == null ? null : decimalToNumber(existing.saldoInicial),
          dataSaldoInicial: existing.dataSaldoInicial,
          status: existing.status,
          notes: existing.notes,
        },
        meta: {
          pagamentos: existing.pagamentos.map((pg) => ({
            month: pg.month,
            valor: decimalToNumber(pg.valor),
            parcelaNumero: pg.parcelaNumero,
            tipo: pg.tipo,
            notes: pg.notes,
          })),
        },
      },
    });

    return NextResponse.json({ success: true });
  },
);
