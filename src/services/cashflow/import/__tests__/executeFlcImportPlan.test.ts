import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFlcImportPlan } from '../executeFlcImportPlan';
import type { FlcGrupoPlano, FlcImportPlan, FlcItemPlano } from '../mapFlcToCashflow';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findUnique: vi.fn() },
  cashflowItem: { create: vi.fn() },
  cashflowValue: { upsert: vi.fn().mockResolvedValue({}) },
}));

const mockEnsurePersonalizedItem = vi.hoisted(() => vi.fn());
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mockEnsurePersonalizedItem,
  personalizeGroup: mockPersonalizeGroup,
}));

const itemPlano = (overrides: Partial<FlcItemPlano> = {}): FlcItemPlano => ({
  linha: 10,
  label: 'Aluguel',
  destino: { tipo: 'existente', itemId: 'item-1', nome: 'Aluguel' },
  escritas: [{ mes: 0, valor: 100 }],
  conflitos: [],
  jaIguais: [],
  ...overrides,
});

const plano = (grupos: FlcGrupoPlano[]): FlcImportPlan => ({
  grupos,
  ignorados: [],
  avisos: [],
  resumo: { itensNovos: 0, celulas: 0, conflitos: 0, jaIguais: 0, ignorados: 0 },
});

const grupoPlano = (itens: FlcItemPlano[], groupId = 'grp-1'): FlcGrupoPlano => ({
  chave: 'habitacao',
  nomePlanilha: 'Habitação',
  destino: { groupId, nome: 'Habitação' },
  itens,
});

describe('executeFlcImportPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null },
    });
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ id: 'grp-1', userId: 'user-1' });
    mockPrisma.cashflowItem.create.mockResolvedValue({ id: 'item-novo' });
    mockPersonalizeGroup.mockResolvedValue('grp-user');
  });

  it('grava escritas de item existente via ensurePersonalizedItem + upsert na chave composta', async () => {
    const rel = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            escritas: [
              { mes: 0, valor: 100 },
              { mes: 3, valor: 50 },
            ],
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockEnsurePersonalizedItem).toHaveBeenCalledWith('item-1', 'user-1');
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith({
      where: {
        itemId_userId_year_month: { itemId: 'item-final', userId: 'user-1', year: 2026, month: 0 },
      },
      update: { value: 100 },
      create: { itemId: 'item-final', userId: 'user-1', year: 2026, month: 0, value: 100 },
    });
    expect(rel).toMatchObject({ celulasGravadas: 2, itensCriados: 0, erros: [] });
  });

  it('política sobrescrever grava o valor da planilha nos conflitos; manter pula', async () => {
    const comConflito = () =>
      plano([
        grupoPlano([
          itemPlano({ escritas: [], conflitos: [{ mes: 1, valorPlanilha: 200, valorApp: 999 }] }),
        ]),
      ]);

    const sobrescreve = await executeFlcImportPlan(comConflito(), 'user-1', 2026, 'sobrescrever');
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 200 } }),
    );
    expect(sobrescreve).toMatchObject({ conflitosSobrescritos: 1, celulasGravadas: 1 });

    vi.clearAllMocks();
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null },
    });
    const mantem = await executeFlcImportPlan(comConflito(), 'user-1', 2026, 'manter');
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(mantem).toMatchObject({ conflitosMantidos: 1, celulasGravadas: 0 });
  });

  it('cria item custom; grupo template é personalizado antes (personalizeGroup)', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ id: 'grp-tpl', userId: null });

    const rel = await executeFlcImportPlan(
      plano([
        grupoPlano(
          [
            itemPlano({
              label: 'Jardineiro',
              destino: { tipo: 'criar', significado: 'Jardim', rank: '3' },
            }),
          ],
          'grp-tpl',
        ),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPersonalizeGroup).toHaveBeenCalledWith('grp-tpl', 'user-1');
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        groupId: 'grp-user',
        name: 'Jardineiro',
        significado: 'Jardim',
        rank: '3',
      },
    });
    expect(rel.itensCriados).toBe(1);
  });

  it('grupo já do usuário não personaliza; itens duplicados (seção repetida) criam só uma vez', async () => {
    const criar = itemPlano({
      label: 'Jardineiro',
      destino: { tipo: 'criar', significado: null, rank: null },
    });
    const rel = await executeFlcImportPlan(
      plano([grupoPlano([criar]), grupoPlano([{ ...criar, escritas: [{ mes: 5, valor: 9 }] }])]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPersonalizeGroup).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledTimes(1);
    expect(rel.itensCriados).toBe(1);
    expect(rel.celulasGravadas).toBe(2);
  });

  it('defensivo: item que virou linha de sonho entre map e execução não é gravado', async () => {
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: 'obj-1' },
    });
    const rel = await executeFlcImportPlan(
      plano([grupoPlano([itemPlano()])]),
      'user-1',
      2026,
      'sobrescrever',
    );
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(rel.celulasGravadas).toBe(0);
    expect(rel.erros).toEqual([]);
  });

  it('erro em um item entra no relatório e não derruba os demais', async () => {
    mockEnsurePersonalizedItem
      .mockRejectedValueOnce(new Error('Item não encontrado'))
      .mockResolvedValueOnce({ itemId: 'item-b', item: { id: 'b', objetivoId: null } });

    const rel = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({ label: 'Quebrado' }),
          itemPlano({ label: 'Ok', destino: { tipo: 'existente', itemId: 'item-2', nome: 'Ok' } }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(rel.erros).toEqual([{ label: 'Quebrado', erro: 'Item não encontrado' }]);
    expect(rel.celulasGravadas).toBe(1);
  });
});
