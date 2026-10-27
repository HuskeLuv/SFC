import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  cashflowOrcamentoItem: { findMany: vi.fn() },
  cashflowOrcamentoPrefs: { findUnique: vi.fn() },
}));
const mockGetMerged = vi.hoisted(() => vi.fn());
const mockInvestimentos = vi.hoisted(() => vi.fn());
const mockGarantirGerais = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMerged,
}));
vi.mock('../ativacao', () => ({ garantirGerais: mockGarantirGerais }));
vi.mock('@/services/cashflow/investimentosPorMes', () => ({
  computeInvestimentosPorMes: mockInvestimentos,
}));

import { carregarOrcamentoV2, hojeEmSaoPaulo } from '../carregarOrcamento';
import {
  arvoreAnexoB,
  idSub,
  indiceCategoria,
  orcadosAnexoB,
} from '@/test/fixtures/orcamentoAnexoBArvore';

/** 23/10/2026 23:00 em São Paulo (02:00 UTC do dia 24). */
const AGORA = new Date('2026-10-24T02:00:00.000Z');
const RECEITA_ANO = Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, 24_000]));

const linhasDoBanco = () =>
  orcadosAnexoB().map((o) => ({
    ...o,
    valor: new Prisma.Decimal(o.valor!),
    pct: null,
  }));

describe('hojeEmSaoPaulo', () => {
  it('converte para UTC−3 (02:00 UTC do dia 24 ainda é dia 23 em SP)', () => {
    expect(hojeEmSaoPaulo(AGORA)).toEqual({ ano: 2026, mes0: 9, dia: 23 });
    expect(hojeEmSaoPaulo(new Date('2026-01-01T02:59:59Z'))).toEqual({
      ano: 2025,
      mes0: 11,
      dia: 31,
    });
  });
});

describe('carregarOrcamentoV2', () => {
  beforeEach(() => {
    mockGetMerged.mockReset().mockResolvedValue(arvoreAnexoB(RECEITA_ANO));
    mockPrisma.cashflowOrcamentoItem.findMany.mockReset().mockResolvedValue(linhasDoBanco());
    mockPrisma.cashflowOrcamentoPrefs.findUnique.mockReset().mockResolvedValue(null);
    mockInvestimentos.mockReset();
    mockGarantirGerais.mockReset().mockResolvedValue({ criadas: [], adotadas: [] });
  });

  it('monta o Anexo B: T01/T02/T04 com Decimal convertido', async () => {
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(r.resumo).toMatchObject({
      orcado: 18_014.9,
      realizado: 16_176,
      disponivel: 1_838.9,
      orcadoPctReceita: 75.1,
      sobraPrevista: 5_985.1,
      indicePoupanca: 24.9,
      contagens: { estouro: 6, aFrente: 6, semOrcamento: 12 },
    });
    expect(r.referencia).toMatchObject({ dia: 23, fase: 'corrente' });
    expect(r.referencia.atualizadoEm).toBe(AGORA.toISOString());
    expect(r.fonte).toBe('lancado');
  });

  it('consulta só o dono dos dados: árvore do ano, orçados do ano + dez anterior, prefs', async () => {
    await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(mockGetMerged).toHaveBeenCalledTimes(1);
    expect(mockGetMerged).toHaveBeenCalledWith('u1', 2026);
    expect(mockPrisma.cashflowOrcamentoItem.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      OR: [{ ano: 2026 }, { ano: 2025, mes: 11 }],
    });
    expect(mockPrisma.cashflowOrcamentoPrefs.findUnique.mock.calls[0][0].where).toEqual({
      userId: 'u1',
    });
  });

  it('não ativado: não garante Gerais (a estrutura só muda na ativação)', async () => {
    await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(mockGarantirGerais).not.toHaveBeenCalled();
  });

  it('ativado: garante Gerais e relê a árvore só se criou ou adotou alguma', async () => {
    mockPrisma.cashflowOrcamentoPrefs.findUnique.mockResolvedValue({
      categoriasRecolhidas: [],
      graficoVisivel: true,
      fonte: null,
      estruturaCriadaEm: new Date('2026-10-20T12:00:00Z'),
      avisoGeralVistoEm: null,
    });
    await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(mockGarantirGerais).toHaveBeenCalledWith('u1');
    expect(mockGetMerged).toHaveBeenCalledTimes(1);

    mockGetMerged.mockClear();
    mockGarantirGerais.mockResolvedValue({ criadas: ['g1'], adotadas: [] });
    await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(mockGetMerged).toHaveBeenCalledTimes(2);
    expect(mockGetMerged).toHaveBeenLastCalledWith('u1', 2026);
  });

  it('T33: não calcula investimentos (D12)', async () => {
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(mockInvestimentos).not.toHaveBeenCalled();
    expect(r.categorias.some((c) => c.nome === 'Investimentos')).toBe(false);
  });

  it('pct do banco (Decimal) vira número e é convertido pela receita', async () => {
    const plan = indiceCategoria('Planejamento Financeiro');
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      ...linhasDoBanco().filter((o) => o.itemId !== idSub(plan, 1)),
      { itemId: idSub(plan, 1), ano: 2026, mes: 9, valor: null, pct: new Prisma.Decimal('6.3') },
    ]);
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(r.categorias[plan].subcategorias[1]).toMatchObject({ pct: 6.3, orcado: 1_512 });
  });

  it('fonte ausente → a das prefs; fonte do parâmetro prevalece', async () => {
    mockPrisma.cashflowOrcamentoPrefs.findUnique.mockResolvedValue({
      categoriasRecolhidas: ['cat-2'],
      graficoVisivel: false,
      fonte: 'consolidado',
      estruturaCriadaEm: new Date('2026-10-27'),
      avisoGeralVistoEm: null,
    });
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'mes' }, AGORA);
    expect(r.fonte).toBe('consolidado');
    expect(r.prefs).toEqual({
      categoriasRecolhidas: ['cat-2'],
      graficoVisivel: false,
      avisoGeralPendente: true,
    });
    const r2 = await carregarOrcamentoV2(
      'u1',
      { ano: 2026, mes0: 9, visao: 'mes', fonte: 'lancado' },
      AGORA,
    );
    expect(r2.fonte).toBe('lancado');
  });

  it('janeiro sem entrada → monta a árvore do ano anterior para a média', async () => {
    mockGetMerged.mockImplementation(async (_u: string, ano: number) =>
      ano === 2026 ? arvoreAnexoB({ 5: 1_000 }) : arvoreAnexoB({ 11: 9_000 }),
    );
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 0, visao: 'mes' }, AGORA);
    expect(mockGetMerged).toHaveBeenCalledWith('u1', 2025);
    expect(r.receitaPrevista).toEqual({
      valor: 9_000,
      origem: 'media3m',
      mesesBase: [{ ano: 2025, mes: 12 }],
    });
  });

  it('visao=ano repassa a visão (somente leitura)', async () => {
    const r = await carregarOrcamentoV2('u1', { ano: 2026, mes0: 9, visao: 'ano' }, AGORA);
    expect(r.visao).toBe('ano');
    // só outubro tem orçado → o acumulado começa (e termina) em outubro
    expect(r.inicioAcumulado).toBe(10);
    expect(r.mesesSemOrcamento).toEqual([]);
    expect(r.receitaPrevista).toEqual({ valor: 24_000, origem: 'fluxo' });
  });
});
