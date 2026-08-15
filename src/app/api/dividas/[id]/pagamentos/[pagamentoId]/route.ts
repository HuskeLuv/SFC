/**
 * Pagamento individual de uma dívida.
 *
 * DELETE /api/dividas/:id/pagamentos/:pagamentoId → remove o lançamento.
 * Ownership validado pela dívida-pai (404 pra pagamento de outro user).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import {
  recordChange,
  finalStateChanges,
  DIVIDA_PAGAMENTO_FIELD_LABELS,
} from '@/services/changeHistory';
import { decimalToNumber } from '../../../_lib/serializer';
import { syncDividaRecordToCashflow } from '@/services/dividas/dividaCashflowSync';

export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; pagamentoId: string }> },
  ) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const { id, pagamentoId } = await params;

    const pagamento = await prisma.dividaPagamento.findFirst({
      where: { id: pagamentoId, dividaId: id, divida: { userId: targetUserId } },
      include: { divida: true },
    });
    if (!pagamento) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    await prisma.dividaPagamento.delete({ where: { id: pagamentoId } });
    // Saldo devedor mudou → resumo da carteira (totalDividas) refaz.
    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

    // Excluir uma amortização de prazo devolve as parcelas do fim à projeção
    // da linha-espelho (o sync recarrega os pagamentos restantes do banco).
    if (pagamento.tipo === 'amortizacao_prazo') {
      await syncDividaRecordToCashflow(targetUserId, pagamento.divida);
    }

    await recordChange({
      request,
      auth,
      section: 'dividas',
      action: 'divida-pagamento.excluir',
      entity: 'divida-pagamento',
      entityId: pagamentoId,
      entityLabel: pagamento.divida.nome,
      changes: finalStateChanges(pagamento, DIVIDA_PAGAMENTO_FIELD_LABELS),
      snapshot: {
        v: 1,
        kind: 'divida-pagamento',
        data: {
          id: pagamento.id,
          month: pagamento.month,
          valor: decimalToNumber(pagamento.valor),
          parcelaNumero: pagamento.parcelaNumero,
          tipo: pagamento.tipo,
          notes: pagamento.notes,
        },
        meta: { dividaId: id },
      },
    });

    return NextResponse.json({ success: true });
  },
);
