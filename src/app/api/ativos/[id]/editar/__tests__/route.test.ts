/**
 * GET /api/ativos/[id]/editar — campos do banco emissor (ClickUp 86e2xqh69): emissor,
 * aceitaEmissor, corretoraEmissora e emissorInformadoOpenFinance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  institution: { findUnique: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  bankInvestment: { findFirst: vi.fn() },
  portfolioProvento: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/ensurePortfolioProventosFromMarket', () => ({
  ensurePortfolioProventosFromMarket: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '../route';

const callGET = (id = 'pf-1') =>
  GET(new NextRequest(`http://localhost/api/ativos/${id}/editar`), {
    params: Promise.resolve({ id }),
  });

const BTG = { id: 'inst-btg', nome: 'BTG Pactual', tipoBacen: 'B1', codigo: '208' };
const XP_CCTVM = { id: 'inst-xpc', nome: 'XP CCTVM', tipoBacen: 'N2', codigo: '102' };
const CATALOGO: Record<string, typeof BTG> = { [BTG.id]: BTG, [XP_CCTVM.id]: XP_CCTVM };

const portfolioCom = (symbol: string) => ({
  id: 'pf-1',
  userId: 'user-1',
  assetId: 'asset-1',
  quantity: 1,
  lastUpdate: new Date('2026-10-01'),
  vinculoAposentadoria: false,
  planejamentoObjetivoId: null,
  moedaRegistro: null,
  asset: { id: 'asset-1', symbol, name: 'CDB Banco XP 2028', type: 'bond', currency: 'BRL' },
});
const compraNa = (instituicaoId: string) => ({
  id: 'tx-1',
  type: 'compra',
  quantity: 1,
  price: 10000,
  total: 10000,
  date: new Date('2026-01-10'),
  fees: 0,
  notes: JSON.stringify({ operation: { instituicaoId } }),
});
const fiCom = (extra: Record<string, unknown> = {}) => ({
  id: 'fi-1',
  type: 'CDB_PRE',
  tesouroBondType: null,
  emissor: null,
  ...extra,
});

describe('GET /api/ativos/[id]/editar — banco emissor (86e2xqh69)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('RENDA-FIXA-1'));
    mockPrisma.stockTransaction.findMany.mockResolvedValue([compraNa(BTG.id)]);
    mockPrisma.institution.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => CATALOGO[where.id] ?? null,
    );
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCom());
    mockPrisma.bankInvestment.findFirst.mockResolvedValue(null);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([]);
  });

  it('CDB manual sem emissor: aceitaEmissor true, emissor null, corretora emissora', async () => {
    const res = await callGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      instituicaoId: BTG.id,
      instituicaoNome: 'BTG Pactual',
      aceitaEmissor: true,
      emissor: null,
      corretoraEmissora: true,
      emissorInformadoOpenFinance: null,
    });
    expect(mockPrisma.fixedIncomeAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', assetId: 'asset-1' } }),
    );
    // Manual não consulta o Open Finance.
    expect(mockPrisma.bankInvestment.findFirst).not.toHaveBeenCalled();
  });

  it('com emissor gravado devolve id, nome, cnpj e cnpjCalculado', async () => {
    const emissor = {
      id: 'inst-bxp',
      nome: 'Banco XP',
      cnpj: '33264668000103',
      cnpjCalculado: true,
    };
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCom({ emissor }));
    const data = await (await callGET()).json();
    expect(data.emissor).toEqual(emissor);
  });

  it.each([
    ['CRI', 'RENDA-FIXA-1', fiCom({ type: 'CRI_PRE' })],
    ['Tesouro', 'TD-TESOURO-SELIC-2029', fiCom({ tesouroBondType: 'Tesouro Selic' })],
    ['debênture manual', 'DEBENTURE-XYZ-1', fiCom()],
    ['fundo RF', 'FUNDO-RF-1', fiCom()],
  ])('%s: aceitaEmissor false', async (_nome, symbol, fi) => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom(symbol));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi);
    const data = await (await callGET()).json();
    expect(data.aceitaEmissor).toBe(false);
    expect(data.emissor).toBeNull();
  });

  it('ação (sem renda fixa): aceitaEmissor false', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PETR4'));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    const data = await (await callGET()).json();
    expect(data.aceitaEmissor).toBe(false);
  });

  it('PLUGGY-RF- CDB sem emissor casado: devolve o texto do Open Finance', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PLUGGY-RF-abc'));
    mockPrisma.bankInvestment.findFirst.mockResolvedValue({ subtype: 'CDB', issuer: ' ARBI ' });
    const data = await (await callGET()).json();
    expect(data.aceitaEmissor).toBe(true);
    expect(data.emissorInformadoOpenFinance).toBe('ARBI');
    expect(mockPrisma.bankInvestment.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', fixedIncomeAssetId: 'fi-1' },
      select: { subtype: true, issuer: true },
    });
  });

  it('PLUGGY-RF- com emissor já gravado não repete o texto do Open Finance', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PLUGGY-RF-abc'));
    mockPrisma.bankInvestment.findFirst.mockResolvedValue({ subtype: 'CDB', issuer: 'ARBI' });
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(
      fiCom({ emissor: { id: 'inst-arbi', nome: 'Banco Arbi', cnpj: null, cnpjCalculado: false } }),
    );
    const data = await (await callGET()).json();
    expect(data.emissorInformadoOpenFinance).toBeNull();
  });

  it('PLUGGY-RF- debênture: aceitaEmissor false', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PLUGGY-RF-abc'));
    mockPrisma.bankInvestment.findFirst.mockResolvedValue({ subtype: 'DEBENTURE', issuer: 'X' });
    const data = await (await callGET()).json();
    expect(data.aceitaEmissor).toBe(false);
    expect(data.emissorInformadoOpenFinance).toBeNull();
  });

  it('corretora N2: corretoraEmissora false', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([compraNa(XP_CCTVM.id)]);
    const data = await (await callGET()).json();
    expect(data.corretoraEmissora).toBe(false);
  });

  it('consultor agindo pelo cliente lê o FI do cliente', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor-1' },
      targetUserId: 'cliente-9',
      actingClient: { id: 'cliente-9' },
    });
    await callGET();
    expect(mockPrisma.fixedIncomeAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'cliente-9', assetId: 'asset-1' } }),
    );
  });
});
