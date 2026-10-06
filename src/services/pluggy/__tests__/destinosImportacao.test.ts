import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  bankInvestment: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  bankConnection: { findUnique: vi.fn() },
  bankAccount: { count: vi.fn() },
  bankTransaction: { count: vi.fn() },
  bankLoan: { count: vi.fn() },
  portfolio: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  userChangeLog: { findMany: vi.fn() },
  fiiTickerMap: { findFirst: vi.fn() },
  fiiMonthly: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/pluggy', () => ({ getPluggyClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: vi.fn(async () => ({ getCurrentValue: () => 10_500 })),
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: vi.fn(),
}));

import {
  MSG_DESTINOS_INDISPONIVEL,
  MSG_SITUACAO_DESTINO,
  aplicarDestinos,
  classificarDestinos,
  contarParaRevisar,
  destinoAtualPorPortfolio,
  listarDestinosImportados,
} from '../destinosImportacao';
import { origemTipoFiiImportado, tipoFiiImportado } from '../secaoImportada';
import { resumoImportado } from '../sync';
import { aplicarDestinosSchema, type AplicarDestinosBody } from '@/lib/pluggyDestinos';
import { MOTIVO_EM_REAIS } from '@/lib/carteiraMover';
import { MSG_NAO_ENCONTRADO } from '@/services/portfolio/moverInvestimento';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = 'user-1';
const CONN = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const asset = (over: Record<string, unknown>) => ({
  id: 'a-1',
  symbol: 'X',
  name: 'X',
  type: 'stock',
  currency: 'BRL',
  source: 'brapi',
  ...over,
});

const KNCA11 = asset({ id: 'a-knca', symbol: 'KNCA11', name: 'Kinea Agro', type: 'fii' });
const VALE3 = asset({ id: 'a-vale', symbol: 'VALE3', name: 'Vale', type: 'stock' });
const CDB = asset({
  id: 'a-cdb',
  symbol: 'RENDA-FIXA-CDB-BANCO-X',
  name: 'CDB Banco X',
  type: 'bond',
  source: 'manual',
});
const PREV = asset({ id: 'a-prev', symbol: 'PREV-1', name: 'PGBL', type: 'previdencia' });

const posicao = (pid: string, a: ReturnType<typeof asset>, over: Record<string, unknown> = {}) => ({
  id: pid,
  userId: USER,
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
  lastUpdate: new Date('2026-10-01T00:00:00Z'),
  asset: a,
  ...over,
});

const FI_CDB = {
  id: 'fi-1',
  userId: USER,
  assetId: 'a-cdb',
  type: 'CDB_POS',
  description: 'CDB Banco X',
  startDate: new Date('2026-01-02T00:00:00Z'),
  maturityDate: new Date('2030-01-02T00:00:00Z'),
  investedAmount: 10_000,
  annualRate: 0,
  indexer: 'CDI',
  indexerPercent: 110,
  liquidityType: 'diaria',
  taxExempt: false,
  tesouroBondType: null,
  tesouroMaturity: null,
  asset: null,
};

/** Posições do usuário por id (ausente = apagada). */
let posicoes: Record<string, ReturnType<typeof posicao>>;

const inv = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  connectionId: CONN,
  userId: USER,
  providerInvestmentId: `prov-${n}`,
  type: 'EQUITY',
  subtype: null,
  name: `Investimento ${n}`,
  code: null,
  balance: 1000 * n,
  ativo: true,
  assetId: null,
  portfolioId: null,
  importStatus: 'importado',
  destinoConfirmadoEm: null,
  createdAt: new Date('2026-10-06T00:00:00Z'),
  connection: { connectorName: 'Banco Teste' },
  ...over,
});

