import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

import { withErrorHandler } from '@/utils/apiErrorHandler';
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
function mergeTemplatesWithCustomizations(
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
          hidden: false,
          isTemplate: false,
        }
      : { ...template, isTemplate: true };

    return { ...base, items: mergedItems, children: mergedChildren };
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

/**
 * GET /api/cashflow
 *
 * Retorna a hierarquia completa de fluxo de caixa:
 * - Grupos → Subgrupos → Itens → Valores
 *
 * Combina templates padrão (userId = null) com personalizações (userId = currentUser.id),
 * dando preferência aos personalizados.
 *
 * Query params:
 * - year (opcional): Filtrar valores por ano. Padrão: ano atual
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  // Registrar acesso se estiver personificado
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow',
    'GET',
    yearParam ? { year: yearParam } : {},
  );

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (isNaN(year)) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  // Construir filtro de valores por ano
  const valuesFilter = {
    userId: targetUserId,
    year: year,
  };

  // Buscar templates padrão (userId = null) com hierarquia completa
  const templates = await prisma.cashflowGroup.findMany({
    where: {
      userId: null,
      parentId: null,
    },
    orderBy: { orderIndex: 'asc' },
    include: {
      items: {
        orderBy: { rank: 'asc' },
        include: {
          values: {
            where: valuesFilter,
            orderBy: { month: 'asc' },
          },
        },
      },
      children: {
        orderBy: { orderIndex: 'asc' },
        include: {
          items: {
            orderBy: { rank: 'asc' },
            include: {
              values: {
                where: valuesFilter,
                orderBy: { month: 'asc' },
              },
            },
          },
          children: {
            orderBy: { orderIndex: 'asc' },
            include: {
              items: {
                orderBy: { rank: 'asc' },
                include: {
                  values: {
                    where: valuesFilter,
                    orderBy: { month: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Buscar personalizações do usuário (userId = payload.id) com hierarquia completa
  const customizations = await prisma.cashflowGroup.findMany({
    where: {
      userId: targetUserId,
      parentId: null,
    },
    orderBy: { orderIndex: 'asc' },
    include: {
      items: {
        orderBy: { rank: 'asc' },
        include: {
          values: {
            where: valuesFilter,
            orderBy: { month: 'asc' },
          },
        },
      },
      children: {
        orderBy: { orderIndex: 'asc' },
        include: {
          items: {
            orderBy: { rank: 'asc' },
            include: {
              values: {
                where: valuesFilter,
                orderBy: { month: 'asc' },
              },
            },
          },
          children: {
            orderBy: { orderIndex: 'asc' },
            include: {
              items: {
                orderBy: { rank: 'asc' },
                include: {
                  values: {
                    where: valuesFilter,
                    orderBy: { month: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Mesclar templates com personalizações (personalizações têm prioridade)
  const mergedGroups = mergeTemplatesWithCustomizations(templates, customizations);

  return NextResponse.json({
    year,
    groups: mergedGroups,
  });
});

// POST pode ser adaptado depois para criar itens/valores/grupos
