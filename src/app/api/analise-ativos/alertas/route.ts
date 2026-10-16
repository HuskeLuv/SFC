import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { listarAvisos } from '@/services/analiseAtivos/alertas/avisosDoUsuario';
import { AlertasQuerySchema, paramsParaObjeto } from '@/services/analiseAtivos/salvos/contrato';
import type { AlertasResposta } from '@/types/analiseAtivosSalvos';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/analise-ativos/alertas?classe=acao|fii&dias=1..90 — aba Salvos › Alertas (bloco 1,
 * fatia D). Lê as Notification type 'analise_ativos_salvos_alerta' do usuário LOGADO (payload.id),
 * dos últimos `dias` (padrão 90), mais novas primeiro; `classe` filtra pelo metadata (o resumo
 * "Novidades em N ativos" vale para as duas classes). `naoLidos` conta no mesmo filtro.
 *
 * - Recurso 'alertas' (ANALISE_ATIVOS_ALERTAS_HABILITADO + SALVOS + área liberada) desligado ⇒ 404.
 * - Consultor agindo pelo cliente: 200 vazio com podeSalvar=false (os avisos são pessoais e vão
 *   sempre ao dono da lista; o consultor não lê nem marca como lido).
 * - Query fora do contrato (strict) ⇒ 400. no-store. Só lê o banco.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'alertas');
  const parsed = AlertasQuerySchema.safeParse(paramsParaObjeto(request.nextUrl.searchParams));
  if (!parsed.success) {
    throw new ApiError(400, 'Parâmetros inválidos', {
      campos: parsed.error.issues.map((i) => i.path.join('.')),
    });
  }
  if (actingClient) {
    const vazio: AlertasResposta = {
      avisos: [],
      naoLidos: 0,
      podeSalvar: false,
      motivoSemSalvar: 'consultor',
    };
    return NextResponse.json(vazio, { headers: NO_STORE });
  }
  const { avisos, naoLidos } = await listarAvisos(prisma, payload.id, parsed.data);
  const corpo: AlertasResposta = { avisos, naoLidos, podeSalvar: true, motivoSemSalvar: null };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
