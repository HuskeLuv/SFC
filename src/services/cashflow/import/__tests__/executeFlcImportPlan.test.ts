import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFlcImportPlan } from '../executeFlcImportPlan';
import type { FlcGrupoPlano, FlcImportPlan, FlcItemPlano } from '../mapFlcToCashflow';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findUnique: vi.fn() },
  cashflowItem: { create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  cashflowValue: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
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
  comentarios: [],
  cores: [],
  ...overrides,
});

const plano = (grupos: FlcGrupoPlano[]): FlcImportPlan => ({
  grupos,
  ignorados: [],
  avisos: [],
  resumo: { itensNovos: 0, celulas: 0, conflitos: 0, jaIguais: 0, ignorados: 0, comentarios: 0 },
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
    const { relatorio: rel } = await executeFlcImportPlan(
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

    const { relatorio: sobrescreve } = await executeFlcImportPlan(
      comConflito(),
      'user-1',
      2026,
      'sobrescrever',
    );
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 200 } }),
    );
    expect(sobrescreve).toMatchObject({ conflitosSobrescritos: 1, celulasGravadas: 1 });

    vi.clearAllMocks();
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null },
    });
    const { relatorio: mantem } = await executeFlcImportPlan(
      comConflito(),
      'user-1',
      2026,
      'manter',
    );
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(mantem).toMatchObject({ conflitosMantidos: 1, celulasGravadas: 0 });
  });

  it('preenche significado/rank de item existente vazio (report 10/08, bug #1)', async () => {
    const { relatorio: rel } = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            destino: {
              tipo: 'existente',
              itemId: 'item-1',
              nome: 'Aluguel',
              significado: 'Moradia da família',
              rank: '1',
            },
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'item-final' },
      data: { significado: 'Moradia da família', rank: '1' },
    });
    expect(rel).toMatchObject({ significadosGravados: 1, celulasGravadas: 1 });
  });

  it('não sobrescreve significado preenchido entre o map e a execução (re-check no banco)', async () => {
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null, significado: 'Preenchido pelo usuário agora' },
    });
    const { relatorio: rel } = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            destino: {
              tipo: 'existente',
              itemId: 'item-1',
              nome: 'Aluguel',
              significado: 'Da planilha',
            },
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();
    expect(rel).toMatchObject({ significadosGravados: 0 });
  });

  it('linha só de significado grava metadados sem upsert de valores', async () => {
    const { relatorio: rel } = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            escritas: [],
            destino: {
              tipo: 'existente',
              itemId: 'item-1',
              nome: 'Aluguel',
              significado: 'Só o porquê',
            },
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPrisma.cashflowItem.update).toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(rel).toMatchObject({ significadosGravados: 1, celulasGravadas: 0 });
  });

  it('grava cor da legenda no mesmo upsert do valor (report 10/08, item 4)', async () => {
    const { relatorio: rel } = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            escritas: [{ mes: 0, valor: 100 }],
            cores: [
              { mes: 0, cor: '#FF0000', corApp: null },
              { mes: 2, cor: '#76933C', corApp: null },
            ],
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith({
      where: {
        itemId_userId_year_month: { itemId: 'item-final', userId: 'user-1', year: 2026, month: 0 },
      },
      update: { value: 100, color: '#FF0000' },
      create: {
        itemId: 'item-final',
        userId: 'user-1',
        year: 2026,
        month: 0,
        value: 100,
        color: '#FF0000',
      },
    });
    // cor sem valor no mês 2: cria célula 0 pintada (precedente do comentário)
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { color: '#76933C' } }),
    );
    expect(rel).toMatchObject({ coresGravadas: 2, celulasGravadas: 1 });
  });

  it('cor conflitante segue a política: manter pula, sobrescrever grava', async () => {
    const comCorConflitante = () =>
      plano([
        grupoPlano([
          itemPlano({
            escritas: [],
            cores: [{ mes: 0, cor: '#FF0000', corApp: '#76933C' }],
          }),
        ]),
      ]);

    const { relatorio: mantem } = await executeFlcImportPlan(
      comCorConflitante(),
      'user-1',
      2026,
      'manter',
    );
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(mantem).toMatchObject({ coresGravadas: 0 });

    vi.clearAllMocks();
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null },
    });
    const { relatorio: sobrescreve } = await executeFlcImportPlan(
      comCorConflitante(),
      'user-1',
      2026,
      'sobrescrever',
    );
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { color: '#FF0000' } }),
    );
    expect(sobrescreve).toMatchObject({ coresGravadas: 1 });
  });

  it('cria item custom; grupo template é personalizado antes (personalizeGroup)', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ id: 'grp-tpl', userId: null });

    const { relatorio: rel } = await executeFlcImportPlan(
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
    const { relatorio: rel } = await executeFlcImportPlan(
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

  it('valor e comentário no mesmo mês vão no MESMO upsert; comentário sozinho cria valor 0', async () => {
    const { relatorio: rel } = await executeFlcImportPlan(
      plano([
        grupoPlano([
          itemPlano({
            escritas: [{ mes: 0, valor: 100 }],
            comentarios: [
              { mes: 0, texto: 'Reajuste em janeiro', textoApp: null },
              { mes: 4, texto: 'Célula vazia comentada', textoApp: null },
            ],
          }),
        ]),
      ]),
      'user-1',
      2026,
      'sobrescrever',
    );

    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith({
      where: {
        itemId_userId_year_month: { itemId: 'item-final', userId: 'user-1', year: 2026, month: 0 },
      },
      update: { value: 100, comment: 'Reajuste em janeiro' },
      create: {
        itemId: 'item-final',
        userId: 'user-1',
        year: 2026,
        month: 0,
        value: 100,
        comment: 'Reajuste em janeiro',
      },
    });
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith({
      where: {
        itemId_userId_year_month: { itemId: 'item-final', userId: 'user-1', year: 2026, month: 4 },
      },
      update: { comment: 'Célula vazia comentada' },
      create: {
        itemId: 'item-final',
        userId: 'user-1',
        year: 2026,
        month: 4,
        value: 0,
        comment: 'Célula vazia comentada',
      },
    });
    expect(rel).toMatchObject({ celulasGravadas: 1, comentariosGravados: 2 });
  });

  it('comentário conflitante (app já tem outro texto) segue a política: manter pula, sobrescrever grava', async () => {
    const comConflito = () =>
      plano([
        grupoPlano([
          itemPlano({
            escritas: [],
            comentarios: [{ mes: 2, texto: 'Da planilha', textoApp: 'Do app' }],
          }),
        ]),
      ]);

    const { relatorio: mantem } = await executeFlcImportPlan(
      comConflito(),
      'user-1',
      2026,
      'manter',
    );
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
    expect(mantem).toMatchObject({ comentariosGravados: 0 });

    vi.clearAllMocks();
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: null },
    });
    const { relatorio: sobrescreve } = await executeFlcImportPlan(
      comConflito(),
      'user-1',
      2026,
      'sobrescrever',
    );
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { comment: 'Da planilha' } }),
    );
    expect(sobrescreve).toMatchObject({ comentariosGravados: 1 });
  });

  it('defensivo: item que virou linha de sonho entre map e execução não é gravado', async () => {
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-final',
      item: { id: 'item-1', objetivoId: 'obj-1' },
    });
    const { relatorio: rel } = await executeFlcImportPlan(
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

    const { relatorio: rel } = await executeFlcImportPlan(
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
