import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  planejamentoObjetivoEntry: { create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  cashflowItem: { create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import type { MesesRelatorio } from '@/types/relatorioFinanceiro';
import { planned } from '@/services/planejamento/planejamentoSonhos';
import { FRACAO_RITMO, mesesSemDeposito, sonhoRitmo } from '@/services/planejamento/sonhoRitmo';
import type { ContextoMontador, Insumos } from '../insumos';
import { mesesDaJanela, periodoDoRelatorio } from '../periodo';
import { montarSonhos } from '../sonhos';

const AGORA = new Date('2026-11-06T09:42:00-03:00');
const HOJE = { ano: 2026, mes0: 10, dia: 6 };

function ctxCom(meses: MesesRelatorio): ContextoMontador {
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, AGORA),
    mesesDoPeriodo: mesesDaJanela(HOJE, meses),
    agora: AGORA,
    hojeSP: HOJE,
    comConsultor: false,
    insumos: {} as Insumos,
  };
}

const OBJ = { target: 12000, months: 12, available: 0, rate: 0 };

describe('sonhoRitmo (decisão 5)', () => {
  it('good "No ritmo" com saldo no planejado', () => {
    const r = sonhoRitmo({
      statusApp: 'Iniciado',
      objetivo: OBJ,
      saldo: planned(OBJ, 6),
      mesesDecorridos: 6,
      mesesSemAporte: 0,
    });
    expect(r).toEqual({ status: 'good', rotulo: 'No ritmo', mesesSemAporte: 0 });
  });

  it('warn "Abaixo do ritmo" abaixo de 95% do planejado', () => {
    const r = sonhoRitmo({
      statusApp: 'Iniciado',
      objetivo: OBJ,
      saldo: planned(OBJ, 6) * FRACAO_RITMO - 1,
      mesesDecorridos: 6,
      mesesSemAporte: 1,
    });
    expect(r.status).toBe('warn');
    expect(r.rotulo).toBe('Abaixo do ritmo');
    // exatamente 95% ainda é "No ritmo"
    expect(
      sonhoRitmo({
        statusApp: 'Iniciado',
        objetivo: OBJ,
        saldo: planned(OBJ, 6) * FRACAO_RITMO,
        mesesDecorridos: 6,
        mesesSemAporte: 0,
      }).status,
    ).toBe('good');
  });

  it('bad "Sem aporte há N meses" com N ≥ 2 meses fechados', () => {
    const r = sonhoRitmo({
      statusApp: 'Iniciado',
      objetivo: OBJ,
      saldo: 99999,
      mesesDecorridos: 6,
      mesesSemAporte: 4,
    });
    expect(r).toEqual({ status: 'bad', rotulo: 'Sem aporte há 4 meses', mesesSemAporte: 4 });
  });

  it('"Pausado" do usuário vira warn "Pausado", mesmo sem depósitos', () => {
    const r = sonhoRitmo({
      statusApp: 'Pausado',
      objetivo: OBJ,
      saldo: 0,
      mesesDecorridos: 6,
      mesesSemAporte: 5,
    });
    expect(r).toEqual({ status: 'warn', rotulo: 'Pausado', mesesSemAporte: 5 });
  });

  it('"Em espera" (não iniciado) vira warn "Não iniciado", nunca "Sem aporte"', () => {
    const r = sonhoRitmo({
      statusApp: 'Em espera',
      objetivo: OBJ,
      saldo: 0,
      mesesDecorridos: 4,
      mesesSemAporte: 4,
    });
    expect(r).toEqual({ status: 'warn', rotulo: 'Não iniciado', mesesSemAporte: 4 });
  });

  it('meses sem depósito contam só os fechados, do anterior para trás, até o início', () => {
    const entries = [
      { month: '2026-07', aporte: 500 },
      { month: '2026-08', aporte: 0 },
    ];
    // nov é o corrente (parcial, não conta); out, set e ago sem depósito
    expect(mesesSemDeposito(entries, '2026-01', '2026-11')).toBe(3);
    expect(mesesSemDeposito([{ month: '2026-10', aporte: 1 }], '2026-01', '2026-11')).toBe(0);
    // sonho iniciado em out: só out conta
    expect(mesesSemDeposito([], '2026-10', '2026-11')).toBe(1);
    expect(mesesSemDeposito([], '2026-11', '2026-11')).toBe(0);
  });
});

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId: 'u1',
  name: `Sonho ${id}`,
  target: 12000,
  months: 24,
  startDate: '2026-01',
  available: 1000,
  rate: 0,
  priority: 'Moderado',
  category: 'm',
  status: 'Iniciado',
  notes: null,
  createdAt: new Date('2025-12-10T00:00:00Z'),
  updatedAt: new Date('2025-12-10T00:00:00Z'),
  entries: [],
  ...extra,
});

