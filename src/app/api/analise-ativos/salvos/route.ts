import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise, flagsEua } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  NO_STORE,
  indiceSalvos,
  permissaoSalvos,
} from '@/services/analiseAtivos/salvos/listasService';
import { ehTickerEua } from '@/types/analiseAtivosEua';
import type { IndiceSalvosResposta } from '@/types/analiseAtivosSalvos';

/** Sem a chave EUA, o índice só traz os tickers da B3. */
function semEuaDesligado(porTicker: Record<string, string[]>): Record<string, string[]> {
  if (flagsEua().eua) return porTicker;
  return Object.fromEntries(Object.entries(porTicker).filter(([t]) => !ehTickerEua(t)));
}

/**
 * GET /api/analise-ativos/salvos — índice compacto do botão Salvar (cabeçalho do ativo, linhas e
 * cartões do Quadro): {porTicker: ticker → listaIds, listas: [{id,nome}], limites, podeSalvar}.
 * No máximo 500 itens (o limite por usuário). Consultor agindo → vazio com podeSalvar=false.
 * Stocks/REITs (EUA, fatia D): os tickers EUA (BRK.B) entram como os do Brasil; com
 * ANALISE_ATIVOS_EUA_HABILITADO desligada eles saem do índice (o Brasil não muda).
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  const consultor = Boolean(actingClient);
  const indice = consultor ? { porTicker: {}, listas: [] } : await indiceSalvos(payload.id);
  const corpo: IndiceSalvosResposta = {
    ...indice,
    porTicker: semEuaDesligado(indice.porTicker),
    ...permissaoSalvos(consultor),
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
