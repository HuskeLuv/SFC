/**
 * Painel administrativo (11/09/2026) — visão consolidada, SÓ LEITURA, para
 * `role === 'admin'`: usuários, uso por funcionalidade, custo do assistente
 * de IA e saúde do sistema. Tudo vem de tabelas que já existem (User,
 * login_events, user_change_logs, assistente_mensagens, séries de mercado);
 * nada novo é gravado. Com o volume atual (~dezenas de usuários) as
 * agregações rodam ao vivo; quando crescer, trocar por tabela diária
 * preenchida por cron (ver docs/plano do painel).
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getBuildId } from '@/lib/buildId';
import { assistenteHabilitado, inicioDoMes, limiteMensal } from '@/services/assistente/limite';
import { MODELO_ASSISTENTE } from '@/services/assistente/prompt';
import { CHANGE_SECTIONS } from '@/services/changeHistory/types';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface AdminUsuarioResumo {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'consultant' | 'admin';
  totpEnabled: boolean;
  createdAt: string;
  ultimoLogin: string | null;
}

export interface AdminSerieDia {
  dia: string; // YYYY-MM-DD
  total: number;
  usuarios: number;
  custoBrl?: number;
}

export interface AdminOverview {
  geradoEm: string;
  usuarios: {
    total: number;
    porPapel: { user: number; consultant: number; admin: number };
    novos7d: number;
    novos30d: number;
    ativos7d: number;
    ativos30d: number;
    loginsFalhos7d: number;
    com2fa: number;
    vinculosConsultorAtivos: number;
    recentes: AdminUsuarioResumo[];
  };
  uso: {
    porSecao: { secao: string; alteracoes7d: number; alteracoes30d: number; usuarios30d: number }[];
    porDia: AdminSerieDia[];
    topAcoes: { acao: string; secao: string; total: number }[];
    viaConsultor30d: number;
    desfeitas30d: number;
    usuariosComEdicao30d: number;
  };
  assistente: {
    habilitado: boolean;
    modelo: string;
    limiteMensal: number;
    mes: {
      inicio: string;
      mensagens: number;
      usuarios: number;
      custoBrl: number;
      custoPorMsgBrl: number;
      cacheHitPct: number;
      propostas: number;
      confirmadas: number;
      erros: number;
      latenciaMediaMs: number;
      inputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
      outputTokens: number;
    };
    total: { mensagens: number; custoBrl: number; desde: string | null };
    porUsuario: {
      userId: string;
      email: string;
      name: string;
      mensagens: number;
      custoBrl: number;
      propostas: number;
      confirmadas: number;
      pctCota: number;
    }[];
    porIntencao: { intencao: string; mensagens: number; custoBrl: number; confirmadas: number }[];
    porDia: AdminSerieDia[];
  };
  sistema: {
    buildId: string;
    ambiente: string;
    dados: { nome: string; ultimaData: string | null; registros: number }[];
    ultimoSyncPrecos: {
      executadoEm: string;
      totalUpdated: number;
      totalInserted: number;
      errors: number;
      duracaoSeg: number;
    } | null;
    cobertura: { status: string; total: number }[];
    banco: { tamanho: string | null; tabelas: { nome: string; linhas: number }[] };
  };
}

interface SerieDiaRow {
  dia: Date;
  total: bigint | number;
  usuarios: bigint | number;
  custo?: Prisma.Decimal | number | string | null;
}

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') return Number(v) || 0;
  if (v instanceof Prisma.Decimal) return v.toNumber();
  if (typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
};

const isoDia = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
};

const round = (n: number, casas = 4): number => {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};

/** Preenche dias sem linha com zero para a série ficar contínua no gráfico. */
function completarSerie(rows: SerieDiaRow[], inicio: Date, fim: Date, comCusto = false) {
  const porDia = new Map<string, AdminSerieDia>();
  for (const r of rows) {
    const entry: AdminSerieDia = {
      dia: isoDia(r.dia),
      total: toNum(r.total),
      usuarios: toNum(r.usuarios),
    };
    if (comCusto) entry.custoBrl = round(toNum(r.custo));
    porDia.set(entry.dia, entry);
  }
  const serie: AdminSerieDia[] = [];
  for (
    let t = Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate());
    t <= fim.getTime();
    t += DIA_MS
  ) {
    const dia = new Date(t).toISOString().slice(0, 10);
    serie.push(
      porDia.get(dia) ?? { dia, total: 0, usuarios: 0, ...(comCusto ? { custoBrl: 0 } : {}) },
    );
  }
  return serie;
}

