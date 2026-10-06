import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { validationError } from '@/utils/validation-schemas';
import {
  aplicarDestinosSchema,
  destinosQuerySchema,
  pluggyDestinosHabilitado,
  type AplicarDestinosErro409,
  type AplicarDestinosResponse,
  type DestinosImportadosResponse,
} from '@/lib/pluggyDestinos';
import { aplicarDestinos, listarDestinosImportados } from '@/services/pluggy/destinosImportacao';
import { recordDestinoImportacao } from '@/services/changeHistory/destinoImportacaoHelpers';
import { invalidateCaixaCaches } from '@/services/portfolio/caixaParaInvestir';
import { invalidarContextoUsuario } from '@/services/assistente/contexto';
import { requireProprioUsuarioPluggyAuth } from '../../_lib/auth';

/**
 * Escolher o destino dos investimentos importados do banco (out/2026).
 * Contrato em src/lib/pluggyDestinos.ts; serviço em
 * src/services/pluggy/destinosImportacao.ts (regra = a do mover).
 *
 * GET  /api/pluggy/carteira/destinos?connectionId=&paraRevisar=1 → DestinosImportadosResponse
 * POST /api/pluggy/carteira/destinos { itens, confirmarIds }      → AplicarDestinosResponse
 *                                                               | 409 AplicarDestinosErro409
 *
 * Só o próprio cliente (consultor 403, decisão 10); posse por targetUserId.
 * Chave PLUGGY_DESTINOS_HABILITADO desligada: GET vazio, POST 404. CSRF pelo
 * middleware (o cliente chama com csrfFetch).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireProprioUsuarioPluggyAuth(request);
  const { searchParams } = new URL(request.url);
  const parsed = destinosQuerySchema.safeParse({
    connectionId: searchParams.get('connectionId') ?? undefined,
    paraRevisar: searchParams.get('paraRevisar') ?? undefined,
  });
  if (!parsed.success) return validationError(parsed);

  if (!pluggyDestinosHabilitado()) {
    const vazio: DestinosImportadosResponse = { habilitado: false, itens: [], paraRevisar: 0 };
    return NextResponse.json(vazio, { headers: NO_STORE });
  }

  const { connectionId } = parsed.data;
  if (connectionId) {
    // Conexão de outro usuário → 404 (mesma mensagem de conexão inexistente).
    const conexao = await prisma.bankConnection.findFirst({
      where: { id: connectionId, userId: auth.targetUserId },
      select: { id: true },
    });
    if (!conexao) throw new ApiError(404, 'Conexão não encontrada');
  }

  const resposta = await listarDestinosImportados(auth.targetUserId, {
    connectionId,
    somenteParaRevisar: parsed.data.paraRevisar === '1',
  });
  return NextResponse.json(resposta, { headers: NO_STORE });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireProprioUsuarioPluggyAuth(request);
  if (!pluggyDestinosHabilitado()) throw new ApiError(404, 'Recurso indisponível');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Dados inválidos');
  }
  const parsed = aplicarDestinosSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const userId = auth.targetUserId;
  const resultado = await aplicarDestinos(userId, parsed.data);
  if (resultado.tipo === 'invalido') {
    // Fase 1 recusou algum item: NADA foi gravado.
    const erro: AplicarDestinosErro409 = {
      error: 'Não foi possível salvar',
      erros: resultado.erros,
    };
    return NextResponse.json(erro, { status: 409 });
  }

  const historicoIds: string[] = [];
  if (resultado.resposta.aplicados > 0) {
    // Pizza/alocação do resumo (cacheado) e o contexto do assistente mudam de aba.
    invalidateCaixaCaches(userId);
    invalidarContextoUsuario(userId);
    // Sequencial: a ordem dos logs é a ordem em que o Desfazer reverte (do fim ao início).
    for (const registro of resultado.registros) {
      const id = await recordDestinoImportacao(request, auth, registro);
      if (id) historicoIds.push(id);
    }
  }

  const resposta: AplicarDestinosResponse = { ...resultado.resposta, historicoIds };
  return NextResponse.json(resposta);
});
