import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordChange } from '@/services/changeHistory/recordChange';
import {
  bancoTransacoesChanges,
  carregarTransacoesBanco,
  type AcaoBanco,
} from '@/services/changeHistory/bancoTransacoesHelpers';
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
 * ids (e, no desaplicar, o item de cada uma para reaplicar). `changes` traz o detalhe de cada
 * transação (data, descrição, valor, conta e, no lançar/tirar, a linha e o mês) para a tela —
 * `detalhe.ids` são as transações afetadas e `detalhe.linhaPorId` (tirar do fluxo) a linha de
 * onde cada uma saiu.
 */
export async function registrarAcaoBanco(
  request: NextRequest,
  user: JWTPayload,
  action: AcaoBanco,
  data: Record<string, unknown>,
  n: number,
  detalhe?: { ids: string[]; linhaPorId?: Map<string, string | null> },
): Promise<void> {
  if (n === 0) return;
  const transacoes = detalhe
    ? await carregarTransacoesBanco(user.id, detalhe.ids, detalhe.linhaPorId)
    : [];
  const changes = transacoes.length > 0 ? bancoTransacoesChanges(action, transacoes) : undefined;
  await recordChange({
    request,
    auth: { payload: { id: user.id }, targetUserId: user.id, actingClient: null },
    section: 'fluxo-caixa',
    action,
    entity: 'banco-transacoes',
    entityLabel: rotuloTransacoes(n),
    changes,
    snapshot: { v: 1, kind: 'banco-transacoes', data },
  });
}
