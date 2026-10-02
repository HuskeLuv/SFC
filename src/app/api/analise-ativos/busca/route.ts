import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterLinhasQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { montarIndiceBusca } from '@/services/analiseAtivos/quadro/indiceBusca';
import type { BuscaIndiceResposta, ItemBusca } from '@/types/analiseAtivosApi';

/**
 * GET /api/analise-ativos/busca — índice compacto de TODAS as linhas (inclusive fora do Quadro,
 * com o motivo). O filtro roda no cliente (BuscaAtivos). Só banco.
 * ETag = versão das linhas → 304 com If-None-Match; Cache-Control: private, max-age=3600.
 * 404 sem acesso (o acesso é checado antes do 304: quem saiu do beta não reaproveita o cache).
 */
export const dynamic = 'force-dynamic';

const CACHE = 'private, max-age=3600';

/** Índice memorizado por versão (troca quando o job grava uma versão nova). */
let memo: { versao: string; itens: ItemBusca[] } | null = null;

const etagDe = (versao: string) => `"busca-${versao}"`;

export const GET = withErrorHandler(async (request: NextRequest) => {
  await exigirAcessoAnalise(request);
  const versao = await versaoQuadro();
  const etag = etagDe(versao);
  const headers = { ETag: etag, 'Cache-Control': CACHE };

  const recebido = request.headers.get('if-none-match');
  if (recebido && recebido.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  if (!memo || memo.versao !== versao) {
    const linhas = await obterLinhasQuadro(undefined, { incluirForaDoQuadro: true });
    memo = { versao, itens: montarIndiceBusca(linhas) };
  }
  const corpo: BuscaIndiceResposta = { versao, itens: memo.itens };
  return NextResponse.json(corpo, { headers });
});
