import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { objetivoSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { assetEntityLabel, recordObjetivoClasseDefinido } from '@/services/changeHistory';

/**
 * Handler ÚNICO das 9 rotas `POST /api/carteira/<aba>/objetivo` (eram 9 cópias
 * idênticas de 42 linhas, diferindo só no rótulo da classe).
 *
 * `ativoId` é o id da POSIÇÃO (Portfolio). Desde os ativos planejados
 * (16/09/2026) também pode ser o id de um planejado (Watchlist), que a aba
 * exibe como linha zerada com `planejado: true` — nesse caso o objetivo é
 * gravado no planejado, sem registro no histórico (não existe posição).
 */
export function criarHandlerObjetivo(classe: string) {
  return withErrorHandler(async (request: NextRequest) => {
    const auth = await requireAuthWithActing(request);
    const { targetUserId } = auth;
    const body = await request.json();
    const parsed = objetivoSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed);
    const { ativoId, objetivo } = parsed.data;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: ativoId, userId: targetUserId },
      include: { asset: { select: { symbol: true, name: true, source: true } } },
    });

    if (!portfolio) {
      const planejado = await prisma.watchlist.findFirst({
        where: { id: ativoId, userId: targetUserId },
      });
      if (!planejado) {
        return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
      }
      await prisma.watchlist.update({ where: { id: planejado.id }, data: { objetivo } });
      return NextResponse.json({ success: true, message: 'Objetivo atualizado com sucesso' });
    }

    await prisma.portfolio.update({ where: { id: portfolio.id }, data: { objetivo } });

    await recordObjetivoClasseDefinido(request, auth, {
      classe,
      ativoId,
      ticker: assetEntityLabel(portfolio.asset),
      objetivoAnterior: portfolio.objetivo,
      objetivo,
    });

    return NextResponse.json({ success: true, message: 'Objetivo atualizado com sucesso' });
  });
}
