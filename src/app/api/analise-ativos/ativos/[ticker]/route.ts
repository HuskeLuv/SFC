import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  exigirAcessoAnalise,
  exigirClasseAnalise,
  flagsEua,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import { montarTopoAtivo } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';

/**
 * GET /api/analise-ativos/ativos/[ticker] — topo da página do ativo numa chamada
 * (AtivoTopoResposta). Só banco: nenhum provedor externo no caminho da requisição.
 * v2.4 (fatia C2): sem o indicador antigo (nenhuma chave dele no JSON; contratoSemNota.test.ts) e
 * com `criterios` nas 3 janelas (trocar a janela na tela não refaz a requisição).
 * - 404 sem acesso (flag/beta, exigirAcessoAnalise) ou ticker fora da área;
 * - 400 ticker em formato inválido;
 * - Cache-Control: private, max-age=300 (cache do servidor por ticker:versão, 30 min);
 * - Server-Timing com o tempo de montagem.
 *
 * Stocks e REITs (fatia C): com ANALISE_ATIVOS_EUA_HABILITADO aceita o ticker EUA
 * (/^[A-Z]{1,5}([.-][A-Z])?$/; BRK-B = BRK.B) — exigirClasseAnalise('stock') dá 404 antes da sessão
 * se a área estiver desligada. Sem a chave, o ticker EUA segue sendo 400 (nada muda). Sem a chave de
 * preço, a cotação EUA sai nula com eua.motivoSemPreco = 'licenca'.
 */
export const dynamic = 'force-dynamic';

/** Ticker de ação/FII da B3 (WEGE3, KLBN11, HGLG11). */
const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { ticker: bruto } = await ctx.params;
  const recebido = decodeURIComponent(bruto ?? '').toUpperCase();
  const chaves = flagsEua();
  const eua = chaves.eua && !TICKER_RE.test(recebido) && ehTickerEua(recebido);
  if (eua) await exigirClasseAnalise(request, 'stock');
  else await exigirAcessoAnalise(request);
  const ticker = eua ? symbolAnaliseDaSec(recebido) : recebido;
  if (!eua && !TICKER_RE.test(ticker)) throw new ApiError(400, 'Ticker inválido');

  const inicio = performance.now();
  // ticker da B3: a chamada de sempre (a linha EUA nunca casa com um ticker com dígito)
  const topo = eua
    ? await montarTopoAtivo(ticker, { eua: { habilitado: true, preco: chaves.euaPreco } })
    : await montarTopoAtivo(ticker);
  const ms = performance.now() - inicio;
  if (!topo) throw new ApiError(404, TEXTOS_TELA.ativo.naoEncontrado);

  return NextResponse.json(topo, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `topo;dur=${ms.toFixed(1)}`,
    },
  });
});
