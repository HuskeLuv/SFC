import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { lerPlanilhaImport } from '@/services/cashflow/import/importRequest';
import { mapFlcToCashflow } from '@/services/cashflow/import/mapFlcToCashflow';
import {
  executeFlcImportPlan,
  type FlcPoliticaConflito,
} from '@/services/cashflow/import/executeFlcImportPlan';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import { recordChange } from '@/services/changeHistory';

/**
 * POST /api/cashflow/import/commit
 *
 * Executa a importação da planilha FLC. Mesmo multipart do preview (`file`,
 * `ano`) + `politicaConflito` opcional ('sobrescrever' default | 'manter').
 * O plano é SEMPRE recalculado aqui contra a árvore atual do usuário — o
 * client não manda plano serializado (evita plano velho/adulterado); o
 * preview é só visualização do mesmo cálculo. Idempotente: reimportar o
 * mesmo arquivo casa itens por nome e upserta valores na chave composta.
 */

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/import/commit',
    'POST',
  );

  const lido = await lerPlanilhaImport(request);
  if (!lido.ok) return lido.response;
  const { ano, arquivo } = lido;

  const politicaRaw = lido.form.get('politicaConflito');
  if (politicaRaw !== null && politicaRaw !== 'sobrescrever' && politicaRaw !== 'manter') {
    return NextResponse.json(
      { error: 'politicaConflito inválida: use "sobrescrever" ou "manter"' },
      { status: 400 },
    );
  }
  const politica: FlcPoliticaConflito = politicaRaw === 'manter' ? 'manter' : 'sobrescrever';

  const arvore = await getMergedCashflowGroups(targetUserId, ano);
  const plan = mapFlcToCashflow(lido.parse, arvore);
  const relatorio = await executeFlcImportPlan(plan, targetUserId, ano, politica);

  if (relatorio.celulasGravadas > 0 || relatorio.itensCriados > 0) {
    // Import grava valores do ano inteiro (meses passados incluídos) →
    // snapshots travados da Evolução do Patrimônio do ano em diante precisam
    // ser recomputados.
    await recomputeEvolucaoSnapshotsSafe(targetUserId, new Date(Date.UTC(ano, 0, 1)));
    await recordChange({
      request,
      auth,
      section: 'fluxo-caixa',
      action: 'fluxo.importar-planilha',
      entity: 'importacao',
      entityLabel: `a planilha "${arquivo}" (${ano}): ${relatorio.celulasGravadas} células, ${relatorio.itensCriados} itens novos`,
    });
  }

  // árvore pós-import para o client gravar direto no cache (padrão batch-update)
  const groups = await getMergedCashflowGroups(targetUserId, ano);

  return NextResponse.json({
    success: relatorio.erros.length === 0,
    ano,
    arquivo,
    relatorio,
    resumo: plan.resumo,
    avisos: plan.avisos,
    ignorados: plan.ignorados,
    groups,
  });
});
