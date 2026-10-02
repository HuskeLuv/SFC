import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  AVISO_OBJETIVO_ZERA,
  MOTIVO_COM_COTACAO,
  MOTIVO_EM_REAIS,
  MOTIVO_PLANEJADO_RV,
  MOTIVO_SALDO_SEM_TITULO,
  MOTIVO_SEM_COTACAO,
  avisoRegraIR,
} from '@/lib/carteiraMover';
import { MSG_ABA_FORA_DA_FASE } from '@/services/portfolio/moverInvestimento';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  asset: { findUnique: vi.fn() },
  userChangeLog: { create: vi.fn(), findMany: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockInvalidarContexto = vi.hoisted(() => vi.fn());
const mockInvalidateCaixa = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/assistente/contexto', () => ({
  invalidarContextoUsuario: mockInvalidarContexto,
}));
vi.mock('@/services/portfolio/caixaParaInvestir', () => ({
  invalidateCaixaCaches: mockInvalidateCaixa,
}));
const mockBuildSaude = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: vi.fn(async () => ({ getCurrentValue: () => 5_250 })),
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: mockBuildSaude,
}));

import { GET, POST } from '../route';
import { GET as GET_CATEGORIA } from '../categoria/route';

const auth = {
  payload: { id: 'user-1', email: 'u@test.com', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};
const authConsultor = {
  payload: { id: 'consultor-1', email: 'c@test.com', role: 'consultant' },
  targetUserId: 'cliente-1',
  actingClient: { id: 'cliente-1', consultantId: 'consultor-1' },
};

const KDIF11 = {
  id: 'a-kdif',
  symbol: 'KDIF11',
  name: 'Kinea Infra FII',
  type: 'fii',
  currency: 'BRL',
  source: 'brapi',
};
const TESOURO = {
  id: 'a-td',
  symbol: 'TESOURO-SELIC-2029',
  name: 'Tesouro Selic 2029',
  type: 'tesouro-direto',
  currency: 'BRL',
  source: 'tesouro',
};
const FUNDO_CVM = {
  id: 'a-cvm',
  symbol: 'CVM-12345678000199',
  name: 'Fundo Multimercado XP',
  type: 'multimercado',
  currency: 'BRL',
  source: 'cvm',
};
const ETF_CVM = {
  id: 'a-etfcvm',
  symbol: 'ETF-CVM-1',
  name: 'ETF CVM',
  type: 'etf-cvm',
  currency: 'BRL',
  source: 'cvm',
};
const VALE3 = {
  id: 'a-vale',
  symbol: 'VALE3',
  name: 'Vale',
  type: 'stock',
  currency: 'BRL',
  source: 'brapi',
};

const posicao = (asset: typeof KDIF11, over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  userId: 'user-1',
  assetId: asset.id,
  quantity: 10,
  avgPrice: 100,
  totalInvested: 1000,
  objetivo: 10,
  estrategia: null,
  tipoFii: 'tvm',
  regiaoEtf: null,
  categoriaOverride: null,
  tipoFundo: null,
  lastUpdate: new Date('2026-09-01T00:00:00Z'),
  planejamentoObjetivoId: null,
  vinculoAposentadoria: false,
  asset,
  ...over,
});

const planejado = (asset: typeof KDIF11, over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  userId: 'user-1',
  assetId: asset.id,
  addedAt: new Date('2026-09-16T00:00:00Z'),
  notes: null,
  objetivo: 7,
  secao: 'value',
  categoriaOverride: null,
  asset,
  ...over,
});

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/carteira/mover', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const get = (qs: string) => new NextRequest(`http://localhost/api/carteira/mover?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue(auth);
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.create.mockResolvedValue({ id: 'log-1' });
  mockPrisma.portfolio.update.mockImplementation(async ({ where, data }) => ({
    ...posicao(KDIF11),
    id: where.id,
    ...data,
  }));
  mockPrisma.watchlist.update.mockImplementation(async ({ where, data }) => ({
    ...planejado(VALE3),
    id: where.id,
    ...data,
  }));
});

