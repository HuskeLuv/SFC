import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

/**
 * Helpers puros do drag-and-drop de linhas do fluxo de caixa (set/2026).
 * Dentro do grupo o backend (`/api/cashflow/item/reorder`) recebe a lista
 * completa de ids na nova ordem; entre grupos (`/api/cashflow/item/move`,
 * 24/09/2026) recebe a lista do destino já com a linha movida.
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

/**
 * Lista de ids do destino com `itemId` inserido antes/depois de `overId`;
 * sem `overId` (soltou no cabeçalho do grupo) vai pro fim.
 */
export function insertId(
  ids: string[],
  itemId: string,
  overId: string | null,
  after: boolean,
): string[] {
  const next = ids.filter((id) => id !== itemId);
  const at = overId ? next.indexOf(overId) : -1;
  if (at < 0) return [...next, itemId];
  next.splice(after ? at + 1 : at, 0, itemId);
  return next;
}

/**
 * Cópia da árvore com `itemId` tirado do grupo atual e posto em `toGroupId`
 * na ordem `orderedIds` (groupId e orderIndex atualizados). Sem o item ou o
 * destino na árvore, devolve a árvore como veio.
 */
export function moveItemInTree(
  groups: CashflowGroup[],
  itemId: string,
  toGroupId: string,
  orderedIds: string[],
): CashflowGroup[] {
  let moving: CashflowItem | null = null;
  const findItem = (list: CashflowGroup[]) => {
    for (const g of list) {
      const hit = (g.items ?? []).find((i) => i.id === itemId);
      if (hit) {
        moving = hit;
        return;
      }
      findItem(g.children ?? []);
      if (moving) return;
    }
  };
  findItem(groups);
  if (!moving || !findGroupInTree(groups, toGroupId)) return groups;
  const moved: CashflowItem = { ...(moving as CashflowItem), groupId: toGroupId };

  const walk = (list: CashflowGroup[]): CashflowGroup[] => {
    let changed = false;
    const next = list.map((group) => {
      const hasItem = (group.items ?? []).some((i) => i.id === itemId);
      let items = group.items;
      if (group.id === toGroupId) {
        items = [...(group.items ?? []).filter((i) => i.id !== itemId), moved];
      } else if (hasItem) {
        items = (group.items ?? []).filter((i) => i.id !== itemId);
      }
      const children = group.children?.length ? walk(group.children) : group.children;
      if (items === group.items && children === group.children) return group;
      changed = true;
      return { ...group, items, children };
    });
    return changed ? next : list;
  };

  return reorderItemsInTree(walk(groups), toGroupId, orderedIds);
}
