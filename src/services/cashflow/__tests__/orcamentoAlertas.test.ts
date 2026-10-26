import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowOrcamento: { findMany: vi.fn() },
  cashflowOrcamentoItem: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  notification: { findMany: vi.fn(), create: vi.fn() },
}));
const mockGetMergedGroups = vi.hoisted(() => vi.fn());
const mockEnviarPush = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('../getCashflowTree', () => ({ getMergedCashflowGroups: mockGetMergedGroups }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mockEnviarPush }));

import { checkOrcamentoAlertas, rankDoConsumo } from '../orcamentoAlertas';
import { limparCacheAcessoOrcamentoV2 } from '../orcamentoV2/acesso';
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
  vi.unstubAllEnvs();
  limparCacheAcessoOrcamentoV2('u1');
  mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([]);
  mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.create.mockResolvedValue({ id: 'notif-criada' });
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
    // Gancho de web push (fase 5): dispara com a notificação criada; o título
    // real não embute R$ — os valores ficam só na message, que não sai no push.
    expect(mockEnviarPush).toHaveBeenCalledWith({ id: 'notif-criada' });
    expect(data.title).not.toContain('R$');
    expect(data.message).toContain('R$');
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

// ---------------------------------------------------------------------------
// Orçamento v2 (desenho técnico §3.3, PR 12): `liberada && ativado` → orçado v2 da categoria.
// ---------------------------------------------------------------------------

const ATIVADO_EM = new Date(Date.UTC(2026, 7, 20, 12));

/** Perfil lido por `estadoAcessoOrcamentoV2` (beta + ativação numa query só). */
const perfilV2 = ({ beta, ativado }: { beta: boolean; ativado: boolean }) => ({
  featureBetas: beta ? [{ id: 'fb-1' }] : [],
  cashflowOrcamentoPrefs: ativado ? { estruturaCriadaEm: ATIVADO_EM } : null,
});

/**
 * Categoria Habitação já personalizada pela ativação: id do override + `templateId` do template,
 * com duas subcategorias (Aluguel e a Geral) e o realizado do mês corrente em cada uma.
 */
const categoriaV2 = (realAluguel: number, realGeral: number): CashflowGroup =>
  ({
    id: 'ovr-hab',
    userId: 'u1',
    templateId: 'tpl-hab',
    name: 'Habitação',
    type: 'despesa',
    parentId: null,
    orderIndex: 0,
    children: [],
    items: [
      {
        id: 'it-aluguel',
        name: 'Aluguel',
        values: [{ month: 7, value: realAluguel, color: null }],
      },
      {
        id: 'it-geral',
        name: 'Geral',
        isGeral: true,
        values: [{ month: 7, value: realGeral, color: null }],
      },
    ],
  }) as unknown as CashflowGroup;

const orcadoV2 = (itemId: string, valor: number | null, mes = 7) => ({
  itemId,
  ano: 2026,
  mes,
  valor,
  pct: null,
});

const ligarV2 = () => vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');

