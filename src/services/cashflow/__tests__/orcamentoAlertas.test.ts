import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowOrcamento: { findMany: vi.fn() },
  notification: { findMany: vi.fn(), create: vi.fn() },
}));
const mockGetMergedGroups = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('../getCashflowTree', () => ({ getMergedCashflowGroups: mockGetMergedGroups }));

import { checkOrcamentoAlertas, rankDoConsumo } from '../orcamentoAlertas';
import type { CashflowGroup } from '@/types/cashflow';

// 20/08/2026 15:00 UTC = 12:00 BRT → mês corrente = agosto (7) de 2026.
const NOW = new Date(Date.UTC(2026, 7, 20, 15));

/** Grupo de despesa custom na raiz — vira categoria direta no orçamento. */
const grupoDespesa = (
  id: string,
  name: string,
  valores: Array<{ month: number; value: number }>,
): CashflowGroup =>
  ({
    id,
    userId: 'u1',
    name,
    type: 'despesa',
    parentId: null,
    orderIndex: 0,
    children: [],
    items: [
      {
        id: `${id}-item`,
        values: valores.map((v) => ({ month: v.month, value: v.value, color: null })),
      },
    ],
  }) as unknown as CashflowGroup;

const metaRow = (groupId: string, valor: number) => ({
  groupId,
  tipo: 'grupo',
  tipoMeta: 'valor',
  valor,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([]);
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.create.mockResolvedValue({});
  mockGetMergedGroups.mockResolvedValue([]);
});

describe('rankDoConsumo', () => {
  it('mapeia os níveis com tolerância de arredondamento', () => {
    expect(rankDoConsumo(3375, 4220)).toBe(0); // 79,97%
    expect(rankDoConsumo(3420, 4220)).toBe(1); // 81%
    expect(rankDoConsumo(4220, 4220)).toBe(2); // 100% exato
    expect(rankDoConsumo(4219.996, 4220)).toBe(2); // 100% com ruído de round2
    expect(rankDoConsumo(4220.01, 4220)).toBe(3); // estourou
    expect(rankDoConsumo(100, 0)).toBe(0); // sem meta válida
  });
});

describe('checkOrcamentoAlertas', () => {
  it('cria alerta de atenção quando a categoria cruza 80% no mês corrente', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 4220)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 3420 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toEqual([
      { groupId: 'g-hab', categoria: 'Habitação', nivel: 'atencao', consumoPct: 81 },
    ]);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.type).toBe('orcamento_alerta');
    expect(data.title).toContain('81%');
    expect(data.metadata).toMatchObject({ year: 2026, month: 7, groupId: 'g-hab', rank: 1 });
  });

  it('consumo pula direto para >100%: sai SÓ o alerta de estouro', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 1200 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toHaveLength(1);
    expect(criados[0].nivel).toBe('estourado');
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('exatamente 100% é "atingido", não estouro', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 1000 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toHaveLength(1);
    expect(criados[0].nivel).toBe('atingido');
  });

  it('dedup: nível já notificado no mês não repete; nível maior notifica', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockPrisma.notification.findMany.mockResolvedValue([
      { metadata: { year: 2026, month: 7, groupId: 'g-hab', rank: 1 } },
    ]);

    // Continua em 85%: nada novo.
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 850 }]),
    ]);
    expect(await checkOrcamentoAlertas('u1', { now: NOW })).toEqual([]);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();

    // Subiu para 100%: notifica o nível novo.
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 1000 }]),
    ]);
    const criados = await checkOrcamentoAlertas('u1', { now: NOW });
    expect(criados).toHaveLength(1);
    expect(criados[0].nivel).toBe('atingido');
  });

  it('gasto em outro mês não alerta (só o mês corrente conta)', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 6, value: 5000 }]),
    ]);

    expect(await checkOrcamentoAlertas('u1', { now: NOW })).toEqual([]);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('sem metas: retorna vazio sem carregar a árvore', async () => {
    expect(await checkOrcamentoAlertas('u1', { now: NOW })).toEqual([]);
    expect(mockGetMergedGroups).not.toHaveBeenCalled();
  });

  it('reaproveita a árvore do caller quando o ano bate', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    const groups = [grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 900 }])];

    const criados = await checkOrcamentoAlertas('u1', { now: NOW, groups, groupsYear: 2026 });

    expect(mockGetMergedGroups).not.toHaveBeenCalled();
    expect(criados[0]?.nivel).toBe('atencao');
  });

  it('árvore de outro ano é ignorada e recarregada', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    const groupsVelhos = [grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 999999 }])];
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 100 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', {
      now: NOW,
      groups: groupsVelhos,
      groupsYear: 2025,
    });

    expect(mockGetMergedGroups).toHaveBeenCalledWith('u1', 2026);
    expect(criados).toEqual([]);
  });
});
