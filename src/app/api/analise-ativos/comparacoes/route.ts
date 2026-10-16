import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursosAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  ComparacaoPostSchema,
  ComparacoesQuerySchema,
} from '@/services/analiseAtivos/salvos/contrato';
import {
  listarComparacoes,
  salvarComparacao,
} from '@/services/analiseAtivos/salvos/comparacoesService';
import {
  NO_STORE,
  exigirPessoal,
  lerCorpo,
  lerQuery,
  permissaoSalvos,
  resolverAtivo,
} from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ComparacaoPostResposta, ComparacoesResposta } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/comparacoes — comparações salvas (bloco 1, fatia A). Exige os recursos
 * salvos E comparador (404 sem qualquer das flags, antes da sessão). Fica FORA de /comparador/
 * para não dividir o balde de 30/min do JSON do Comparador.
 *
 * - GET ?classe= → ComparacoesResposta (mais recentes primeiro; href pronto para reabrir).
 * - POST {classe, tickers[1..4], janela, tipoFii?, nome?} (CSRF) → 201 {comparacao,
 *   atualizada:false}, ou 200 {atualizada:true} na mesma chave. Todos os tickers precisam ser da
 *   classe (outra classe → 400; sem linha no Quadro → 404). 31ª → 409. Consultor → 403.
 */
export const dynamic = 'force-dynamic';

const RECURSOS = ['salvos', 'comparador'] as const;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursosAnalise(request, RECURSOS);
  const { classe } = lerQuery(request.nextUrl.searchParams, ComparacoesQuerySchema);
  const consultor = Boolean(actingClient);
  const corpo: ComparacoesResposta = {
    comparacoes: consultor ? [] : await listarComparacoes(payload.id, classe),
    ...permissaoSalvos(consultor),
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursosAnalise(request, RECURSOS);
  exigirPessoal(actingClient);
  const body = await lerCorpo(request, ComparacaoPostSchema);
  const ativos = await Promise.all(body.tickers.map((t) => resolverAtivo(t)));
  if (ativos.some((a) => a.classe !== body.classe)) {
    throw new ApiError(400, TEXTOS_SALVOS.servidor.classesMisturadas);
  }
  const corpo: ComparacaoPostResposta = await salvarComparacao(payload.id, {
    classe: body.classe,
    tickers: ativos.map((a) => a.symbol),
    janela: body.janela,
    tipoFii: body.tipoFii ?? null,
    nome: body.nome,
  });
  return NextResponse.json(corpo, { status: corpo.atualizada ? 200 : 201, headers: NO_STORE });
});