const logGravado = () => mockPrisma.userChangeLog.create.mock.calls[0][0].data;

describe('POST /api/carteira/mover — validações', () => {
  it('401 sem sessão', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    const res = await POST(post({ acao: 'mover', tipo: 'posicao', id: 'p-1' }));
    expect(res.status).toBe(401);
  });

  it('400 corpo inválido (zod) e JSON quebrado', async () => {
    const r1 = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'rendaFixa', subgrupo: 'x' }),
    );
    expect(r1.status).toBe(400);
    const r2 = await POST(
      new NextRequest('http://localhost/api/carteira/mover', { method: 'POST', body: '{' }),
    );
    expect(r2.status).toBe(400);
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('404 quando a posição não é do usuário (IDOR)', async () => {
    const res = await POST(
      post({
        acao: 'mover',
        tipo: 'posicao',
        id: 'p-de-outro',
        categoria: 'acoes',
        subgrupo: 'value',
      }),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-de-outro', userId: 'user-1' },
      include: { asset: true },
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('409 com motivo: FII (reais) não vai para Stocks', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'stocks', subgrupo: 'value' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(MOTIVO_EM_REAIS);
  });

  it('409 modelo: fundo CVM não vai para FIIs; ETF CVM não vai para Fundos', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(FUNDO_CVM));
    const r1 = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fiis', subgrupo: 'tvm' }),
    );
    expect(r1.status).toBe(409);
    expect((await r1.json()).error).toBe(MOTIVO_SEM_COTACAO);

    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(ETF_CVM));
    const r2 = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fimFia', subgrupo: 'fim' }),
    );
    expect(r2.status).toBe(409);
  });

  it('409 item de aba fixa (Tesouro)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(TESOURO));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'acoes', subgrupo: 'value' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ainda não pode ser movida/);
  });

  it('400 subgrupo que não existe na aba destino', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fiis', subgrupo: 'growth' }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('noop: mesma aba e mesmo subgrupo → 200 sem gravar nem registrar', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fiis', subgrupo: 'tvm' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, noop: true });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/carteira/mover — gravação', () => {
  it('troca só de seção: não grava override e mantém o objetivo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fiis', subgrupo: 'infra' }),
    );
    expect(res.status).toBe(200);
    const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ categoriaOverride: null, tipoFii: 'infra' });
    expect(data).not.toHaveProperty('objetivo');
    expect(await res.json()).toEqual({
      ok: true,
      origem: { categoria: 'fiis', subgrupo: 'tvm' },
      destino: { categoria: 'fiis', subgrupo: 'infra' },
      objetivoZerado: false,
      historicoId: 'log-1',
    });
    const log = logGravado();
    expect(log).toMatchObject({
      section: 'carteira',
      action: 'investimento.mover',
      entity: 'portfolio',
      entityId: 'p-1',
      entityLabel: 'KDIF11',
      viaConsultant: false,
    });
    expect(log.changes).toEqual([
      { field: 'subgrupo', label: 'Subgrupo', before: 'TVM', after: 'Infra' },
    ]);
    expect(mockInvalidarContexto).toHaveBeenCalledWith('user-1');
    expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
  });

  it('troca de aba: grava override, subgrupo na coluna da aba e zera o objetivo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fimFia', subgrupo: 'fiagro' }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.portfolio.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'p-1' },
      data: { categoriaOverride: 'fimFia', tipoFundo: 'fiagro', objetivo: 0 },
    });
    // As colunas de outras abas ficam como estavam (tipoFii não é apagado).
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).not.toHaveProperty('tipoFii');
    const body = await res.json();
    expect(body.objetivoZerado).toBe(true);

    const log = logGravado();
    expect(log.changes).toEqual([
      { field: 'aba', label: 'Aba', before: "FII's", after: 'Fundos' },
      { field: 'subgrupo', label: 'Subgrupo', before: 'TVM', after: 'Fiagro' },
      { field: 'objetivo', label: 'Objetivo', before: 10, after: 0, format: 'percent' },
    ]);
    expect(log.snapshot).toMatchObject({
      v: 1,
      kind: 'mover',
      data: { categoriaOverride: null, tipoFii: 'tvm', tipoFundo: null, objetivo: 10 },
      meta: { after: { categoriaOverride: 'fimFia', tipoFundo: 'fiagro', objetivo: 0 } },
    });
  });

  it('mover de volta para a aba base grava override null', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(KDIF11, { categoriaOverride: 'fimFia', tipoFundo: 'fiagro', objetivo: 0 }),
    );
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'fiis', subgrupo: 'tijolo' }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      tipoFii: 'tijolo',
    });
    expect((await res.json()).objetivoZerado).toBe(false);
  });

  it('planejado: grava override + secao e mantém o objetivo', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(planejado(KDIF11, { secao: 'tvm' }));
    const res = await POST(
      post({ acao: 'mover', tipo: 'planejado', id: 'w-1', categoria: 'acoes', subgrupo: 'growth' }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'w-1' },
      data: { categoriaOverride: 'acoes', secao: 'growth' },
    });
    expect((await res.json()).objetivoZerado).toBe(false);
    expect(logGravado()).toMatchObject({
      action: 'planejado.mover',
      entity: 'watchlist',
      entityId: 'w-1',
    });
    expect(mockPrisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });

  it('consultor agindo: lê pela posse do cliente e registra via consultor', async () => {
    mockRequireAuthWithActing.mockResolvedValue(authConsultor);
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11, { userId: 'cliente-1' }));
    const res = await POST(
      post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria: 'acoes', subgrupo: 'value' }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', userId: 'cliente-1' },
      include: { asset: true },
    });
    expect(logGravado()).toMatchObject({
      userId: 'cliente-1',
      actorId: 'consultor-1',
      viaConsultant: true,
    });
    expect(mockInvalidarContexto).toHaveBeenCalledWith('cliente-1');
  });
});

