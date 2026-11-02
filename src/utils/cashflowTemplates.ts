import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { DESPESAS_FINANCEIRAS_ITEMS, LINHAS_PADRAO } from '@/lib/cashflow/linhasPadrao';

export { DESPESAS_FINANCEIRAS_ITEMS };
export type { LinhaTemplate } from '@/lib/cashflow/linhasPadrao';

// ===== CASHFLOW TEMPLATES STRUCTURE =====

// Grupos aqui; as linhas de cada grupo ficam em `lib/cashflow/linhasPadrao.ts` (puro, também
// usado pelo catálogo do Orçamento v2).
export const CASHFLOW_TEMPLATE_STRUCTURE = {
  grupos: [
    { name: 'Entradas', orderIndex: 1, parentId: null, type: 'entrada' as const },
    { name: 'Entradas Fixas', orderIndex: 1, parentId: 'Entradas', type: 'entrada' as const },
    { name: 'Entradas Variáveis', orderIndex: 2, parentId: 'Entradas', type: 'entrada' as const },
    {
      name: 'Sem Tributação',
      orderIndex: 1,
      parentId: 'Entradas Variáveis',
      type: 'entrada' as const,
    },
    {
      name: 'Com Tributação',
      orderIndex: 2,
      parentId: 'Entradas Variáveis',
      type: 'entrada' as const,
    },
    { name: 'Despesas', orderIndex: 2, parentId: null, type: 'despesa' as const },
    { name: 'Despesas Fixas', orderIndex: 1, parentId: 'Despesas', type: 'despesa' as const },
    { name: 'Habitação', orderIndex: 1, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Transporte', orderIndex: 2, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Saúde', orderIndex: 3, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Educação', orderIndex: 4, parentId: 'Despesas Fixas', type: 'despesa' as const },
    {
      name: 'Animais de Estimação',
      orderIndex: 5,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Despesas Pessoais',
      orderIndex: 6,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    { name: 'Lazer', orderIndex: 7, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Impostos', orderIndex: 8, parentId: 'Despesas Fixas', type: 'despesa' as const },
    {
      name: 'Despesas com Dependentes',
      orderIndex: 9,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Despesas Empresa',
      orderIndex: 10,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    // Linhas-espelho das dívidas (parcelas de financiamentos SAC/Price
    // sincronizadas pela área de Dívidas — ver dividaCashflowSync.ts).
    // Renomeado de "Dívidas" e movido para ANTES do Planejamento Financeiro
    // (pedido ago/2026; nome alinhado à categoria da planilha-base).
    {
      name: 'Despesas Financeiras',
      orderIndex: 11,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Planejamento Financeiro',
      orderIndex: 12,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    { name: 'Despesas Variáveis', orderIndex: 2, parentId: 'Despesas', type: 'despesa' as const },
    { name: 'Investimentos', orderIndex: 3, parentId: null, type: 'investimento' as const },
    // Bloco de SALDO (não é entrada nem despesa): o cliente informa manualmente
    // quanto ficou parado em cada banco no fim do mês. Alimenta o carry-over
    // "Saldo Conta Corrente Mês Anterior" e o Fluxo de Caixa livre.
    { name: 'Conta Corrente', orderIndex: 4, parentId: null, type: 'saldo' as const },
  ],
  itensPorGrupo: LINHAS_PADRAO,
};

// ===== ENSURE: CONTA CORRENTE (upgrade de template para bancos existentes) =====

// Cache de processo: uma vez confirmado que o template existe, não consulta de novo.
let contaCorrenteEnsured = false;

/**
 * Garante que o grupo template "Conta Corrente" (type='saldo') exista.
 * Bancos criados antes desta feature têm o seed completo mas não este grupo —
 * o seedTemplates() pula quando já há templates. Idempotente e barato
 * (1 findFirst por processo).
 */
export async function ensureContaCorrenteTemplate(): Promise<void> {
  if (contaCorrenteEnsured) return;

  const existing = await prisma.cashflowGroup.findFirst({
    where: { userId: null, parentId: null, type: 'saldo' },
    select: { id: true },
  });

  if (!existing) {
    const group = await prisma.cashflowGroup.create({
      data: {
        userId: null,
        name: 'Conta Corrente',
        type: 'saldo',
        orderIndex: 4,
        parentId: null,
      },
    });
    await prisma.cashflowItem.createMany({
      data: ['Banco 1', 'Banco 2', 'Banco 3'].map((name) => ({
        userId: null,
        groupId: group.id,
        name,
      })),
    });
    logger.info('✅ Template "Conta Corrente" criado (upgrade de template)');
  }

  contaCorrenteEnsured = true;
}

// ===== ENSURE: DESPESAS COM DEPENDENTES (upgrade de template para bancos existentes) =====

let dependentesEnsured = false;

const DEPENDENTES_GROUP_NAME = 'Despesas com Dependentes';
const DEPENDENTES_ITEMS = [
  'Escola / Faculdade',
  'Cursos',
  'Pensão',
  'Material escolar',
  'Vestuário',
  'Outros',
];

/**
 * Garante que o grupo template "Despesas com Dependentes" exista sob
 * "Despesas Fixas", entre Impostos (8) e Despesas Empresa (posição da seção na
 * planilha FLC). Bancos criados antes desta feature têm o seed completo mas não
 * este grupo. Rebaixa orderIndex >= 9 dos templates irmãos E dos overrides
 * personalizados (que copiam o orderIndex do template na personalização) para
 * o grupo novo não empatar com "Despesas Empresa" na árvore mesclada.
 * Idempotente e barato (1 findFirst por processo).
 */
export async function ensureDependentesTemplate(): Promise<void> {
  if (dependentesEnsured) return;

  const existing = await prisma.cashflowGroup.findFirst({
    where: { userId: null, name: DEPENDENTES_GROUP_NAME },
    select: { id: true },
  });

  if (!existing) {
    const despesasFixas = await prisma.cashflowGroup.findFirst({
      where: { userId: null, name: 'Despesas Fixas' },
      select: { id: true },
    });
    if (!despesasFixas) {
      // banco sem seed (seedTemplates ainda não rodou) — o seed novo já cria o grupo
      dependentesEnsured = true;
      return;
    }

    await prisma.$transaction(async (tx) => {
      const irmaosDepois = await tx.cashflowGroup.findMany({
        where: { userId: null, parentId: despesasFixas.id, orderIndex: { gte: 9 } },
        select: { id: true },
      });
      const idsDepois = irmaosDepois.map((g) => g.id);
      await tx.cashflowGroup.updateMany({
        where: { id: { in: idsDepois } },
        data: { orderIndex: { increment: 1 } },
      });
      await tx.cashflowGroup.updateMany({
        where: { templateId: { in: idsDepois } },
        data: { orderIndex: { increment: 1 } },
      });

      const group = await tx.cashflowGroup.create({
        data: {
          userId: null,
          name: DEPENDENTES_GROUP_NAME,
          type: 'despesa',
          orderIndex: 9,
          parentId: despesasFixas.id,
        },
      });
      await tx.cashflowItem.createMany({
        data: DEPENDENTES_ITEMS.map((name) => ({ userId: null, groupId: group.id, name })),
      });
    });
    logger.info('✅ Template "Despesas com Dependentes" criado (upgrade de template)');
  }

  dependentesEnsured = true;
}

// ===== ENSURE: DESPESAS FINANCEIRAS (upgrade de template p/ bancos antigos) =====

let dividasEnsured = false;

// Ex-"Dívidas" (renomeado ago/2026, migração 20260814*_rename_dividas_group).
const DIVIDAS_GROUP_NAME = 'Despesas Financeiras';

/**
 * Garante que o grupo template "Despesas Financeiras" exista sob "Despesas
 * Fixas", ANTES do "Planejamento Financeiro", E que ele tenha as linhas da
 * seção homônima da planilha FLC (`DESPESAS_FINANCEIRAS_ITEMS` — ticket
 * 20/08/2026; bancos antigos criaram o grupo vazio). Além delas, o grupo
 * recebe as linhas-espelho das parcelas de financiamento, criadas por dívida
 * (dividaCashflowSync). Idempotente e barato (1 findFirst por processo).
 */
export async function ensureDividasTemplate(): Promise<void> {
  if (dividasEnsured) return;

  let existing = await prisma.cashflowGroup.findFirst({
    where: { userId: null, name: DIVIDAS_GROUP_NAME },
    select: { id: true },
  });

  if (!existing) {
    const despesasFixas = await prisma.cashflowGroup.findFirst({
      where: { userId: null, name: 'Despesas Fixas' },
      select: { id: true },
    });
    if (!despesasFixas) {
      // banco sem seed (seedTemplates ainda não rodou) — o seed novo já cria o grupo
      dividasEnsured = true;
      return;
    }

    // Entra ANTES do Planejamento Financeiro (assume o índice dele e o PF
    // desce 1); sem PF no banco, vai pro fim da seção.
    const pf = await prisma.cashflowGroup.findFirst({
      where: { userId: null, parentId: despesasFixas.id, name: 'Planejamento Financeiro' },
      select: { id: true, orderIndex: true },
    });
    let orderIndex: number;
    if (pf) {
      orderIndex = pf.orderIndex;
      await prisma.cashflowGroup.update({
        where: { id: pf.id },
        data: { orderIndex: pf.orderIndex + 1 },
      });
    } else {
      const last = await prisma.cashflowGroup.findFirst({
        where: { userId: null, parentId: despesasFixas.id },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      orderIndex = (last?.orderIndex ?? 11) + 1;
    }
    existing = await prisma.cashflowGroup.create({
      data: {
        userId: null,
        name: DIVIDAS_GROUP_NAME,
        type: 'despesa',
        orderIndex,
        parentId: despesasFixas.id,
      },
      select: { id: true },
    });
    logger.info('✅ Template "Despesas Financeiras" criado (upgrade de template)');
  }

  // Itens-template da seção da planilha: cria só os que faltam (bancos
  // antigos têm o grupo vazio; reexecutar não duplica).
  const itensExistentes = await prisma.cashflowItem.findMany({
    where: { userId: null, groupId: existing.id },
    select: { name: true },
  });
  const nomesExistentes = new Set(itensExistentes.map((i) => i.name));
  const faltantes = DESPESAS_FINANCEIRAS_ITEMS.filter((name) => !nomesExistentes.has(name));
  if (faltantes.length > 0) {
    await prisma.cashflowItem.createMany({
      data: faltantes.map((name) => ({
        userId: null,
        groupId: existing!.id,
        name,
        orderIndex: DESPESAS_FINANCEIRAS_ITEMS.indexOf(name) + 1,
      })),
    });
    logger.info(
      `✅ ${faltantes.length} itens-template criados em "Despesas Financeiras" (upgrade de template)`,
    );
  }

  dividasEnsured = true;
}

// ===== SEED TEMPLATES =====

export async function seedTemplates() {
  logger.info('🌱 Criando templates padrão (userId = null)...\n');

  const existingTemplates = await prisma.cashflowGroup.count({
    where: { userId: null, parentId: null },
  });

  if (existingTemplates >= 3) {
    logger.info('✅ Templates já existem no banco. Pulando criação.\n');
    return;
  }

  const createdGroups: Record<string, { id: string; name: string }> = {};

  for (const grupo of CASHFLOW_TEMPLATE_STRUCTURE.grupos) {
    const groupData = {
      userId: null as null,
      name: grupo.name,
      type: grupo.type,
      orderIndex: grupo.orderIndex,
      parentId:
        grupo.parentId && createdGroups[grupo.parentId] ? createdGroups[grupo.parentId].id : null,
    };

    const group = await prisma.cashflowGroup.create({ data: groupData });
    createdGroups[grupo.name] = { id: group.id, name: group.name };
    logger.info(`   ✅ ${grupo.name} criado como template`);
  }

  logger.info('\n📝 Criando itens padrão (templates)...\n');
  let itemsCount = 0;

  for (const [groupName, items] of Object.entries(CASHFLOW_TEMPLATE_STRUCTURE.itensPorGrupo)) {
    const group = createdGroups[groupName];
    if (!group) {
      logger.info(`   ⚠️  Grupo não encontrado: ${groupName}`);
      continue;
    }

    if (!items.length) continue;

    await prisma.cashflowItem.createMany({
      data: items.map((item) => ({
        userId: null,
        groupId: group.id,
        name: item.name,
        orderIndex: item.orderIndex,
      })),
    });
    itemsCount += items.length;
    logger.info(`   ✅ ${items.length} itens criados para ${groupName}`);
  }

  logger.info(
    `\n✅ Estrutura padrão criada: ${Object.keys(createdGroups).length} grupos, ${itemsCount} itens\n`,
  );
}
