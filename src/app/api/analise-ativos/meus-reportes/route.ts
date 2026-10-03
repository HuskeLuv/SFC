import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { analiseAtivosReporteHabilitado } from '@/lib/analiseAtivosConfig';
import {
  MENSAGEM_SEM_ACESSO,
  exigirAcessoAnalise,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  TIPOS_NOTIFICACAO,
  casoFechado,
  ehStatusCaso,
  statusParaUsuario,
  type BlocoReporte,
  type CampoReporte,
  type ResolucaoCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import type { ItemMeuReporte, MeusReportesResposta } from '@/types/analiseAtivosCuradoria';

/**
 * GET /api/analise-ativos/meus-reportes?ticker=&cursor= — "Meus relatos" (bloco C, fatia D).
 *
 * - SEMPRE os relatos do usuário LOGADO (payload.id): nunca os do cliente personificado nem um
 *   userId vindo da query.
 * - Flag do relato desligada / sem acesso → 404; sem sessão → 401.
 * - Rota SEPARADA do POST: o balde de rate limit do middleware é por 4 segmentos, e o tier de
 *   10/min por IP vale só para '/api/analise-ativos/reportes'.
 * - ticker opcional (o "Você reportou" da página do ativo); paginação por cursor (createdAt|id),
 *   20 por página, mais novos primeiro.
 * - respostaPublica/resolucao só com o caso fechado; `novo` = há aviso de resposta ainda NÃO lido
 *   no sino para o caso (metadata.casoId ou metadata.reporteId).
 * - Cache-Control: no-store.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const POR_PAGINA = 20;
const RE_TICKER = /^[A-Z0-9]{4,12}$/;
/** avisos de resposta não lidos considerados para o destaque "Resposta nova" */
const MAX_AVISOS = 200;

interface Cursor {
  criadoEm: Date;
  id: string;
}

function codificarCursor(c: Cursor): string {
  return Buffer.from(`${c.criadoEm.toISOString()}|${c.id}`, 'utf8').toString('base64url');
}

function decodificarCursor(s: string): Cursor | null {
  try {
    const [iso, id] = Buffer.from(s, 'base64url').toString('utf8').split('|');
    const criadoEm = new Date(iso);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(criadoEm.getTime())) return null;
    return { criadoEm, id };
  } catch {
    return null;
  }
}

function dataCivil(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!analiseAtivosReporteHabilitado()) throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  const { payload } = await exigirAcessoAnalise(request);
  const userId = payload.id;

  const sp = request.nextUrl.searchParams;
  const tickerBruto = sp.get('ticker');
  const ticker = tickerBruto ? tickerBruto.trim().toUpperCase() : null;
  if (ticker !== null && !RE_TICKER.test(ticker)) throw new ApiError(400, 'Ticker inválido');
  const cursorBruto = sp.get('cursor');
  const cursor = cursorBruto ? decodificarCursor(cursorBruto) : null;
  if (cursorBruto && !cursor) throw new ApiError(400, 'Cursor inválido');

  const relatos = await prisma.analiseDataReport.findMany({
    where: {
      userId,
      ...(ticker ? { symbol: ticker } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.criadoEm } },
              { createdAt: cursor.criadoEm, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: POR_PAGINA + 1,
    select: {
      id: true,
      protocolo: true,
      symbol: true,
      bloco: true,
      campo: true,
      periodo: true,
      mensagem: true,
      valorExibido: true,
      valorEsperado: true,
      fonteEsperada: true,
      createdAt: true,
      caso: {
        select: {
          id: true,
          status: true,
          slaAte: true,
          updatedAt: true,
          resolucao: true,
          respostaPublica: true,
        },
      },
    },
  });
  const pagina = relatos.slice(0, POR_PAGINA);
  const temMais = relatos.length > POR_PAGINA;

  const fechadosNaPagina = pagina.some((r) => casoFechado(r.caso.status));
  const avisos = fechadosNaPagina
    ? await prisma.notification.findMany({
        where: { userId, type: TIPOS_NOTIFICACAO.resposta, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: MAX_AVISOS,
        select: { metadata: true },
      })
    : [];
  const naoLidos = new Set<string>();
  for (const a of avisos) {
    const m = a.metadata as Record<string, unknown> | null;
    for (const k of ['casoId', 'reporteId'] as const) {
      if (m && typeof m[k] === 'string') naoLidos.add(m[k] as string);
    }
  }

  const itens: ItemMeuReporte[] = pagina.map((r) => {
    const fechado = casoFechado(r.caso.status);
    return {
      id: r.id,
      protocolo: r.protocolo,
      ticker: r.symbol,
      bloco: r.bloco as BlocoReporte,
      campo: r.campo as CampoReporte,
      periodo: r.periodo,
      criadoEm: r.createdAt.toISOString(),
      mensagem: r.mensagem,
      valorExibido: r.valorExibido,
      valorEsperado: r.valorEsperado,
      fonteEsperada: r.fonteEsperada,
      caso: {
        status: ehStatusCaso(r.caso.status) ? statusParaUsuario(r.caso.status) : 'aberto',
        slaAte: dataCivil(r.caso.slaAte),
        atualizadoEm: r.caso.updatedAt.toISOString(),
        resolucao: fechado ? ((r.caso.resolucao as ResolucaoCaso | null) ?? null) : null,
        respostaPublica: fechado ? r.caso.respostaPublica : null,
        novo: fechado && (naoLidos.has(r.caso.id) || naoLidos.has(r.id)),
      },
    };
  });

  const ultimo = pagina[pagina.length - 1];
  const corpo: MeusReportesResposta = {
    itens,
    proximoCursor:
      temMais && ultimo ? codificarCursor({ criadoEm: ultimo.createdAt, id: ultimo.id }) : null,
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
