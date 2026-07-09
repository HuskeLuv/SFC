import prisma from '@/lib/prisma';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

/**
 * Monta a árvore de fluxo de caixa do usuário para um ano: templates padrão
 * (userId = null) combinados com a camada de personalização do usuário
 * (override layer). Compartilhado entre `GET /api/cashflow` e o contexto de
 * planejamento para garantir a mesma fonte de verdade.
 *
 * NÃO injeta o grupo de investimentos derivado de transações (isso é feito no
 * client, em `useCashflowData`) — consumidores que só precisam de receitas e
 * despesas (sobra/despesa/despesa fixa) não dependem dele.
 */

const valuesInclude = (valuesFilter: { userId: string; year: number }) => ({
  orderBy: { rank: 'asc' as const },
  include: {
    values: {
      where: valuesFilter,
      orderBy: { month: 'asc' as const },
    },
  },
});

export async function getMergedCashflowGroups(
  targetUserId: string,
  year: number,
): Promise<CashflowGroup[]> {
  const valuesFilter = { userId: targetUserId, year };
  const items = valuesInclude(valuesFilter);

  const nestedInclude = {
    items,
    children: {
      orderBy: { orderIndex: 'asc' as const },
      include: {
        items,
        children: {
          orderBy: { orderIndex: 'asc' as const },
          include: { items },
        },
      },
    },
  };

  const [templates, customizations] = await Promise.all([
    prisma.cashflowGroup.findMany({
      where: { userId: null, parentId: null },
      orderBy: { orderIndex: 'asc' },
      include: nestedInclude,
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, parentId: null },
      orderBy: { orderIndex: 'asc' },
      include: nestedInclude,
    }),
  ]);

  return mergeTemplatesWithCustomizations(
    templates as unknown as CashflowGroup[],
    customizations as unknown as CashflowGroup[],
  );
}

/**
 * Combina templates padrão com personalizações do usuário (override layer).
 *
 * Estratégia de merge:
 * - Prioridade 1: match por `templateId` (override explícito do refactor novo).
 * - Prioridade 2 (back-compat): match por nome+path para clones físicos antigos
 *   sem `templateId` setado.
 * - Tombstone: override com `hidden=true` é omitido do resultado.
 * - Custom puro: linha do usuário com `templateId=null` e sem matching de nome
 *   é anexada como nó adicional (preserva itens/grupos criados pelo usuário).
 */
