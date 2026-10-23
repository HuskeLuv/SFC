/**
 * Defaults pra pré-popular o simulador na primeira vez (sem plano salvo).
 *
 * - patrimonio: soma de Portfolio.totalInvested do user (patrimônio disponível
 *   aproximado), em R$: posição gravada em US$ convertida (somarCustoEmBrl).
 * - rentNom: CDI anualizado mais recente (% a.a.). Fallback 12%.
 * - inflacao: default conservador (% a.a.) dentro da meta do BCB — o user
 *   ajusta no slider. Não derivamos do IPCA aqui porque acumular 12 meses de
 *   forma confiável foge do escopo de uma sugestão inicial.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { posicaoEmDolar } from '@/lib/ativoEmDolar';
import { getCotacaoDolarHoje } from '@/services/market/cambioUsdBrl';
import { somarCustoEmBrl } from '@/services/portfolio/itemValuation';

const DEFAULT_RENT_NOM = 12; // % a.a.
const DEFAULT_INFLACAO = 4.5; // % a.a.

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [latestCdi, posicoes] = await Promise.all([
    prisma.economicIndex.findFirst({
      where: { indexType: 'CDI_ANUALIZADO' },
      orderBy: { date: 'desc' },
      select: { value: true },
    }),
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      select: {
        totalInvested: true,
        moedaRegistro: true,
        totalInvestedBrl: true,
        asset: { select: { type: true, currency: true } },
      },
    }),
  ]);
  // Câmbio só quando há posição em US$ (REIT, stock em dólar).
  const cotacaoDolar = posicoes.some((p) => posicaoEmDolar(p, p.asset))
    ? ((await getCotacaoDolarHoje().catch(() => null))?.taxa ?? null)
    : null;

  let rentNom = DEFAULT_RENT_NOM;
  if (latestCdi) {
    // CDI_ANUALIZADO vem como % anual (ex.: 13.65 = 13,65%/ano).
    const cdi = Number(latestCdi.value);
    if (Number.isFinite(cdi) && cdi > 0 && cdi < 100) {
      rentNom = Math.round(cdi * 10) / 10; // 1 casa decimal
    }
  }

  const patrimonio = Math.round(somarCustoEmBrl(posicoes, cotacaoDolar) * 100) / 100;

  return NextResponse.json({
    patrimonio,
    rentNom,
    inflacao: DEFAULT_INFLACAO,
  });
});
