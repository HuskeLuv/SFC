/**
 * Cronograma de amortização de um financiamento.
 *
 * GET /api/dividas/:id/cronograma → cronograma completo (SAC ou Price,
 * moeda constante) + resumo + fator de indexação realizado (TR/IPCA/CDI)
 * pra UI exibir o saldo corrigido. Rotativa → 400 (não tem cronograma).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  corrigirCronograma,
  gerarCronograma,
  parcelasCortadasDe,
  saldoFinanciamento,
} from '@/services/dividas/amortizacao';
import {
  accruedIndexFactor,
  isIndexadorCorrigivel,
  monthlyIndexFactors,
} from '@/services/dividas/indexacaoDivida';
import { decimalToNumber, toPagamentoInputs } from '../../_lib/serializer';

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id } = await params;

    const divida = await prisma.divida.findFirst({
      where: { id, userId: targetUserId },
      include: { pagamentos: true },
    });
    if (!divida) {
      return NextResponse.json({ error: 'Dívida não encontrada' }, { status: 404 });
    }

    if (
      divida.modalidade !== 'financiamento' ||
      divida.principal == null ||
      divida.taxaAm == null ||
      divida.prazoMeses == null ||
      !divida.sistema ||
      !divida.primeiroVencimento
    ) {
      return NextResponse.json(
        { error: 'Dívida rotativa não possui cronograma de amortização' },
        { status: 400 },
      );
    }

    const principal = decimalToNumber(divida.principal);
    let cronograma = gerarCronograma({
      principal,
      taxaAm: decimalToNumber(divida.taxaAm),
      prazoMeses: divida.prazoMeses,
      primeiroVencimento: divida.primeiroVencimento,
      sistema: divida.sistema,
    });
    // Contrato indexado: cada parcela é corrigida pelo índice realizado até o
    // aniversário do mês dela (parcelas futuras carregam a correção realizada
    // até hoje, sem projeção — atualizam conforme o BACEN publica).
    if (isIndexadorCorrigivel(divida.indexador) && cronograma.length > 0) {
      const fatores = await monthlyIndexFactors(
        divida.indexador,
        divida.primeiroVencimento,
        cronograma[cronograma.length - 1].mes,
      );
      cronograma = corrigirCronograma(cronograma, fatores);
    }
    const pagamentosInput = toPagamentoInputs(divida.pagamentos);
    const saldo = saldoFinanciamento(principal, cronograma, pagamentosInput);
    // Parcelas do fim quitadas por amortização (redução de prazo): a UI marca
    // as linhas como amortizadas em vez de escondê-las.
    const parcelasCortadas = parcelasCortadasDe(pagamentosInput);
    const cronogramaAnotado = cronograma.map((p) => ({
      ...p,
      amortizada: p.numero > cronograma.length - parcelasCortadas,
    }));

    // Fator acumulado do índice realizado desde o 1º vencimento — 1 quando
    // PREFIXADO ou série indisponível. A UI mostra saldoDevedor × fator com
    // disclaimer de aproximação.
    const fatorIndexacao = await accruedIndexFactor(divida.indexador, divida.primeiroVencimento);

    return NextResponse.json({
      cronograma: cronogramaAnotado,
      saldo,
      parcelasCortadas,
      indexador: divida.indexador,
      fatorIndexacao,
      saldoCorrigido: Math.round(saldo.saldoDevedor * fatorIndexacao * 100) / 100,
    });
  },
);
