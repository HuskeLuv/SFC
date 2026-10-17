import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { marcarAvisosLidos } from '@/services/analiseAtivos/alertas/avisosDoUsuario';
import {
  AlertasLidosSchema,
  MENSAGEM_LISTAS_PESSOAIS,
} from '@/services/analiseAtivos/salvos/contrato';
import type { AlertasLidosResposta } from '@/types/analiseAtivosSalvos';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * POST /api/analise-ativos/alertas/lidos (CSRF) — "Marcar todos como lidos" da aba Alertas (bloco
 * 1, fatia D). Body strict {ids?: uuid[] (1..500)}; ausente = todos os avisos não lidos dos últimos
 * 90 dias. Marca readAt SÓ nas Notification type 'analise_ativos_salvos_alerta' do usuário logado
 * (payload.id) → {ok, marcados}. Consultor agindo ⇒ 403; recurso 'alertas' desligado ⇒ 404.
 */
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'alertas');
  if (actingClient) throw new ApiError(403, MENSAGEM_LISTAS_PESSOAIS);
  // Corpo vazio = "todos"; JSON malformado é 400 (antes virava {} e marcava tudo como lido).
  const texto = await request.text();
  let bruto: unknown = {};
  if (texto.trim()) {
    try {
      bruto = JSON.parse(texto);
    } catch {
      bruto = undefined;
    }
  }
  const parsed = AlertasLidosSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', {
      campos: parsed.error.issues.map((i) => i.path.join('.')),
    });
  }
  const marcados = await marcarAvisosLidos(prisma, payload.id, parsed.data.ids);
  const corpo: AlertasLidosResposta = { ok: true, marcados };
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
