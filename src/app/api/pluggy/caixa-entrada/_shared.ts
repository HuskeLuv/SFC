import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordChange } from '@/services/changeHistory/recordChange';
import type { JWTPayload } from '@/utils/auth';

export const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const aplicacoesSchema = z.object({
  aplicacoes: z
    .array(z.object({ id: z.string().uuid(), itemId: z.string().min(1) }))
    .min(1)
    .max(500),
});

export function rotuloTransacoes(n: number): string {
  return n === 1 ? '1 transação' : `${n} transações`;
}

/**
 * Histórico (seção fluxo-caixa). O snapshot guarda o que o desfazer precisa:
 * ids (e, no desaplicar, o item de cada uma para reaplicar).
 */
export async function registrarAcaoBanco(
  request: NextRequest,
  user: JWTPayload,
  action: 'banco.aplicar' | 'banco.ignorar' | 'banco.desaplicar',
  data: Record<string, unknown>,
  n: number,
): Promise<void> {
  if (n === 0) return;
  await recordChange({
    request,
    auth: { payload: { id: user.id }, targetUserId: user.id, actingClient: null },
    section: 'fluxo-caixa',
    action,
    entity: 'banco-transacoes',
    entityLabel: rotuloTransacoes(n),
    snapshot: { v: 1, kind: 'banco-transacoes', data },
  });
}
