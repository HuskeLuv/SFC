import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { computeInvestimentosPorMes } from '@/services/cashflow/investimentosPorMes';
import { buildOrcamentoVsReal } from '@/services/cashflow/orcamentoVsReal';
import { cashflowOrcamentoUpdateSchema, validationError } from '@/utils/validation-schemas';
import { recordChange } from '@/services/changeHistory';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Orçamento vs Real — metas mensais por categoria de despesa + linha especial
 * de Investimentos (% da renda). O real vem da própria planilha do fluxo de
 * caixa (todas as células = "lançado"; pintadas de Pago/Recebido =
 * "consolidado") e da linha Aporte/Resgate derivada das transações.
 *
 * GET  ?year=  → payload completo de `buildOrcamentoVsReal` (categorias com
 *               meta+real nos dois modos, investimentos, totais).
 * PUT          → upsert/delete de metas em lote. Meta de categoria referencia
 *               um CashflowGroup de despesa (template ou personalizado);
 *               `groupId: null` é a meta percentual de investimentos.
 */

const parseYear = (request: NextRequest): { year?: number; error?: NextResponse } => {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (yearParam && (isNaN(year) || year < 1900 || year > 2100)) {
    return {
      error: NextResponse.json(
        { error: 'Parâmetro year inválido. Deve ser um número entre 1900 e 2100.' },
        { status: 400 },
      ),
    };
  }
  return { year };
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento',
    'GET',
  );

  const { year, error } = parseYear(request);
  if (error) return error;
  const targetYear = year!;

  const [groups, metasRows, investimentos] = await Promise.all([
    getMergedCashflowGroups(targetUserId, targetYear),
    prisma.cashflowOrcamento.findMany({
      where: { userId: targetUserId, year: targetYear },
    }),
    computeInvestimentosPorMes(targetUserId, targetYear),
  ]);

  // Real investido = Aporte/Resgate + aportes vinculados a sonhos (ambos
  // saem do bolso do usuário no mês; reinvestimento de proventos fica fora).
  const investimentosRealPorMes = Array.from(
    { length: 12 },
    (_, m) => (investimentos.totaisPorMes[m] || 0) + (investimentos.planejamentoPorMes[m] || 0),
  );

  const payload_ = buildOrcamentoVsReal({
    groups,
    metas: metasRows.map((row) => ({
      groupId: row.groupId,
      tipo: row.tipo,
      tipoMeta: row.tipoMeta,
      valor: Number(row.valor),
    })),
    investimentosRealPorMes,
  });

  return NextResponse.json({ year: targetYear, ...payload_ });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento',
    'PUT',
  );

  const body = await request.json();
  const parsed = cashflowOrcamentoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { year, metas = [], deletes = [] } = parsed.data;

  // Categorias precisam ser grupos de despesa visíveis pelo usuário
  // (template global ou grupo/override do próprio usuário).
  const groupIds = metas.flatMap((m) => (m.groupId ? [m.groupId] : []));
  const groupNames = new Map<string, string>();
  if (groupIds.length > 0) {
    const groups = await prisma.cashflowGroup.findMany({
      where: {
        id: { in: groupIds },
        type: 'despesa',
        hidden: false,
        OR: [{ userId: targetUserId }, { userId: null }],
      },
      select: { id: true, name: true },
    });
    groups.forEach((g) => groupNames.set(g.id, g.name));
    const missing = groupIds.filter((id) => !groupNames.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Categoria não encontrada ou não é um grupo de despesa.' },
        { status: 404 },
      );
    }
  }

  const before = await prisma.cashflowOrcamento.findMany({
    where: { userId: targetUserId, year },
  });
  const beforeByKey = new Map(before.map((row) => [row.groupId ?? 'investimentos', row]));

  await prisma.$transaction(async (tx) => {
    for (const meta of metas) {
      if (meta.groupId) {
        await tx.cashflowOrcamento.upsert({
          where: {
            userId_year_tipo_groupId: {
              userId: targetUserId,
              year,
              tipo: 'grupo',
              groupId: meta.groupId,
            },
          },
          update: { valor: meta.valor },
          create: {
            userId: targetUserId,
            year,
            tipo: 'grupo',
            tipoMeta: 'valor',
            groupId: meta.groupId,
            valor: meta.valor,
          },
        });
      } else {
        // Linha de investimentos (groupId NULL): unique composta não pega
        // NULL no Postgres — a unicidade real vem do índice parcial da
        // migration; aqui fazemos update-então-create. Meta em R$ mensal
        // (tipoMeta 'valor') OU % da renda (tipoMeta 'percentual',
        // reintroduzido em ago/2026 — o serviço computa % × entradas do mês).
        const updated = await tx.cashflowOrcamento.updateMany({
          where: { userId: targetUserId, year, tipo: 'investimentos' },
          data: { valor: meta.valor, tipoMeta: meta.tipoMeta },
        });
        if (updated.count === 0) {
          await tx.cashflowOrcamento.create({
            data: {
              userId: targetUserId,
              year,
              tipo: 'investimentos',
              tipoMeta: meta.tipoMeta,
              groupId: null,
              valor: meta.valor,
            },
          });
        }
      }
    }

    const groupDeletes = deletes.filter((d) => d !== 'investimentos');
    if (groupDeletes.length > 0) {
      await tx.cashflowOrcamento.deleteMany({
        where: { userId: targetUserId, year, tipo: 'grupo', groupId: { in: groupDeletes } },
      });
    }
    if (deletes.includes('investimentos')) {
      await tx.cashflowOrcamento.deleteMany({
        where: { userId: targetUserId, year, tipo: 'investimentos' },
      });
    }
  });

  // Histórico de alterações — um registro por meta tocada, com before/after.
  const changes = [
    ...metas.map((meta) => {
      const key = meta.groupId ?? 'investimentos';
      const prev = beforeByKey.get(key);
      const isInvestimentos = meta.groupId === null;
      return {
        field: key,
        label: isInvestimentos
          ? 'Meta mensal — Investimentos'
          : `Meta mensal — ${groupNames.get(meta.groupId!) ?? meta.groupId}`,
        before: prev ? Number(prev.valor) : null,
        after: meta.valor,
        format: 'currency' as const,
      };
    }),
    ...deletes
      .filter((d) => beforeByKey.has(d === 'investimentos' ? 'investimentos' : d))
      .map((d) => {
        const prev = beforeByKey.get(d === 'investimentos' ? 'investimentos' : d)!;
        return {
          field: d,
          label:
            d === 'investimentos' ? 'Meta mensal — Investimentos' : `Meta mensal — ${prev.groupId}`,
          before: Number(prev.valor),
          after: null,
          format: 'currency' as const,
        };
      }),
  ];
  if (changes.length > 0) {
    await recordChange({
      request,
      auth,
      section: 'fluxo-caixa',
      action: 'orcamento.editar',
      entity: 'orcamento',
      entityId: `orcamento-${year}`,
      entityLabel: `Orçamento ${year}`,
      changes,
    });
  }

  return NextResponse.json({ success: true });
});
