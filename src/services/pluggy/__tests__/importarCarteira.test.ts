import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    bankInvestment: { update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    pluggyImportacaoOrigem: { findUnique: vi.fn(), upsert: vi.fn() },
    bankLoan: { update: vi.fn(), findMany: vi.fn() },
    divida: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    dividaPagamento: { createMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
const mockRecalc = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
}));
const mockSyncDivida = vi.hoisted(() => vi.fn());
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: mockSyncDivida,
}));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  chaveEmprestimo,
  chaveInvestimento,
  importarEmprestimo,
  importarInvestimento,
  indexadorRendaFixa,
  mapLoan,
  posicaoDesatualizada,
  prazoMesesDivida,
  taxaAaParaAm,
  tipoDivida,
  tipoRendaFixa,
} from '../importarCarteira';

const base = {
  id: 'bi-1',
  connectionId: 'conn-1',
  userId: 'user-1',
  providerInvestmentId: '44feccaf-0000-4000-8000-000000000000',
  isin: null,
  number: null,
  balance: 2000,
  quantity: null,
  unitValue: null,
  amountOriginal: 2000,
  amountProfit: 0,
  rate: null,
  rateType: null,
  fixedAnnualRate: null,
  issueDate: new Date('2026-01-10T00:00:00Z'),
  dueDate: new Date('2028-01-10T00:00:00Z'),
  issuer: 'Banco do Pluggy',
  status: 'ACTIVE',
  providerDate: new Date(), // posição do dia (não desatualizada)
  ativo: true,
  assetId: null,
  portfolioId: null,
  fixedIncomeAssetId: null,
  importStatus: 'pendente',
  importError: null,
  importedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bankInvestment.update.mockResolvedValue({});
  mockPrisma.bankLoan.update.mockResolvedValue({});
  mockPrisma.dividaPagamento.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.tx.asset.create.mockImplementation(async ({ data }: { data: { symbol: string } }) => ({
    id: 'asset-' + data.symbol,
  }));
  mockPrisma.tx.stockTransaction.create.mockResolvedValue({ id: 'tx-1' });
  mockPrisma.tx.portfolio.create.mockResolvedValue({ id: 'port-1' });
  mockPrisma.tx.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.tx.fixedIncomeAsset.create.mockResolvedValue({ id: 'fi-1' });
  mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue(null);
  mockPrisma.pluggyImportacaoOrigem.upsert.mockResolvedValue({});
  mockPrisma.bankInvestment.count.mockResolvedValue(0);
});

describe('mapeamentos', () => {
  it('renda fixa: tipo e indexador', () => {
    expect(tipoRendaFixa('CDB', 'CDI')).toBe('CDB_PRE');
    expect(tipoRendaFixa('LCI', 'IPCA')).toBe('LCI_HIB');
    expect(tipoRendaFixa('DEBENTURE', null)).toBe('CDB_PRE');
    expect(indexadorRendaFixa('CDI', 150, null)).toEqual({
      indexer: 'CDI',
      indexerPercent: 150,
      annualRate: 0,
    });
    expect(indexadorRendaFixa('IPCA', 100, 6.5)).toEqual({
      indexer: 'IPCA',
      indexerPercent: 100,
      annualRate: 6.5,
    });
    expect(indexadorRendaFixa(null, 12, null)).toEqual({
      indexer: 'PRE',
      indexerPercent: null,
      annualRate: 12,
    });
  });

  it('dívida: tipo, taxa a.a.→a.m., prazo e indexador', () => {
    expect(tipoDivida('CREDITO_PESSOAL_COM_CONSIGNACAO')).toBe('consignado');
    expect(tipoDivida('FINANCIAMENTO_IMOBILIARIO')).toBe('financiamento_imobiliario');
    expect(tipoDivida('FINANCIAMENTO_VEICULOS')).toBe('financiamento_veiculo');
    expect(tipoDivida(null)).toBe('outro');
    expect(taxaAaParaAm(0.6)).toBeCloseTo(0.03994, 4);
    expect(taxaAaParaAm(null)).toBe(0);
    // sandbox manda 130632 "parcelas" em dias: cai no cálculo por datas
    expect(
      prazoMesesDivida({
        totalInstallments: 130632,
        periodicity: 'MONTHLY',
        firstInstallmentDueDate: new Date('2018-02-15T00:00:00Z'),
        dueDate: new Date('2028-01-15T00:00:00Z'),
        contractDate: null,
      }),
    ).toBe(120);
    expect(
      prazoMesesDivida({
        totalInstallments: 48,
        periodicity: 'MONTHLY',
        firstInstallmentDueDate: null,
        dueDate: null,
        contractDate: null,
      }),
    ).toBe(48);
  });

  it('mapLoan pega a taxa pré quando o indexador é PRE_FIXADO', () => {
    const m = mapLoan(
      {
        id: 'l1',
        contractAmount: 50000,
        totalRemainingAmount: 28500.04,
        CET: 0.29,
        interestRates: [
          { referentialRateIndexerType: 'PRE_FIXADO', preFixedRate: 0.6, postFixedRate: 0.55 },
        ],
        installments: { totalNumberOfInstallments: 130632, paidInstallments: 73 },
        amortizationScheduled: 'SAC',
        productName: 'Crédito Pessoal Consignado',
        type: 'CREDITO_PESSOAL_COM_CONSIGNACAO',
      } as never,
      'conn-1',
      'user-1',
    );
    expect(m).toMatchObject({
      annualRate: 0.6,
      outstanding: 28500.04,
      amortization: 'SAC',
      paidInstallments: 73,
      indexer: 'PRE_FIXADO',
    });
  });
});

