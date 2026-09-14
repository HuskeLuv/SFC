import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import {
  PLUGGY_WEBHOOK_HEADER,
  PLUGGY_WEBHOOK_IPS,
  pluggyHabilitado,
  pluggyWebhookSecret,
} from '@/lib/pluggyConfig';

/**
 * POST /api/webhooks/pluggy — receptor dos eventos do Pluggy
 * (item/created|updated|error|waiting_user_input, transactions/*, connector/status_updated…).
 *
 * Contrato do Pluggy (docs.pluggy.ai/docs/webhooks): responder 2xx em até 10 s;
 * 3 tentativas (imediata, +15 min, +2 h); 400/401/403/404/405 NÃO são retentados;
 * IP fixo de saída 52.67.145.81; o payload não é assinado — a autenticação é
 * o header customizado configurado ao criar o webhook (X-Webhook-Secret) e,
 * em produção, a origem.
 *
 * Fase de preparação (set/2026): só valida, registra e confirma. A gravação
 * em tabela + processamento por cron entram na Fase 2 (docs/analise-pluggy-set2026.md §4).
 * Não confiar no conteúdo do payload para dados: ao processar, buscar GET /items/{id}.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventoSchema = z
  .object({
    event: z.string().min(1),
    itemId: z.string().optional(),
    clientId: z.string().optional(),
    triggeredBy: z.string().optional(),
  })
  .passthrough();

export type PluggyWebhookEvento = z.infer<typeof eventoSchema>;

function segredoConfere(request: NextRequest, secret: string): boolean {
  const provided = request.headers.get(PLUGGY_WEBHOOK_HEADER) ?? '';
  const a = createHash('sha256').update(secret).digest();
  const b = createHash('sha256').update(provided).digest();
  return timingSafeEqual(a, b);
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!pluggyHabilitado()) throw new ApiError(404, 'Não encontrado');

  const secret = pluggyWebhookSecret();
  if (!secret) throw new ApiError(503, 'PLUGGY_WEBHOOK_SECRET não configurado');
  if (!segredoConfere(request, secret)) throw new ApiError(401, 'Não autorizado');

  // Em dev o webhook chega por túnel (IP de origem varia); em produção o
  // Pluggy sai sempre do mesmo IP.
  const ip = getClientIp(request);
  if (process.env.NODE_ENV === 'production' && !PLUGGY_WEBHOOK_IPS.includes(ip)) {
    throw new ApiError(401, 'Origem não permitida');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'JSON inválido');
  }
  const parsed = eventoSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Evento inválido');

  logger.info('[pluggy webhook] evento recebido', {
    event: parsed.data.event,
    itemId: parsed.data.itemId ?? null,
    triggeredBy: parsed.data.triggeredBy ?? null,
  });

  return NextResponse.json({ ok: true });
});