describe('POST /api/carteira/mover — restaurar', () => {
  const eventoMover = {
    entityId: 'p-1',
    action: 'investimento.mover',
    createdAt: new Date('2026-09-20T12:00:00Z'),
    viaConsultant: false,
    snapshot: {
      v: 1,
      kind: 'mover',
      data: {
        categoriaOverride: null,
        estrategia: null,
        tipoFii: null,
        regiaoEtf: null,
        tipoFundo: null,
        objetivo: 10,
      },
      meta: {
        after: {
          categoriaOverride: 'fimFia',
          estrategia: null,
          tipoFii: null,
          regiaoEtf: null,
          tipoFundo: 'fiagro',
          objetivo: 0,
        },
      },
    },
  };

  it('volta à aba base com os subgrupos de antes do 1º mover (null fica null)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(KDIF11, {
        categoriaOverride: 'fimFia',
        tipoFii: null,
        tipoFundo: 'fiagro',
        objetivo: 0,
      }),
    );
    mockPrisma.userChangeLog.findMany.mockResolvedValue([eventoMover]);
    const res = await POST(post({ acao: 'restaurar', tipo: 'posicao', id: 'p-1' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      estrategia: null,
      tipoFii: null,
      regiaoEtf: null,
      tipoFundo: null,
    });
    const body = await res.json();
    expect(body.origem).toEqual({ categoria: 'fimFia', subgrupo: 'fiagro' });
    // FII sem tipoFii → a rota mostra em FOF.
    expect(body.destino).toEqual({ categoria: 'fiis', subgrupo: 'fofi' });
    expect(logGravado()).toMatchObject({ action: 'investimento.restaurar', entity: 'portfolio' });
  });

  it('409 quando o item já está na aba original', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await POST(post({ acao: 'restaurar', tipo: 'posicao', id: 'p-1' }));
    expect(res.status).toBe(409);
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('planejado restaurado registra planejado.restaurar e volta a secao', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(
      planejado(KDIF11, { categoriaOverride: 'acoes', secao: 'growth' }),
    );
    mockPrisma.userChangeLog.findMany.mockResolvedValue([
      {
        entityId: 'w-1',
        action: 'planejado.mover',
        createdAt: new Date('2026-09-20T12:00:00Z'),
        viaConsultant: false,
        snapshot: {
          v: 1,
          kind: 'mover',
          data: { categoriaOverride: null, secao: 'tvm' },
          meta: { after: { categoriaOverride: 'acoes', secao: 'growth' } },
        },
      },
    ]);
    const res = await POST(post({ acao: 'restaurar', tipo: 'planejado', id: 'w-1' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'w-1' },
      data: { categoriaOverride: null, secao: 'tvm' },
    });
    expect((await res.json()).destino).toEqual({ categoria: 'fiis', subgrupo: 'tvm' });
    expect(logGravado()).toMatchObject({ action: 'planejado.restaurar', entity: 'watchlist' });
  });
});

