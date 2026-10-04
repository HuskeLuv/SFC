import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { analiseAtivosReporteHabilitado } from '@/lib/analiseAtivosConfig';
import {
  MENSAGEM_SEM_ACESSO,
  exigirAcessoAnalise,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterLinhaQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { HTTP_REPORTE_DUPLICADO } from '@/services/analiseAtivos/curadoria/contrato';
import {
  registrarReporte,
  validarCorpoReporte,
} from '@/services/analiseAtivos/curadoria/registrarReporte';
import { notificarAdminsNovoCaso } from '@/services/analiseAtivos/curadoria/notificacoesReporte';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type {
  ReporteConflito409,
  ReporteLimite429,
  ReportePostResposta,
} from '@/types/analiseAtivosCuradoria';

/**
 * POST /api/analise-ativos/reportes — "Reportar dado incorreto" (bloco C, fatia D).
 *
 * - Flag ANALISE_ATIVOS_REPORTE_HABILITADO desligada → 404 (antes de olhar a sessão); área
 *   desligada / fora do beta → 404 (exigirAcessoAnalise); sem sessão → 401.
 * - CSRF: o middleware valida (csrfFetch no cliente). Tier por IP de 10/min SÓ neste prefixo
 *   (src/lib/rateLimit.ts); o GET de Meus relatos fica em outro balde.
 * - Corpo: zod strict + saneamento (controle/bidi/zero-width) antes do tamanho; HTML → 400 com
 *   details por campo. Ticker fora do Quadro → 404.
 * - Consultor agindo pelo cliente: autor = consultor (payload.id), clienteId = cliente; o cliente
 *   não é notificado (decisão 10).
 * - 201 ReportePostResposta | 409 ReporteConflito409 (relato aberto do mesmo dado; nada criado) |
 *   429 ReporteLimite429 (dia, hora no ativo, global). Cache-Control: no-store.
 * - Admins recebem o aviso de caso novo (produção + flag; nunca derruba o relato).
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MSG_LIMITE = TEXTOS_TELA.relatos.erros;

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!analiseAtivosReporteHabilitado()) throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  const { payload, targetUserId, actingClient } = await exigirAcessoAnalise(request);

  const validacao = validarCorpoReporte(await request.json().catch(() => null));
  if (!validacao.ok) {
    throw new ApiError(400, TEXTOS_TELA.relatos.erros.resumo, validacao.erros);
  }
  const { corpo, removidos } = validacao;

  const linha = await obterLinhaQuadro(corpo.ticker);
  if (!linha) throw new ApiError(404, TEXTOS_TELA.ativo.naoEncontrado);

  const clienteId = actingClient && targetUserId !== payload.id ? targetUserId : null;
  const r = await registrarReporte(prisma, {
    autorId: payload.id,
    clienteId,
    corpo,
    linha,
    removidos,
  });

  if (r.tipo === 'duplicado') {
    const body: ReporteConflito409 = {
      error: TEXTOS_TELA.relatos.erros.duplicado,
      casoId: r.casoId,
      reporteId: r.reporteId,
    };
    return NextResponse.json(body, { status: HTTP_REPORTE_DUPLICADO, headers: NO_STORE });
  }
  if (r.tipo === 'limite') {
    const body: ReporteLimite429 = {
      error:
        r.limite === 'global'
          ? MSG_LIMITE.limiteGlobal
          : r.limite === 'dia'
            ? 'Limite diário de relatos atingido'
            : 'Limite de relatos por ativo na última hora atingido',
      limite: r.limite,
      voltaEm: r.voltaEm,
    };
    const headers: Record<string, string> = { ...NO_STORE };
    if (r.voltaEm) {
      const seg = Math.max(1, Math.ceil((Date.parse(r.voltaEm) - Date.now()) / 1000));
      headers['Retry-After'] = String(seg);
    }
    return NextResponse.json(body, { status: 429, headers });
  }

  if (r.casoNovo || r.primeiroRelato) {
    await notificarAdminsNovoCaso(prisma, r.caso);
  }
  const body: ReportePostResposta = r.resposta;
  return NextResponse.json(body, { status: 201, headers: NO_STORE });
});
