import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import {
  exigirAcessoOrcamentoV2,
  limparCacheAcessoOrcamentoV2,
} from '@/services/cashflow/orcamentoV2/acesso';
import { ativarOrcamentoV2 } from '@/services/cashflow/orcamentoV2/ativacao';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * POST /api/cashflow/orcamento/v2/ativar — ativa o Orçamento v2 do DONO DOS DADOS (targetUserId)
 * com as mesmas fases do script (desenho técnico §4): advisory lock por usuário, estrutura,
 * orçados, verificação e compensação. Idempotente: já ativado → 200 `ja_ativado` (0 mudanças).
 * Serve ao ACESSO=todos (E5); na fase beta a ativação é feita só pelo script.
 *
 * Nunca adota órfãs nem força sugestões (só o automático para usuário sem despesas, Q9/Q17).
 * Flag desligada ou fora do beta → 404 (exigirAcessoOrcamentoV2). Abortado (valores em
 * item-template, orçados sem ativação) → 409; compensado (verificação divergiu) → 500.
 * Responde só o resumo (status, motivo, contagens), não o plano.
 */
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await exigirAcessoOrcamentoV2(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento/v2/ativar',
    'POST',
  );

  const relatorio = await ativarOrcamentoV2(targetUserId, { dryRun: false });
  limparCacheAcessoOrcamentoV2(targetUserId);

  const corpo = {
    status: relatorio.status,
    motivo: relatorio.motivo,
    mudancas: relatorio.mudancas,
    divergencias: relatorio.divergencias.length,
  };
  if (relatorio.status === 'abortado') {
    return NextResponse.json({ error: 'Ativação não aplicada', ...corpo }, { status: 409 });
  }
  if (relatorio.status === 'compensado') {
    logger.error('Ativação do Orçamento v2 compensada', {
      userId: targetUserId,
      motivo: relatorio.motivo,
      divergencias: relatorio.divergencias.slice(0, 20),
    });
    return NextResponse.json({ error: 'Ativação desfeita', ...corpo }, { status: 500 });
  }
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
