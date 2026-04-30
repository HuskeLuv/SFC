import prisma from '@/lib/prisma';

// Buscar estrutura do cashflow do usuário aplicando override layer.
// Lê templates (userId=null) + linhas do usuário (userId=X) e funde:
// - Override por templateId tem prioridade. Tombstone (hidden=true) some do tree.
// - Custom puro (templateId=null, sem matching de nome) anexa ao final.
// - Fallback back-compat: clones físicos antigos (sem templateId) ainda batem por nome+path.
export async function getUserCashflowStructure(userId: string) {
  try {
    type GroupRow = Awaited<ReturnType<typeof prisma.cashflowGroup.findMany>>[number] & {
      items: {
        id: string;
        name: string;
        rank: string | null;
        significado: string | null;
        userId: string | null;
        templateId: string | null;
        hidden: boolean;
        groupId: string;
      }[];
      children: GroupRow[];
    };

    const include = {
      items: { orderBy: { rank: 'asc' as const } },
      children: {
        include: {
          items: { orderBy: { rank: 'asc' as const } },
          children: {
            include: {
              items: { orderBy: { rank: 'asc' as const } },
            },
            orderBy: { orderIndex: 'asc' as const },
          },
        },
        orderBy: { orderIndex: 'asc' as const },
      },
    };

    const [templates, userRows] = await Promise.all([
      prisma.cashflowGroup.findMany({
        where: { userId: null, parentId: null },
        include,
        orderBy: { orderIndex: 'asc' },
      }),
      prisma.cashflowGroup.findMany({
        where: { userId },
        include,
        orderBy: { orderIndex: 'asc' },
      }),
    ]);

    // Fast path: usuário sem nenhuma personalização — devolve templates direto.
    if (userRows.length === 0) {
      return (templates as GroupRow[]).map((t) => markTemplate(t));
    }

    return mergeStructure(templates as GroupRow[], userRows as GroupRow[]);
  } catch (error) {
    console.error('Erro ao buscar estrutura do usuário:', error);
    throw error;
  }
}

type MergeableItem = {
  id: string;
  name: string;
  rank: string | null;
  significado: string | null;
  userId: string | null;
  templateId: string | null;
  hidden: boolean;
  groupId: string;
};

type MergeableGroup = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  orderIndex: number;
  userId: string | null;
  templateId: string | null;
  hidden: boolean;
  items: MergeableItem[];
  children: MergeableGroup[];
};

function markTemplate<T extends MergeableGroup>(group: T): T & { isTemplate: boolean } {
  return {
    ...group,
    isTemplate: true,
    items: group.items.map((i) => ({ ...i, isTemplate: true })),
    children: group.children.map((c) => markTemplate(c)),
  } as T & { isTemplate: boolean };
}

