/**
 * Handlers de undo — transações importadas do banco (Caixa de entrada).
 *
 * banco.aplicar    → desaplicar os mesmos ids (células recomputadas)
 * banco.ignorar    → tirar a marca de ignorada (voltam à Caixa de entrada)
 * banco.desaplicar → reaplicar cada id no item de onde saiu
 *
 * A entrada "Desfez: …" repete o detalhe das transações da original (bancoTransacoesHelpers):
 * todas quando o desfazer pegou todas; só as desfeitas (sem o "Mais N") quando pegou parte.
 */
import { aplicar, desaplicar, ignorar } from '@/services/pluggy/caixaEntrada';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import { getChanges, getSnapshot } from '../helpers';
import { BANCO_CAMPO_PREFIXO, BANCO_CAMPO_RESTO } from '../../bancoTransacoesHelpers';
import type { FieldChange } from '../../types';

function idsDoSnapshot(ctx: UndoContext): string[] {
  const snap = getSnapshot(ctx.entry);
  const ids = (snap?.data as { ids?: unknown } | undefined)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string')) {
    throw new UndoError(400, 'Snapshot sem as transações', 'UNDO_MISSING_DATA');
  }
  return ids as string[];
}

const rotulo = (n: number) => (n === 1 ? '1 transação' : `${n} transações`);

/** Detalhe da entrada original restrito ao que foi desfeito; `undefined` sem detalhe. */
export function detalheDesfeito(
  ctx: UndoContext,
  idsDesfeitos: string[],
  totalOriginal: number,
): FieldChange[] | undefined {
  const changes = getChanges(ctx.entry);
  if (changes.length === 0) return undefined;
  if (idsDesfeitos.length >= totalOriginal) return changes;
  const desfeitos = new Set(idsDesfeitos.map((id) => `${BANCO_CAMPO_PREFIXO}${id}`));
  const parte = changes.filter((c) => c.field !== BANCO_CAMPO_RESTO && desfeitos.has(c.field));
  return parte.length > 0 ? parte : undefined;
}

const bancoAplicar: UndoDefinition = {
  strategy: 'custom',
  requires: { snapshot: true },
  async execute(ctx: UndoContext): Promise<UndoOutcome> {
    const ids = idsDoSnapshot(ctx);
    const r = await desaplicar(ctx.auth.targetUserId, ids);
    if (r.aplicadas === 0) throw new UndoError(409, 'As transações já não estão no fluxo');
    return {
      entityLabel: rotulo(r.aplicadas),
      changes: detalheDesfeito(ctx, r.ids ?? [], ids.length),
    };
  },
};

const bancoIgnorar: UndoDefinition = {
  strategy: 'custom',
  requires: { snapshot: true },
  async execute(ctx: UndoContext): Promise<UndoOutcome> {
    const pedidos = idsDoSnapshot(ctx);
    const ids = await ignorar(ctx.auth.targetUserId, pedidos, false);
    if (ids.length === 0) throw new UndoError(409, 'As transações já não estão ignoradas');
    return { entityLabel: rotulo(ids.length), changes: detalheDesfeito(ctx, ids, pedidos.length) };
  },
};

const bancoDesaplicar: UndoDefinition = {
  strategy: 'custom',
  requires: { snapshot: true },
  async execute(ctx: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(ctx.entry);
    const aplicacoes = (snap?.data as { aplicacoes?: unknown } | undefined)?.aplicacoes;
    if (
      !Array.isArray(aplicacoes) ||
      aplicacoes.length === 0 ||
      !aplicacoes.every((a) => a && typeof a.id === 'string' && typeof a.itemId === 'string')
    ) {
      throw new UndoError(400, 'Snapshot sem as linhas de origem', 'UNDO_MISSING_DATA');
    }
    try {
      const r = await aplicar(
        ctx.auth.targetUserId,
        aplicacoes as Array<{ id: string; itemId: string }>,
      );
      return {
        entityLabel: rotulo(r.aplicadas),
        changes: detalheDesfeito(ctx, r.ids ?? [], aplicacoes.length),
      };
    } catch (error: unknown) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 409 || status === 404 || status === 400) {
        throw new UndoError(409, 'Alguma transação já foi aplicada ou a linha não existe mais');
      }
      throw error;
    }
  },
};

export const BANCO_IMPORTACAO_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'banco.aplicar': bancoAplicar,
  'banco.ignorar': bancoIgnorar,
  'banco.desaplicar': bancoDesaplicar,
};
