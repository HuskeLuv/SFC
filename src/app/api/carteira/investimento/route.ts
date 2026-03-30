import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { investimentoCreateSchema, validationError } from '@/utils/validation-schemas';
import { parsePaginationParams, paginatedResponse } from '@/utils/pagination';

import { withErrorHandler } from '@/utils/apiErrorHandler';
// GET - Buscar investimentos categorizados do usuário
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar investimentos do usuário (grupos tipo 'investimento')
  // Buscar templates e personalizações
  const investmentGroupsTemplate = await prisma.cashflowGroup.findMany({
    where: {
      userId: null,
      type: 'investimento',
    },
    include: {
      items: {
        include: {
          values: {
            where: {
              userId: targetUserId,
            },
          },
        },
      },
    },
  });

  const investmentGroupsCustom = await prisma.cashflowGroup.findMany({
    where: {
      userId: targetUserId,
      type: 'investimento',
    },
    include: {
      items: {
        include: {
          values: {
            where: {
              userId: targetUserId,
            },
          },
        },
      },
    },
  });

  // Mesclar grupos (personalizações têm prioridade)
  const allInvestmentGroups = [...investmentGroupsCustom];
  const templateMap = new Map(investmentGroupsTemplate.map((g) => [g.name, g]));
  investmentGroupsCustom.forEach((custom) => templateMap.delete(custom.name));
  allInvestmentGroups.push(...Array.from(templateMap.values()));

  // Coletar todos os itens de investimento e ordenar por nome
  const investimentos = allInvestmentGroups
    .flatMap((group) => group.items || [])
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const pagination = parsePaginationParams(request);
  if (pagination) {
    const total = investimentos.length;
    const paged = investimentos.slice(pagination.skip, pagination.skip + pagination.take);
    return NextResponse.json(paginatedResponse(paged, total, pagination.page, pagination.limit));
  }

  return NextResponse.json(investimentos);
});

// POST - Adicionar novo investimento categorizado
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = investimentoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { name, descricao, significado, valor } = parsed.data;

  const itemName = name || descricao;

  // Validações
  if (!itemName) {
    return NextResponse.json(
      {
        error: 'Campos obrigatórios: name, valor',
      },
      { status: 400 },
    );
  }

  // Buscar ou criar grupo de investimentos
  let grupoInvestimentos = await prisma.cashflowGroup.findFirst({
    where: {
      userId: targetUserId,
      name: 'Investimentos',
      type: 'investimento',
    },
  });

  if (!grupoInvestimentos) {
    // Buscar template de Investimentos
    const templateGroup = await prisma.cashflowGroup.findFirst({
      where: {
        userId: null,
        name: 'Investimentos',
        type: 'investimento',
      },
    });

    if (templateGroup) {
      // Importar função de personalização
      const { personalizeGroup } = await import('@/utils/cashflowPersonalization');
      const personalizedGroupId = await personalizeGroup(templateGroup.id, targetUserId);
      grupoInvestimentos = await prisma.cashflowGroup.findUnique({
        where: { id: personalizedGroupId },
      });
    } else {
      // Criar grupo se não existir template
      grupoInvestimentos = await prisma.cashflowGroup.create({
        data: {
          userId: targetUserId,
          name: 'Investimentos',
          type: 'investimento',
          orderIndex: 999,
        },
      });
    }
  }

  // Obter maior rank do grupo
  // Criar o item de investimento
  const investimento = await prisma.cashflowItem.create({
    data: {
      userId: targetUserId, // Sempre personalizado quando criado pelo usuário
      groupId: grupoInvestimentos!.id,
      name: itemName,
      significado: significado || null,
      rank: null, // Rank agora é texto, não precisa calcular
    },
  });

  // Adicionar valor para o mês atual
  const currentYear = new Date().getFullYear();
  const monthAtual = new Date().getMonth(); // 0 = Janeiro, 11 = Dezembro

  await prisma.cashflowValue.create({
    data: {
      itemId: investimento.id,
      userId: targetUserId,
      year: currentYear,
      month: monthAtual,
      value: valor,
    },
  });

  // Buscar o investimento criado com todos os dados
  const investimentoCompleto = await prisma.cashflowItem.findUnique({
    where: { id: investimento.id },
    include: {
      values: {
        where: { userId: targetUserId },
      },
      group: true,
    },
  });

  return NextResponse.json(investimentoCompleto, { status: 201 });
});
