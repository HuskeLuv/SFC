import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AVISO_LIQUIDEZ_RESERVA,
  AVISO_SAUDE_RESERVA,
  MOTIVO_COM_COTACAO,
  MOTIVO_EM_VALIDACAO,
  MOTIVO_PLANEJADO_RV,
  MOTIVO_SALDO_SEM_TITULO,
  MOTIVO_SEM_COTACAO,
  MOTIVO_SEM_COTACAO_BOLSA,
} from '@/lib/carteiraMover';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  asset: { findUnique: vi.fn() },
  userChangeLog: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
const mockPricer = vi.hoisted(() => vi.fn());
const mockBuildSaude = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockPricer,
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: mockBuildSaude,
}));

import {
  carregarItemMover,
  estadoAtualDe,
  estadoSnapshotDe,
  moverInvestimento,
  obterCategoriaAtivo,
  obterOpcoesMover,
  restaurarOriginal,
  tesouroDestinoDaCompra,
  MSG_ABA_FORA_DA_FASE,
  MSG_ESCOLHA_SECAO,
  MSG_SECAO_SEGUE_CVM,
  type ItemMover,
} from '../moverInvestimento';

const asset = (over: Record<string, unknown>) => ({
  id: 'a-1',
  symbol: 'X',
  name: 'X',
  type: 'stock',
  currency: 'BRL',
  source: 'brapi',
  ...over,
});

const posicao = (a: ReturnType<typeof asset>, over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  userId: 'user-1',
  assetId: a.id,
  quantity: 1,
  avgPrice: 1,
  totalInvested: 1,
  objetivo: 0,
  estrategia: null,
  tipoFii: null,
  regiaoEtf: null,
  categoriaOverride: null,
  tipoFundo: null,
  lastUpdate: new Date(),
  planejamentoObjetivoId: null,
  vinculoAposentadoria: false,
  asset: a,
  ...over,
});

const O = asset({ id: 'a-o', symbol: 'O', name: 'Realty Income', type: 'reit', currency: 'USD' });
const AAPL = asset({ id: 'a-aapl', symbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD' });
const IVVB11 = asset({ id: 'a-ivvb', symbol: 'IVVB11', name: 'iShares S&P 500', type: 'etf' });
const VOO = asset({ id: 'a-voo', symbol: 'VOO', name: 'Vanguard', type: 'etf', currency: 'USD' });
const FUNDO_RF = asset({ id: 'a-f', symbol: 'FUNDO-ABC', name: 'Fundo RF', type: 'fund-rf' });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.portfolio.update.mockImplementation(async ({ data }) => ({
    ...posicao(AAPL),
    ...data,
  }));
});

describe('carregarItemMover', () => {
  it('lê das compras a seção mais recente que existe (aporte sem o campo não conta) e a pista de RF', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(O));
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { notes: JSON.stringify({ operation: { action: 'aporte' } }) },
      { notes: JSON.stringify({ estrategiaReit: 'growth' }) },
      { notes: JSON.stringify({ estrategiaReit: 'risk' }) },
    ]);
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue({ id: 'fi-1' });
    const item = (await carregarItemMover('user-1', 'posicao', 'p-1'))!;
    expect(item.tipo).toBe('posicao');
    expect(item.temRendaFixa).toBe(true);
    expect(item.notes).toEqual({ estrategiaReit: 'growth', tipoFundo: undefined });
    expect(item.row).not.toHaveProperty('asset');
  });

  it('notes malformadas viram null; linha sem asset = null', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(O));
    mockPrisma.stockTransaction.findMany.mockResolvedValue([{ notes: '{quebrado' }]);
    expect((await carregarItemMover('user-1', 'posicao', 'p-1'))!.notes).toBeNull();

    mockPrisma.portfolio.findFirst.mockResolvedValue({ ...posicao(O), asset: null, assetId: null });
    expect(await carregarItemMover('user-1', 'posicao', 'p-1')).toBeNull();
  });
});

