import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/rateLimit';
import type { ChangeSection, FieldChange } from './types';

/**
 * Subconjunto estrutural de AuthWithActingResult (src/utils/auth.ts) —
 * passe o resultado de requireAuthWithActing direto.
 */
interface RecordChangeAuth {
  payload: { id: string };
  targetUserId: string;
  actingClient: { id: string } | null;
}

export interface RecordChangeParams {
  request: NextRequest;
  auth: RecordChangeAuth;
  section: ChangeSection;
  /** Chave verbal, ex. 'transacao.editar' — renderizada em pt-BR no cliente. */
  action: string;
  entity?: string;
  entityId?: string;
  /** Snapshot legível ("PETR4", "Viagem Europa") — sobrevive à exclusão da entidade. */
  entityLabel?: string;
  /** Pares antes/depois (via diffFields). `[]` = edição no-op → não grava. */
  changes?: FieldChange[];
}

/**
 * Registra uma alteração no histórico visível ao usuário (user_change_logs).
 *
 * - Best-effort: NUNCA lança — falha de log não pode quebrar a mutação.
 * - Chamar somente APÓS a mutação ter sucesso, fora de qualquer $transaction.
 * - Dados sensíveis: nunca passar senha/hash/segredo TOTP em `changes`;
 *   troca de senha registra apenas a ação ('senha.alterar'), sem valores.
 */
export async function recordChange({
  request,
  auth,
  section,
  action,
  entity,
  entityId,
  entityLabel,
  changes,
}: RecordChangeParams): Promise<void> {
  try {
    if (changes && changes.length === 0) return;

    const ip = getClientIp(request);

    await prisma.userChangeLog.create({
      data: {
        userId: auth.targetUserId,
        actorId: auth.payload.id,
        viaConsultant: auth.actingClient !== null,
        section,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        entityLabel: entityLabel ?? null,
        changes: changes ? (changes as unknown as object) : undefined,
        ipAddress: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
      },
    });
  } catch (error) {
    logger.error('[ChangeHistory] Erro ao registrar alteração:', error);
  }
}