describe('importarInvestimento', () => {
  it('ETF do catálogo: cria transação + posição e recalcula', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({
      id: 'asset-bova',
      symbol: 'BOVA11',
      type: 'etf',
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    const st = await importarInvestimento({
      ...base,
      type: 'ETF',
      subtype: 'ETF',
      name: 'BOVA11',
      code: 'BOVA11',
      quantity: 10,
      amountOriginal: 1190,
      balance: 1184,
    });
    expect(st).toBe('importado');
    expect(mockPrisma.tx.stockTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'asset-bova',
        type: 'compra',
        quantity: 10,
        price: 119,
        total: 1190,
      }),
    });
    expect(mockRecalc).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: 'user-1',
        assetId: 'asset-bova',
        portfolioId: 'port-1',
      }),
    );
    expect(mockPrisma.bankInvestment.update).toHaveBeenCalledWith({
      where: { id: 'bi-1' },
      data: expect.objectContaining({
        importStatus: 'importado',
        assetId: 'asset-bova',
        portfolioId: 'port-1',
      }),
    });
  });

  it('ETF que o usuário já tem: só vincula (não duplica)', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({ id: 'asset-bova' });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-existente' });
    const st = await importarInvestimento({
      ...base,
      type: 'ETF',
      subtype: 'ETF',
      name: 'BOVA11',
      code: 'BOVA11',
      quantity: 1,
    });
    expect(st).toBe('vinculado');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it('ticker fora do catálogo fica sem suporte', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    expect(
      await importarInvestimento({
        ...base,
        type: 'EQUITY',
        subtype: 'STOCK',
        name: 'XPTO3',
        code: 'XPTO3',
        quantity: 1,
      }),
    ).toBe('sem-suporte');
  });

  it('CDB 150% CDI: Asset bond + FixedIncomeAsset na curva + posição', async () => {
    const st = await importarInvestimento({
      ...base,
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Banco X',
      code: '0001-02',
      rate: 150,
      rateType: 'CDI',
    });
    expect(st).toBe('importado');
    expect(mockPrisma.tx.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: 'PLUGGY-RF-44FECCAF',
        type: 'bond',
        source: 'pluggy',
      }),
    });
    expect(mockPrisma.tx.fixedIncomeAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CDB_PRE',
        indexer: 'CDI',
        indexerPercent: 150,
        annualRate: 0,
        investedAmount: 2000,
        startDate: new Date('2026-01-10T00:00:00Z'),
        maturityDate: new Date('2028-01-10T00:00:00Z'),
        taxExempt: false,
      }),
    });
    expect(mockPrisma.tx.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantity: 1, avgPrice: 2000, totalInvested: 2000 }),
    });
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it('CDB que o banco parou de atualizar não entra na Carteira', async () => {
    // Caso Itaú 26/09/2026: CDB resgatado em 08/11/2025 seguia vindo como ativo,
    // com o saldo de 07/11/2025 — na curva aparecia valendo 59 mil.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T00:35:00Z'));
    try {
      const st = await importarInvestimento({
        ...base,
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        name: 'CDB - ITAU UNIBANCO S.A.',
        rate: 100,
        rateType: 'CDI',
        amountOriginal: 52000,
        balance: 52581.67,
        issueDate: new Date('2025-10-02T03:00:00Z'),
        providerDate: new Date('2025-11-07T00:00:00Z'),
      });
      expect(st).toBe('sem-suporte');
      expect(mockPrisma.tx.asset.create).not.toHaveBeenCalled();
      expect(mockPrisma.bankInvestment.update).toHaveBeenCalledWith({
        where: { id: 'bi-1' },
        data: {
          importStatus: 'sem-suporte',
          importError: expect.stringContaining('não atualiza esta aplicação desde 07/11/2025'),
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('posição desatualizada: só depois de 10 dias sem atualização', () => {
    const agora = new Date('2026-09-26T00:35:00Z');
    expect(posicaoDesatualizada(new Date('2026-09-25T00:00:00Z'), agora)).toBe(false);
    expect(posicaoDesatualizada(new Date('2026-09-17T00:00:00Z'), agora)).toBe(false);
    expect(posicaoDesatualizada(new Date('2026-09-15T00:00:00Z'), agora)).toBe(true);
    expect(posicaoDesatualizada(null, agora)).toBe(false);
  });

  it('LCI com vencimento inválido: isenta e vencimento em +10 anos', async () => {
    await importarInvestimento({
      ...base,
      type: 'FIXED_INCOME',
      subtype: 'LCI',
      name: 'LCI',
      dueDate: new Date('2026-01-10T00:00:00Z'),
    });
    const data = mockPrisma.tx.fixedIncomeAsset.create.mock.calls[0][0].data;
    expect(data.taxExempt).toBe(true);
    expect(data.maturityDate.getFullYear()).toBe(2036);
  });

  it('fundo sem CNPJ no catálogo vira ativo manual que segue o saldo', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    const st = await importarInvestimento({
      ...base,
      type: 'MUTUAL_FUND',
      subtype: 'INVESTMENT_FUND',
      name: 'Fundo Premium',
      code: null,
      quantity: 3,
      amountOriginal: 1000,
      balance: 1359.39,
    });
    expect(st).toBe('importado');
    expect(mockPrisma.tx.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'fund', source: 'pluggy', currentPrice: 1359.39 / 3 }),
    });
    expect(mockPrisma.tx.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantity: 3, totalInvested: 1000 }),
    });
  });

  it('previdência com CNPJ no catálogo usa o ativo CVM', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({ id: 'asset-cvm' });
    const st = await importarInvestimento({
      ...base,
      type: 'SECURITY',
      subtype: 'PGBL',
      name: 'Prev',
      code: '07.400.588/0001-10',
      quantity: 3.6,
      amountOriginal: 10000,
      balance: 11720,
    });
    expect(st).toBe('importado');
    expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith({ where: { cnpj: '07400588000110' } });
    expect(mockPrisma.tx.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.tx.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'asset-cvm', quantity: 3.6 }),
    });
  });

  it('posição encerrada é ignorada; COE fica sem suporte; erro é registrado', async () => {
    expect(
      await importarInvestimento({
        ...base,
        type: 'ETF',
        subtype: 'ETF',
        name: 'BOVA11',
        code: 'BOVA11',
        status: 'TOTAL_WITHDRAWAL',
        quantity: 0,
      }),
    ).toBe('ignorado');
    expect(
      await importarInvestimento({ ...base, type: 'COE', subtype: null, name: 'COE', code: null }),
    ).toBe('sem-suporte');
    mockPrisma.asset.findFirst.mockRejectedValue(new Error('db off'));
    expect(
      await importarInvestimento({
        ...base,
        type: 'ETF',
        subtype: 'ETF',
        name: 'BOVA11',
        code: 'BOVA11',
        quantity: 1,
      }),
    ).toBe('erro');
    expect(mockPrisma.bankInvestment.update).toHaveBeenLastCalledWith({
      where: { id: 'bi-1' },
      data: { importStatus: 'erro', importError: 'db off' },
    });
  });
});

