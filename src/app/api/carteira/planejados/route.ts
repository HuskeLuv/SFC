import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError, zPercentage, zString } from '@/utils/validation-schemas';
import {
  ABA_POR_TIPO_OPERACAO,
  SECOES_POR_ABA,
  TIPOS_ATIVO_PLANEJAVEIS,
} from '@/services/portfolio/ativosPlanejados';

/**
 * POST /api/carteira/planejados — inclui um ativo PLANEJADO na aba (sem
 * posição). Ver `services/portfolio/ativosPlanejados.ts` para a decisão de
 * arquitetura. Fase 1: só ativos do catálogo (ações/BDR, FII, ETF, cripto/moeda).
 */
const planejadoCreateSchema = z.object({
  assetId: zString(255),
  /** Tipo do wizard: 'acao' | 'bdr' | 'fii' | 'etf' | 'criptoativo' | 'moeda'. */
  tipoAtivo: zString(50),
  /** Seção da aba (estratégia / tipo do FII / região do ETF). */
  secao: z.string().max(50).optional().nullable(),
  objetivo: zPercentage.optional().default(0),
  observacoes: z.string().max(500).optional().nullable(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const parsed = planejadoCreateSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { assetId, tipoAtivo, secao, objetivo, observacoes } = parsed.data;

  const aba = ABA_POR_TIPO_OPERACAO[tipoAtivo];
  if (!aba) {
    throw new ApiError(400, 'Este tipo de ativo ainda não pode ser planejado sem posição');
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, 'Ativo não encontrado');
  if (!(TIPOS_ATIVO_PLANEJAVEIS[aba] as readonly string[]).includes(asset.type)) {
    throw new ApiError(400, 'O ativo escolhido não pertence a esta aba da carteira');
  }

  const secoesValidas = SECOES_POR_ABA[aba];
  const secaoFinal = secoesValidas.length > 0 ? secao || secoesValidas[0] : null;
  if (secaoFinal && !secoesValidas.includes(secaoFinal)) {
    throw new ApiError(400, 'Seção inválida para esta aba');
  }

  const posicao = await prisma.portfolio.findFirst({
    where: { userId: targetUserId, assetId },
    select: { id: true },
  });
  if (posicao) {
    throw new ApiError(409, 'Este ativo já está na sua carteira — edite o objetivo na própria aba');
  }

  const existente = await prisma.watchlist.findFirst({ where: { userId: targetUserId, assetId } });
  if (existente) {
    throw new ApiError(409, 'Este ativo já está planejado nesta aba');
  }

  const planejado = await prisma.watchlist.create({
    data: {
      userId: targetUserId,
      assetId,
      objetivo,
      secao: secaoFinal,
      notes: observacoes?.trim() || null,
    },
  });

  return NextResponse.json({ success: true, planejado }, { status: 201 });
});