describe('checkOrcamentoAlertas — Orçamento v2', () => {
  it('ativado e liberado: alerta de 80% usa a soma dos orçados v2 das subcategorias', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      orcadoV2('it-aluguel', 800),
      orcadoV2('it-geral', 200),
    ]);
    // Tabela antiga com outra meta: não pode ser lida.
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('ovr-hab', 5000)]);
    mockGetMergedGroups.mockResolvedValue([categoriaV2(700, 150)]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toEqual([
      { groupId: 'ovr-hab', categoria: 'Habitação', nivel: 'atencao', consumoPct: 85 },
    ]);
    expect(mockPrisma.cashflowOrcamento.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowOrcamentoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', ano: 2026, mes: 7 } }),
    );
    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.metadata).toMatchObject({
      year: 2026,
      month: 7,
      groupId: 'ovr-hab',
      rank: 1,
      meta: 1000,
      real: 850,
      orcamento: 'v2',
    });
    expect(mockEnviarPush).toHaveBeenCalledTimes(1);
  });

  it('ativado: 100% do orçado v2 é "atingido" e acima é "estourado"', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      orcadoV2('it-aluguel', 800),
      orcadoV2('it-geral', 200),
    ]);

    mockGetMergedGroups.mockResolvedValue([categoriaV2(800, 200)]);
    expect((await checkOrcamentoAlertas('u1', { now: NOW }))[0]?.nivel).toBe('atingido');

    mockGetMergedGroups.mockResolvedValue([categoriaV2(900, 200)]);
    expect((await checkOrcamentoAlertas('u1', { now: NOW }))[0]?.nivel).toBe('estourado');
  });

  it('ativado: orçado em % é convertido pela receita prevista do mês (R-17)', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      { itemId: 'it-aluguel', ano: 2026, mes: 7, valor: null, pct: 10 },
    ]);
    const entradas = {
      id: 'entradas',
      userId: null,
      name: 'Entradas',
      type: 'entrada',
      parentId: null,
      orderIndex: 0,
      children: [],
      items: [
        {
          id: 'salario',
          name: 'Salário',
          values: [0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ month: m, value: 10000, color: null })),
        },
      ],
    } as unknown as CashflowGroup;
    mockGetMergedGroups.mockResolvedValue([entradas, categoriaV2(900, 0)]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    // 10% de 10.000 = 1.000 de orçado; 900 lançados = 90%.
    expect(criados).toEqual([
      { groupId: 'ovr-hab', categoria: 'Habitação', nivel: 'atencao', consumoPct: 90 },
    ]);
  });

  it('ativado sem orçado v2 no mês: nada a alertar, sem carregar a árvore', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([orcadoV2('it-aluguel', null)]);
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('ovr-hab', 100)]);

    expect(await checkOrcamentoAlertas('u1', { now: NOW })).toEqual([]);
    expect(mockGetMergedGroups).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('dia da ativação: nível já notificado pelo id do template não repete no override', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      orcadoV2('it-aluguel', 800),
      orcadoV2('it-geral', 200),
    ]);
    // Alerta de 80% gravado de manhã pela tabela antiga, com o id do grupo de template.
    mockPrisma.notification.findMany.mockResolvedValue([
      { metadata: { year: 2026, month: 7, groupId: 'tpl-hab', rank: 1 } },
    ]);

    mockGetMergedGroups.mockResolvedValue([categoriaV2(700, 150)]);
    expect(await checkOrcamentoAlertas('u1', { now: NOW })).toEqual([]);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockEnviarPush).not.toHaveBeenCalled();

    // Nível maior ainda notifica.
    mockGetMergedGroups.mockResolvedValue([categoriaV2(800, 200)]);
    const criados = await checkOrcamentoAlertas('u1', { now: NOW });
    expect(criados).toHaveLength(1);
    expect(criados[0].nivel).toBe('atingido');
  });

  it('liberado mas NÃO ativado: caminho antigo (cashflow_orcamentos), como hoje', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: false }));
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 850 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toEqual([
      { groupId: 'g-hab', categoria: 'Habitação', nivel: 'atencao', consumoPct: 85 },
    ]);
    expect(mockPrisma.cashflowOrcamentoItem.findMany).not.toHaveBeenCalled();
    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.metadata).not.toHaveProperty('orcamento');
  });

  it('ativado mas fora do beta: caminho antigo', async () => {
    ligarV2();
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: false, ativado: true }));
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('g-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([
      grupoDespesa('g-hab', 'Habitação', [{ month: 7, value: 1000 }]),
    ]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados[0]?.nivel).toBe('atingido');
    expect(mockPrisma.cashflowOrcamentoItem.findMany).not.toHaveBeenCalled();
  });

  it('flag desligada: ativado volta para a tabela antiga, sem consultar o perfil v2', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(perfilV2({ beta: true, ativado: true }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([orcadoV2('it-aluguel', 10)]);
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([metaRow('ovr-hab', 1000)]);
    mockGetMergedGroups.mockResolvedValue([categoriaV2(700, 150)]);

    const criados = await checkOrcamentoAlertas('u1', { now: NOW });

    expect(criados).toEqual([
      { groupId: 'ovr-hab', categoria: 'Habitação', nivel: 'atencao', consumoPct: 85 },
    ]);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowOrcamentoItem.findMany).not.toHaveBeenCalled();
  });
});