describe('importarEmprestimo', () => {
  const loan = {
    id: 'bl-1',
    connectionId: 'conn-1',
    userId: 'user-1',
    providerLoanId: 'l1',
    contractNumber: '0007',
    productName: 'Crédito Pessoal Consignado',
    type: 'CREDITO_PESSOAL_COM_CONSIGNACAO',
    contractAmount: 50000,
    outstanding: 28500.04,
    nextInstallmentAmount: 1000.04,
    cet: 0.29,
    annualRate: 0.6,
    indexer: 'PRE_FIXADO',
    amortization: 'SAC',
    periodicity: 'MONTHLY',
    totalInstallments: 130632,
    paidInstallments: 73,
    dueInstallments: 57,
    pastDueInstallments: 73,
    contractDate: new Date('2022-08-01T00:00:00Z'),
    firstInstallmentDueDate: new Date('2018-02-15T00:00:00Z'),
    dueDate: new Date('2028-01-15T00:00:00Z'),
    ativo: true,
    dividaId: null,
    importStatus: 'pendente',
    importError: null,
    importedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('cria a dívida SAC com espelho no fluxo e vincula', async () => {
    mockPrisma.divida.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'div-1', nome: 'x', ...data }),
    );
    const st = await importarEmprestimo(loan, 'Pluggy Bank');
    expect(st).toBe('importado');
    // 73 parcelas pagas viram pagamentos com os valores do cronograma SAC
    const pag = mockPrisma.dividaPagamento.createMany.mock.calls[0][0].data;
    expect(pag).toHaveLength(73);
    expect(pag[0]).toMatchObject({
      dividaId: 'div-1',
      month: '2018-02',
      parcelaNumero: 1,
      tipo: 'pagamento',
    });
    expect(pag[72].parcelaNumero).toBe(73);
    expect(pag[0].valor).toBeGreaterThan(pag[72].valor); // SAC: parcela decrescente
    expect(mockPrisma.divida.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        nome: 'Crédito Pessoal Consignado',
        instituicao: 'Pluggy Bank',
        tipo: 'consignado',
        modalidade: 'financiamento',
        status: 'ativa',
        principal: 50000,
        taxaUnidadeEntrada: 'aa',
        prazoMeses: 120,
        sistema: 'SAC',
        indexador: 'PREFIXADO',
        primeiroVencimento: '2018-02',
      }),
    });
    expect(mockPrisma.divida.create.mock.calls[0][0].data.taxaAm).toBeCloseTo(0.03994, 4);
    expect(mockSyncDivida).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'div-1' }));
    expect(mockPrisma.bankLoan.update).toHaveBeenCalledWith({
      where: { id: 'bl-1' },
      data: expect.objectContaining({ importStatus: 'importado', dividaId: 'div-1' }),
    });
  });

  it('saldo zero entra quitada; sem valor contratado fica sem suporte', async () => {
    mockPrisma.divida.create.mockResolvedValue({ id: 'div-2' });
    await importarEmprestimo({ ...loan, outstanding: 0 }, null);
    expect(mockPrisma.divida.create.mock.calls[0][0].data.status).toBe('quitada');
    expect(mockPrisma.dividaPagamento.createMany).not.toHaveBeenCalled();
    expect(
      await importarEmprestimo({ ...loan, contractAmount: null, outstanding: null }, null),
    ).toBe('sem-suporte');
  });
});

