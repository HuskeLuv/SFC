import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { count: fn(), groupBy: fn(), findMany: fn() },
    loginEvent: { findMany: fn(), count: fn(), groupBy: fn() },
    clientConsultant: { count: fn() },
    userChangeLog: { groupBy: fn(), findMany: fn(), count: fn() },
    assistenteMensagem: { aggregate: fn(), count: fn(), findMany: fn(), groupBy: fn() },
    portfolioDailySnapshot: { aggregate: fn() },
    assetPriceHistory: { aggregate: fn() },
    economicIndex: { aggregate: fn() },
    cvmFundQuota: { aggregate: fn() },
    tesouroDiretoPrice: { aggregate: fn() },
    cashflowPatrimonioSnapshot: { aggregate: fn() },
    syncPriceLog: { findFirst: fn() },
    marketDataCoverage: { groupBy: fn() },
    $queryRaw: fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/lib/buildId', () => ({ getBuildId: vi.fn().mockResolvedValue('build-abc') }));
vi.mock('@/services/assistente/prompt', () => ({ MODELO_ASSISTENTE: 'claude-haiku-4-5' }));

import { getAdminOverview } from '../overview';

const AGORA = new Date('2026-09-11T15:00:00.000Z');
const vazioAgg = { _count: { _all: 0 }, _sum: {}, _avg: {}, _max: {}, _min: {} };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASSISTENTE_LIMITE_MENSAL = '300';

  mockPrisma.user.count.mockResolvedValue(0);
  mockPrisma.user.groupBy.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.loginEvent.findMany.mockResolvedValue([]);
  mockPrisma.loginEvent.count.mockResolvedValue(0);
  mockPrisma.loginEvent.groupBy.mockResolvedValue([]);
  mockPrisma.clientConsultant.count.mockResolvedValue(0);
  mockPrisma.userChangeLog.groupBy.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.count.mockResolvedValue(0);
  mockPrisma.assistenteMensagem.aggregate.mockResolvedValue(vazioAgg);
  mockPrisma.assistenteMensagem.count.mockResolvedValue(0);
  mockPrisma.assistenteMensagem.findMany.mockResolvedValue([]);
  mockPrisma.assistenteMensagem.groupBy.mockResolvedValue([]);
  for (const m of [
    mockPrisma.portfolioDailySnapshot,
    mockPrisma.assetPriceHistory,
    mockPrisma.economicIndex,
    mockPrisma.cvmFundQuota,
    mockPrisma.tesouroDiretoPrice,
    mockPrisma.cashflowPatrimonioSnapshot,
  ]) {
    m.aggregate.mockResolvedValue({ _max: {}, _count: { _all: 0 } });
  }
  mockPrisma.syncPriceLog.findFirst.mockResolvedValue(null);
  mockPrisma.marketDataCoverage.groupBy.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

