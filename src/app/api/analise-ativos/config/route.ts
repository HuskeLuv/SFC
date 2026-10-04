import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireSession } from '@/utils/auth';
import {
  analiseAtivosAcesso,
  analiseAtivosNovoAte,
  analiseAtivosReporteHabilitado,
} from '@/lib/analiseAtivosConfig';
import { estadoAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import type { ConfigResposta } from '@/types/analiseAtivosApi';

/**
 * GET /api/analise-ativos/config — diz ao cliente se a Análise de Ativos está liberada PARA O
 * USUÁRIO LOGADO (o item do menu só aparece com habilitada=true). Nunca 404 (o menu precisa da
 * resposta mesmo com a flag desligada); sem sessão → 401. Cache-Control: no-store.
 * reporteHabilitado (bloco C) = ANALISE_ATIVOS_REPORTE_HABILITADO e a área liberada para o usuário.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const payload = await requireSession(request);
  const estado = await estadoAcessoAnalise(payload.id);
  const corpo: ConfigResposta = {
    habilitada: estado === 'liberada',
    estado,
    acesso: analiseAtivosAcesso(),
    novoAte: analiseAtivosNovoAte(),
    reporteHabilitado: estado === 'liberada' && analiseAtivosReporteHabilitado(),
  };
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
