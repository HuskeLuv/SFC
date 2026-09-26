import type { CashflowGroup } from '@/types/cashflow';
import { getGroupCapabilities } from '@/lib/cashflow/itemCapabilities';

/**
 * Destinos do "Mover para outra seção" do sheet da linha (PWA fase 2). Mesma regra do alvo de
 * soltar do arrastar no desktop (`acceptsDrop` do GroupHeader, via `getGroupCapabilities`):
 * grupos-folha de entrada/despesa — nunca Aporte/Resgate nem Conta Corrente — menos o grupo atual.
 */

export interface MoveTarget {
  groupId: string;
  /** Nome do grupo de destino. */
  name: string;
  /** Trilha dos grupos acima (ex.: 'Despesas › Despesas Variáveis'); '' na raiz. */
  trail: string;
  /** Tipo do grupo ('entrada' | 'despesa'). */
  type: string;
  /** Quantas linhas o destino já tem. */
  itemCount: number;
}

export const TRAIL_SEPARATOR = ' › ';

/** Destinos na ordem da planilha (pré-ordem da árvore). */
export function listMoveTargets(groups: CashflowGroup[], currentGroupId: string): MoveTarget[] {
  const out: MoveTarget[] = [];
  const walk = (list: CashflowGroup[], ancestors: string[]) => {
    for (const group of list) {
      if (group.hidden) continue;
      if (group.id !== currentGroupId && getGroupCapabilities(group).acceptsMovedRow) {
        out.push({
          groupId: group.id,
          name: group.name,
          trail: ancestors.join(TRAIL_SEPARATOR),
          type: group.type,
          itemCount: (group.items ?? []).filter((i) => !i.hidden).length,
        });
      }
      if (group.children?.length) walk(group.children, [...ancestors, group.name]);
    }
  };
  walk(groups, []);
  return out;
}

/** Minúsculas sem acento, para a busca. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Filtra pelo nome ou pela trilha (sem acento, sem caixa). Busca vazia = todos. */
export function filterMoveTargets(targets: MoveTarget[], query: string): MoveTarget[] {
  const q = normalizeSearch(query);
  if (!q) return targets;
  return targets.filter(
    (t) => normalizeSearch(t.name).includes(q) || normalizeSearch(t.trail).includes(q),
  );
}

/** Agrupa pela trilha, mantendo a ordem da planilha. */
export function groupMoveTargetsByTrail(
  targets: MoveTarget[],
): Array<{ trail: string; targets: MoveTarget[] }> {
  const sections: Array<{ trail: string; targets: MoveTarget[] }> = [];
  for (const target of targets) {
    const last = sections[sections.length - 1];
    if (last && last.trail === target.trail) last.targets.push(target);
    else sections.push({ trail: target.trail, targets: [target] });
  }
  return sections;
}