// 1 FII (para conferir), 2 previdência (fixo), 3 ação vinculada (já estava),
// 4 sem suporte, 5 posição apagada, 6 CDB (para conferir com a fase 2 ligada).
const INV_FII = inv(1, { code: 'KNCA11', name: 'KNCA11', portfolioId: 'p-fii', balance: 5000 });
const INV_PREV = inv(2, { type: 'SECURITY', portfolioId: 'p-prev' });
const INV_VINC = inv(3, { code: 'VALE3', importStatus: 'vinculado', portfolioId: 'p-vale' });
const INV_SEM = inv(4, { type: 'COE', importStatus: 'sem-suporte' });
const INV_GONE = inv(5, { type: 'FIXED_INCOME', portfolioId: 'p-gone' });
const INV_CDB = inv(6, { type: 'FIXED_INCOME', subtype: 'CDB', portfolioId: 'p-cdb' });
const TODOS = [INV_FII, INV_PREV, INV_VINC, INV_SEM, INV_GONE, INV_CDB];

type Where = { where: { id?: string | { in: string[] }; userId?: string } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'true');
  vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
  posicoes = {
    'p-fii': posicao('p-fii', KNCA11, { tipoFii: 'tijolo' }),
    'p-prev': posicao('p-prev', PREV),
    'p-vale': posicao('p-vale', VALE3, { estrategia: 'value' }),
    'p-cdb': posicao('p-cdb', CDB),
  };
  mockPrisma.portfolio.findFirst.mockImplementation(async ({ where }: Where) =>
    where.userId === USER && typeof where.id === 'string' ? (posicoes[where.id] ?? null) : null,
  );
  mockPrisma.portfolio.update.mockImplementation(async ({ where, data }) => ({
    ...posicoes[where.id],
    ...data,
  }));
  mockPrisma.portfolio.count.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((p) => posicoes[p]).length,
  );
  mockPrisma.fixedIncomeAsset.findFirst.mockImplementation(
    async ({ where }: { where: { assetId: string } }) =>
      where.assetId === 'a-cdb' ? FI_CDB : null,
  );
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.fiiTickerMap.findFirst.mockResolvedValue(null);
  mockPrisma.fiiMonthly.findFirst.mockResolvedValue(null);
  mockPrisma.bankInvestment.updateMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }),
  );
  mockPrisma.bankInvestment.findFirst.mockImplementation(
    async ({ where }: Where) =>
      TODOS.find((i) => i.id === where.id && i.userId === where.userId) ?? null,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const idsMarcados = (chamada = 0): string[] =>
  mockPrisma.bankInvestment.updateMany.mock.calls[chamada][0].where.id.in;

// ── origemTipoFiiImportado ───────────────────────────────────────────────────

describe('origemTipoFiiImportado — ramo da seção do FII importado', () => {
  const prismaFake = (cnpj: string | null, tipoVigente: string | null) =>
    ({
      fiiTickerMap: { findFirst: vi.fn(async () => (cnpj ? { cnpj } : null)) },
      fiiMonthly: { findFirst: vi.fn(async () => (tipoVigente ? { tipoVigente } : null)) },
    }) as unknown as PrismaClient;

  it.each([
    ['catálogo da CVM', prismaFake('123', 'papel'), 'Fundo X', { tipoFii: 'tvm', via: 'catalogo' }],
    [
      'nome (catálogo sem tipo)',
      prismaFake('123', null),
      'Kinea Fundo de Fundos',
      { tipoFii: 'fofi', via: 'nome' },
    ],
    [
      'Infra pelo nome vence o catálogo',
      prismaFake('123', 'tijolo'),
      'Kinea Infra',
      { tipoFii: 'infra', via: 'nome' },
    ],
    [
      'padrão (sem pista)',
      prismaFake(null, null),
      'Kinea Agro',
      { tipoFii: 'tijolo', via: 'padrao' },
    ],
  ] as const)('%s', async (_nome, p, nomeFundo, esperado) => {
    expect(await origemTipoFiiImportado('XXXX11', nomeFundo, p)).toEqual(esperado);
    expect(await tipoFiiImportado('XXXX11', nomeFundo, p)).toBe(esperado.tipoFii);
  });
});

// ── classificarDestinos / contarParaRevisar ──────────────────────────────────

describe('classificarDestinos', () => {
  it('marca só os importados sem escolha (previdência); FII e posição apagada ficam null', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([INV_FII, INV_PREV, INV_GONE, INV_CDB]);
    expect(await classificarDestinos(USER)).toBe(1);
    expect(mockPrisma.bankInvestment.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        userId: USER,
        importStatus: 'importado',
        ativo: true,
        destinoConfirmadoEm: null,
        portfolioId: { not: null },
      },
      take: 200,
    });
    expect(idsMarcados()).toEqual([INV_PREV.id]);
    expect(mockPrisma.bankInvestment.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      destinoConfirmadoEm: null,
    });
  });

  it('roda com PLUGGY_DESTINOS_HABILITADO desligada; CDB sem a fase 2 vira fixo', async () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'false');
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    mockPrisma.bankInvestment.findMany.mockResolvedValue([INV_FII, INV_CDB]);
    expect(await classificarDestinos(USER)).toBe(1);
    expect(idsMarcados()).toEqual([INV_CDB.id]);
  });

  it('nada a marcar → nenhum update', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([INV_FII]);
    expect(await classificarDestinos(USER)).toBe(0);
    expect(mockPrisma.bankInvestment.updateMany).not.toHaveBeenCalled();
  });
});