describe('GET /api/carteira/mover', () => {
  it('400 sem tipo/id; 404 de outro usuário', async () => {
    expect((await GET(get('tipo=posicao'))).status).toBe(400);
    expect((await GET(get('tipo=posicao&id=p-x'))).status).toBe(404);
  });

  it('opções de um FII na base: destinos, motivos e avisos', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
    const res = await GET(get('tipo=posicao&id=p-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toMatchObject({ tipo: 'posicao', id: 'p-1', ticker: 'KDIF11' });
    expect(body.atual).toEqual({
      categoria: 'fiis',
      abaId: 'fiis',
      subgrupo: 'tvm',
      subgrupoLabel: 'TVM',
      override: false,
    });
    expect(body.movivel).toBe(true);
    expect(body.modelo).toBe('b3-brl');
    expect(body.movido).toBeNull();
    expect(body.original).toBeNull();

    const porCat = Object.fromEntries(
      body.destinos.map((d: { categoria: string }) => [d.categoria, d]),
    );
    expect(porCat.fiis.subgrupos.find((s: { id: string }) => s.id === 'tvm').atual).toBe(true);
    expect(porCat.fiis.avisos).toEqual([]);
    expect(porCat.stocks).toMatchObject({ permitido: false, motivo: MOTIVO_EM_REAIS });
    expect(porCat.acoes.permitido).toBe(true);
    expect(porCat.acoes.avisos).toEqual([avisoRegraIR('fiis'), AVISO_OBJETIVO_ZERA]);
  });

  it('item movido traz selo (via consultor) e original', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(KDIF11, { categoriaOverride: 'fimFia', tipoFundo: 'fiagro', objetivo: 0 }),
    );
    mockPrisma.userChangeLog.findMany.mockResolvedValue([
      {
        entityId: 'p-1',
        action: 'investimento.mover',
        createdAt: new Date('2026-09-20T12:00:00Z'),
        viaConsultant: true,
        snapshot: {
          v: 1,
          kind: 'mover',
          data: { categoriaOverride: null, tipoFii: 'tvm', objetivo: 10 },
          meta: { after: { categoriaOverride: 'fimFia', tipoFundo: 'fiagro', objetivo: 0 } },
        },
      },
    ]);
    const body = await (await GET(get('tipo=posicao&id=p-1'))).json();
    expect(body.atual).toMatchObject({ categoria: 'fimFia', abaId: 'fim-fia', override: true });
    expect(body.movido).toEqual({ em: '2026-09-20T12:00:00.000Z', viaConsultant: true });
    expect(body.original).toEqual({ categoria: 'fiis', subgrupo: 'tvm', label: "FII's › TVM" });
  });

  it('item de aba fixa: não movível, com motivo e sem destinos', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(TESOURO));
    const body = await (await GET(get('tipo=posicao&id=p-1'))).json();
    expect(body.movivel).toBe(false);
    expect(body.modelo).toBe('fixo');
    expect(body.motivo).toMatch(/ainda não pode ser movida/);
    expect(body.destinos).toEqual([]);
  });
});