describe('estado atual', () => {
  it('REIT: subgrupo vem de notes.estrategiaReit quando a coluna é null', () => {
    const { asset: a, ...row } = posicao(O);
    const item = {
      tipo: 'posicao',
      row,
      asset: a,
      temRendaFixa: false,
      notes: { estrategiaReit: 'risk' },
    } as unknown as ItemMover;
    expect(estadoAtualDe(item)).toEqual({
      categoria: 'reits',
      base: 'reits',
      subgrupo: 'risk',
      override: false,
    });
  });

  it('estadoSnapshotDe separa posição (colunas + objetivo) e planejado (secao)', () => {
    expect(
      estadoSnapshotDe('posicao', {
        categoriaOverride: 'acoes',
        estrategia: 'value',
        tipoFii: 'tvm',
        regiaoEtf: null,
        tipoFundo: null,
        objetivo: 3,
      }),
    ).toEqual({
      categoriaOverride: 'acoes',
      estrategia: 'value',
      tipoFii: 'tvm',
      regiaoEtf: null,
      tipoFundo: null,
      objetivo: 3,
    });
    expect(
      estadoSnapshotDe('planejado', { categoriaOverride: null, objetivo: 3, secao: 'growth' }),
    ).toEqual({ categoriaOverride: null, secao: 'growth' });
  });
});

describe('moverInvestimento — matriz', () => {
  it('Stock (USD) → REITs grava override reits + estrategia', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(AAPL, { estrategia: 'growth' }));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'reits',
      subgrupo: 'growth',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'reits',
      estrategia: 'growth',
    });
  });

  it('ETF: região é livre dentro da aba (USD para Brasil)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(VOO, { regiaoEtf: 'estados_unidos' }));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'etfs',
      subgrupo: 'brasil',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      regiaoEtf: 'brasil',
    });
  });

  it('ETF em dólar ↔ Stocks fica "em validação" (409)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(VOO));
    await expect(
      moverInvestimento('user-1', {
        tipo: 'posicao',
        id: 'p-1',
        categoria: 'stocks',
        subgrupo: 'value',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_EM_VALIDACAO });
  });

  it('ETF B3 (IVVB11) → Ações é permitido', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(IVVB11));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'acoes',
      subgrupo: 'value',
    });
    expect(r.noop).toBe(false);
  });

  it('Fundo com FixedIncomeAsset: só troca de subgrupo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(FUNDO_RF));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue({ id: 'fi' });
    await expect(
      moverInvestimento('user-1', {
        tipo: 'posicao',
        id: 'p-1',
        categoria: 'acoes',
        subgrupo: 'value',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_SEM_COTACAO });
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'fimFia',
      subgrupo: 'fidc',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      tipoFundo: 'fidc',
    });
  });
});

describe('moverInvestimento — planejado de fundo classificado pela CVM', () => {
  const planejadoFundo = (type: string) => {
    const fundo = asset({ id: 'a-fundo', symbol: 'CVM-123', name: 'Fundo Y', type, source: 'cvm' });
    return {
      id: 'w-1',
      userId: 'user-1',
      assetId: fundo.id,
      addedAt: new Date(),
      notes: null,
      objetivo: 3,
      secao: 'fim',
      categoriaOverride: null,
      asset: fundo,
    };
  };

  it('trocar só a seção é recusado (a aba exibe a seção da CVM) e nada é gravado', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(planejadoFundo('fia'));
    await expect(
      moverInvestimento('user-1', {
        tipo: 'planejado',
        id: 'w-1',
        categoria: 'fimFia',
        subgrupo: 'fim',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MSG_SECAO_SEGUE_CVM });
    expect(mockPrisma.watchlist.update).not.toHaveBeenCalled();
  });

  it('fundo genérico (fund) planejado continua trocando de seção', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(planejadoFundo('fund'));
    mockPrisma.watchlist.update.mockImplementation(async ({ data }) => ({
      ...planejadoFundo('fund'),
      ...data,
    }));
    const r = await moverInvestimento('user-1', {
      tipo: 'planejado',
      id: 'w-1',
      categoria: 'fimFia',
      subgrupo: 'fidc',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.watchlist.update.mock.calls[0][0].data).toMatchObject({ secao: 'fidc' });
  });
});

describe('restaurarOriginal', () => {
  it('sem histórico (expurgado): só limpa o override', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(AAPL, { categoriaOverride: 'reits', estrategia: 'risk' }),
    );
    const r = await restaurarOriginal('user-1', 'posicao', 'p-1');
    const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(data.categoriaOverride).toBeNull();
    expect(data).not.toHaveProperty('estrategia');
    expect(r.destino).toEqual({ categoria: 'stocks', subgrupo: 'risk' });
  });
});