function mergeStructure(templates: MergeableGroup[], userRows: MergeableGroup[]) {
  // Index user rows for fast lookup by templateId and by (parentId, name) for back-compat.
  const userByTemplateId = new Map<string, MergeableGroup>();
  const userByPathName = new Map<string, MergeableGroup>();
  const userItemByTemplateId = new Map<string, MergeableItem>();
  const userItemByGroupAndName = new Map<string, MergeableItem>();
  const consumedUserGroupIds = new Set<string>();
  const consumedUserItemIds = new Set<string>();

  const indexUser = (groups: MergeableGroup[], parentKey: string) => {
    for (const g of groups) {
      if (g.templateId) userByTemplateId.set(g.templateId, g);
      userByPathName.set(`${parentKey}|${g.name}`, g);
      for (const it of g.items) {
        if (it.templateId) userItemByTemplateId.set(it.templateId, it);
        userItemByGroupAndName.set(`${g.id}|${it.name}`, it);
      }
      indexUser(g.children, `${parentKey}|${g.name}`);
    }
  };
  indexUser(userRows, '');

  const mergeGroup = (template: MergeableGroup, parentKey: string): MergeableGroup | null => {
    const pathKey = `${parentKey}|${template.name}`;
    // Prioridade 1: match por templateId (override explícito).
    // Prioridade 2: clone físico antigo sem templateId, casado por (parentPath, name).
    const override =
      userByTemplateId.get(template.id) ??
      (() => {
        const candidate = userByPathName.get(pathKey);
        return candidate && !candidate.templateId ? candidate : undefined;
      })();

    if (override?.hidden) return null;
    if (override) consumedUserGroupIds.add(override.id);

    const baseGroup: MergeableGroup = override
      ? {
          ...template,
          id: override.id,
          userId: override.userId,
          name: override.name,
          type: override.type,
          orderIndex: override.orderIndex,
          templateId: override.templateId ?? template.id,
          hidden: false,
        }
      : { ...template };

    // Map override-item lookup against ORIGINAL template item ids (templateId match).
    // Para back-compat (clone físico antigo), buscar por nome dentro do override-group.
    const matchUserItem = (templateItem: MergeableItem): MergeableItem | undefined => {
      const byTpl = userItemByTemplateId.get(templateItem.id);
      if (byTpl) return byTpl;
      if (override) {
        const byName = userItemByGroupAndName.get(`${override.id}|${templateItem.name}`);
        if (byName && !byName.templateId) return byName;
      }
      return undefined;
    };

    const mergedItems: MergeableItem[] = [];
    for (const tplItem of template.items) {
      const userItem = matchUserItem(tplItem);
      if (userItem?.hidden) continue;
      if (userItem) {
        consumedUserItemIds.add(userItem.id);
        mergedItems.push({
          ...tplItem,
          id: userItem.id,
          userId: userItem.userId,
          name: userItem.name,
          significado: userItem.significado,
          rank: userItem.rank,
          templateId: userItem.templateId ?? tplItem.id,
          hidden: false,
          isTemplate: false,
        } as MergeableItem & { isTemplate: boolean });
      } else {
        mergedItems.push({ ...tplItem, isTemplate: true } as MergeableItem & {
          isTemplate: boolean;
        });
      }
    }

    // Custom-puro items dentro do override-group (templateId=null, sem match com template).
    if (override) {
      for (const userItem of override.items) {
        if (consumedUserItemIds.has(userItem.id)) continue;
        if (userItem.hidden) continue;
        if (userItem.templateId) continue; // já era override; se chegou aqui é porque template sumiu
        consumedUserItemIds.add(userItem.id);
        mergedItems.push({ ...userItem, isTemplate: false } as MergeableItem & {
          isTemplate: boolean;
        });
      }
    }

    const mergedChildren: MergeableGroup[] = [];
    for (const tplChild of template.children) {
      const merged = mergeGroup(tplChild, pathKey);
      if (merged) mergedChildren.push(merged);
    }

    // Custom-puro grupos-filhos dentro do override-group.
    if (override) {
      for (const userChild of override.children) {
        if (consumedUserGroupIds.has(userChild.id)) continue;
        if (userChild.hidden) continue;
        if (userChild.templateId) continue;
        consumedUserGroupIds.add(userChild.id);
        mergedChildren.push(buildPureCustomTree(userChild));
      }
    }

    mergedChildren.sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      ...baseGroup,
      items: mergedItems,
      children: mergedChildren,
      isTemplate: !override,
    } as MergeableGroup & { isTemplate: boolean };
  };

  const buildPureCustomTree = (g: MergeableGroup): MergeableGroup =>
    ({
      ...g,
      items: g.items
        .filter((i) => !i.hidden)
        .map((i) => ({ ...i, isTemplate: false }) as MergeableItem & { isTemplate: boolean }),
      children: g.children.filter((c) => !c.hidden).map((c) => buildPureCustomTree(c)),
      isTemplate: false,
    }) as MergeableGroup & { isTemplate: boolean };

  const result: MergeableGroup[] = [];
  for (const template of templates) {
    const merged = mergeGroup(template, '');
    if (merged) result.push(merged);
  }

  // Custom-puro grupos no nível raiz (templateId=null, parentId=null, não consumidos).
  for (const userGroup of userRows) {
    if (consumedUserGroupIds.has(userGroup.id)) continue;
    if (userGroup.hidden) continue;
    if (userGroup.templateId) continue;
    if (userGroup.parentId) continue;
    result.push(buildPureCustomTree(userGroup));
  }

  result.sort((a, b) => a.orderIndex - b.orderIndex);
  return result;
}