describe('montarSonhos (6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filtra meta 0 e concluídos; monta acumulado, depósito, conclusão e histórico', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([
      row('zero', { target: 0 }),
      row('feito', { status: 'Concluído' }),
      row('a', {
        priority: 'Alta',
        entries: [
          { month: '2026-09', aporte: 500, balance: 4000 },
          { month: '2026-10', aporte: 500, balance: 4500 },
        ],
      }),
      row('b', { status: 'Pausado' }),
    ]);
    const lista = await montarSonhos(ctxCom(3));
    expect(lista.map((s) => s.id)).toEqual(['a', 'b']); // Alta antes de Moderado
    const a = lista[0];
    expect(a).toMatchObject({
      nome: 'Sonho a',
      prioridade: 'Alta',
      prazo: 'Médio',
      meta: 12000,
      acumulado: 4500,
      aporteMensal: Math.round(((12000 - 1000) / 24) * 100) / 100,
      aportadoPeriodo: 1000,
      conclusao: '2028-01',
      mesesSemAporte: 0,
    });
    expect(a.historico.map((h) => h.mes)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(a.historico.map((h) => h.valor)).toEqual([1000, 1000, 1000, 4000, 4500, 4500]);
    expect(lista[1]).toMatchObject({ status: 'warn', rotuloStatus: 'Pausado' });
  });

  it('sonho "Em espera" sem startDate: "Não iniciado", não conta como atrasado', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([
      row('e', {
        status: 'Em espera',
        startDate: null,
        createdAt: new Date('2026-07-10T00:00:00Z'),
      }),
    ]);
    const [e] = await montarSonhos(ctxCom(1));
    expect(e).toMatchObject({ status: 'warn', rotuloStatus: 'Não iniciado' });
  });

  it('sem depósito há meses: bad com N; leitura pura (nada gravado)', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([
      row('c', { entries: [{ month: '2026-06', aporte: 500, balance: 3000 }] }),
    ]);
    const [c] = await montarSonhos(ctxCom(1));
    expect(c.status).toBe('bad');
    expect(c.rotuloStatus).toBe('Sem aporte há 4 meses');
    expect(c.aportadoPeriodo).toBe(0);
    const escritas = [
      mockPrisma.planejamentoObjetivo.create,
      mockPrisma.planejamentoObjetivo.createMany,
      mockPrisma.planejamentoObjetivo.update,
      mockPrisma.planejamentoObjetivo.updateMany,
      mockPrisma.planejamentoObjetivo.upsert,
      mockPrisma.planejamentoObjetivo.delete,
      mockPrisma.planejamentoObjetivoEntry.create,
      mockPrisma.planejamentoObjetivoEntry.upsert,
      mockPrisma.planejamentoObjetivoEntry.deleteMany,
      mockPrisma.cashflowItem.create,
      mockPrisma.cashflowItem.update,
      mockPrisma.cashflowItem.upsert,
    ];
    for (const f of escritas) expect(f).not.toHaveBeenCalled();
  });

  it('sem sonhos: lista vazia', async () => {
    mockPrisma.planejamentoObjetivo.findMany.mockResolvedValue([]);
    expect(await montarSonhos(ctxCom(6))).toEqual([]);
  });
});
