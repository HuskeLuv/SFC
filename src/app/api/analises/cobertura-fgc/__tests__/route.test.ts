import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  bankInvestment: { findMany: vi.fn() },
  institution: { findMany: vi.fn() },
}));

const mockPricer = vi.hoisted(() => ({
  fixedIncomeAssets: [] as Record<string, unknown>[],
  fixedIncomeByAssetId: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: vi.fn(async () => ({
    ...mockPricer,
    getCurrentValue: () => 0,
  })),
}));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn(async () => new Map()),
}));
vi.mock('@/services/market/cambioUsdBrl', () => ({
  getCotacaoDolarHoje: vi.fn(async () => null),
}));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/analises/cobertura-fgc');

interface Caso {
  pid: string;
  symbol: string;
  type?: string;
  tesouroBondType?: string | null;
  valor: number;
  corretoraId?: string | null;
  emissorId?: string | null;
}

const INSTITUICOES = [
  {
    id: 'btg',
    nome: 'BTG Pactual',
    cnpj: '30306294000145',
    cnpjCalculado: false,
    tipoBacen: 'B1',
    codigo: '208',
    conglomeradoBacen: null,
  },
  {
    id: 'bxp',
    nome: 'Banco XP S.A.',
    cnpj: '33264668000103',
    cnpjCalculado: true,
    tipoBacen: 'B1',
    codigo: 'BCB-33264668',
    conglomeradoBacen: null,
  },
];

function montar(
  casos: Caso[],
  bankInvestments: { fixedIncomeAssetId: string; subtype: string; issuer: string | null }[] = [],
) {
  const fis = casos
    .filter((c) => c.type)
    .map((c) => ({
      id: `fi-${c.pid}`,
      assetId: `a-${c.pid}`,
      type: c.type,
      tesouroBondType: c.tesouroBondType ?? null,
      description: `Título ${c.pid}`,
      investedAmount: c.valor,
      maturityDate: new Date('2028-01-01T00:00:00Z'),
      taxExempt: false,
      emissorInstitutionId: c.emissorId ?? null,
    }));
  mockPricer.fixedIncomeAssets = fis;
  mockPricer.fixedIncomeByAssetId = new Map(fis.map((f) => [f.assetId, f]));
  const portfolio = casos.map((c) => ({
    id: c.pid,
    userId: 'user-1',
    assetId: `a-${c.pid}`,
    quantity: 1,
    avgPrice: c.valor,
    totalInvested: c.valor,
    asset: { id: `a-${c.pid}`, symbol: c.symbol, name: c.symbol, type: 'bond' },
  }));
  mockPrisma.portfolio.findMany.mockImplementation(async (args: { where: { id?: unknown } }) =>
    args.where.id ? [] : portfolio,
  );
  mockPrisma.stockTransaction.findMany.mockResolvedValue(
    casos
      .filter((c) => c.corretoraId)
      .map((c) => ({
        assetId: `a-${c.pid}`,
        notes: JSON.stringify({ operation: { instituicaoId: c.corretoraId } }),
      })),
  );
  mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue(
    fis.map((f) => ({ id: f.id, emissorInstitutionId: f.emissorInstitutionId })),
  );
  mockPrisma.bankInvestment.findMany.mockResolvedValue(bankInvestments);
  mockPrisma.institution.findMany.mockImplementation(
    async (args: { where: { id: { in: string[] } } }) =>
      INSTITUICOES.filter((i) => args.where.id.in.includes(i.id)),
  );
}

