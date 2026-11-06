import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  aposentadoriaPlano: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  aposentadoriaPlanoEntry: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
const mockTriggerLazyBackfill = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioSnapshotPersistence', () => ({
  triggerLazyBackfill: mockTriggerLazyBackfill,
}));

import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type { MesesRelatorio } from '@/types/relatorioFinanceiro';
import { calc, nomM, planTraj } from '@/services/planejamento/aposentadoria';
import type { ContextoMontador, Insumos, PontoPerformance, SnapshotDiario } from '../insumos';
import { mesesDaJanela, periodoDoRelatorio } from '../periodo';
import { montarPlanejamento, offsetDoMes } from '../planejamento';
import { montarCarteira } from '../carteira';

const AGORA = new Date('2026-11-06T09:42:00-03:00');
const HOJE = { ano: 2026, mes0: 10, dia: 6 };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ABAS = {
  acoes: 0,
  fii: 0,
  etf: 0,
  reit: 0,
  stocks: 0,
  moedasCriptos: 0,
  previdenciaSeguros: 0,
  opcoes: 0,
  fimFia: 0,
  rendaFixa: 0,
};
const BASE = {
  porClasse: {
    reservaEmergencia: 0,
    reservaOportunidade: 0,
    rendaFixaFundos: 300000,
    fimFia: 0,
    fiis: 0,
    acoes: 200000,
    stocks: 0,
    reits: 0,
    etfs: 0,
    moedasCriptos: 0,
    previdenciaSeguros: 0,
    opcoes: 0,
    imoveisBens: 0,
    tesouroDireto: 0,
    etfsExterior: 0,
  },
  caixa: { bolso: 0, reservado: 0, porAba: ABAS },
  nPosicoes: 3,
} as unknown as SaudeFinanceiraPayload;

const PLANO_ROW = {
  id: 'plano-1',
  userId: 'u1',
  idade: 40,
  apos: 60,
  vida: 90,
  rentNom: 13.5,
  inflacao: 4.5,
  rentNomRetiro: null,
  patrimonio: 400000,
  aporteM: 3500,
  renda: 20000,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [],
  fieldLocks: [],
  createdAt: d('2026-01-01'),
  updatedAt: d('2026-01-01'),
  entries: [
    // manual vence o snapshot; auto perde para o snapshot
    { off: 9, year: 2026, month: 9, aporteReal: 0, patFinal: 999999, origem: 'manual' },
    { off: 10, year: 2026, month: 10, aporteReal: 0, patFinal: 1, origem: 'auto' },
    { off: 6, year: 2026, month: 6, aporteReal: 0, patFinal: 410000, origem: 'auto' },
  ],
};

const snap = (iso: string, totalValue: number): SnapshotDiario => ({
  date: d(iso),
  totalValue,
  totalInvested: totalValue,
});
const ponto = (iso: string, cumulativeReturn: number): PontoPerformance => ({
  date: d(iso),
  dailyReturn: null,
  cumulativeReturn,
});

function ctxCom(meses: MesesRelatorio): ContextoMontador {
  const janela = mesesDaJanela(HOJE, 13);
  const insumos = {
    userId: 'u1',
    agora: AGORA,
    hojeSP: HOJE,
    janela,
    inicioJanela: d('2025-11-01'),
    saudeBase: vi.fn().mockResolvedValue(BASE),
    snapshots13m: vi
      .fn()
      .mockResolvedValue([
        snap('2026-08-31', 480000),
        snap('2026-09-30', 490000),
        snap('2026-10-31', 495000),
        snap('2026-11-05', 500000),
      ]),
    aportesMensais13m: vi
      .fn()
      .mockResolvedValue(janela.map((mes, i) => ({ mes, valor: 3000 + i * 10 }))),
    performance13m: vi
      .fn()
      .mockResolvedValue([
        ponto('2026-05-31', 0),
        ponto('2026-08-31', 3),
        ponto('2026-09-30', 4.03),
        ponto('2026-10-31', 5.0703),
      ]),
  } as unknown as Insumos;
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, AGORA),
    mesesDoPeriodo: mesesDaJanela(HOJE, meses),
    agora: AGORA,
    hojeSP: HOJE,
    comConsultor: false,
    insumos,
  };
}

const ESCRITAS = [
  mockPrisma.aposentadoriaPlano.create,
  mockPrisma.aposentadoriaPlano.update,
  mockPrisma.aposentadoriaPlano.upsert,
  mockPrisma.aposentadoriaPlanoEntry.createMany,
  mockPrisma.aposentadoriaPlanoEntry.updateMany,
  mockPrisma.aposentadoriaPlanoEntry.deleteMany,
];

describe('montarPlanejamento (5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTriggerLazyBackfill.mockResolvedValue(undefined);
  });

  it('sem plano: temPlano false, só o patrimônio realizado', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);
    const b = await montarPlanejamento(ctxCom(3));
    expect(b).toEqual({
      temPlano: false,
      patrimonioRealizado: 500000,
      patrimonioPlanejadoHoje: null,
      metaIndependencia: null,
      metaMensal: null,
      serie: [],
    });
    for (const f of ESCRITAS) expect(f).not.toHaveBeenCalled();
  });

  it('planejado pelo planTraj, realizado manual > snapshot > auto, meta do plano', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(PLANO_ROW);
    const b = await montarPlanejamento(ctxCom(3));
    const s = { ...PLANO_ROW, eventos: [] } as unknown as Parameters<typeof planTraj>[0];
    const traj = planTraj(s);

    expect(b.temPlano).toBe(true);
    // n=3: a série vem com 6 meses (jun–nov)
    expect(b.serie.map((p) => p.mes)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    const nov = b.serie[5];
    expect(offsetDoMes(s, '2026-11')).toBe(10);
    expect(nov.planejado).toBe(Math.round(traj.T[10] * 100) / 100);
    expect(nov.aporteProjetado).toBe(Math.round(traj.C[10] * 100) / 100);
    expect(nov.realizado).toBe(500000);
    expect(b.serie[3].realizado).toBe(999999); // set: manual
    expect(b.serie[4].realizado).toBe(495000); // out: snapshot vence o auto
    expect(b.serie[0].realizado).toBe(410000); // jun: sem snapshot, vale o auto
    expect(b.serie[1].realizado).toBeNull(); // jul: nada
    expect(b.serie[4].rentabilidade).toBeCloseTo(1, 3);
    expect(b.patrimonioPlanejadoHoje).toBe(Math.round(traj.T[10] * 100) / 100);
    expect(b.patrimonioRealizado).toBe(500000);
    expect(b.metaMensal).toBeCloseTo(nomM(s) * 100, 4);
    expect(b.metaIndependencia).toEqual({
      valor: Math.round(calc(s)!.Pr * 100) / 100,
      mes: '2046-01',
    });
    for (const f of ESCRITAS) expect(f).not.toHaveBeenCalled();
  });

  it('investimento realizado = o mesmo da seção 4a (aportesMensais)', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(PLANO_ROW);
    const ctx = ctxCom(3);
    const [plan, cart] = await Promise.all([montarPlanejamento(ctx), montarCarteira(ctx)]);
    const doPeriodo = plan.serie.filter((p) => ctx.mesesDoPeriodo.includes(p.mes));
    expect(doPeriodo.map((p) => ({ mes: p.mes, valor: p.aporteRealizado }))).toEqual(cart.aportes);
  });
});