describe('obterOpcoesMover / obterCategoriaAtivo', () => {
  it('null quando o item não existe', async () => {
    expect(await obterOpcoesMover('user-1', 'planejado', 'w-x')).toBeNull();
  });

  it('planejado em Fundos (fiagro sugerido pelo nome) e sem aviso de objetivo', async () => {
    const fii = asset({ id: 'a-agro', symbol: 'RZAG11', name: 'Riza Fiagro', type: 'fii' });
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'w-1',
      userId: 'user-1',
      assetId: fii.id,
      addedAt: new Date(),
      notes: null,
      objetivo: 8,
      secao: 'tijolo',
      categoriaOverride: null,
      asset: fii,
    });
    const r = (await obterOpcoesMover('user-1', 'planejado', 'w-1'))!;
    expect(r.atual).toMatchObject({ categoria: 'fiis', subgrupo: 'tijolo' });
    const fundos = r.destinos.find((d) => d.categoria === 'fimFia')!;
    expect(fundos.subgrupoSugerido).toBe('fiagro');
    expect(fundos.avisos.some((a) => a.includes('objetivo'))).toBe(false);
  });

  it('categoria pelo planejado quando não há posição', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(AAPL);
    mockPrisma.watchlist.findFirst.mockResolvedValue({ categoriaOverride: 'reits' });
    expect(await obterCategoriaAtivo('user-1', 'a-aapl')).toEqual({
      categoria: 'reits',
      override: true,
    });
  });
});

// ── FASE 2 (Reservas + Renda Fixa), atrás de MOVER_CAIXA_RF_HABILITADO ─────────