describe('contarParaRevisar', () => {
  it('candidatos cuja posição existe, em 2 queries', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([
      { portfolioId: 'p-fii' },
      { portfolioId: 'p-gone' },
      { portfolioId: 'p-cdb' },
    ]);
    expect(await contarParaRevisar(USER, { connectionId: CONN })).toBe(2);
    expect(mockPrisma.bankInvestment.findMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      connectionId: CONN,
      destinoConfirmadoEm: null,
    });
    expect(mockPrisma.portfolio.count).toHaveBeenCalledTimes(1);
  });

  it('chave desligada → 0 sem consultar', async () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'false');
    expect(await contarParaRevisar(USER)).toBe(0);
    expect(mockPrisma.bankInvestment.findMany).not.toHaveBeenCalled();
  });
});

// ── listarDestinosImportados ─────────────────────────────────────────────────

describe('listarDestinosImportados', () => {
  it('chave desligada → payload vazio, sem consultar', async () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'false');
    expect(await listarDestinosImportados(USER)).toEqual({
      habilitado: false,
      itens: [],
      paraRevisar: 0,
    });
    expect(mockPrisma.bankInvestment.findMany).not.toHaveBeenCalled();
  });

  it('situação, faixa, origem e opções de cada item; marca de passagem os fixos', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue(TODOS);
    const r = await listarDestinosImportados(USER, { connectionId: CONN });
    expect(r.habilitado).toBe(true);
    expect(r.paraRevisar).toBe(2);
    const por = Object.fromEntries(r.itens.map((i) => [i.bankInvestmentId, i]));

    expect(por[INV_FII.id]).toMatchObject({
      situacao: 'para-revisar',
      grupo: 'fiis',
      ticker: 'KNCA11',
      banco: 'Banco Teste',
      saldo: 5000,
      atual: { categoria: 'fiis', abaId: 'fiis', rotulo: "FII's › Tijolo" },
      via: 'padrao',
      confira: true,
    });
    expect(por[INV_FII.id].opcoes?.destinos.find((d) => d.categoria === 'stocks')).toMatchObject({
      permitido: false,
      motivo: MOTIVO_EM_REAIS,
    });

    expect(por[INV_CDB.id]).toMatchObject({
      situacao: 'para-revisar',
      grupo: 'rf',
      via: 'indexador',
      confira: false,
    });
    expect(por[INV_CDB.id].opcoes?.movivel).toBe(true);

    expect(por[INV_PREV.id]).toMatchObject({
      situacao: 'fixo',
      grupo: 'previdencia',
      opcoes: null,
      via: null,
      texto: 'Fica em Previdência e Seguros',
    });
    expect(por[INV_VINC.id]).toMatchObject({
      situacao: 'ja-estava',
      grupo: 'ja-estava',
      opcoes: null,
      atual: { categoria: 'acoes' },
    });
    expect(por[INV_SEM.id]).toMatchObject({ situacao: 'sem-suporte', grupo: 'sem-suporte' });
    expect(por[INV_GONE.id]).toMatchObject({
      situacao: 'fora-da-carteira',
      portfolioId: null,
      atual: null,
      opcoes: null,
    });

    // Ordem: faixa do protótipo (fiis, rf, previdência, já estava, sem suporte).
    expect(r.itens.map((i) => i.grupo)).toEqual([
      'fiis',
      'rf',
      'rf',
      'previdencia',
      'ja-estava',
      'sem-suporte',
    ]);
    // CDB (saldo 6000) antes do item apagado (5000) na faixa rf.
    expect(r.itens[1].bankInvestmentId).toBe(INV_CDB.id);

    expect(idsMarcados()).toEqual([INV_PREV.id]);
  });

  it('FII com override ou com seção trocada à mão → sem origem', async () => {
    posicoes['p-fii'] = posicao('p-fii', KNCA11, { tipoFii: 'tvm' });
    mockPrisma.bankInvestment.findMany.mockResolvedValue([INV_FII]);
    let r = await listarDestinosImportados(USER);
    expect(r.itens[0]).toMatchObject({ situacao: 'para-revisar', via: null, confira: false });

    posicoes['p-fii'] = posicao('p-fii', KNCA11, {
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
    });
    r = await listarDestinosImportados(USER);
    expect(r.itens[0]).toMatchObject({
      situacao: 'para-revisar',
      via: null,
      atual: { rotulo: 'Fundos › Fiagro' },
    });
  });

  it('já conferido → confirmado ("Na Carteira em …"), fora da contagem', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([
      { ...INV_FII, destinoConfirmadoEm: new Date() },
    ]);
    const r = await listarDestinosImportados(USER);
    expect(r.paraRevisar).toBe(0);
    expect(r.itens[0]).toMatchObject({
      situacao: 'confirmado',
      opcoes: null,
      texto: "Na Carteira em FII's › Tijolo",
    });
  });

  it('somenteParaRevisar: filtra na consulta e devolve só os para conferir', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([INV_FII, INV_PREV, INV_GONE]);
    const r = await listarDestinosImportados(USER, { somenteParaRevisar: true });
    expect(mockPrisma.bankInvestment.findMany.mock.calls[0][0].where).toMatchObject({
      importStatus: 'importado',
      destinoConfirmadoEm: null,
    });
    expect(r.itens.map((i) => i.bankInvestmentId)).toEqual([INV_FII.id]);
  });
});