async function chamar() {
  const res = await GET(req());
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /api/analises/cobertura-fgc (por emissor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor', email: 'c@x', role: 'consultant' },
      targetUserId: 'user-1',
      actingClient: { id: 'user-1' },
    });
  });

  it('agrupa pelo emissor gravado e filtra tudo pelo cliente (consultor agindo)', async () => {
    montar([
      {
        pid: 'p1',
        symbol: 'RENDA-FIXA-1',
        type: 'CDB_PRE',
        valor: 100_000,
        corretoraId: 'btg',
        emissorId: 'bxp',
      },
    ]);
    const data = await chamar();
    expect(data.instituicoes).toHaveLength(1);
    const g = data.instituicoes[0];
    expect(g.instituicaoNome).toBe('Banco XP S.A.');
    expect(g.chave).toBe('33264668');
    expect(g.cnpjCalculado).toBe(true);
    expect(g.corretoras).toEqual([{ id: 'btg', nome: 'BTG Pactual' }]);
    expect(g.ativos[0].corretoraNome).toBe('BTG Pactual');
    expect(g.ativos[0].fonteInstituicao).toBe('emissor');
    expect(data.avisosConglomerado).toEqual([]);
    expect(mockPrisma.bankInvestment.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(mockPrisma.fixedIncomeAsset.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    const ids = mockPrisma.institution.findMany.mock.calls[0][0].where.id.in;
    expect(new Set(ids)).toEqual(new Set(['btg', 'bxp']));
  });

  it('Tesouro continua em semCobertura e fora dos grupos', async () => {
    montar([
      {
        pid: 'p1',
        symbol: 'TESOURO-SELIC-2029',
        type: 'LFT',
        tesouroBondType: 'SELIC',
        valor: 50_000,
        corretoraId: 'btg',
      },
      { pid: 'p2', symbol: 'RENDA-FIXA-2', type: 'CDB_PRE', valor: 10_000, corretoraId: 'btg' },
    ]);
    const data = await chamar();
    expect(data.instituicoes).toHaveLength(1);
    expect(data.instituicoes[0].ativos.map((a: { id: string }) => a.id)).toEqual(['p2']);
    const tesouro = data.semCobertura.classes.find(
      (c: { classe: string }) => c.classe === 'tesouroDireto',
    );
    expect(tesouro.valor).toBe(50_000);
  });

  it('emissor apagado do catálogo cai no fallback da corretora', async () => {
    montar([
      {
        pid: 'p1',
        symbol: 'RENDA-FIXA-1',
        type: 'CDB_PRE',
        valor: 20_000,
        corretoraId: 'btg',
        emissorId: 'sumiu',
      },
    ]);
    const data = await chamar();
    const g = data.instituicoes[0];
    expect(g.instituicaoId).toBe('btg');
    expect(g.usaCorretoraComoEmissor).toBe(true);
    expect(g.ativosSemEmissor).toBe(1);
    expect(g.ativos[0].fonteInstituicao).toBe('corretora');
  });

  it('Pluggy sem casamento: "desconhecida" com o texto recebido e origem openFinance', async () => {
    montar(
      [{ pid: 'p1', symbol: 'PLUGGY-RF-abc', type: 'CDB_POS', valor: 30_000 }],
      [{ fixedIncomeAssetId: 'fi-p1', subtype: 'CDB', issuer: ' ARBI ' }],
    );
    const data = await chamar();
    const g = data.instituicoes[0];
    expect(g.chave).toBe('desconhecida');
    expect(g.instituicaoNome).toBe('Emissor não identificado');
    expect(g.temOpenFinance).toBe(true);
    expect(g.ativos[0].origem).toBe('openFinance');
    expect(g.ativos[0].emissorInformadoTexto).toBe('ARBI');
    expect(g.ativos[0].fonteInstituicao).toBe('desconhecida');
    expect(g.ativos[0].editarEmissorHref).toBe('/ativos/p1/editar?editar=emissor');
  });

  it('href só quando a edição aceita emissor (debênture/fundo/Pluggy DEBENTURE não)', async () => {
    montar(
      [
        { pid: 'p1', symbol: 'DEBENTURE-ABC', type: 'CDB_PRE', valor: 10_000, corretoraId: 'btg' },
        { pid: 'p2', symbol: 'FUNDO-XYZ', type: 'CDB_PRE', valor: 10_000, corretoraId: 'btg' },
        { pid: 'p3', symbol: 'PLUGGY-RF-d', type: 'CDB_PRE', valor: 10_000 },
        { pid: 'p4', symbol: 'RENDA-FIXA-4', type: 'CRI_PRE', valor: 10_000, corretoraId: 'btg' },
        { pid: 'p5', symbol: 'RENDA-FIXA-5', type: 'LCI_POS', valor: 10_000, corretoraId: 'btg' },
      ],
      [{ fixedIncomeAssetId: 'fi-p3', subtype: 'DEBENTURE', issuer: 'Vale' }],
    );
    const data = await chamar();
    const ativos = data.instituicoes.flatMap(
      (g: { ativos: { id: string; editarEmissorHref: string | null }[] }) => g.ativos,
    );
    const href = Object.fromEntries(
      ativos.map((a: { id: string; editarEmissorHref: string | null }) => [
        a.id,
        a.editarEmissorHref,
      ]),
    );
    expect(href).toEqual({
      p1: null,
      p2: null,
      p3: null,
      p4: null,
      p5: '/ativos/p5/editar?editar=emissor',
    });
    // Debênture/fundo como CDB continuam contando como cobertos (decisão 6).
    expect(data.resumo.totalEfetivamenteCoberto).toBe(40_000);
    expect(data.resumo.totalNaoCoberto).toBe(10_000);
  });
});
