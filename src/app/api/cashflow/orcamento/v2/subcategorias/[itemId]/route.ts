import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import {
  ErroEscritaOrcamento,
  marcarFixa,
  respostaDaSubcategoria,
} from '@/services/cashflow/orcamentoV2/escritaOrcado';
import {
  anoSchema,
  fonteSchema,
  lerCorpo,
  mesSchema,
  respostaErroEscrita,
} from '@/services/cashflow/orcamentoV2/esquemasEscrita';
import { hojeEmSaoPaulo } from '@/services/cashflow/orcamentoV2/carregarOrcamento';
import { validationError } from '@/utils/validation-schemas';
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
export const runtime = 'nodejs';

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

const fixaBodySchema = z.object({
  /** `null` = volta ao padrão do catálogo (R-07). */
  fixa: z.boolean().nullable(),
  /** Mês (1–12) e fonte só para o recálculo da resposta; padrão = hoje (SP) e a fonte das prefs. */
  ano: anoSchema.optional(),
  mes: mesSchema.optional(),
  fonte: fonteSchema.optional(),
});

/**
 * PATCH /api/cashflow/orcamento/v2/subcategorias/[itemId] — `{fixa}` marca/desmarca a
 * subcategoria como fixa (R-07, "Marcar como fixa" do menu ⋯, Q12). 200 `{subcategoria,
 * categoria, resumo}` do mês pedido (padrão: o corrente) recalculados no servidor; 400 corpo
 * inválido ou categoria de poupança (sempre fixa); 404 item oculto/fora das categorias/de outro
 * usuário. Flag/beta → 404; não ativado → 409. Item-template é personalizado antes. Histórico
 * `orcamento.subcategoria.fixa` (sem Desfazer); CSRF pelo middleware.
 */
export const PATCH = withErrorHandler(
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
      'PATCH',
    );
    await exigirOrcamentoV2Ativado(targetUserId);

    const corpo = await lerCorpo(request);
    if (!corpo) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    const parsed = fixaBodySchema.safeParse(corpo);
    if (!parsed.success) return validationError(parsed);
    const agora = new Date();
    const hoje = hojeEmSaoPaulo(agora);
    const ano = parsed.data.ano ?? hoje.ano;
    const mes0 = parsed.data.mes !== undefined ? parsed.data.mes - 1 : hoje.mes0;

    let resultado;
    try {
      resultado = await marcarFixa(targetUserId, itemId, parsed.data.fixa, ano, {
        contexto: { request, auth },
      });
    } catch (error) {
      if (error instanceof ErroEscritaOrcamento) return respostaErroEscrita(error);
      throw error;
    }

    const resposta = await respostaDaSubcategoria(
      targetUserId,
      resultado.itemId,
      { ano, mes0, fonte: parsed.data.fonte },
      agora,
    );
    if (!resposta) {
      return NextResponse.json({ error: 'Subcategoria não encontrada' }, { status: 404 });
    }
    return NextResponse.json(resposta, { headers: { 'Cache-Control': 'no-store' } });
  },
);