describe('destinoAtualPorPortfolio', () => {
  it('rótulo da aba › seção por posição; apagada fica de fora', async () => {
    const m = await destinoAtualPorPortfolio(USER, ['p-fii', 'p-gone', 'p-cdb', 'p-fii']);
    expect([...m.keys()]).toEqual(['p-fii', 'p-cdb']);
    expect(m.get('p-fii')?.rotulo).toBe("FII's › Tijolo");
    expect(m.get('p-cdb')).toMatchObject({ categoria: 'rendaFixaFundos', label: 'Renda Fixa' });
  });
});

// ── aplicarDestinos ──────────────────────────────────────────────────────────

describe('aplicarDestinos', () => {
  const corpo = (b: AplicarDestinosBody) => aplicarDestinosSchema.parse(b);

  it('chave desligada → 404', async () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'false');
    await expect(
      aplicarDestinos(USER, corpo({ itens: [], confirmarIds: [INV_FII.id] })),
    ).rejects.toMatchObject({ statusCode: 404, message: MSG_DESTINOS_INDISPONIVEL });
  });

  it('lote com um item bloqueado → inválido e NADA é gravado', async () => {
    const r = await aplicarDestinos(
      USER,
      corpo({
        itens: [
          { id: INV_CDB.id, categoria: 'reservaEmergencia' },
          { id: INV_FII.id, categoria: 'stocks', subgrupo: 'value' },
        ],
        confirmarIds: [INV_FII.id, INV_CDB.id],
      }),
    );
    expect(r).toEqual({
      tipo: 'invalido',
      erros: [{ id: INV_FII.id, nome: 'KNCA11', motivo: MOTIVO_EM_REAIS }],
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(mockPrisma.bankInvestment.updateMany).not.toHaveBeenCalled();
  });

  it('item de outro usuário, já conferido ou sem escolha → inválido', async () => {
    const outro = '00000000-0000-4000-8000-000000000099';
    const r = await aplicarDestinos(
      USER,
      corpo({
        itens: [
          { id: outro, categoria: 'fimFia', subgrupo: 'fiagro' },
          { id: INV_PREV.id, categoria: 'acoes', subgrupo: 'value' },
          { id: INV_VINC.id, categoria: 'fiis', subgrupo: 'tijolo' },
          { id: INV_GONE.id, categoria: 'reservaEmergencia' },
        ],
      }),
    );
    expect(r.tipo).toBe('invalido');
    if (r.tipo !== 'invalido') return;
    expect(r.erros).toEqual([
      { id: outro, nome: '', motivo: MSG_NAO_ENCONTRADO },
      { id: INV_PREV.id, nome: INV_PREV.name, motivo: MSG_SITUACAO_DESTINO },
      { id: INV_VINC.id, nome: INV_VINC.name, motivo: MSG_SITUACAO_DESTINO },
      { id: INV_GONE.id, nome: INV_GONE.name, motivo: MSG_SITUACAO_DESTINO },
    ]);
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();

    mockPrisma.bankInvestment.findFirst.mockResolvedValueOnce({
      ...INV_FII,
      destinoConfirmadoEm: new Date(),
    });
    const conferido = await aplicarDestinos(
      USER,
      corpo({ itens: [{ id: INV_FII.id, categoria: 'fimFia', subgrupo: 'fiagro' }] }),
    );
    expect(conferido).toMatchObject({
      tipo: 'invalido',
      erros: [{ motivo: MSG_SITUACAO_DESTINO }],
    });
  });

  it('lote ok: move pelo mover, devolve os registros e confirma os vistos', async () => {
    const r = await aplicarDestinos(
      USER,
      corpo({
        itens: [
          { id: INV_FII.id, categoria: 'fimFia', subgrupo: 'fiagro' },
          { id: INV_CDB.id, categoria: 'reservaEmergencia' },
        ],
        confirmarIds: [INV_FII.id, INV_CDB.id],
      }),
    );
    expect(r.tipo).toBe('ok');
    if (r.tipo !== 'ok') return;
    expect(r.resposta).toEqual({
      aplicados: 2,
      semMudanca: 0,
      confirmados: 2,
      parcial: false,
      erros: [],
      historicoIds: [],
    });
    expect(mockPrisma.portfolio.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.portfolio.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'p-fii' },
      data: { categoriaOverride: 'fimFia', tipoFundo: 'fiagro' },
    });
    expect(mockPrisma.portfolio.update.mock.calls[1][0]).toMatchObject({
      where: { id: 'p-cdb' },
      data: { categoriaOverride: 'reservaEmergencia' },
    });
    expect(r.registros.map((x) => [x.bankInvestmentId, x.id, x.destino.categoria])).toEqual([
      [INV_FII.id, 'p-fii', 'fimFia'],
      [INV_CDB.id, 'p-cdb', 'reservaEmergencia'],
    ]);
    expect(r.registros[0]).toMatchObject({
      tipo: 'posicao',
      origem: { categoria: 'fiis', subgrupo: 'tijolo' },
      antes: { categoriaOverride: null, tipoFii: 'tijolo' },
      depois: { categoriaOverride: 'fimFia', tipoFundo: 'fiagro' },
    });
    expect(idsMarcados()).toEqual([INV_FII.id, INV_CDB.id]);
    expect(mockPrisma.bankInvestment.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      importStatus: 'importado',
      destinoConfirmadoEm: null,
    });
  });

  it('escolha igual à sugestão → semMudanca, sem gravar a posição, mas confirmada', async () => {
    const r = await aplicarDestinos(
      USER,
      corpo({ itens: [{ id: INV_FII.id, categoria: 'fiis', subgrupo: 'tijolo' }] }),
    );
    expect(r).toMatchObject({
      tipo: 'ok',
      resposta: { aplicados: 0, semMudanca: 1, confirmados: 1 },
      registros: [],
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(idsMarcados()).toEqual([INV_FII.id]);
  });

  it('confirmarIds: só os enviados (nunca o escopo), filtrados por usuário e por null', async () => {
    const r = await aplicarDestinos(USER, corpo({ itens: [], confirmarIds: [INV_CDB.id] }));
    expect(r).toMatchObject({ tipo: 'ok', resposta: { aplicados: 0, confirmados: 1 } });
    expect(idsMarcados()).toEqual([INV_CDB.id]);
    expect(mockPrisma.bankInvestment.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: [INV_CDB.id] },
      userId: USER,
      importStatus: 'importado',
      destinoConfirmadoEm: null,
    });

    mockPrisma.bankInvestment.updateMany.mockResolvedValueOnce({ count: 0 });
    const ja = await aplicarDestinos(USER, corpo({ itens: [], confirmarIds: [INV_PREV.id] }));
    expect(ja).toMatchObject({ resposta: { confirmados: 0 } });
  });

  it('falha na gravação (concorrência) → parcial, por item, e o item fica na fila', async () => {
    // Fase 1 lê a posição; na fase 2 outra tela já a apagou.
    let leituras = 0;
    const base = mockPrisma.portfolio.findFirst.getMockImplementation()!;
    mockPrisma.portfolio.findFirst.mockImplementation(async (args: Where) => {
      if (args.where.id === 'p-cdb' && ++leituras > 1) return null;
      return base(args);
    });
    const r = await aplicarDestinos(
      USER,
      corpo({
        itens: [
          { id: INV_FII.id, categoria: 'fimFia', subgrupo: 'fiagro' },
          { id: INV_CDB.id, categoria: 'reservaEmergencia' },
        ],
        confirmarIds: [INV_FII.id, INV_CDB.id],
      }),
    );
    expect(r).toMatchObject({
      tipo: 'ok',
      resposta: {
        aplicados: 1,
        parcial: true,
        erros: [{ id: INV_CDB.id, nome: INV_CDB.name, motivo: MSG_NAO_ENCONTRADO }],
      },
    });
    expect(idsMarcados()).toEqual([INV_FII.id]);
  });

  it('erro inesperado (não ApiError) sobe', async () => {
    mockPrisma.bankInvestment.findFirst.mockRejectedValueOnce(new Error('db caiu'));
    await expect(
      aplicarDestinos(
        USER,
        corpo({ itens: [{ id: INV_FII.id, categoria: 'fiis', subgrupo: 'tvm' }] }),
      ),
    ).rejects.toThrow('db caiu');
  });
});

// ── resumoImportado (tela "Conexão realizada") ───────────────────────────────

describe('resumoImportado — investimentosParaRevisar', () => {
  beforeEach(() => {
    for (const m of [
      mockPrisma.bankAccount.count,
      mockPrisma.bankTransaction.count,
      mockPrisma.bankInvestment.count,
      mockPrisma.bankLoan.count,
    ]) {
      m.mockResolvedValue(0);
    }
  });

  it('chave ligada: conta os para conferir da conexão', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue({ userId: USER });
    mockPrisma.bankInvestment.findMany.mockResolvedValue([{ portfolioId: 'p-fii' }]);
    const r = await resumoImportado(CONN);
    expect(r.investimentosParaRevisar).toBe(1);
    expect(mockPrisma.bankInvestment.findMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      connectionId: CONN,
    });
  });

  it('chave desligada: 0 e nenhuma consulta nova', async () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'false');
    const r = await resumoImportado(CONN);
    expect(r.investimentosParaRevisar).toBe(0);
    expect(mockPrisma.bankConnection.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.bankInvestment.findMany).not.toHaveBeenCalled();
  });
});