async function blocoUsuarios(agora: Date, d7: Date, d30: Date): Promise<AdminOverview['usuarios']> {
  const [
    total,
    porPapel,
    novos7d,
    novos30d,
    ativos7d,
    ativos30d,
    loginsFalhos7d,
    com2fa,
    vinculos,
    recentes,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.loginEvent.findMany({
      where: { success: true, createdAt: { gte: d7 }, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.loginEvent.findMany({
      where: { success: true, createdAt: { gte: d30 }, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.loginEvent.count({ where: { success: false, createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { totpEnabled: true } }),
    prisma.clientConsultant.count({ where: { status: 'active' } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, email: true, name: true, role: true, totpEnabled: true, createdAt: true },
    }),
  ]);

  const ultimosLogins = recentes.length
    ? await prisma.loginEvent.groupBy({
        by: ['userId'],
        where: { success: true, userId: { in: recentes.map((u) => u.id) } },
        _max: { createdAt: true },
      })
    : [];
  const ultimoLoginPorUser = new Map(
    ultimosLogins.map((l) => [l.userId, l._max.createdAt?.toISOString() ?? null]),
  );

  const papel = { user: 0, consultant: 0, admin: 0 };
  for (const p of porPapel) papel[p.role] = p._count._all;

  return {
    total,
    porPapel: papel,
    novos7d,
    novos30d,
    ativos7d: ativos7d.length,
    ativos30d: ativos30d.length,
    loginsFalhos7d,
    com2fa,
    vinculosConsultorAtivos: vinculos,
    recentes: recentes.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      ultimoLogin: ultimoLoginPorUser.get(u.id) ?? null,
    })),
  };
}

async function blocoUso(agora: Date, d7: Date, d30: Date): Promise<AdminOverview['uso']> {
  const [
    secao7d,
    secao30d,
    usuariosSecao30d,
    topAcoes,
    viaConsultor30d,
    desfeitas30d,
    editores,
    porDiaRows,
  ] = await Promise.all([
    prisma.userChangeLog.groupBy({
      by: ['section'],
      where: { createdAt: { gte: d7 } },
      _count: { _all: true },
    }),
    prisma.userChangeLog.groupBy({
      by: ['section'],
      where: { createdAt: { gte: d30 } },
      _count: { _all: true },
    }),
    prisma.userChangeLog.findMany({
      where: { createdAt: { gte: d30 } },
      distinct: ['section', 'userId'],
      select: { section: true, userId: true },
    }),
    prisma.userChangeLog.groupBy({
      by: ['section', 'action'],
      where: { createdAt: { gte: d30 } },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    }),
    prisma.userChangeLog.count({ where: { createdAt: { gte: d30 }, viaConsultant: true } }),
    prisma.userChangeLog.count({ where: { createdAt: { gte: d30 }, undoneAt: { not: null } } }),
    prisma.userChangeLog.findMany({
      where: { createdAt: { gte: d30 } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.$queryRaw<SerieDiaRow[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt")::date AS dia,
               count(*)::int AS total,
               count(DISTINCT "userId")::int AS usuarios
        FROM user_change_logs
        WHERE "createdAt" >= ${d30}
        GROUP BY 1 ORDER BY 1
      `),
  ]);

  const c7 = new Map(secao7d.map((s) => [s.section, s._count._all]));
  const c30 = new Map(secao30d.map((s) => [s.section, s._count._all]));
  const u30 = new Map<string, number>();
  for (const r of usuariosSecao30d) u30.set(r.section, (u30.get(r.section) ?? 0) + 1);

  const secoes = new Set<string>([...CHANGE_SECTIONS, ...c30.keys(), ...c7.keys()]);
  const porSecao = [...secoes]
    .map((secao) => ({
      secao,
      alteracoes7d: c7.get(secao) ?? 0,
      alteracoes30d: c30.get(secao) ?? 0,
      usuarios30d: u30.get(secao) ?? 0,
    }))
    .sort((a, b) => b.alteracoes30d - a.alteracoes30d);

  return {
    porSecao,
    porDia: completarSerie(porDiaRows, d30, agora),
    topAcoes: topAcoes.map((a) => ({ acao: a.action, secao: a.section, total: a._count._all })),
    viaConsultor30d,
    desfeitas30d,
    usuariosComEdicao30d: editores.length,
  };
}

async function blocoAssistente(agora: Date, d30: Date): Promise<AdminOverview['assistente']> {
  const inicioMes = inicioDoMes(agora);
  const limite = limiteMensal();

  const [
    agg,
    comCache,
    propostas,
    confirmadas,
    erros,
    usuariosMes,
    porUsuarioRaw,
    porIntencaoRaw,
    total,
    porDiaRows,
  ] = await Promise.all([
    prisma.assistenteMensagem.aggregate({
      where: { createdAt: { gte: inicioMes } },
      _count: { _all: true },
      _sum: {
        custoBrl: true,
        inputTokens: true,
        cachedInputTokens: true,
        cacheWriteTokens: true,
        outputTokens: true,
      },
      _avg: { latencyMs: true },
    }),
    prisma.assistenteMensagem.count({
      where: { createdAt: { gte: inicioMes }, cachedInputTokens: { gt: 0 } },
    }),
    prisma.assistenteMensagem.count({
      where: { createdAt: { gte: inicioMes }, propostaGerada: true },
    }),
    prisma.assistenteMensagem.count({
      where: { createdAt: { gte: inicioMes }, propostaConfirmada: true },
    }),
    prisma.assistenteMensagem.count({ where: { createdAt: { gte: inicioMes }, ok: false } }),
    prisma.assistenteMensagem.findMany({
      where: { createdAt: { gte: inicioMes } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.assistenteMensagem.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: inicioMes } },
      _count: { _all: true },
      _sum: { custoBrl: true },
    }),
    prisma.assistenteMensagem.groupBy({
      by: ['intencao'],
      where: { createdAt: { gte: inicioMes } },
      _count: { _all: true },
      _sum: { custoBrl: true },
    }),
    prisma.assistenteMensagem.aggregate({
      _count: { _all: true },
      _sum: { custoBrl: true },
      _min: { createdAt: true },
    }),
    prisma.$queryRaw<SerieDiaRow[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt")::date AS dia,
               count(*)::int AS total,
               count(DISTINCT "userId")::int AS usuarios,
               coalesce(sum("custoBrl"), 0) AS custo
        FROM assistente_mensagens
        WHERE "createdAt" >= ${d30}
        GROUP BY 1 ORDER BY 1
      `),
  ]);

  const userIds = porUsuarioRaw.map((u) => u.userId);
  const [usuarios, propostasPorUser, confirmadasPorUser, confirmadasPorIntencao] =
    await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.assistenteMensagem.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: inicioMes }, propostaGerada: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.assistenteMensagem.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: inicioMes }, propostaConfirmada: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.assistenteMensagem.groupBy({
        by: ['intencao'],
        where: { createdAt: { gte: inicioMes }, propostaConfirmada: true },
        _count: { _all: true },
      }),
    ]);
  const userById = new Map(usuarios.map((u) => [u.id, u]));
  const propostasMap = new Map(propostasPorUser.map((p) => [p.userId, p._count._all]));
  const confirmadasMap = new Map(confirmadasPorUser.map((p) => [p.userId, p._count._all]));
  const confIntencaoMap = new Map(confirmadasPorIntencao.map((p) => [p.intencao, p._count._all]));

  const mensagens = agg._count._all;
  const custoMes = toNum(agg._sum.custoBrl);

  return {
    habilitado: assistenteHabilitado(),
    modelo: MODELO_ASSISTENTE,
    limiteMensal: limite,
    mes: {
      inicio: inicioMes.toISOString(),
      mensagens,
      usuarios: usuariosMes.length,
      custoBrl: round(custoMes),
      custoPorMsgBrl: mensagens ? round(custoMes / mensagens) : 0,
      cacheHitPct: mensagens ? round((comCache / mensagens) * 100, 1) : 0,
      propostas,
      confirmadas,
      erros,
      latenciaMediaMs: Math.round(toNum(agg._avg.latencyMs)),
      inputTokens: toNum(agg._sum.inputTokens),
      cachedInputTokens: toNum(agg._sum.cachedInputTokens),
      cacheWriteTokens: toNum(agg._sum.cacheWriteTokens),
      outputTokens: toNum(agg._sum.outputTokens),
    },
    total: {
      mensagens: total._count._all,
      custoBrl: round(toNum(total._sum.custoBrl)),
      desde: total._min.createdAt?.toISOString() ?? null,
    },
    porUsuario: porUsuarioRaw
      .map((u) => ({
        userId: u.userId,
        email: userById.get(u.userId)?.email ?? '(removido)',
        name: userById.get(u.userId)?.name ?? '',
        mensagens: u._count._all,
        custoBrl: round(toNum(u._sum.custoBrl)),
        propostas: propostasMap.get(u.userId) ?? 0,
        confirmadas: confirmadasMap.get(u.userId) ?? 0,
        pctCota: limite ? round((u._count._all / limite) * 100, 1) : 0,
      }))
      .sort((a, b) => b.custoBrl - a.custoBrl),
    porIntencao: porIntencaoRaw
      .map((i) => ({
        intencao: i.intencao,
        mensagens: i._count._all,
        custoBrl: round(toNum(i._sum.custoBrl)),
        confirmadas: confIntencaoMap.get(i.intencao) ?? 0,
      }))
      .sort((a, b) => b.mensagens - a.mensagens),
    porDia: completarSerie(porDiaRows, d30, agora, true),
  };
}

interface TabelaRow {
  nome: string;
  linhas: bigint | number;
}

async function blocoSistema(): Promise<AdminOverview['sistema']> {
  const [
    buildId,
    snapshots,
    precos,
    indices,
    cotasCvm,
    tesouro,
    patrimonioFluxo,
    ultimoSync,
    cobertura,
    tamanho,
    tabelas,
  ] = await Promise.all([
    getBuildId(),
    prisma.portfolioDailySnapshot.aggregate({ _max: { date: true }, _count: { _all: true } }),
    prisma.assetPriceHistory.aggregate({ _max: { date: true }, _count: { _all: true } }),
    prisma.economicIndex.aggregate({ _max: { date: true }, _count: { _all: true } }),
    prisma.cvmFundQuota.aggregate({ _max: { date: true }, _count: { _all: true } }),
    prisma.tesouroDiretoPrice.aggregate({ _max: { baseDate: true }, _count: { _all: true } }),
    prisma.cashflowPatrimonioSnapshot.aggregate({
      _max: { createdAt: true },
      _count: { _all: true },
    }),
    prisma.syncPriceLog.findFirst({ orderBy: { executedAt: 'desc' } }),
    prisma.marketDataCoverage.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma
      .$queryRaw<
        { tamanho: string }[]
      >(Prisma.sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho`)
      .catch(() => [] as { tamanho: string }[]),
    prisma
      .$queryRaw<TabelaRow[]>(
        Prisma.sql`
        SELECT relname AS nome, greatest(n_live_tup, 0)::bigint AS linhas
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 8
      `,
      )
      .catch(() => [] as TabelaRow[]),
  ]);

  const dado = (nome: string, data: Date | null | undefined, registros: number) => ({
    nome,
    ultimaData: data ? data.toISOString() : null,
    registros,
  });

  return {
    buildId,
    ambiente: process.env.NODE_ENV ?? 'development',
    dados: [
      dado('Snapshots diários da carteira', snapshots._max.date, snapshots._count._all),
      dado('Histórico de preços (ativos)', precos._max.date, precos._count._all),
      dado('Índices econômicos (CDI, IPCA, Selic…)', indices._max.date, indices._count._all),
      dado('Cotas de fundos CVM', cotasCvm._max.date, cotasCvm._count._all),
      dado('Preços Tesouro Direto', tesouro._max.baseDate, tesouro._count._all),
      dado(
        'Snapshots de patrimônio (fluxo)',
        patrimonioFluxo._max.createdAt,
        patrimonioFluxo._count._all,
      ),
    ],
    ultimoSyncPrecos: ultimoSync
      ? {
          executadoEm: ultimoSync.executedAt.toISOString(),
          totalUpdated: ultimoSync.totalUpdated,
          totalInserted: ultimoSync.totalInserted,
          errors: ultimoSync.errors,
          duracaoSeg: ultimoSync.duration,
        }
      : null,
    cobertura: cobertura
      .map((c) => ({ status: c.status, total: c._count._all }))
      .sort((a, b) => b.total - a.total),
    banco: {
      tamanho: tamanho[0]?.tamanho ?? null,
      tabelas: tabelas.map((t) => ({ nome: t.nome, linhas: toNum(t.linhas) })),
    },
  };
}

export async function getAdminOverview(agora = new Date()): Promise<AdminOverview> {
  const d7 = new Date(agora.getTime() - 7 * DIA_MS);
  const d30 = new Date(agora.getTime() - 30 * DIA_MS);

  const [usuarios, uso, assistente, sistema] = await Promise.all([
    blocoUsuarios(agora, d7, d30),
    blocoUso(agora, d7, d30),
    blocoAssistente(agora, d30),
    blocoSistema(),
  ]);

  return { geradoEm: agora.toISOString(), usuarios, uso, assistente, sistema };
}
