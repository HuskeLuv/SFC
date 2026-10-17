import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursosAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { montarComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { hojeSaoPaulo } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { montarDocumentoComparacao } from '@/services/analiseAtivos/pdf/montarDocumentoComparacao';
import { renderizarPdfComparacao } from '@/services/analiseAtivos/pdf/renderizarPdfComparacao';
import { ComparacaoPdfQuerySchema, nomeArquivoPdf } from '@/services/analiseAtivos/salvos/contrato';
import {
  consumirCotaPdf,
  devolverCotaPdf,
} from '@/services/analiseAtivos/salvos/comparacoesService';
import { lerQuery } from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { JANELA_PADRAO } from '@/types/analiseAtivosCriterios';

/**
 * GET /api/analise-ativos/comparacao-pdf?t=WEGE3,BBAS3&janela=5&tipo= — PDF do Comparador gerado
 * NO SERVIDOR (pdfkit), bloco 1, fatia A.
 *
 * - Recursos pdfComparador + comparador (404 sem as flags, antes da sessão; 401 sem sessão).
 * - Mesma montagem da tela (montarComparador → números idênticos) → montarDocumentoComparacao
 *   (puro) → renderizarPdfComparacao. SEM OPÇÕES: nunca posição, nome ou e-mail; aviso legal em
 *   toda página. Consultor agindo pode gerar (o PDF não leva dado pessoal nem posição).
 * - Limites: tier próprio por IP em rateLimit.ts (10/min, fora do balde do /comparador) + 10 por
 *   hora por usuário (payload.id; em memória, zera no restart) → 429 com Retry-After. A cota só é
 *   consumida quando há ativo para gerar, e é devolvida se a renderização falhar.
 * - attachment 'comparacao-<acoes|fiis>-<T1>-…-AAAA-MM-DD.pdf'; no-store; runtime nodejs.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload } = await exigirRecursosAnalise(request, ['pdfComparador', 'comparador']);
  const q = lerQuery(request.nextUrl.searchParams, ComparacaoPdfQuerySchema);
  const hoje = hojeSaoPaulo();
  const r = await montarComparador(q.t, hoje, q.janela ?? JANELA_PADRAO);
  if (!r || r.dados.ativos.length === 0) {
    throw new ApiError(404, TEXTOS_SALVOS.servidor.ativoNaoEncontrado);
  }

  try {
    consumirCotaPdf(payload.id);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.statusCode === 429) {
      const liberaEm = error.details?.liberaEm?.[0];
      const segundos = liberaEm
        ? Math.max(1, Math.ceil((new Date(liberaEm).getTime() - Date.now()) / 1000))
        : 3600;
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 429, headers: { 'Retry-After': String(segundos), 'Cache-Control': 'no-store' } },
      );
    }
    throw error;
  }

  let pdf: Buffer;
  try {
    const doc = montarDocumentoComparacao(r.dados, { geradoEm: new Date() });
    pdf = await renderizarPdfComparacao(doc);
  } catch (error: unknown) {
    devolverCotaPdf(payload.id);
    throw error;
  }

  const nome = nomeArquivoPdf(r.dados.classe, r.dados.tickers, hoje);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
