import { NextRequest, NextResponse } from 'next/server';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import {
  ErroExclusaoSubcategoria,
  executarExclusaoSubcategoria,
} from '@/services/cashflow/orcamentoV2/excluirSubcategoria';
import {
  exigirOrcamentoV2Ativado,
  respostaRecusa,
} from '@/services/cashflow/orcamentoV2/rotaExclusao';
import { checkOrcamentoAlertasSafe } from '@/services/cashflow/orcamentoAlertas';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * DELETE /api/cashflow/orcamento/v2/subcategorias/[itemId] — exclui a subcategoria fundindo-a na
 * Geral da categoria (R-12, desenho técnico §6.2/§6.3). É o mesmo `executarExclusaoSubcategoria`
 * da Planilha (batch-update/update), então o resultado é idêntico nas duas telas (D11).
 *
 * 200 `{celulasMovidas, celulasSomadas, transacoesMovidas}`; 409 Geral, espelho ou
 * `cores_divergentes` (com `meses` 1–12, Q5); 404 item fora das categorias. Flag/beta → 404; não
 * ativado → 409. O histórico `orcamento.subcategoria.excluir` (com Desfazer) é gravado depois do
 * commit; CSRF pelo middleware.
 */
export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const auth = await exigirAcessoOrcamentoV2(request);
    const { payload, targetUserId, actingClient } = auth;
    const { itemId } = await params;
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/cashflow/orcamento/v2/subcategorias/[itemId]',
      'DELETE',
    );
    await exigirOrcamentoV2Ativado(targetUserId);

    let resultado;
    try {
      resultado = await executarExclusaoSubcategoria(targetUserId, itemId, {
        contexto: { request, auth },
      });
    } catch (error) {
      if (error instanceof ErroExclusaoSubcategoria) return respostaRecusa(error);
      throw error;
    }
    // `null` só sai na delegação da Planilha; aqui é defesa.
    if (!resultado) {
      return NextResponse.json({ error: 'Subcategoria não encontrada' }, { status: 404 });
    }

    await recomputeEvolucaoSnapshotsSafe(targetUserId, new Date(0));
    await checkOrcamentoAlertasSafe(targetUserId);

    return NextResponse.json({
      celulasMovidas: resultado.celulasMovidas,
      celulasSomadas: resultado.celulasSomadas,
      transacoesMovidas: resultado.transacoesMovidas,
    });
  },
);
