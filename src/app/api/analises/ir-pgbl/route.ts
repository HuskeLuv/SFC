import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import type { CashGroupLike } from '@/services/cashflow/linhasEditaveis';
import { sugerirDoFluxo, type SugestaoFluxoIr } from '@/services/ir/sugestaoFluxoIr';
import { pgblDoAno, type PlanoPrevidenciaIR } from '@/services/ir/pgblDoAno';

/**
 * Aba PGBL do IR (HTML do Pedro, 03/11/2026): aportes do ano nos planos de previdência da
 * carteira (Asset.type = 'previdencia'), agrupados por plano, com o saldo atual.
 *
 * A carteira não grava se o plano é PGBL ou VGBL (o fundo de previdência do catálogo CVM serve
 * aos dois). `tipoSugerido` é só um palpite pelo nome; quem decide é o usuário na tela.
 * O agrupamento por plano mora em services/ir/pgblDoAno.ts (também usado pelo Relatório
 * financeiro).
 */

interface IRPgblResponse {
  year: number;
  asOf: string;
  planos: PlanoPrevidenciaIR[];
  /** Renda e deduções do Fluxo de Caixa do ano, para o botão "Preencher com o fluxo de caixa". */
  sugestaoFluxo: SugestaoFluxoIr | null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const yearParam = parseInt(request.nextUrl.searchParams.get('year') ?? '', 10);
  const year =
    Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam
      : new Date().getFullYear();

  const lista = await pgblDoAno(targetUserId, year);

  // Sugestão do fluxo: falha aqui não derruba a aba (os aportes da carteira continuam).
  const sugestaoFluxo = await getMergedCashflowGroups(targetUserId, year)
    .then((g) => sugerirDoFluxo(g as unknown as CashGroupLike[]))
    .catch(() => null);
  const body: IRPgblResponse = {
    year,
    asOf: new Date().toISOString(),
    planos: lista,
    sugestaoFluxo,
  };
  return NextResponse.json(body);
});