export function mergeTemplatesWithCustomizations(
  templates: CashflowGroup[],
  customizations: CashflowGroup[],
): CashflowGroup[] {
  // Fast path: usuário sem nenhuma personalização — devolve templates sem alteração.
  if (customizations.length === 0) {
    return templates.map((t) => markTemplate(t));
  }

  const userByTemplateId = new Map<string, CashflowGroup>();
  const userByPathName = new Map<string, CashflowGroup>();
  const userItemByTemplateId = new Map<string, CashflowItem>();
  const userItemByGroupAndName = new Map<string, CashflowItem>();
  const consumedGroupIds = new Set<string>();
  const consumedItemIds = new Set<string>();

  const indexUser = (groups: CashflowGroup[], parentKey: string) => {
    for (const g of groups) {
      if (g.templateId) userByTemplateId.set(g.templateId, g);
      userByPathName.set(`${parentKey}|${g.name}`, g);
      for (const it of g.items ?? []) {
        if (it.templateId) userItemByTemplateId.set(it.templateId, it);
        userItemByGroupAndName.set(`${g.id}|${it.name}`, it);
      }
      indexUser(g.children ?? [], `${parentKey}|${g.name}`);
    }
  };
  indexUser(customizations, '');

  const findOverrideGroup = (template: CashflowGroup, pathKey: string) => {
    const byId = userByTemplateId.get(template.id);
    if (byId) return byId;
    const byPath = userByPathName.get(pathKey);
    return byPath && !byPath.templateId ? byPath : undefined;
  };

  const findOverrideItem = (
    templateItem: CashflowItem,
    overrideGroup: CashflowGroup | undefined,
  ) => {
    const byId = userItemByTemplateId.get(templateItem.id);
    if (byId) return byId;
    if (!overrideGroup) return undefined;
    const byName = userItemByGroupAndName.get(`${overrideGroup.id}|${templateItem.name}`);
    return byName && !byName.templateId ? byName : undefined;
  };

  const mergeGroup = (template: CashflowGroup, parentKey: string): CashflowGroup | null => {
    const pathKey = `${parentKey}|${template.name}`;
    const override = findOverrideGroup(template, pathKey);
    if (override?.hidden) return null;
    if (override) consumedGroupIds.add(override.id);

    const mergedItems: CashflowItem[] = [];
    for (const tplItem of template.items ?? []) {
      const userItem = findOverrideItem(tplItem, override);
      if (userItem?.hidden) continue;
      if (userItem) {
        consumedItemIds.add(userItem.id);
        mergedItems.push({
          ...tplItem,
          id: userItem.id,
          userId: userItem.userId,
          name: userItem.name,
          significado: userItem.significado,
          rank: userItem.rank,
          values: userItem.values ?? [],
          templateId: userItem.templateId ?? tplItem.id,
          hidden: false,
          isTemplate: false,
        });
      } else {
        mergedItems.push({ ...tplItem, isTemplate: true });
      }
    }

    if (override) {
      for (const userItem of override.items ?? []) {
        if (consumedItemIds.has(userItem.id)) continue;
        if (userItem.hidden) continue;
        if (userItem.templateId) continue;
        consumedItemIds.add(userItem.id);
        mergedItems.push({ ...userItem, isTemplate: false });
      }
    }

    const mergedChildren: CashflowGroup[] = [];
    for (const tplChild of template.children ?? []) {
      const merged = mergeGroup(tplChild, pathKey);
      if (merged) mergedChildren.push(merged);
    }

    if (override) {
      for (const userChild of override.children ?? []) {
        if (consumedGroupIds.has(userChild.id)) continue;
        if (userChild.hidden) continue;
        if (userChild.templateId) continue;
        consumedGroupIds.add(userChild.id);
        mergedChildren.push(buildPureCustomTree(userChild));
      }
    }

    mergedChildren.sort((a, b) => a.orderIndex - b.orderIndex);
    mergedItems.sort((a, b) => a.name.localeCompare(b.name));

    const base: CashflowGroup = override
      ? {
          ...template,
          id: override.id,
          userId: override.userId,
          name: override.name,
          type: override.type,
          orderIndex: override.orderIndex,
          templateId: override.templateId ?? template.id,
          templateName: template.name,
          hidden: false,
          isTemplate: false,
        }
      : { ...template, isTemplate: true, templateName: template.name };

    // O id final do grupo pode ser o do override enquanto os itens vieram do
    // template (ou vice-versa); normaliza o groupId de todos para o id final —
    // o front agrupa mudanças por `item.groupId === group.id` e um mismatch
    // descarta a edição silenciosamente.
    return {
      ...base,
      items: mergedItems.map((i) => (i.groupId === base.id ? i : { ...i, groupId: base.id })),
      children: mergedChildren,
    };
  };

  const result: CashflowGroup[] = [];
  for (const template of templates) {
    const merged = mergeGroup(template, '');
    if (merged) result.push(merged);
  }

  for (const userGroup of customizations) {
    if (consumedGroupIds.has(userGroup.id)) continue;
    if (userGroup.hidden) continue;
    if (userGroup.templateId) continue;
    if (userGroup.parentId) continue;
    result.push(buildPureCustomTree(userGroup));
  }

  result.sort((a, b) => a.orderIndex - b.orderIndex);
  return result;
}

function markTemplate(group: CashflowGroup): CashflowGroup {
  return {
    ...group,
    isTemplate: true,
    templateName: group.name,
    items: (group.items ?? []).map((i) => ({ ...i, isTemplate: true })),
    children: (group.children ?? []).map((c) => markTemplate(c)),
  };
}

function buildPureCustomTree(g: CashflowGroup): CashflowGroup {
  return {
    ...g,
    isTemplate: false,
    items: (g.items ?? []).filter((i) => !i.hidden).map((i) => ({ ...i, isTemplate: false })),
    children: (g.children ?? []).filter((c) => !c.hidden).map((c) => buildPureCustomTree(c)),
  };
}