describe('fase 2 — Reservas + Renda Fixa', () => {
  const CDB = asset({
    id: 'a-cdb',
    symbol: 'RENDA-FIXA-CDB-BANCO-X',
    name: 'CDB Banco X 110% CDI',
    type: 'bond',
    source: 'manual',
  });
  const CONTA = asset({
    id: 'a-cc',
    symbol: 'CONTA-CORRENTE-OPORT-1',
    name: 'Conta corrente',
    type: 'opportunity',
    source: 'manual',
  });
  const TESOURO_PRE = asset({
    id: 'a-tpre',
    symbol: 'TESOURO-PREFIXADO-2029',
    name: 'Tesouro Prefixado 2029',
    type: 'tesouro-direto',
    source: 'tesouro',
  });
  const KDIF11 = asset({ id: 'a-kdif', symbol: 'KDIF11', name: 'Kinea Infra', type: 'fii' });
  const VALE3 = asset({ id: 'a-vale', symbol: 'VALE3', name: 'Vale', type: 'stock' });

  const fi = (over: Record<string, unknown> = {}) => ({
    id: 'fi-1',
    userId: 'user-1',
    assetId: 'a-cdb',
    type: 'CDB_PRE',
    description: 'CDB',
    startDate: new Date('2026-01-02T00:00:00Z'),
    maturityDate: new Date('2030-01-02T00:00:00Z'),
    investedAmount: 10_000,
    annualRate: 0,
    indexer: 'CDI',
    indexerPercent: 110,
    liquidityType: null,
    taxExempt: false,
    tesouroBondType: null,
    tesouroMaturity: null,
    asset: null,
    ...over,
  });

  type FindManyArgs = { select?: { assetId?: boolean } } | undefined;

  /** stockTransaction.findMany: compras (notes da posição) × marcador de reserva do Tesouro. */
  const comTransacoes = (
    compras: { notes: string | null }[],
    marcadas: { assetId: string; notes: string }[] = [],
  ) =>
    mockPrisma.stockTransaction.findMany.mockImplementation(async (args: FindManyArgs) =>
      args?.select?.assetId ? marcadas : compras,
    );

  const update = () => mockPrisma.portfolio.update.mock.calls[0][0].data;

  const resetarMocks = () => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.update.mockImplementation(async ({ data }) => ({
      ...posicao(CDB),
      ...data,
    }));
  };

  beforeEach(() => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPricer.mockResolvedValue({ getCurrentValue: () => 11_500 });
    mockBuildSaude.mockResolvedValue({
      indicadores: { benchmarks: { reservaEmergencia: { atual: 18_400, necessario: 30_000 } } },
    });
    mockPrisma.portfolio.update.mockImplementation(async ({ data }) => ({
      ...posicao(CDB),
      ...data,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CDB da RF → Emergência → Oportunidade → volta à RF (override, seção, objetivo)', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB, { objetivo: 4 }));
    const r1 = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'reservaEmergencia',
    });
    if (r1.noop) throw new Error('noop');
    expect(update()).toMatchObject({ categoriaOverride: 'reservaEmergencia', objetivo: 0 });
    // Sem coluna de subgrupo nas 3 abas.
    for (const c of ['estrategia', 'tipoFii', 'regiaoEtf', 'tipoFundo']) {
      expect(update()).not.toHaveProperty(c);
    }
    expect(r1.origem).toEqual({ categoria: 'rendaFixaFundos', subgrupo: 'pos-fixada' });
    expect(r1.destino).toEqual({ categoria: 'reservaEmergencia', subgrupo: null });
    expect(r1.objetivoZerado).toBe(true);

    resetarMocks();
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(CDB, { categoriaOverride: 'reservaEmergencia' }),
    );
    // O subgrupo enviado é ignorado no trio (seção não editável).
    const r2 = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'reservaOportunidade',
      subgrupo: 'qualquer',
    });
    expect(r2.noop).toBe(false);
    expect(update()).toEqual({
      categoriaOverride: 'reservaOportunidade',
      lastUpdate: expect.any(Date),
    });

    resetarMocks();
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(CDB, { categoriaOverride: 'reservaOportunidade' }),
    );
    const r3 = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'rendaFixaFundos',
    });
    if (r3.noop) throw new Error('noop');
    expect(update().categoriaOverride).toBeNull();
    expect(update()).not.toHaveProperty('objetivo'); // já era 0
    expect(r3.destino).toEqual({ categoria: 'rendaFixaFundos', subgrupo: 'pos-fixada' });
  });

  it('mesma aba no trio = noop (sem gravar)', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'rendaFixaFundos',
      subgrupo: 'prefixada',
    });
    expect(r).toEqual({ noop: true });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('conta corrente (saldo sem título) → RF 409; → Emergência OK', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CONTA));
    await expect(
      moverInvestimento('user-1', { tipo: 'posicao', id: 'p-1', categoria: 'rendaFixaFundos' }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_SALDO_SEM_TITULO });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();

    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'reservaEmergencia',
    });
    expect(r.noop).toBe(false);
    expect(update().categoriaOverride).toBe('reservaEmergencia');
  });

  it('Tesouro de catálogo de reserva → RF (seção pelo título) e restaurar volta à reserva', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(
      fi({
        assetId: TESOURO_PRE.id,
        indexer: 'CDI', // o FI de reserva nasce com o indexador padrão
        tesouroBondType: 'Tesouro Prefixado',
        liquidityType: 'DAILY',
      }),
    );
    comTransacoes(
      [{ notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia', benchmark: 'CDI' }) }],
      [
        {
          assetId: TESOURO_PRE.id,
          notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
        },
      ],
    );
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(TESOURO_PRE));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'rendaFixaFundos',
    });
    if (r.noop) throw new Error('noop');
    expect(update().categoriaOverride).toBe('rendaFixaFundos');
    expect(r.origem).toEqual({ categoria: 'reservaEmergencia', subgrupo: null });
    // Pré-fixada pelo tipo do título, não "Pós" pelo CDI padrão do FI de reserva.
    expect(r.destino).toEqual({ categoria: 'rendaFixaFundos', subgrupo: 'prefixada' });

    // A base vem da 1ª compra marcada (reservaDestinoPorAsset, ordem determinística).
    const consulta = mockPrisma.stockTransaction.findMany.mock.calls.find(
      ([a]) => (a as FindManyArgs)?.select?.assetId,
    )![0];
    expect(consulta.orderBy).toEqual([{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);

    mockPrisma.portfolio.update.mockClear();
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(TESOURO_PRE, { categoriaOverride: 'rendaFixaFundos' }),
    );
    const v = await restaurarOriginal('user-1', 'posicao', 'p-1');
    expect(update().categoriaOverride).toBeNull();
    expect(v.origem).toEqual({ categoria: 'rendaFixaFundos', subgrupo: 'prefixada' });
    expect(v.destino).toEqual({ categoria: 'reservaEmergencia', subgrupo: null });
  });

  it('bloqueios: RF → Ações, FII → Reserva, planejado → RF (409 com motivo)', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB));
    await expect(
      moverInvestimento('user-1', {
        tipo: 'posicao',
        id: 'p-1',
        categoria: 'acoes',
        subgrupo: 'value',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_SEM_COTACAO_BOLSA });

    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    await expect(
      moverInvestimento('user-1', { tipo: 'posicao', id: 'p-1', categoria: 'reservaEmergencia' }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_COM_COTACAO });

    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'w-1',
      userId: 'user-1',
      assetId: VALE3.id,
      addedAt: new Date(),
      notes: null,
      objetivo: 0,
      secao: 'value',
      categoriaOverride: null,
      asset: VALE3,
    });
    await expect(
      moverInvestimento('user-1', { tipo: 'planejado', id: 'w-1', categoria: 'rendaFixaFundos' }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_PLANEJADO_RV });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(mockPrisma.watchlist.update).not.toHaveBeenCalled();
  });

  it('aba com seção editável sem subgrupo → 400 "Escolha a seção"', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    await expect(
      moverInvestimento('user-1', { tipo: 'posicao', id: 'p-1', categoria: 'acoes' }),
    ).rejects.toMatchObject({ statusCode: 400, message: MSG_ESCOLHA_SECAO });
  });

  it('GET: CDB sem liquidez diária e vencimento distante → aviso de liquidez, Saúde e valor', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi({ liquidityType: null }));
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB));
    const r = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
    expect(r.movivel).toBe(true);
    expect(r.modelo).toBe('curva');
    expect(r.grupo).toBe('caixaRf');
    expect(r.atual).toMatchObject({
      categoria: 'rendaFixaFundos',
      subgrupo: 'pos-fixada',
      subgrupoLabel: 'Pós-fixada',
    });
    expect(r.item.valorAtualBRL).toBe(11_500);
    // Nome das abas do trio: descrição do FI (não o Asset.name com valor e data).
    expect(r.item.nome).toBe('CDB');
    expect(r.saudePrevia).toEqual({ reservaAtual: 18_400, necessario: 30_000 });
    expect(r.destinos.map((d) => d.categoria)).toEqual([
      'reservaEmergencia',
      'reservaOportunidade',
      'rendaFixaFundos',
      'fimFia',
      'fiis',
      'acoes',
      'stocks',
      'reits',
      'etfs',
    ]);
    const porCat = Object.fromEntries(r.destinos.map((d) => [d.categoria, d]));
    expect(porCat.reservaEmergencia).toMatchObject({
      permitido: true,
      subgrupos: [],
      subgrupoEditavel: false,
      avisos: [AVISO_LIQUIDEZ_RESERVA, AVISO_SAUDE_RESERVA],
    });
    expect(porCat.reservaOportunidade.avisos).toEqual([]);
    expect(porCat.rendaFixaFundos).toMatchObject({
      permitido: true,
      subgrupoEditavel: false,
      secaoAutomatica: { id: 'pos-fixada', label: 'Pós-fixada', via: 'indexador' },
    });
    expect(porCat.acoes).toMatchObject({ permitido: false, motivo: MOTIVO_SEM_COTACAO_BOLSA });

    // Com liquidez diária: só o aviso da Saúde.
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi({ liquidityType: 'DAILY' }));
    const r2 = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
    expect(r2.destinos[0].avisos).toEqual([AVISO_SAUDE_RESERVA]);
  });

  it('GET: Saúde e pricer com erro → saudePrevia null e sem valor (frase fixa)', async () => {
    mockBuildSaude.mockRejectedValue(new Error('boom'));
    mockPricer.mockRejectedValue(new Error('sem CDI'));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB));
    const r = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
    expect(r.saudePrevia).toBeNull();
    expect(r.item).not.toHaveProperty('valorAtualBRL');
  });

  it('GET: movido para a Emergência traz o original "Renda Fixa › Pós-fixada"', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(CDB, { categoriaOverride: 'reservaEmergencia' }),
    );
    const r = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
    expect(r.atual).toMatchObject({
      categoria: 'reservaEmergencia',
      subgrupo: null,
      subgrupoLabel: null,
      override: true,
    });
    expect(r.original).toEqual({
      categoria: 'rendaFixaFundos',
      subgrupo: 'pos-fixada',
      label: 'Renda Fixa › Pós-fixada',
    });
  });

  it('obterCategoriaAtivo: Tesouro de catálogo usa a reserva da 1ª compra como base', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(TESOURO_PRE);
    comTransacoes(
      [],
      [
        {
          assetId: TESOURO_PRE.id,
          notes: JSON.stringify({ tesouroDestino: 'reserva-oportunidade' }),
        },
      ],
    );
    mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'rendaFixaFundos' });
    expect(await obterCategoriaAtivo('user-1', TESOURO_PRE.id)).toEqual({
      categoria: 'rendaFixaFundos',
      override: true,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: null });
    expect(await obterCategoriaAtivo('user-1', TESOURO_PRE.id)).toEqual({
      categoria: 'reservaOportunidade',
      override: false,
    });
  });

  describe('tesouroDestinoDaCompra (compra nova de Tesouro movido não troca a base)', () => {
    it('base Emergência + movido para RF: grava o marcador da base, não o recebido', async () => {
      comTransacoes(
        [],
        [
          {
            assetId: TESOURO_PRE.id,
            notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
          },
        ],
      );
      mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'rendaFixaFundos' });
      expect(await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'renda-fixa-posfixada')).toBe(
        'reserva-emergencia',
      );
      expect(await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'reserva-oportunidade')).toBe(
        'reserva-emergencia',
      );
    });

    it('base RF + movido para a Oportunidade: o marcador de reserva recebido é omitido', async () => {
      comTransacoes([], []);
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        categoriaOverride: 'reservaOportunidade',
      });
      expect(
        await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'reserva-oportunidade'),
      ).toBeUndefined();
      expect(await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'renda-fixa-prefixada')).toBe(
        'renda-fixa-prefixada',
      );
    });

    it('sem posição movida, outro tipo ou chave desligada: o recebido, como hoje', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: null });
      expect(await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'reserva-oportunidade')).toBe(
        'reserva-oportunidade',
      );
      expect(await tesouroDestinoDaCompra('user-1', CDB, 'reserva-oportunidade')).toBe(
        'reserva-oportunidade',
      );
      vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
      mockPrisma.portfolio.findFirst.mockClear();
      mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'rendaFixaFundos' });
      expect(await tesouroDestinoDaCompra('user-1', TESOURO_PRE, 'reserva-oportunidade')).toBe(
        'reserva-oportunidade',
      );
      expect(mockPrisma.portfolio.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('chave desligada = fase 1', () => {
    beforeEach(() => {
      vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    });

    it('CDB: não movível com a frase de hoje e sem campos da fase 2', async () => {
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi());
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB));
      const r = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
      expect(r.movivel).toBe(false);
      expect(r.modelo).toBe('fixo');
      expect(r.motivo).toBe('Renda Fixa ainda não pode ser movida para outra aba');
      expect(r.item.nome).toBe('CDB Banco X 110% CDI');
      expect(r).not.toHaveProperty('grupo');
      expect(r).not.toHaveProperty('saudePrevia');
      expect(mockBuildSaude).not.toHaveBeenCalled();
      await expect(
        moverInvestimento('user-1', {
          tipo: 'posicao',
          id: 'p-1',
          categoria: 'reservaEmergencia',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('FII → Reserva: 409 "ainda não dá"; destinos só com as 6, sem campos novos', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
      await expect(
        moverInvestimento('user-1', {
          tipo: 'posicao',
          id: 'p-1',
          categoria: 'reservaEmergencia',
        }),
      ).rejects.toMatchObject({ statusCode: 409, message: MSG_ABA_FORA_DA_FASE });
      const r = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
      expect(r.destinos.map((d) => d.categoria)).toEqual([
        'fimFia',
        'fiis',
        'acoes',
        'stocks',
        'reits',
        'etfs',
      ]);
      for (const d of r.destinos) {
        expect(d).not.toHaveProperty('subgrupoEditavel');
        expect(d).not.toHaveProperty('secaoAutomatica');
      }
      expect(r).not.toHaveProperty('grupo');
      expect(r.item).not.toHaveProperty('valorAtualBRL');
    });

    it('Tesouro: não consulta a reserva da compra (nenhuma query nova)', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(TESOURO_PRE));
      await obterOpcoesMover('user-1', 'posicao', 'p-1');
      const consultas = mockPrisma.stockTransaction.findMany.mock.calls.map(
        ([a]) => a as FindManyArgs,
      );
      expect(consultas.every((a) => !a?.select?.assetId)).toBe(true);
    });
  });
});
