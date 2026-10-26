import { NextRequest, NextResponse } from 'next/server';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import {
  ErroExclusaoSubcategoria,
  hojeEmSaoPauloExclusao,
  planejarExclusao,
} from '@/services/cashflow/orcamentoV2/excluirSubcategoria';
import {
  exigirOrcamentoV2Ativado,
  mesesDaApi,
  respostaRecusa,
} from '@/services/cashflow/orcamentoV2/rotaExclusao';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow/orcamento/v2/subcategorias/[itemId]/impacto — contagens para a confirmação
 * da exclusão (desenho técnico §6.3): `{celulas, transacoes, mesesComOrcado, coresDivergentes}`
 * (meses 1–12). Só leitura. Flag/beta → 404 (exigirAcessoOrcamentoV2); não ativado → 409; Geral
 * ou espelho → 409; item fora das categorias → 404. Sempre do dono dos dados (targetUserId).
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { payload, targetUserId, actingClient } = await exigirAcessoOrcamentoV2(request);
    const { itemId } = await params;
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/cashflow/orcamento/v2/subcategorias/[itemId]/impacto',
      'GET',
    );
    await exigirOrcamentoV2Ativado(targetUserId);

    try {
      const impacto = await planejarExclusao(
        targetUserId,
        itemId,
        hojeEmSaoPauloExclusao(new Date()),
      );
      return NextResponse.json(
        {
          itemId: impacto.itemId,
          nome: impacto.nome,
          celulas: impacto.celulas,
          transacoes: impacto.transacoes,
          mesesComOrcado: impacto.mesesComOrcado,
          coresDivergentes: mesesDaApi(impacto.coresDivergentes),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (error instanceof ErroExclusaoSubcategoria) return respostaRecusa(error);
      throw error;
    }
  },
);
