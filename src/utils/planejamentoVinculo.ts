import { z } from 'zod';
import { prisma } from '@/lib/prisma';

/**
 * Vínculo de um ativo (Portfolio) com um planejamento — sonho OU aposentadoria,
 * mutuamente exclusivos. Compartilhado pelas rotas de escrita da carteira
 * (operacao/aporte) e pela edição do ativo.
 */

export const vinculoPlanejamentoFields = {
  vinculoTipo: z.enum(['sonho', 'aposentadoria']).nullable().optional(),
  vinculoObjetivoId: z.string().max(255).nullable().optional(),
};

export interface AplicarVinculoInput {
  userId: string;
  assetId: string;
  vinculoTipo: 'sonho' | 'aposentadoria' | null | undefined;
  vinculoObjetivoId: string | null | undefined;
}

export type AplicarVinculoResult =
  | { ok: true; applied: boolean; previousObjetivoId: string | null }
  | { ok: false; error: string };

/**
 * Aplica (ou remove) o vínculo no Portfolio do ativo. `vinculoTipo === undefined`
 * é no-op (campo ausente no request); `null` remove o vínculo. Valida ownership
 * do sonho. Retorna o objetivo anterior para o caller re-sincronizar a
 * linha-espelha antiga quando o vínculo muda de sonho.
 */
export async function aplicarVinculoPlanejamento(
  input: AplicarVinculoInput,
): Promise<AplicarVinculoResult> {
  const { userId, assetId, vinculoTipo, vinculoObjetivoId } = input;

  if (vinculoTipo === undefined) {
    return { ok: true, applied: false, previousObjetivoId: null };
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId, assetId },
    select: { id: true, planejamentoObjetivoId: true },
  });
  if (!portfolio) {
    return { ok: false, error: 'Ativo não encontrado na carteira' };
  }

  let data: { planejamentoObjetivoId: string | null; vinculoAposentadoria: boolean };
  if (vinculoTipo === null) {
    data = { planejamentoObjetivoId: null, vinculoAposentadoria: false };
  } else if (vinculoTipo === 'aposentadoria') {
    data = { planejamentoObjetivoId: null, vinculoAposentadoria: true };
  } else {
    if (!vinculoObjetivoId) {
      return { ok: false, error: 'vinculoObjetivoId é obrigatório para vínculo com sonho' };
    }
    const objetivo = await prisma.planejamentoObjetivo.findFirst({
      where: { id: vinculoObjetivoId, userId },
      select: { id: true },
    });
    if (!objetivo) {
      return { ok: false, error: 'Sonho não encontrado' };
    }
    data = { planejamentoObjetivoId: vinculoObjetivoId, vinculoAposentadoria: false };
  }

  await prisma.portfolio.update({ where: { id: portfolio.id }, data });

  return { ok: true, applied: true, previousObjetivoId: portfolio.planejamentoObjetivoId };
}