describe('getAdminOverview', () => {
  it('monta os quatro blocos com banco vazio (série diária contínua de 31 dias)', async () => {
    const r = await getAdminOverview(AGORA);

    expect(r.geradoEm).toBe(AGORA.toISOString());
    expect(r.usuarios.total).toBe(0);
    expect(r.usuarios.porPapel).toEqual({ user: 0, consultant: 0, admin: 0 });
    // Todas as seções conhecidas aparecem mesmo sem edição.
    expect(r.uso.porSecao.map((s) => s.secao)).toContain('fluxo-caixa');
    expect(r.uso.porDia).toHaveLength(31);
    expect(r.uso.porDia[0].dia).toBe('2026-08-12');
    expect(r.uso.porDia[30].dia).toBe('2026-09-11');
    expect(r.assistente.mes.custoBrl).toBe(0);
    expect(r.assistente.mes.custoPorMsgBrl).toBe(0);
    expect(r.assistente.porDia.every((d) => d.custoBrl === 0)).toBe(true);
    expect(r.sistema.buildId).toBe('build-abc');
    expect(r.sistema.ultimoSyncPrecos).toBeNull();
    expect(r.sistema.dados).toHaveLength(6);
  });

  it('agrega usuários: papéis, ativos distintos e último login dos recentes', async () => {
    mockPrisma.user.count
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(1) // novos7d
      .mockResolvedValueOnce(2) // novos30d
      .mockResolvedValueOnce(1); // com2fa
    mockPrisma.user.groupBy.mockResolvedValue([
      { role: 'user', _count: { _all: 4 } },
      { role: 'admin', _count: { _all: 1 } },
    ]);
    mockPrisma.loginEvent.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // ativos7d
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]); // ativos30d
    mockPrisma.loginEvent.count.mockResolvedValue(7);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'a@x.com',
        name: 'A',
        role: 'user',
        totpEnabled: false,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    mockPrisma.loginEvent.groupBy.mockResolvedValue([
      { userId: 'u1', _max: { createdAt: new Date('2026-09-10T10:00:00Z') } },
    ]);

    const r = await getAdminOverview(AGORA);

    expect(r.usuarios.total).toBe(5);
    expect(r.usuarios.porPapel).toEqual({ user: 4, consultant: 0, admin: 1 });
    expect(r.usuarios.ativos7d).toBe(2);
    expect(r.usuarios.ativos30d).toBe(3);
    expect(r.usuarios.loginsFalhos7d).toBe(7);
    expect(r.usuarios.recentes[0]).toMatchObject({
      email: 'a@x.com',
      createdAt: '2026-09-01T00:00:00.000Z',
      ultimoLogin: '2026-09-10T10:00:00.000Z',
    });
  });

  it('agrega o assistente: custo/msg, cache hit, cota por usuário e série com custo', async () => {
    mockPrisma.assistenteMensagem.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 24 },
        _sum: {
          custoBrl: 1.0471,
          inputTokens: 14726,
          cachedInputTokens: 57213,
          cacheWriteTokens: 119667,
          outputTokens: 4848,
        },
        _avg: { latencyMs: 2650.4 },
      })
      .mockResolvedValueOnce({
        _count: { _all: 24 },
        _sum: { custoBrl: 1.0471 },
        _min: { createdAt: new Date('2026-09-10T13:00:00Z') },
      });
    // comCache, propostas, confirmadas, erros
    mockPrisma.assistenteMensagem.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(16)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(0);
    mockPrisma.assistenteMensagem.findMany.mockResolvedValue([{ userId: 'g' }, { userId: 'a' }]);
    mockPrisma.assistenteMensagem.groupBy
      .mockResolvedValueOnce([
        { userId: 'g', _count: { _all: 20 }, _sum: { custoBrl: 0.8209 } },
        { userId: 'a', _count: { _all: 3 }, _sum: { custoBrl: 0.1603 } },
      ]) // porUsuario
      .mockResolvedValueOnce([
        { intencao: 'lancamento', _count: { _all: 11 }, _sum: { custoBrl: 0.5766 } },
      ]) // porIntencao
      .mockResolvedValueOnce([{ userId: 'g', _count: { _all: 13 } }]) // propostas por user
      .mockResolvedValueOnce([{ userId: 'g', _count: { _all: 13 } }]) // confirmadas por user
      .mockResolvedValueOnce([{ intencao: 'lancamento', _count: { _all: 13 } }]); // confirmadas por intenção
    mockPrisma.user.findMany.mockImplementation(
      async (args?: { where?: { id?: { in?: string[] } } }) =>
        args?.where?.id?.in
          ? [
              { id: 'g', email: 'gorila@qa', name: 'Gorila' },
              { id: 'a', email: 'ana@qa', name: '' },
            ]
          : [],
    );
    mockPrisma.$queryRaw.mockImplementation(async (q: { sql?: string; strings?: string[] }) => {
      const sql = q?.sql ?? q?.strings?.join('') ?? '';
      if (sql.includes('assistente_mensagens')) {
        return [{ dia: new Date('2026-09-10T00:00:00Z'), total: 24, usuarios: 3, custo: '1.0471' }];
      }
      return [];
    });

    const r = await getAdminOverview(AGORA);
    const { mes, porUsuario, porIntencao, porDia } = r.assistente;

    expect(mes.mensagens).toBe(24);
    expect(mes.custoBrl).toBe(1.0471);
    expect(mes.custoPorMsgBrl).toBe(0.0436);
    expect(mes.cacheHitPct).toBe(33.3);
    expect(mes.latenciaMediaMs).toBe(2650);
    expect(mes.propostas).toBe(16);
    expect(mes.confirmadas).toBe(15);
    expect(r.assistente.total.desde).toBe('2026-09-10T13:00:00.000Z');
    expect(porUsuario[0]).toMatchObject({
      email: 'gorila@qa',
      mensagens: 20,
      custoBrl: 0.8209,
      propostas: 13,
      confirmadas: 13,
      pctCota: 6.7,
    });
    expect(porUsuario[1]).toMatchObject({
      email: 'ana@qa',
      propostas: 0,
      confirmadas: 0,
      pctCota: 1,
    });
    expect(porIntencao[0]).toMatchObject({
      intencao: 'lancamento',
      mensagens: 11,
      confirmadas: 13,
    });
    const dia10 = porDia.find((d) => d.dia === '2026-09-10');
    expect(dia10).toEqual({ dia: '2026-09-10', total: 24, usuarios: 3, custoBrl: 1.0471 });
    expect(porDia.find((d) => d.dia === '2026-09-09')).toEqual({
      dia: '2026-09-09',
      total: 0,
      usuarios: 0,
      custoBrl: 0,
    });
  });

  it('marca cobertura, sync de preços e não quebra se as consultas do banco (pg_*) falharem', async () => {
    mockPrisma.syncPriceLog.findFirst.mockResolvedValue({
      executedAt: new Date('2026-09-11T08:00:00Z'),
      totalUpdated: 120,
      totalInserted: 3,
      errors: 1,
      duration: 42,
    });
    mockPrisma.marketDataCoverage.groupBy.mockResolvedValue([
      { status: 'OK', _count: { _all: 50 } },
      { status: 'FETCH_FAIL', _count: { _all: 2 } },
    ]);
    mockPrisma.portfolioDailySnapshot.aggregate.mockResolvedValue({
      _max: { date: new Date('2026-09-10T00:00:00Z') },
      _count: { _all: 1234 },
    });
    mockPrisma.$queryRaw.mockImplementation(async (q: { sql?: string; strings?: string[] }) => {
      const sql = q?.sql ?? q?.strings?.join('') ?? '';
      if (sql.includes('pg_')) throw new Error('permission denied');
      return [];
    });

    const r = await getAdminOverview(AGORA);

    expect(r.sistema.ultimoSyncPrecos).toEqual({
      executadoEm: '2026-09-11T08:00:00.000Z',
      totalUpdated: 120,
      totalInserted: 3,
      errors: 1,
      duracaoSeg: 42,
    });
    expect(r.sistema.cobertura).toEqual([
      { status: 'OK', total: 50 },
      { status: 'FETCH_FAIL', total: 2 },
    ]);
    expect(r.sistema.dados[0]).toEqual({
      nome: 'Snapshots diários da carteira',
      ultimaData: '2026-09-10T00:00:00.000Z',
      registros: 1234,
    });
    expect(r.sistema.banco).toEqual({ tamanho: null, tabelas: [] });
  });
});
