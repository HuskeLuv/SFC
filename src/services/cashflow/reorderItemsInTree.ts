import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

/**
 * Helpers puros do drag-and-drop de linhas do fluxo de caixa (set/2026).
 * A linha só anda dentro do próprio grupo/subgrupo; o backend
 * (`/api/cashflow/item/reorder`) recebe a lista completa de ids na nova ordem.
 */

/** Busca um grupo (em qualquer nível) pelo id. */
export function findGroupInTree(groups: CashflowGroup[], groupId: string): CashflowGroup | null {
  for (const group of groups) {
    if (group.id === groupId) return group;
    const found = findGroupInTree(group.children ?? [], groupId);
    if (found) return found;
  }
  return null;
}

/** Move o elemento de `from` para `to` (cópia; índices inválidos devolvem cópia igual). */
export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Devolve a nova ordem de ids do grupo ao soltar `activeId` sobre `overId`.
 * null quando o movimento é inválido (ids de grupos diferentes, ids
 * desconhecidos ou soltar no próprio lugar).
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  return moveIndex(ids, from, to);
}

/**
 * Cópia da árvore com os itens do grupo `groupId` na ordem `orderedIds`
 * (orderIndex 1..N, igual ao que o backend grava). Ids que não estiverem em
 * `orderedIds` vão pro fim, preservando a ordem atual. Grupos não tocados são
 * reaproveitados por referência (React.memo das subtrees continua valendo).
 */
export function reorderItemsInTree(
  groups: CashflowGroup[],
  groupId: string,
  orderedIds: string[],
): CashflowGroup[] {
  const position = new Map(orderedIds.map((id, index) => [id, index]));
  const sortItems = (items: CashflowItem[]): CashflowItem[] =>
    items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const pa = position.get(a.item.id) ?? orderedIds.length + a.index;
        const pb = position.get(b.item.id) ?? orderedIds.length + b.index;
        return pa - pb;
      })
      .map(({ item }, index) => ({ ...item, orderIndex: index + 1 }));

  const walk = (list: CashflowGroup[]): CashflowGroup[] => {
    let changed = false;
    const next = list.map((group) => {
      if (group.id === groupId) {
        changed = true;
        return { ...group, items: sortItems(group.items ?? []) };
      }
      const children = group.children?.length ? walk(group.children) : group.children;
      if (children !== group.children) {
        changed = true;
        return { ...group, children };
      }
      return group;
    });
    return changed ? next : list;
  };

  return walk(groups);
}
