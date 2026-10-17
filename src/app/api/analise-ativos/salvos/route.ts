import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  NO_STORE,
  indiceSalvos,
  permissaoSalvos,
} from '@/services/analiseAtivos/salvos/listasService';
import type { IndiceSalvosResposta } from '@/types/analiseAtivosSalvos';

/**
 * GET /api/analise-ativos/salvos — índice compacto do botão Salvar (cabeçalho do ativo, linhas e
 * cartões do Quadro): {porTicker: ticker → listaIds, listas: [{id,nome}], limites, podeSalvar}.
 * No máximo 500 itens (o limite por usuário). Consultor agindo → vazio com podeSalvar=false.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  const consultor = Boolean(actingClient);
  const indice = consultor ? { porTicker: {}, listas: [] } : await indiceSalvos(payload.id);
  const corpo: IndiceSalvosResposta = { ...indice, ...permissaoSalvos(consultor) };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