describe('reconexão não duplica (origem estável)', () => {
  const cdb = {
    ...base,
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    name: 'CDB Banco X',
    code: '0001-02',
    rate: 110,
    rateType: 'CDI',
  };
  const origemCdb = {
    id: 'o1',
    userId: 'user-1',
    chave: 'x',
    tipo: 'investimento',
    assetId: 'asset-antigo',
    portfolioId: 'port-antigo',
    fixedIncomeAssetId: 'fi-antigo',
    dividaId: null,
  };

  it('a chave ignora id do Pluggy e saldo; muda com instituição e datas', () => {
    const k = chaveInvestimento(cdb, 7);
    expect(
      chaveInvestimento({ ...cdb, providerInvestmentId: 'outro-id', balance: 9999 } as never, 7),
    ).toBe(k);
    expect(chaveInvestimento(cdb, 8)).not.toBe(k);
    expect(chaveInvestimento({ ...cdb, dueDate: new Date('2029-01-10T00:00:00Z') }, 7)).not.toBe(k);
    expect(chaveInvestimento({ ...cdb, name: 'cdb banco x' }, 7)).toBe(k);
  });

  it('primeira importação grava a origem', async () => {
    expect(await importarInvestimento(cdb, 7)).toBe('importado');
    expect(mockPrisma.pluggyImportacaoOrigem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_chave: { userId: 'user-1', chave: chaveInvestimento(cdb, 7) } },
        create: expect.objectContaining({
          tipo: 'investimento',
          assetId: 'asset-PLUGGY-RF-44FECCAF',
          portfolioId: 'port-1',
          fixedIncomeAssetId: 'fi-1',
        }),
      }),
    );
  });

  it('reconexão: posição da origem ainda existe → vincula, sem criar nada', async () => {
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue(origemCdb);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-antigo' });
    expect(await importarInvestimento({ ...cdb, id: 'bi-novo' }, 7)).toBe('vinculado');
    expect(mockPrisma.tx.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.tx.stockTransaction.create).not.toHaveBeenCalled();
    expect(mockPrisma.bankInvestment.update).toHaveBeenCalledWith({
      where: { id: 'bi-novo' },
      data: expect.objectContaining({
        importStatus: 'vinculado',
        assetId: 'asset-antigo',
        portfolioId: 'port-antigo',
        fixedIncomeAssetId: 'fi-antigo',
      }),
    });
  });

  it('usuário apagou a posição: importa de novo', async () => {
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue(origemCdb);
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    expect(await importarInvestimento(cdb, 7)).toBe('importado');
    expect(mockPrisma.tx.asset.create).toHaveBeenCalled();
  });

  it('duas aplicações idênticas no mesmo banco continuam sendo duas', async () => {
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue(origemCdb);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-antigo' });
    mockPrisma.bankInvestment.count.mockResolvedValue(1); // a gêmea já está ligada nela
    expect(await importarInvestimento(cdb, 7)).toBe('importado');
    expect(mockPrisma.tx.asset.create).toHaveBeenCalled();
  });

  it('fundo sem catálogo também reusa a origem', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue({
      ...origemCdb,
      fixedIncomeAssetId: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-antigo' });
    const st = await importarInvestimento(
      {
        ...base,
        type: 'MUTUAL_FUND',
        subtype: 'INVESTMENT_FUND',
        name: 'Fundo Premium',
        code: null,
      },
      7,
    );
    expect(st).toBe('vinculado');
    expect(mockPrisma.tx.asset.create).not.toHaveBeenCalled();
  });

  it('empréstimo do mesmo contrato: vincula à dívida existente', async () => {
    const loan = {
      id: 'bl-9',
      connectionId: 'conn-2',
      userId: 'user-1',
      providerLoanId: 'novo',
      contractNumber: '0007',
      productName: 'Crédito Pessoal',
      type: 'CREDITO_PESSOAL',
      contractAmount: 1000,
      outstanding: 500,
      nextInstallmentAmount: 100,
      cet: 0.2,
      annualRate: 0.2,
      indexer: 'PRE_FIXADO',
      amortization: 'PRICE',
      periodicity: 'MONTHLY',
      totalInstallments: 12,
      paidInstallments: 6,
      dueInstallments: 6,
      pastDueInstallments: 0,
      contractDate: new Date('2026-01-01T00:00:00Z'),
      firstInstallmentDueDate: new Date('2026-02-01T00:00:00Z'),
      dueDate: new Date('2027-01-01T00:00:00Z'),
      ativo: true,
      dividaId: null,
      importStatus: 'pendente',
      importError: null,
      importedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(chaveEmprestimo(loan, 7)).toBe(chaveEmprestimo({ ...loan, contractAmount: 5 }, 7));
    mockPrisma.pluggyImportacaoOrigem.findUnique.mockResolvedValue({
      ...origemCdb,
      tipo: 'emprestimo',
      dividaId: 'div-antiga',
    });
    mockPrisma.divida.findFirst.mockResolvedValue({ id: 'div-antiga' });
    expect(await importarEmprestimo(loan, 'Banco', 7)).toBe('vinculado');
    expect(mockPrisma.divida.create).not.toHaveBeenCalled();
    expect(mockPrisma.bankLoan.update).toHaveBeenCalledWith({
      where: { id: 'bl-9' },
      data: expect.objectContaining({ importStatus: 'vinculado', dividaId: 'div-antiga' }),
    });
  });
});
