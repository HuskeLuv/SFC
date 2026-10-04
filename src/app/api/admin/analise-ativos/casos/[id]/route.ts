import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import {
  EFEITOS_TELA,
  STATUS_CASO,
  TODAS_RESOLUCOES,
} from '@/services/analiseAtivos/curadoria/contrato';
import { ConflitoCaso, aplicarAcaoCaso } from '@/services/analiseAtivos/curadoria/acoesCuradoria';
import { detalharCaso } from '@/services/analiseAtivos/curadoria/filaCuradoria';
import type { CasoPatchBody, CasoPatchResposta } from '@/types/analiseAtivosCuradoria';

/**
 * /api/admin/analise-ativos/casos/[id] (bloco C, fatia C) — só admin (403); no-store.
 *  - GET   → CasoDetalheResposta (texto do usuário vai como dado; a tela renderiza como TEXTO)
 *  - PATCH → CasoPatchBody (zod strict, união discriminada; CSRF no middleware) →
 *            CasoPatchResposta {…detalhe, notificados}. 409 = concorrência/transição
 *            (CasoConflito409); 400 = validação (termo proibido: details.termos).
 * Decisão 16: não há 'conferenciaManual' no corpo (chave extra = 400).
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esperado = z.string().min(1).max(40);
// Limites brutos folgados: o texto é saneado e medido de novo no serviço (LIMITES do contrato).
const texto = (max: number) => z.string().max(max * 2);

const PatchSchema = z.discriminatedUnion('acao', [
  z.strictObject({ acao: z.enum(['assumir', 'soltar']), atualizadoEmEsperado: esperado }),
  z.strictObject({
    acao: z.literal('decidir'),
    status: z.enum(STATUS_CASO),
    resolucao: z.enum(TODAS_RESOLUCOES as [string, ...string[]]).optional(),
    efeitoTela: z.enum(EFEITOS_TELA),
    respostaPublica: texto(500).optional(),
    notaCurador: texto(2000).optional(),
    atualizadoEmEsperado: esperado,
  }),
  z.strictObject({
    acao: z.literal('nota'),
    notaCurador: texto(2000),
    atualizadoEmEsperado: esperado,
  }),
]);

async function idDe(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id ?? '')) throw new ApiError(404, 'Caso não encontrado');
  return id;
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  await requireAdmin(request);
  const id = await idDe(ctx);
  const detalhe = await detalharCaso(prisma, id);
  if (!detalhe) throw new ApiError(404, 'Caso não encontrado');
  return NextResponse.json(detalhe, { headers: NO_STORE });
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const payload = await requireAdmin(request);
  const id = await idDe(ctx);
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? 'corpo');
      (details[k] ??= []).push(i.message);
    }
    throw new ApiError(400, 'Dados inválidos', details);
  }
  try {
    const { notificados } = await aplicarAcaoCaso(prisma, {
      casoId: id,
      adminId: payload.id,
      corpo: parsed.data as CasoPatchBody,
    });
    const detalhe = await detalharCaso(prisma, id);
    if (!detalhe) throw new ApiError(404, 'Caso não encontrado');
    const corpo: CasoPatchResposta = { ...detalhe, notificados };
    return NextResponse.json(corpo, { headers: NO_STORE });
  } catch (e: unknown) {
    if (e instanceof ConflitoCaso) {
      return NextResponse.json(e.corpo, { status: 409, headers: NO_STORE });
    }
    throw e;
  }
});
