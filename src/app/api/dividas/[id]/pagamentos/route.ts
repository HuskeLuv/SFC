/**
 * Pagamentos de uma dívida (coleção).
 *
 * POST /api/dividas/:id/pagamentos → registra pagamento (parcela, extra ou
 * ajuste). Regras cruzadas por modalidade validadas aqui: parcelaNumero só
 * pra financiamento, dentro de 1..prazoMeses e sem duplicata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { dividaPagamentoCreateSchema, validationError } from '@/utils/validation-schemas';
import { resumoDivida } from '@/services/dividas/amortizacao';
import { recordChange, diffFields, DIVIDA_PAGAMENTO_FIELD_LABELS } from '@/services/changeHistory';
import {
  serializeDivida,
  serializePagamento,
  toCalcInput,
  toPagamentoInputs,
} from '../../_lib/serializer';

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id } = await params;

    const divida = await prisma.divida.findFirst({
      where: { id, userId: targetUserId },
      include: { pagamentos: true },
    });
    if (!divida) {
      return NextResponse.json({ error: 'Dívida não encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = dividaPagamentoCreateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }
    const p = parsed.data;

    if (p.parcelaNumero != null) {
      if (divida.modalidade !== 'financiamento') {
        return NextResponse.json(
          { error: 'parcelaNumero só se aplica a financiamento' },
          { status: 400 },
        );
      }
      if (divida.prazoMeses != null && p.parcelaNumero > divida.prazoMeses) {
        return NextResponse.json(
          { error: `parcelaNumero fora do prazo (1..${divida.prazoMeses})` },
          { status: 400 },
        );
      }
      const duplicada = divida.pagamentos.some(
        (pg) => pg.parcelaNumero === p.parcelaNumero && pg.tipo === 'pagamento',
      );
      if (duplicada) {
        return NextResponse.json(
          { error: `Parcela ${p.parcelaNumero} já registrada como paga` },
          { status: 409 },
        );
      }
    }

    const created = await prisma.dividaPagamento.create({
      data: {
        dividaId: divida.id,
        month: p.month,
        valor: p.valor,
        parcelaNumero: p.parcelaNumero ?? null,
        tipo: p.tipo,
        notes: p.notes ?? null,
      },
    });

    await recordChange({
      request,
      auth,
      section: 'dividas',
      action: 'divida-pagamento.registrar',
      entity: 'divida-pagamento',
      entityId: created.id,
      entityLabel: divida.nome,
      changes: diffFields({}, created, DIVIDA_PAGAMENTO_FIELD_LABELS),
    });

    const pagamentos = [...divida.pagamentos, created];
    return NextResponse.json(
      {
        pagamento: serializePagamento(created),
        divida: serializeDivida(
          { ...divida, pagamentos },
          { resumo: resumoDivida(toCalcInput(divida), toPagamentoInputs(pagamentos)) },
        ),
      },
      { status: 201 },
    );
  },
);
