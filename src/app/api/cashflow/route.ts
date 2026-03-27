import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

/**
 * Combina templates padrão com personalizações do usuário
 * Personalizações têm prioridade sobre templates
 */
function mergeTemplatesWithCustomizations(
  templates: CashflowGroup[],
  customizations: CashflowGroup[],
): CashflowGroup[] {
  // Criar mapas hierárquicos de personalizações
  const customGroupMap = new Map<string, CashflowGroup>();
  const customItemMap = new Map<string, CashflowItem>(); // chave: "groupId|itemName"

  const buildMaps = (groups: CashflowGroup[], parentPath: string = '') => {
    for (const group of groups) {
      const groupKey = parentPath ? `${parentPath}|${group.name}` : group.name;
      customGroupMap.set(groupKey, group);

      // Mapear itens do grupo
      if (group.items?.length) {
        for (const item of group.items) {
          customItemMap.set(`${group.id}|${item.name}`, item);
        }
      }

      // Recursão para filhos
      if (group.children?.length) {
        buildMaps(group.children, groupKey);
      }
    }
  };

  buildMaps(customizations);

  // Mesclar grupos recursivamente
  const mergeGroup = (template: CashflowGroup, parentPath: string = ''): CashflowGroup => {
    const groupKey = parentPath ? `${parentPath}|${template.name}` : template.name;
    const custom = customGroupMap.get(groupKey);

    if (custom) {
      // Personalização encontrada - usar ela e mesclar itens e filhos
      const mergedGroup: CashflowGroup = {
        ...custom,
        items: mergeItems(template.items || [], custom.items || [], custom.id),
        children: mergeChildren(template.children || [], custom.children || [], groupKey),
      };
      return mergedGroup;
    }

    // Usar template, mas verificar se há itens personalizados que correspondem
    // Buscar grupo personalizado com mesmo nome no mesmo nível hierárquico
    // (groupKey já foi definido acima)
    const customGroupMatch = customGroupMap.get(groupKey);

    // Se encontrou grupo personalizado correspondente, mesclar seus itens
    const customItemsForThisGroup = customGroupMatch?.items || [];

    // Mesclar itens do template com itens personalizados encontrados
    const mergedItems = mergeItems(template.items || [], customItemsForThisGroup, template.id);

    const mergedGroup: CashflowGroup = {
      ...template,
      items: mergedItems,
      children: (template.children || []).map((child: CashflowGroup) =>
        mergeGroup(child, groupKey),
      ),
    };

    return mergedGroup;
  };

  // Mesclar filhos de grupos
  const mergeChildren = (
    templateChildren: CashflowGroup[],
    customChildren: CashflowGroup[],
    parentPath: string,
  ): CashflowGroup[] => {
    const result: CashflowGroup[] = [];
    const templateMap = new Map(templateChildren.map((c: CashflowGroup) => [c.name, c]));
    const customMap = new Map(customChildren.map((c: CashflowGroup) => [c.name, c]));
    const allNames = new Set([...templateMap.keys(), ...customMap.keys()]);

    for (const name of allNames) {
      const template = templateMap.get(name);
      const custom = customMap.get(name);

      if (custom) {
        // Personalização existe - usar ela
        result.push(mergeGroup(custom, parentPath));
      } else if (template) {
        // Apenas template - usar ele
        result.push(mergeGroup(template, parentPath));
      }
    }

    return result.sort((a, b) => a.orderIndex - b.orderIndex);
  };

  // Mesclar itens: personalizados substituem templates com mesmo nome
  const mergeItems = (
    templateItems: CashflowItem[],
    customItems: CashflowItem[],
    _groupId: string,
  ): CashflowItem[] => {
    const result: CashflowItem[] = [];
    const templateMap = new Map(templateItems.map((i: CashflowItem) => [i.name, i]));
    const customMap = new Map(customItems.map((i: CashflowItem) => [i.name, i]));
    const allNames = new Set([...templateMap.keys(), ...customMap.keys()]);

    for (const name of allNames) {
      const template = templateMap.get(name);
      const custom = customMap.get(name);

      if (custom) {
        // Personalização existe - usar ela (prioridade)
        result.push(custom);
      } else if (template) {
        // Apenas template - usar ele
        result.push(template);
      }
    }

    // Ordenar por nome já que rank não é mais numérico
    return result.sort((a, b) => a.name.localeCompare(b.name));
  };

  return templates.map((template) => mergeGroup(template));
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
export async function GET(request: NextRequest) {
  try {
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
  } catch (error: unknown) {
    console.error('Erro na API cashflow:', error);

    const errObj = error as { code?: string; message?: string };

    // Tratamento específico para erros de conexão do Prisma
    if (errObj.code === 'P1001' || errObj.code === 'P1000') {
      return NextResponse.json(
        {
          error: 'Erro de conexão com o banco de dados',
          message:
            'Não foi possível conectar ao servidor de banco de dados. Verifique se o banco está ativo e tente novamente.',
          code: errObj.code,
        },
        { status: 503 },
      );
    }

    // Tratamento para outros erros do Prisma
    if (errObj.code?.startsWith('P')) {
      return NextResponse.json(
        {
          error: 'Erro no banco de dados',
          message: errObj.message || 'Ocorreu um erro ao processar a requisição.',
          code: errObj.code,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: 'Erro interno do servidor',
        message: errObj.message || 'Ocorreu um erro inesperado.',
      },
      { status: 500 },
    );
  }
}

// POST pode ser adaptado depois para criar itens/valores/grupos
