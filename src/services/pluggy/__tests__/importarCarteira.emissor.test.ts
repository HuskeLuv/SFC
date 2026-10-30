/**
 * Emissor da renda fixa do Open Finance (ClickUp 86e2xqh69): a importação casa o issuer do
 * Pluggy (CNPJ, depois nome ou apelido) com o catálogo e grava FixedIncomeAsset.emissorInstitutionId.
 * O backfill dos já importados respeita a escolha do usuário. Nada chama a API do Pluggy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Investment } from 'pluggy-sdk';

const mockPrisma = vi.hoisted(() => {
  const tx = {
    asset: { create: vi.fn() },
    stockTransaction: { create: vi.fn() },
    portfolio: { create: vi.fn(), findFirst: vi.fn() },
    fixedIncomeAsset: { create: vi.fn() },
  };
  return {
    tx,
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    portfolio: { findFirst: vi.fn() },
    fixedIncomeAsset: { findFirst: vi.fn() },
    tesouroDiretoPrice: { findFirst: vi.fn() },
    bankInvestment: { update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    pluggyImportacaoOrigem: { findUnique: vi.fn(), upsert: vi.fn() },
    bankLoan: { update: vi.fn(), findMany: vi.fn() },
    institution: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: vi.fn(),
}));
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: vi.fn(),
}));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  chaveInvestimento,
  importarInvestimento,
  importarPendentes,
  mapInvestment,
} from '../importarCarteira';
import {
  montarIndiceEmissores,
  planejarBackfillEmissor,
  type CandidatoBackfill,
  type InstituicaoIndice,
} from '@/services/instituicoes/casarEmissor';

const catalogo: InstituicaoIndice[] = [
  {
    id: 'inst-xp',
    nome: 'Banco XP S.A.',
    cnpj: '33264668000103',
    tipoBacen: 'B1',
    codigo: '348',
    apelidos: 'xp',
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'inst-arbi',
    nome: 'Banco Arbi S.A.',
    cnpj: '54403563000150',
    tipoBacen: 'B1',
    codigo: '213',
    apelidos: null,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'inst-nu',
    nome: 'Nu Financeira S.A. - SCFI',
    cnpj: '30680829000143',
    tipoBacen: 'N1',
    codigo: 'BCB-30680829',
    apelidos: 'nubank',
    createdAt: new Date('2025-01-01'),
  },
];

const base = {
  id: 'bi-1',
  connectionId: 'conn-1',
  userId: 'user-1',
  providerInvestmentId: '44feccaf-0000-4000-8000-000000000000',
  type: 'FIXED_INCOME',
  subtype: 'CDB',
  name: 'CDB Pós',
  code: null,
  isin: null,
  number: null,
  balance: 2000,
  quantity: null,
  unitValue: null,
  amountOriginal: 2000,
  amountProfit: 0,
  rate: 110,
  rateType: 'CDI',
  fixedAnnualRate: null,
  issueDate: new Date('2026-01-10T00:00:00Z'),
  dueDate: new Date('2028-01-10T00:00:00Z'),
  issuer: 'BANCO XP S.A.',
  issuerCnpj: '33264668000103',
  status: 'ACTIVE',
  providerDate: new Date(),
  ativo: true,
  assetId: null,
  portfolioId: null,
  fixedIncomeAssetId: null,
  importStatus: 'pendente',
  importError: null,
  importedAt: null,
  destinoConfirmadoEm: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Parameters<typeof importarInvestimento>[0];

const emissorGravado = () =>
  mockPrisma.tx.fixedIncomeAsset.create.mock.calls[0][0].data.emissorInstitutionId;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bankInvestment.update.mockResolvedValue({});
  mockPrisma.tx.asset.create.mockImplementation(async ({ data }: { data: { symbol: string } }) => ({
    id: 'asset-' + data.symbol,
  }));
  mockPrisma.tx.stockTransaction.create.mockResolvedValue({ id: 'tx-1' });
  mockPrisma.tx.portfolio.create.mockResolvedValue({ id: 'port-1' });
  mockPrisma.tx.fixedIncomeAsset.create.mockResolvedValue({ id: 'fi-1' });
  mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue(null);
  mockPrisma.pluggyImportacaoOrigem.upsert.mockResolvedValue({});
  mockPrisma.bankInvestment.count.mockResolvedValue(0);
  mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
  mockPrisma.tesouroDiretoPrice.findFirst.mockResolvedValue(null);
  mockPrisma.institution.findMany.mockResolvedValue(catalogo);
  mockPrisma.bankLoan.findMany.mockResolvedValue([]);
});

describe('importação grava o emissor', () => {
  it('CDB com issuerCNPJ grava o emissor (raiz no catálogo)', async () => {
    const st = await importarInvestimento({
      ...base,
      issuer: 'Nome que não casa',
      issuerCnpj: '33264668000294',
    });
    expect(st).toBe('importado');
    expect(emissorGravado()).toBe('inst-xp');
    expect(mockPrisma.institution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ATIVA' } }),
    );
  });

  it('CDB só com o nome casa pelo nome; RDB "NUBANK" casa pelo apelido', async () => {
    await importarInvestimento({ ...base, issuer: 'Banco Arbi SA', issuerCnpj: null });
    expect(emissorGravado()).toBe('inst-arbi');
    vi.clearAllMocks();
    mockPrisma.tx.fixedIncomeAsset.create.mockResolvedValue({ id: 'fi-1' });
    mockPrisma.tx.asset.create.mockResolvedValue({ id: 'a' });
    mockPrisma.tx.portfolio.create.mockResolvedValue({ id: 'p' });
    mockPrisma.institution.findMany.mockResolvedValue(catalogo);
    await importarInvestimento({ ...base, subtype: 'RDB', issuer: 'NUBANK', issuerCnpj: null });
    expect(emissorGravado()).toBe('inst-nu');
  });

  it('emissor sem casamento (ARBI só como texto desconhecido) fica null', async () => {
    await importarInvestimento({ ...base, issuer: 'ARBI DTVM', issuerCnpj: null });
    expect(emissorGravado()).toBeNull();
  });

  it.each(['DEBENTURE', 'LF', 'CRI', 'CRA'])('%s: sem emissor, mesmo com CNPJ', async (subtype) => {
    const st = await importarInvestimento({ ...base, subtype });
    expect(st).toBe('importado');
    expect(emissorGravado()).toBeNull();
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
  });

  it('Tesouro: sem emissor', async () => {
    const vencimento = new Date('2040-08-15T00:00:00Z');
    mockPrisma.tesouroDiretoPrice.findFirst.mockResolvedValue({
      bondType: 'Tesouro IPCA+',
      maturityDate: vencimento,
    });
    const st = await importarInvestimento({
      ...base,
      subtype: 'TREASURY',
      name: 'TESOURO DIRETO - NTNB-P',
      dueDate: vencimento,
      issuer: 'Tesouro Nacional',
      issuerCnpj: '00394460000141',
    });
    expect(st).toBe('importado');
    expect(emissorGravado()).toBeNull();
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
  });

  it('índice passado de fora: não relê o catálogo; null = sem catálogo', async () => {
    const indice = montarIndiceEmissores(catalogo);
    await importarInvestimento(base, 7, indice);
    expect(emissorGravado()).toBe('inst-xp');
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
    vi.clearAllMocks();
    mockPrisma.tx.fixedIncomeAsset.create.mockResolvedValue({ id: 'fi-1' });
    mockPrisma.tx.asset.create.mockResolvedValue({ id: 'a' });
    mockPrisma.tx.portfolio.create.mockResolvedValue({ id: 'p' });
    await importarInvestimento(base, 7, null);
    expect(emissorGravado()).toBeNull();
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
  });

  it('catálogo indisponível não impede a importação', async () => {
    mockPrisma.institution.findMany.mockRejectedValue(new Error('db fora'));
    expect(await importarInvestimento(base)).toBe('importado');
    expect(emissorGravado()).toBeNull();
  });

  it('reconexão (vinculado) não cria nada nem mexe no emissor', async () => {
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue({
      id: 'o1',
      assetId: 'asset-antigo',
      portfolioId: 'port-antigo',
      fixedIncomeAssetId: 'fi-antigo',
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-antigo' });
    expect(await importarInvestimento(base, 7)).toBe('vinculado');
    expect(mockPrisma.tx.fixedIncomeAsset.create).not.toHaveBeenCalled();
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
  });

  it('importarPendentes carrega o catálogo uma vez para várias RF', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([
      { ...base, id: 'a', connection: { connectorId: 1 } },
      {
        ...base,
        id: 'b',
        providerInvestmentId: 'bbbbbbbb-0000',
        issuer: 'Banco Arbi',
        issuerCnpj: null,
        connection: { connectorId: 1 },
      },
    ]);
    const r = await importarPendentes('user-1');
    expect(r.importados).toBe(2);
    expect(mockPrisma.institution.findMany).toHaveBeenCalledTimes(1);
    const emissores = mockPrisma.tx.fixedIncomeAsset.create.mock.calls.map(
      (c) => c[0].data.emissorInstitutionId,
    );
    expect(emissores).toEqual(['inst-xp', 'inst-arbi']);
  });

  it('importarPendentes sem RF com emissor não lê o catálogo', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([]);
    await importarPendentes('user-1');
    expect(mockPrisma.institution.findMany).not.toHaveBeenCalled();
  });
});

describe('espelho e identidade da posição', () => {
  const investimento = {
    id: 'pluggy-1',
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    name: 'CDB Pós',
    balance: 1000,
    issuer: 'BANCO XP S.A.',
    issuerCNPJ: '33.264.668/0001-03',
  } as unknown as Investment;

  it('mapInvestment normaliza o CNPJ do emissor (só dígitos; vazio vira null)', () => {
    expect(mapInvestment(investimento, 'conn', 'user').issuerCnpj).toBe('33264668000103');
    expect(
      mapInvestment({ ...investimento, issuerCNPJ: null } as Investment, 'conn', 'user').issuerCnpj,
    ).toBeNull();
    expect(
      mapInvestment({ ...investimento, issuerCNPJ: ' - ' } as Investment, 'conn', 'user')
        .issuerCnpj,
    ).toBeNull();
    expect(
      mapInvestment({ ...investimento, issuerCNPJ: undefined } as unknown as Investment, 'c', 'u')
        .issuerCnpj,
    ).toBeNull();
  });

  it('chaveInvestimento igual com e sem issuerCnpj (sync repetido não duplica)', () => {
    const k = chaveInvestimento({ ...base, issuerCnpj: null } as never, 7);
    expect(chaveInvestimento({ ...base, issuerCnpj: '33264668000103' } as never, 7)).toBe(k);
    expect(chaveInvestimento(base, 7)).toBe(k);
  });
});

describe('backfill: seleção pura', () => {
  const indice = montarIndiceEmissores(catalogo);
  const candidato = (extra: Partial<CandidatoBackfill> = {}): CandidatoBackfill => ({
    fixedIncomeAssetId: 'fi-1',
    userId: 'user-1',
    portfolioIds: ['port-1'],
    fiType: 'CDB_PRE',
    tesouroBondType: null,
    emissorInstitutionId: null,
    assetSymbol: 'PLUGGY-RF-44FECCAF',
    pluggySubtype: 'CDB',
    issuer: 'BANCO XP S.A.',
    issuerCnpj: '33264668000103',
    ...extra,
  });

  it('casa o FI sem emissor e sem histórico de emissor', () => {
    const [item] = planejarBackfillEmissor([candidato()], [], indice);
    expect(item).toMatchObject({
      fixedIncomeAssetId: 'fi-1',
      puladoPorEscolha: false,
      emissor: { id: 'inst-xp', via: 'cnpj' },
    });
  });

  it('pula quem tem histórico de emissor (inclusive "Usar a corretora")', () => {
    const logs = [
      {
        userId: 'user-1',
        entityId: 'port-1',
        changes: [{ field: 'emissor', label: 'Banco emissor', before: 'Banco XP', after: null }],
      },
    ];
    const [item] = planejarBackfillEmissor([candidato()], logs, indice);
    expect(item.puladoPorEscolha).toBe(true);
    expect(item.emissor).toBeNull();
  });

  it('histórico de outro campo, de outro usuário ou outro ativo não pula', () => {
    const logs = [
      { userId: 'user-1', entityId: 'port-1', changes: null },
      {
        userId: 'user-1',
        entityId: 'port-1',
        changes: [{ field: 'nome', label: 'Nome', before: 'a', after: 'b' }],
      },
      { userId: 'user-2', entityId: 'port-1', changes: [{ field: 'emissor' }] },
      { userId: 'user-1', entityId: 'port-9', changes: [{ field: 'emissor' }] },
    ];
    const [item] = planejarBackfillEmissor([candidato()], logs, indice);
    expect(item.puladoPorEscolha).toBe(false);
    expect(item.emissor?.id).toBe('inst-xp');
  });

  it('ignora FI que já tem emissor ou que não aceita emissor', () => {
    const itens = planejarBackfillEmissor(
      [
        candidato({ fixedIncomeAssetId: 'ja', emissorInstitutionId: 'inst-arbi' }),
        candidato({ fixedIncomeAssetId: 'deb', pluggySubtype: 'DEBENTURE' }),
        candidato({ fixedIncomeAssetId: 'td', tesouroBondType: 'Tesouro Selic' }),
        candidato({ fixedIncomeAssetId: 'td2', assetSymbol: 'PLUGGY-TD-1' }),
        candidato({ fixedIncomeAssetId: 'lf', fiType: 'LF_PRE' }),
        candidato({ fixedIncomeAssetId: 'ok', issuer: 'Desconhecido', issuerCnpj: null }),
      ],
      [],
      indice,
    );
    expect(itens.map((i) => i.fixedIncomeAssetId)).toEqual(['ok']);
    expect(itens[0].emissor).toBeNull();
  });
});
