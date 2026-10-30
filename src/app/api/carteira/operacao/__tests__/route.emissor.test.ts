/**
 * Banco emissor na renda fixa coberta pelo FGC (ClickUp 86e2xqh69): o POST grava
 * FixedIncomeAsset.emissorInstitutionId. Omitido → a corretora; produto não coberto,
 * Tesouro e debênture → null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mockPrisma = vi.hoisted(() => {
  const base = {
    userChangeLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    institution: { findFirst: vi.fn(), findUnique: vi.fn() },
    asset: { findUnique: vi.fn(), create: vi.fn() },
    stock: { findUnique: vi.fn() },
    stockTransaction: { create: vi.fn(), findMany: vi.fn() },
    portfolio: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    watchlist: { findFirst: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    fixedIncomeAsset: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tesouroDiretoPrice: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  base.$transaction.mockImplementation((fn: (tx: typeof base) => unknown) => fn(base));
  return base;
});

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: vi.fn().mockResolvedValue(undefined),
  recalculatePortfolioFromTransactions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/pricing/cvmFundSync', () => ({
  runCvmFundSync: vi.fn().mockResolvedValue({}),
}));
const mockCaixa = vi.hoisted(() => ({
  debitarCaixa: vi.fn(),
  creditarCaixa: vi.fn(),
  resolverCaixaAba: vi.fn(),
  invalidateCaixaCaches: vi.fn(),
}));
vi.mock('@/services/portfolio/caixaParaInvestir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portfolio/caixaParaInvestir')>()),
  ...mockCaixa,
}));

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/operacao', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const CORRETORA = { id: 'inst-btg', codigo: '208', nome: 'BTG Pactual', tipoBacen: 'B1' };
const BANCO_XP = { id: 'inst-bxp', codigo: '348', nome: 'Banco XP', tipoBacen: 'B1' };
const XP_CCTVM = { id: 'inst-xpcctvm', codigo: '102', nome: 'XP CCTVM', tipoBacen: 'N2' };
const CATALOGO: Record<string, typeof CORRETORA> = {
  [CORRETORA.id]: CORRETORA,
  [BANCO_XP.id]: BANCO_XP,
  [XP_CCTVM.id]: XP_CCTVM,
};

const cdbPre = (extra: Record<string, unknown> = {}) => ({
  tipoAtivo: 'renda-fixa',
  instituicaoId: CORRETORA.id,
  rendaFixaTipo: 'CDB_PRE',
  dataInicio: '2024-01-15',
  dataVencimento: '2026-01-15',
  valorAplicado: 10000,
  descricao: 'CDB Banco X',
  taxaJurosAnual: 12.5,
  rendaFixaIndexer: 'PRE',
  ...extra,
});

const fiData = () => {
  expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledTimes(1);
  return mockPrisma.fixedIncomeAsset.create.mock.calls[0][0].data as Record<string, unknown>;
};

describe('POST /api/carteira/operacao — banco emissor (86e2xqh69)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.institution.findFirst.mockResolvedValue(CORRETORA);
    mockPrisma.institution.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => CATALOGO[where.id] ?? null,
    );
    mockPrisma.asset.create.mockResolvedValue({
      id: 'asset-rf',
      symbol: 'RENDA-FIXA-1',
      name: 'CDB Banco X',
      type: 'bond',
    });
    mockPrisma.asset.findUnique.mockResolvedValue(null);
    mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.fixedIncomeAsset.create.mockResolvedValue({});
    mockPrisma.tesouroDiretoPrice.findFirst.mockResolvedValue(null);
  });

  it('CDB_PRE sem emissor grava a corretora (o FGC fica igual ao de antes)', async () => {
    const res = await POST(createRequest(cdbPre()));
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(CORRETORA.id);
  });

  it("'' cai no padrão (a corretora)", async () => {
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: '' })));
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(CORRETORA.id);
  });

  it('null cai no padrão (a corretora)', async () => {
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: null })));
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(CORRETORA.id);
  });

  it('com emissor grava o emissor e não põe nada nas notes', async () => {
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: BANCO_XP.id })));
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(BANCO_XP.id);
    const notes = JSON.parse(mockPrisma.stockTransaction.create.mock.calls[0][0].data.notes);
    expect(JSON.stringify(notes)).not.toContain(BANCO_XP.id);
    expect(notes.operation.instituicaoId).toBe(CORRETORA.id);
  });

  it('LCI pós (LCI_PRE com CDI) também aceita emissor', async () => {
    const res = await POST(
      createRequest(
        cdbPre({
          tipoAtivo: 'renda-fixa-posfixada',
          rendaFixaTipo: 'LCI_PRE',
          rendaFixaIndexer: 'CDI',
          taxaJurosAnual: 95,
          emissorInstituicaoId: BANCO_XP.id,
        }),
      ),
    );
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(BANCO_XP.id);
  });

  it('emissor inexistente dá 404 e não grava nada', async () => {
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: 'inst-fantasma' })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Banco emissor não encontrado');
    expect(mockPrisma.fixedIncomeAsset.create).not.toHaveBeenCalled();
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('emissor INATIVA dá 404 (o picker só lista as ATIVA)', async () => {
    mockPrisma.institution.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'inst-inativa'
          ? { ...BANCO_XP, id: 'inst-inativa', status: 'INATIVA' }
          : (CATALOGO[where.id] ?? null),
    );
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: 'inst-inativa' })));
    expect(res.status).toBe(404);
    expect(mockPrisma.fixedIncomeAsset.create).not.toHaveBeenCalled();
  });

  it('corretora pura (N2) diferente da corretora da compra dá 400', async () => {
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: XP_CCTVM.id })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/não emite/);
    expect(mockPrisma.fixedIncomeAsset.create).not.toHaveBeenCalled();
  });

  it('a própria corretora N2 como emissor passa (pré-preenchimento do wizard)', async () => {
    mockPrisma.institution.findFirst.mockResolvedValue(XP_CCTVM);
    const res = await POST(
      createRequest(cdbPre({ instituicaoId: XP_CCTVM.id, emissorInstituicaoId: XP_CCTVM.id })),
    );
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBe(XP_CCTVM.id);
  });

  it.each([['LF_PRE'], ['CRI_PRE'], ['CRA_PRE']])(
    '%s (fora do FGC) grava null mesmo com emissor no body',
    async (tipo) => {
      const res = await POST(
        createRequest(cdbPre({ rendaFixaTipo: tipo, emissorInstituicaoId: BANCO_XP.id })),
      );
      expect(res.status).toBe(201);
      expect(fiData().emissorInstitutionId).toBeNull();
    },
  );

  it('debênture manual grava null', async () => {
    const res = await POST(
      createRequest({
        tipoAtivo: 'debenture',
        instituicaoId: CORRETORA.id,
        assetId: 'DEBENTURE-MANUAL',
        ativo: 'Debênture XYZ',
        dataCompra: '2024-01-15',
        quantidade: 100,
        cotacaoUnitaria: 10,
        metodo: 'cotas',
        tipoDebenture: 'prefixada',
        taxaJurosAnual: 12.5,
        emissorInstituicaoId: BANCO_XP.id,
      }),
    );
    expect(res.status).toBe(201);
    const data = fiData();
    expect(data.type).toBe('CDB_PRE');
    expect(data.emissorInstitutionId).toBeNull();
  });

  it('Tesouro com destino renda fixa grava null', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      id: 'asset-td-cat',
      symbol: 'TD-TESOURO-SELIC-2029',
      name: 'Tesouro Selic 2029',
      type: 'tesouro-direto',
    });
    const res = await POST(
      createRequest({
        tipoAtivo: 'tesouro-direto',
        instituicaoId: CORRETORA.id,
        assetId: 'asset-td-cat',
        dataCompra: '2024-01-15',
        valorInvestido: 5000,
        metodo: 'valor',
        tesouroDestino: 'renda-fixa-posfixada',
        dataInicio: '2024-01-15',
        dataVencimento: '2029-03-01',
        taxaJurosAnual: 100,
        rendaFixaIndexer: 'CDI',
        descricao: 'Tesouro Selic 2029',
        emissorInstituicaoId: BANCO_XP.id,
      }),
    );
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBeNull();
  });

  it('reserva com CDB grava null (o emissor da reserva é só na edição)', async () => {
    mockPrisma.institution.findFirst.mockResolvedValue({ id: 'inst-reserva', nome: 'Reserva' });
    mockPrisma.asset.create.mockResolvedValue({
      id: 'asset-res',
      symbol: 'RESERVA-EMERG-1',
      name: 'Reserva',
      type: 'emergency',
    });
    const res = await POST(
      createRequest({
        tipoAtivo: 'emergency',
        instituicaoId: CORRETORA.id,
        ativo: 'CDB liquidez diária',
        dataCompra: '2024-01-15',
        valorInvestido: 1000,
        cotizacaoResgate: 'D+0',
        liquidacaoResgate: 'D+0',
        vencimento: '2027-01-15',
        benchmark: 'CDI',
        percentualCDI: 100,
        emissorInstituicaoId: BANCO_XP.id,
      }),
    );
    expect(res.status).toBe(201);
    expect(fiData().emissorInstitutionId).toBeNull();
  });

  it("'renda-fixa-prefixada' (ramo morto) dá 400", async () => {
    const res = await POST(createRequest(cdbPre({ tipoAtivo: 'renda-fixa-prefixada' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Tipo de ativo inválido. Use Renda Fixa pré, pós ou híbrida.',
    );
  });

  it('consultor agindo pelo cliente grava o emissor no FI do cliente', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor-1', email: 'c@t.com', role: 'consultant' },
      targetUserId: 'cliente-9',
      actingClient: { id: 'cliente-9' },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'cliente-9' });
    const res = await POST(createRequest(cdbPre({ emissorInstituicaoId: BANCO_XP.id })));
    expect(res.status).toBe(201);
    const data = fiData();
    expect(data.userId).toBe('cliente-9');
    expect(data.emissorInstitutionId).toBe(BANCO_XP.id);
  });
});
