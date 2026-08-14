/**
 * Parâmetros personalizáveis da metodologia de Saúde Financeira.
 *
 * GET  /api/saude-financeira/config  → { config, defaults }
 * PUT  /api/saude-financeira/config  → upsert parcial (valor = default
 *                                      remove o override)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { saudeConfigSchema, validationError } from '@/utils/validation-schemas';
import { recordChange, diffFields, SAUDE_CONFIG_FIELD_LABELS } from '@/services/changeHistory';
import { DEFAULT_SAUDE_CONFIG } from '@/services/saudeFinanceira/indicadores';
import { getSaudeConfig, saveSaudeConfig } from '@/services/saudeFinanceira/saudeFinanceiraConfig';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const config = await getSaudeConfig(targetUserId);
  return NextResponse.json({ config, defaults: DEFAULT_SAUDE_CONFIG });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const parsed = saudeConfigSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationError(parsed);
  }

  const before = await getSaudeConfig(targetUserId);
  const config = await saveSaudeConfig(targetUserId, parsed.data);

  await recordChange({
    request,
    auth,
    section: 'saude-financeira',
    action: 'saude-config.editar',
    entity: 'saude-config',
    entityId: targetUserId,
    changes: diffFields(
      before as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
      SAUDE_CONFIG_FIELD_LABELS,
    ),
  });

  return NextResponse.json({ config, defaults: DEFAULT_SAUDE_CONFIG });
});
