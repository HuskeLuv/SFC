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
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import { dividaPagamentoCreateSchema, validationError } from '@/utils/validation-schemas';
import {
  calcularCorteAmortizacao,
  custoQuitacaoParcela,
  gerarCronograma,
  parcelasCortadasDe,
  resumoDivida,
} from '@/services/dividas/amortizacao';
import { syncDividaRecordToCashflow } from '@/services/dividas/dividaCashflowSync';
import { recordChange, diffFields, DIVIDA_PAGAMENTO_FIELD_LABELS } from '@/services/changeHistory';
import {
  decimalToNumber,
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
      if (p.tipo !== 'pagamento') {
        return NextResponse.json(
          { error: 'parcelaNumero só se aplica a pagamento de parcela' },
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

    // Amortização com redução de prazo: quita parcelas do FIM do cronograma.
    // O servidor calcula quantas o valor cobre (custo = VALOR PRESENTE de
    // cada parcela na data do pagamento; os juros embutidos são o desconto do
    // cliente) e grava o nº cortado em parcelaNumero — semântica própria
    // desse tipo.
    let parcelasCortadas: number | null = null;
    if (p.tipo === 'amortizacao_prazo') {
      if (
        divida.modalidade !== 'financiamento' ||
        divida.principal == null ||
        divida.taxaAm == null ||
        divida.prazoMeses == null ||
        !divida.sistema ||
        !divida.primeiroVencimento
      ) {
        return NextResponse.json(
          { error: 'Amortização com redução de prazo só se aplica a financiamento' },
          { status: 400 },
        );
      }
      const taxaAm = decimalToNumber(divida.taxaAm);
      const cronograma = gerarCronograma({
        principal: decimalToNumber(divida.principal),
        taxaAm,
        prazoMeses: divida.prazoMeses,
        primeiroVencimento: divida.primeiroVencimento,
        sistema: divida.sistema,
      });
      const jaCortadas = parcelasCortadasDe(toPagamentoInputs(divida.pagamentos));
      const corte = calcularCorteAmortizacao(cronograma, jaCortadas, p.valor, taxaAm, p.month);
      if (corte.parcelas < 1) {
        const ultima = cronograma[cronograma.length - 1 - jaCortadas];
        return NextResponse.json(
          {
            error: `Valor não quita nem a última parcela do cronograma (custo de hoje: R$ ${ultima ? custoQuitacaoParcela(ultima, taxaAm, p.month).toFixed(2) : '—'}). Para abater o saldo sem reduzir o prazo, use o pagamento extraordinário.`,
          },
          { status: 400 },
        );
      }
      parcelasCortadas = corte.parcelas;
    }

    const created = await prisma.dividaPagamento.create({
      data: {
        dividaId: divida.id,
        month: p.month,
        valor: p.valor,
        parcelaNumero:
          p.tipo === 'amortizacao_prazo' ? parcelasCortadas : (p.parcelaNumero ?? null),
        tipo: p.tipo,
        notes: p.notes ?? null,
      },
    });

    // Redução de prazo muda a projeção da linha-espelho no fluxo de caixa
    // (as parcelas do fim saem do planejado).
    if (p.tipo === 'amortizacao_prazo') {
      await syncDividaRecordToCashflow(targetUserId, {
        ...divida,
        pagamentos: [...divida.pagamentos, created],
      });
    }

    // Pagamento muda o saldo devedor → o resumo (totalDividas) precisa refazer.
    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

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
