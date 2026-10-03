import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { ORIGENS_CASO, STATUS_CASO } from '@/services/analiseAtivos/curadoria/contrato';
import { FILAS, listarCasos } from '@/services/analiseAtivos/curadoria/filaCuradoria';

/**
 * GET /api/admin/analise-ativos/casos — fila de curadoria (bloco C, fatia C). Só admin (403);
 * somente leitura; no-store. Query = CasosListaQuery do contrato + `fila` (atalho dos contadores e
 * abas da tela: principal | pendentes | em_analise | vencendo | vencidos | so_regra | revisao |
 * fechados). Resposta = CasosListaResposta com contadores extras (vencendo, soRegra, revisao).
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const QuerySchema = z.strictObject({
  fila: z.enum(FILAS).optional(),
  status: z.enum(STATUS_CASO).optional(),
  origem: z.enum(ORIGENS_CASO).optional(),
  tipo: z.enum(['bloqueante', 'revisao']).optional(),
  classe: z.enum(['acao', 'fii']).optional(),
  grupo: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
  q: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,12}$/, 'Busque pelo ticker (letras e números).')
    .optional(),
  prazo: z.enum(['vence_hoje', 'vencido']).optional(),
  responsavel: z.enum(['eu', 'ninguem']).optional(),
  cursor: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireAdmin(request);
  const bruto = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''),
  );
  const parsed = QuerySchema.safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError(400, 'Filtro inválido', {
      query: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const corpo = await listarCasos(prisma, parsed.data, { adminId: payload.id });
  return NextResponse.json(corpo, { headers: NO_STORE });
});