describe('GET /api/carteira/mover/categoria', () => {
  const getCat = (qs: string) =>
    GET_CATEGORIA(new NextRequest(`http://localhost/api/carteira/mover/categoria?${qs}`));

  it('aba base sem posição; override da posição quando houver; 404 sem asset', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(VALE3);
    expect(await (await getCat('assetId=a-vale')).json()).toEqual({
      categoria: 'acoes',
      override: false,
    });

    mockPrisma.asset.findUnique.mockResolvedValue(KDIF11);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'fimFia' });
    expect(await (await getCat('assetId=a-kdif')).json()).toEqual({
      categoria: 'fimFia',
      override: true,
    });

    mockPrisma.asset.findUnique.mockResolvedValue(null);
    expect((await getCat('assetId=nada')).status).toBe(404);
    expect((await getCat('')).status).toBe(400);
  });
});

// ── FASE 2: Reservas + Renda Fixa (MOVER_CAIXA_RF_HABILITADO) ─────────────────

describe('/api/carteira/mover — fase 2 (Reservas + Renda Fixa)', () => {
  const CDB = {
    id: 'a-cdb',
    symbol: 'RENDA-FIXA-CDB-X',
    name: 'CDB Banco X',
    type: 'bond',
    currency: 'BRL',
    source: 'manual',
  };
  const RESERVA = {
    id: 'a-res',
    symbol: 'RESERVA-EMERG-1',
    name: 'Reserva de Emergência',
    type: 'emergency',
    currency: 'BRL',
    source: 'manual',
  };
  const fiCdb = {
    id: 'fi-1',
    userId: 'user-1',
    assetId: CDB.id,
    type: 'CDB_PRE',
    description: 'CDB',
    startDate: new Date('2026-01-02T00:00:00Z'),
    maturityDate: new Date('2027-01-02T00:00:00Z'),
    investedAmount: 5_000,
    annualRate: 0,
    indexer: 'CDI',
    indexerPercent: 100,
    liquidityType: 'DAILY',
    taxExempt: false,
    tesouroBondType: null,
    tesouroMaturity: null,
    asset: null,
  };
  const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
  const mover = (categoria: string, extra: Record<string, unknown> = {}) =>
    post({ acao: 'mover', tipo: 'posicao', id: 'p-1', categoria, ...extra });

  beforeEach(() => {
    mockBuildSaude.mockResolvedValue({
      indicadores: { benchmarks: { reservaEmergencia: { atual: 1_000, necessario: 9_000 } } },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('chave desligada (igual à main)', () => {
    it('FII → Reserva/RF: 409 "ainda não dá" e nada gravado', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
      for (const categoria of ['reservaEmergencia', 'reservaOportunidade', 'rendaFixaFundos']) {
        const res = await POST(mover(categoria));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe(MSG_ABA_FORA_DA_FASE);
      }
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
      expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
    });

    it('CDB: GET não movível com a frase de hoje; POST 409', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB as typeof KDIF11));
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      const body = await (await GET(get('tipo=posicao&id=p-1'))).json();
      expect(body).toMatchObject({ movivel: false, modelo: 'fixo', destinos: [] });
      expect(body.motivo).toBe('Renda Fixa ainda não pode ser movida para outra aba');
      expect(body).not.toHaveProperty('grupo');
      expect((await POST(mover('reservaEmergencia'))).status).toBe(409);
      expect(mockBuildSaude).not.toHaveBeenCalled();
    });

    it('FII: GET com as 6 abas da fase 1 e sem campos novos', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
      const body = await (await GET(get('tipo=posicao&id=p-1'))).json();
      expect(body.destinos.map((d: { categoria: string }) => d.categoria)).toEqual([
        'fimFia',
        'fiis',
        'acoes',
        'stocks',
        'reits',
        'etfs',
      ]);
      expect(body.destinos[0]).not.toHaveProperty('subgrupoEditavel');
      expect(body.item).not.toHaveProperty('valorAtualBRL');
    });
  });

  describe('chave ligada', () => {
    beforeEach(ligar);

    it('CDB RF → Emergência: grava o override, histórico sem seção e zera o objetivo', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB as typeof KDIF11));
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      const res = await POST(mover('reservaEmergencia'));
      expect(res.status).toBe(200);
      expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toEqual({
        categoriaOverride: 'reservaEmergencia',
        objetivo: 0,
        lastUpdate: expect.any(Date),
      });
      expect(await res.json()).toEqual({
        ok: true,
        origem: { categoria: 'rendaFixaFundos', subgrupo: 'pos-fixada' },
        destino: { categoria: 'reservaEmergencia', subgrupo: null },
        objetivoZerado: true,
        historicoId: 'log-1',
      });
      expect(logGravado()).toMatchObject({ action: 'investimento.mover', entity: 'portfolio' });
      expect(logGravado().changes).toEqual([
        { field: 'aba', label: 'Aba', before: 'Renda Fixa', after: 'Reserva Emergência' },
        { field: 'subgrupo', label: 'Subgrupo', before: 'Pós-fixada', after: null },
        { field: 'objetivo', label: 'Objetivo', before: 10, after: 0, format: 'percent' },
      ]);
      expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
    });

    it('os pares do trio: Emergência ↔ Oportunidade e volta à RF (override null)', async () => {
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      mockPrisma.portfolio.findFirst.mockResolvedValue(
        posicao(CDB as typeof KDIF11, { categoriaOverride: 'reservaEmergencia', objetivo: 0 }),
      );
      const r1 = await POST(mover('reservaOportunidade'));
      expect(r1.status).toBe(200);
      expect(mockPrisma.portfolio.update.mock.calls[0][0].data.categoriaOverride).toBe(
        'reservaOportunidade',
      );
      // Reserva → Reserva: o Histórico não ganha linha "Subgrupo: — → —".
      expect(logGravado().changes).toEqual([
        {
          field: 'aba',
          label: 'Aba',
          before: 'Reserva Emergência',
          after: 'Reserva Oportunidade',
        },
      ]);

      mockPrisma.portfolio.findFirst.mockResolvedValue(
        posicao(CDB as typeof KDIF11, { categoriaOverride: 'reservaOportunidade', objetivo: 0 }),
      );
      const r2 = await POST(mover('rendaFixaFundos'));
      expect(r2.status).toBe(200);
      expect(mockPrisma.portfolio.update.mock.calls[1][0].data.categoriaOverride).toBeNull();
      expect((await r2.json()).destino).toEqual({
        categoria: 'rendaFixaFundos',
        subgrupo: 'pos-fixada',
      });
    });

    it('saldo sem título (reserva sem FI) → RF 409 com motivo', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(RESERVA as typeof KDIF11));
      const res = await POST(mover('rendaFixaFundos'));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe(MOTIVO_SALDO_SEM_TITULO);
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('renda variável ↔ caixa/RF bloqueado nos dois sentidos; planejado → RF 409', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(KDIF11));
      const r1 = await POST(mover('reservaOportunidade'));
      expect(r1.status).toBe(409);
      expect((await r1.json()).error).toBe(MOTIVO_COM_COTACAO);

      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB as typeof KDIF11));
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      const r2 = await POST(mover('fiis', { subgrupo: 'tvm' }));
      expect(r2.status).toBe(409);

      mockPrisma.watchlist.findFirst.mockResolvedValue(planejado(VALE3));
      const r3 = await POST(
        post({ acao: 'mover', tipo: 'planejado', id: 'w-1', categoria: 'rendaFixaFundos' }),
      );
      expect(r3.status).toBe(409);
      expect((await r3.json()).error).toBe(MOTIVO_PLANEJADO_RV);
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
      expect(mockPrisma.watchlist.update).not.toHaveBeenCalled();
    });

    it('IDOR: posição de outro usuário → 404 sem gravar', async () => {
      const res = await POST(
        post({ acao: 'mover', tipo: 'posicao', id: 'p-x', categoria: 'reservaEmergencia' }),
      );
      expect(res.status).toBe(404);
      expect((await GET(get('tipo=posicao&id=p-x'))).status).toBe(404);
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('consultor agindo move a RF do cliente e o histórico fica via consultor', async () => {
      mockRequireAuthWithActing.mockResolvedValue(authConsultor);
      mockPrisma.portfolio.findFirst.mockResolvedValue(
        posicao(CDB as typeof KDIF11, { userId: 'cliente-1' }),
      );
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      const res = await POST(mover('reservaOportunidade'));
      expect(res.status).toBe(200);
      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', userId: 'cliente-1' },
        include: { asset: true },
      });
      expect(mockPrisma.fixedIncomeAsset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'cliente-1', assetId: CDB.id } }),
      );
      expect(logGravado()).toMatchObject({
        userId: 'cliente-1',
        actorId: 'consultor-1',
        viaConsultant: true,
      });
    });

    it('restaurar: item movido para a Emergência volta à RF na seção derivada', async () => {
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      mockPrisma.portfolio.findFirst.mockResolvedValue(
        posicao(CDB as typeof KDIF11, { categoriaOverride: 'reservaEmergencia', objetivo: 0 }),
      );
      mockPrisma.userChangeLog.findMany.mockResolvedValue([
        {
          entityId: 'p-1',
          action: 'investimento.mover',
          createdAt: new Date('2026-10-02T12:00:00Z'),
          viaConsultant: false,
          snapshot: {
            v: 1,
            kind: 'mover',
            data: { categoriaOverride: null, objetivo: 10 },
            meta: { after: { categoriaOverride: 'reservaEmergencia', objetivo: 0 } },
          },
        },
      ]);
      const opcoes = await (await GET(get('tipo=posicao&id=p-1'))).json();
      expect(opcoes.original).toEqual({
        categoria: 'rendaFixaFundos',
        subgrupo: 'pos-fixada',
        label: 'Renda Fixa › Pós-fixada',
      });
      expect(opcoes.movido).toEqual({ em: '2026-10-02T12:00:00.000Z', viaConsultant: false });

      const res = await POST(post({ acao: 'restaurar', tipo: 'posicao', id: 'p-1' }));
      expect(res.status).toBe(200);
      expect(mockPrisma.portfolio.update.mock.calls[0][0].data.categoriaOverride).toBeNull();
      expect((await res.json()).destino).toEqual({
        categoria: 'rendaFixaFundos',
        subgrupo: 'pos-fixada',
      });
      expect(logGravado()).toMatchObject({ action: 'investimento.restaurar' });
    });

    it('GET: destinos do trio com prévia da Saúde e valor do item', async () => {
      mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCdb);
      mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(CDB as typeof KDIF11));
      const body = await (await GET(get('tipo=posicao&id=p-1'))).json();
      expect(body).toMatchObject({
        movivel: true,
        modelo: 'curva',
        grupo: 'caixaRf',
        saudePrevia: { reservaAtual: 1_000, necessario: 9_000 },
      });
      expect(body.item.valorAtualBRL).toBe(5_250);
      const permitidos = body.destinos
        .filter((d: { permitido: boolean }) => d.permitido)
        .map((d: { categoria: string }) => d.categoria);
      expect(permitidos).toEqual(['reservaEmergencia', 'reservaOportunidade', 'rendaFixaFundos']);
    });

    it('GET /categoria: segue o override do trio', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(CDB);
      mockPrisma.portfolio.findFirst.mockResolvedValue({ categoriaOverride: 'reservaEmergencia' });
      const res = await GET_CATEGORIA(
        new NextRequest('http://localhost/api/carteira/mover/categoria?assetId=a-cdb'),
      );
      expect(await res.json()).toEqual({ categoria: 'reservaEmergencia', override: true });
    });
  });
});
