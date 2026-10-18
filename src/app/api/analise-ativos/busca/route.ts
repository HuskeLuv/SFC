import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise, flagsEua } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterLinhasQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { linhasDaBusca, montarIndiceBusca } from '@/services/analiseAtivos/quadro/indiceBusca';
import type { BuscaIndiceResposta, ItemBusca } from '@/types/analiseAtivosApi';

/**
 * GET /api/analise-ativos/busca — índice compacto de TODAS as linhas (inclusive fora do Quadro,
 * com o motivo): itens {t, n, c, q, f, m}, sem i/e (v2.4). O filtro roda no cliente (BuscaAtivos).
 * Só banco.
 * ETag = versão das linhas → 304 com If-None-Match; Cache-Control: private, max-age=3600.
 * 404 sem acesso (o acesso é checado antes do 304: quem saiu do beta não reaproveita o cache).
 * Stocks e REITs (fatia C): só com ANALISE_ATIVOS_EUA_HABILITADO (sem a chave o índice é o de
 * hoje); o ETag muda com a chave (quem tinha o índice sem EUA recarrega).
 */
export const dynamic = 'force-dynamic';

const CACHE = 'private, max-age=3600';

/** Índice memorizado por versão (troca quando o job grava uma versão nova). */
let memo: { versao: string; eua: boolean; itens: ItemBusca[] } | null = null;

/** 'v2' no ETag: o formato mudou na v2.4 (sem i/e); quem tinha o índice antigo em cache recarrega. */
const etagDe = (versao: string, eua: boolean) => `"busca-v2-${versao}${eua ? '-eua' : ''}"`;

export const GET = withErrorHandler(async (request: NextRequest) => {
  await exigirAcessoAnalise(request);
  const versao = await versaoQuadro();
  const { eua } = flagsEua();
  const etag = etagDe(versao, eua);
  const headers = { ETag: etag, 'Cache-Control': CACHE };

  const recebido = request.headers.get('if-none-match');
  if (recebido && recebido.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  if (!memo || memo.versao !== versao || memo.eua !== eua) {
    const linhas = await obterLinhasQuadro(undefined, { incluirForaDoQuadro: true });
    memo = { versao, eua, itens: montarIndiceBusca(linhasDaBusca(linhas, eua)) };
  }
  const corpo: BuscaIndiceResposta = { versao, itens: memo.itens };
  return NextResponse.json(corpo, { headers });
});
