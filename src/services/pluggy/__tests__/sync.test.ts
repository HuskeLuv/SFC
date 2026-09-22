import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  bankConnection: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  bankAccount: { upsert: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  bankTransaction: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pluggyWebhookEvent: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  openFinanceConsentimento: { updateMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

const mockClient = vi.hoisted(() => ({
  fetchItem: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchAllTransactions: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));
vi.mock('@/lib/pluggy', () => ({ getPluggyClient: () => mockClient }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  atualizarManualmente,
  dedupHash,
  excluirConexao,
  mapTransaction,
  processarEventosPendentes,
  registrarConexao,
  sincronizarConexao,
} from '../sync';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  connector: { id: 2, name: 'Pluggy Bank', imageUrl: 'img', isOpenFinance: false, isSandbox: true },
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  error: null,
  consentExpiresAt: null,
  lastUpdatedAt: new Date('2026-09-14T10:00:00Z'),
  clientUserId: 'user-1',
  ...over,
});

const conta = {
  id: 'acc-p1',
  itemId: 'item-1',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  number: '1234-5',
  balance: 100.5,
  name: 'Conta Corrente',
  marketingName: null,
  currencyCode: 'BRL',
  creditData: null,
};

const tx = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  accountId: 'acc-p1',
  date: new Date('2026-09-10T00:00:00Z'),
  description: 'SALARIO',
  descriptionRaw: null,
  type: 'CREDIT',
  amount: 8500,
  currencyCode: 'BRL',
  category: 'Salary',
  categoryId: '01000000',
  status: 'POSTED',
  paymentData: {
    payer: { name: 'EMPRESA XYZ', documentNumber: { value: '12.345.678/0001-00', type: 'CNPJ' } },
  },
  creditCardMetadata: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bankConnection.findUniqueOrThrow.mockResolvedValue({
    id: 'conn-1',
    userId: 'user-1',
    providerItemId: 'item-1',
    lastSyncAt: null,
    accounts: [],
  });
  mockPrisma.bankConnection.update.mockResolvedValue({});
  mockPrisma.bankAccount.upsert.mockResolvedValue({ id: 'acc-l1', ativa: true });
  mockPrisma.bankAccount.findMany.mockResolvedValue([]);
  mockPrisma.bankAccount.update.mockResolvedValue({});
  mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
  mockPrisma.bankTransaction.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.bankTransaction.updateMany.mockResolvedValue({ count: 0 });
  mockClient.fetchItem.mockResolvedValue(item());
  mockClient.fetchAccounts.mockResolvedValue({ results: [conta] });
  mockClient.fetchAllTransactions.mockResolvedValue([]);
});

describe('mapTransaction', () => {
  it('guarda o nome da contraparte, nunca o documento, e o hash de dedup', () => {
    const m = mapTransaction(tx('t1') as never, 'acc-l1', 'user-1');
    expect(m.counterpartName).toBe('EMPRESA XYZ');
    expect(JSON.stringify(m)).not.toContain('12.345.678');
    expect(m.dedupHash).toBe(
      dedupHash('acc-l1', new Date('2026-09-10T00:00:00Z'), 8500, 'SALARIO'),
    );
    expect(m.providerCategory).toBe('Salary');
    expect(m.type).toBe('CREDIT');
  });

  it('em débito a contraparte é o recebedor; parcelas do cartão são copiadas', () => {
    const m = mapTransaction(
      tx('t2', {
        type: 'DEBIT',
        amount: -55.9,
        paymentData: { receiver: { name: 'NETFLIX' } },
        creditCardMetadata: { installmentNumber: 2, totalInstallments: 10, billId: 'bill-1' },
      }) as never,
      'acc-l1',
      'user-1',
    );
    expect(m.counterpartName).toBe('NETFLIX');
    expect(m.installmentNumber).toBe(2);
    expect(m.installmentTotal).toBe(10);
    expect(m.billId).toBe('bill-1');
  });

  it('dedupHash ignora caixa e espaços da descrição', () => {
    const d = new Date('2026-09-10T00:00:00Z');
    expect(dedupHash('a', d, 10, ' Netflix ')).toBe(dedupHash('a', d, 10, 'netflix'));
    expect(dedupHash('a', d, 10, 'netflix')).not.toBe(dedupHash('a', d, 10.01, 'netflix'));
  });
});

describe('registrarConexao', () => {
  it('recusa item de outro usuário (clientUserId diferente)', async () => {
    mockClient.fetchItem.mockResolvedValue(item({ clientUserId: 'outro' }));
    await expect(registrarConexao('user-1', 'item-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.bankConnection.create).not.toHaveBeenCalled();
  });

  it('recusa item já registrado por outro usuário', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue({ id: 'c9', userId: 'outro' });
    await expect(registrarConexao('user-1', 'item-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('cria a conexão e faz a primeira carga', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue(null);
    mockPrisma.bankConnection.create.mockResolvedValue({ id: 'conn-1' });
    mockClient.fetchAllTransactions.mockResolvedValue([tx('t1')]);
    mockPrisma.bankTransaction.createMany.mockResolvedValue({ count: 1 });

    const r = await registrarConexao('user-1', 'item-1');
    expect(r).toMatchObject({ reaproveitada: false, contasRepetidas: 0 });

    expect(mockPrisma.bankConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        providerItemId: 'item-1',
        connectorName: 'Pluggy Bank',
        isSandbox: true,
        status: 'UPDATED',
      }),
    });
    // primeira carga = 12 meses
    const dateFrom = mockClient.fetchAllTransactions.mock.calls[0][1].dateFrom as string;
    const esperado = new Date();
    esperado.setMonth(esperado.getMonth() - 12);
    expect(dateFrom).toBe(esperado.toISOString().slice(0, 10));
    expect(mockPrisma.bankTransaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ providerTxId: 't1', accountId: 'acc-l1', duplicadaDe: null }),
      ],
      skipDuplicates: true,
    });
  });
});

describe('registrarConexao — banco conectado duas vezes', () => {
  it('todas as contas repetidas: migra a conexão existente para o item novo', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue(null);
    mockClient.fetchItem.mockResolvedValue(item({ id: 'item-2' }));
    mockClient.fetchAccounts.mockResolvedValue({ results: [{ ...conta, id: 'acc-p2' }] });
    mockPrisma.bankAccount.findMany.mockResolvedValue([
      {
        id: 'acc-l1',
        connectionId: 'conn-1',
        number: '1234-5',
        type: 'BANK',
        name: 'Conta Corrente',
        connection: { id: 'conn-1', providerItemId: 'item-1' },
      },
    ]);
    mockClient.deleteItem.mockResolvedValue(undefined);

    const r = await registrarConexao('user-1', 'item-2');

    expect(r).toMatchObject({ reaproveitada: true, contasRepetidas: 1 });
    expect(mockPrisma.bankConnection.create).not.toHaveBeenCalled();
    expect(mockClient.deleteItem).toHaveBeenCalledWith('item-1');
    expect(mockPrisma.bankConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: expect.objectContaining({ providerItemId: 'item-2', lastManualUpdateAt: null }),
    });
    expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-l1' },
      data: { providerAccountId: 'acc-p2' },
    });
  });

  it('parte das contas repetidas: conexão nova, conta repetida desativada e sem transações', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue(null);
    mockPrisma.bankConnection.create.mockResolvedValue({ id: 'conn-2' });
    const cartao = {
      ...conta,
      id: 'acc-p9',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: '9437',
      name: 'Cartão',
    };
    mockClient.fetchAccounts.mockResolvedValue({ results: [conta, cartao] });
    mockPrisma.bankAccount.findMany.mockResolvedValue([
      {
        id: 'acc-l1',
        connectionId: 'conn-1',
        number: '1234-5',
        type: 'BANK',
        name: 'Conta Corrente',
        connection: { id: 'conn-1', providerItemId: 'item-1' },
      },
    ]);
    mockPrisma.bankAccount.upsert
      .mockResolvedValueOnce({ id: 'acc-l1b', ativa: false })
      .mockResolvedValueOnce({ id: 'acc-l9', ativa: true });

    const r = await registrarConexao('user-1', 'item-1');

    expect(r).toMatchObject({ reaproveitada: false, contasRepetidas: 1 });
    expect(mockPrisma.bankAccount.upsert.mock.calls[0][0].create).toMatchObject({ ativa: false });
    expect(mockPrisma.bankAccount.upsert.mock.calls[1][0].create).toMatchObject({ ativa: true });
    expect(mockClient.fetchAllTransactions).toHaveBeenCalledTimes(1);
    expect(mockClient.fetchAllTransactions).toHaveBeenCalledWith('acc-p9', expect.any(Object));
  });
});

describe('dedup na sincronização', () => {
  it('id trocado no provedor: a linha existente adota o id novo (sem cópia nem removida)', async () => {
    const t = tx('t1-novo');
    const m = mapTransaction(t as never, 'acc-l1', 'user-1', '2|n:1234-5');
    mockClient.fetchAllTransactions.mockResolvedValue([t]);
    mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'l1',
        providerTxId: 't1-velho',
        dedupHash: m.dedupHash,
        globalHash: null,
        status: 'POSTED',
        providerCategory: 'Salary',
        amount: 8500,
        deletedAt: null,
      },
    ]);

    const r = await sincronizarConexao('conn-1');

    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: expect.objectContaining({ providerTxId: 't1-novo', deletedAt: null }),
    });
    expect(mockPrisma.bankTransaction.createMany).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      transacoesNovas: 0,
      transacoesAtualizadas: 1,
      transacoesDuplicadas: 0,
    });
  });

  it('mesma transação já importada por outra conta do usuário entra como duplicada', async () => {
    const t = tx('t1');
    const m = mapTransaction(t as never, 'acc-l1', 'user-1', '2|n:1234-5');
    mockClient.fetchAllTransactions.mockResolvedValue([t]);
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'orig-1', globalHash: m.globalHash }]);
    mockPrisma.bankTransaction.createMany.mockResolvedValue({ count: 1 });

    const r = await sincronizarConexao('conn-1');

    expect(mockPrisma.bankTransaction.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          accountId: { not: 'acc-l1' },
          duplicadaDe: null,
        }),
      }),
    );
    expect(mockPrisma.bankTransaction.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ providerTxId: 't1', duplicadaDe: 'orig-1' })],
      skipDuplicates: true,
    });
    expect(r).toMatchObject({ transacoesNovas: 1, transacoesDuplicadas: 1 });
  });

  it('conta desativada não busca transações', async () => {
    mockPrisma.bankAccount.upsert.mockResolvedValue({ id: 'acc-l1', ativa: false });
    const r = await sincronizarConexao('conn-1');
    expect(mockClient.fetchAllTransactions).not.toHaveBeenCalled();
    expect(r.contas).toBe(1);
  });
});

describe('sincronizarConexao', () => {
  it('sync incremental usa janela de 7 dias antes do último sync', async () => {
    mockPrisma.bankConnection.findUniqueOrThrow.mockResolvedValue({
      id: 'conn-1',
      userId: 'user-1',
      providerItemId: 'item-1',
      lastSyncAt: new Date('2026-09-14T00:00:00Z'),
    });
    await sincronizarConexao('conn-1');
    expect(mockClient.fetchAllTransactions).toHaveBeenCalledWith('acc-p1', {
      dateFrom: '2026-09-07',
    });
  });

  it('atualiza a que mudou, cria a nova e marca removida a que sumiu da janela', async () => {
    mockClient.fetchAllTransactions.mockResolvedValue([tx('t1'), tx('t2', { amount: 10 })]);
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        {
          id: 'l1',
          providerTxId: 't1',
          dedupHash: 'antigo',
          dedupHash: 'antigo',
          globalHash: null,
          providerCategory: 'Salary',
          amount: 8500,
          deletedAt: null,
        },
      ])
      .mockResolvedValue([]);
    mockPrisma.bankTransaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.bankTransaction.updateMany.mockResolvedValue({ count: 3 });

    const r = await sincronizarConexao('conn-1');

    expect(r).toMatchObject({
      contas: 1,
      transacoesNovas: 1,
      transacoesAtualizadas: 1,
      transacoesRemovidas: 3,
    });
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: expect.objectContaining({ providerTxId: 't1', deletedAt: null }),
    });
    expect(mockPrisma.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        accountId: 'acc-l1',
        deletedAt: null,
        providerTxId: { notIn: ['t1', 't2'] },
      }),
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockPrisma.bankConnection.update).toHaveBeenLastCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncAt: expect.any(Date), lastSyncError: null },
    });
  });

  it('grava lastSyncError e propaga quando o provedor falha', async () => {
    mockClient.fetchAccounts.mockRejectedValue(new Error('Response code 429'));
    await expect(sincronizarConexao('conn-1')).rejects.toThrow('429');
    expect(mockPrisma.bankConnection.update).toHaveBeenLastCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncError: 'Response code 429' },
    });
  });
});

describe('atualizarManualmente / excluirConexao', () => {
  it('respeita o cooldown de 6 h', async () => {
    mockPrisma.bankConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      providerItemId: 'item-1',
      lastManualUpdateAt: new Date(Date.now() - 60_000),
    });
    await expect(atualizarManualmente('conn-1', 'user-1')).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(mockClient.updateItem).not.toHaveBeenCalled();
  });

  it('pede PATCH ao Pluggy fora do cooldown e registra o horário', async () => {
    mockPrisma.bankConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      providerItemId: 'item-1',
      lastManualUpdateAt: null,
    });
    mockClient.updateItem.mockResolvedValue(item({ status: 'UPDATING' }));
    await atualizarManualmente('conn-1', 'user-1');
    expect(mockClient.updateItem).toHaveBeenCalledWith('item-1');
    expect(mockPrisma.bankConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: expect.objectContaining({ status: 'UPDATING', lastManualUpdateAt: expect.any(Date) }),
    });
  });

  it('404 para conexão de outro usuário', async () => {
    mockPrisma.bankConnection.findFirst.mockResolvedValue(null);
    await expect(excluirConexao('conn-x', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('exclui no Pluggy (tolerando 404) e no ledger', async () => {
    mockPrisma.bankConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      providerItemId: 'item-1',
    });
    mockClient.deleteItem.mockRejectedValue(new Error('Response code 404 (Not Found)'));
    await excluirConexao('conn-1', 'user-1', '200.1.2.3');
    expect(mockPrisma.bankConnection.delete).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
    // O registro do consentimento fica, marcado como revogado pelo usuário.
    expect(mockPrisma.openFinanceConsentimento.updateMany).toHaveBeenCalledWith({
      where: { connectionId: 'conn-1', status: 'ativo' },
      data: {
        status: 'revogado',
        revogadoEm: expect.any(Date),
        motivoRevogacao: 'usuario',
        ipRevogacao: '200.1.2.3',
      },
    });
  });
});

describe('processarEventosPendentes', () => {
  const evento = (over: Record<string, unknown> = {}) => ({
    id: 'ev-1',
    event: 'item/updated',
    providerItemId: 'item-1',
    attempts: 0,
    ...over,
  });

  beforeEach(() => {
    mockPrisma.pluggyWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.pluggyWebhookEvent.update.mockResolvedValue({});
  });

  it('sincroniza a conexão do item e marca done', async () => {
    mockPrisma.pluggyWebhookEvent.findMany.mockResolvedValue([evento()]);
    mockPrisma.bankConnection.findUnique.mockResolvedValue({ id: 'conn-1' });
    const r = await processarEventosPendentes();
    expect(r).toEqual({ processados: 1, erros: 0, ignorados: 0, adiados: 0 });
    expect(mockClient.fetchAccounts).toHaveBeenCalledWith('item-1');
    expect(mockPrisma.pluggyWebhookEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'ev-1' },
      data: { status: 'done', error: null, processedAt: expect.any(Date) },
    });
  });

  it('adia evento de item ainda não registrado e ignora após 3 tentativas', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue(null);
    mockPrisma.pluggyWebhookEvent.findMany.mockResolvedValue([evento({ attempts: 0 })]);
    expect((await processarEventosPendentes()).adiados).toBe(1);
    mockPrisma.pluggyWebhookEvent.findMany.mockResolvedValue([evento({ attempts: 2 })]);
    expect((await processarEventosPendentes()).ignorados).toBe(1);
  });

  it('pula evento que outro worker já pegou', async () => {
    mockPrisma.pluggyWebhookEvent.findMany.mockResolvedValue([evento()]);
    mockPrisma.pluggyWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    const r = await processarEventosPendentes();
    expect(r).toEqual({ processados: 0, erros: 0, ignorados: 0, adiados: 0 });
    expect(mockClient.fetchItem).not.toHaveBeenCalled();
  });

  it('falha de sync: adia e, na 3ª, marca error', async () => {
    mockPrisma.bankConnection.findUnique.mockResolvedValue({ id: 'conn-1' });
    mockClient.fetchAccounts.mockRejectedValue(new Error('boom'));
    mockPrisma.pluggyWebhookEvent.findMany.mockResolvedValue([evento({ attempts: 2 })]);
    const r = await processarEventosPendentes();
    expect(r.erros).toBe(1);
    expect(mockPrisma.pluggyWebhookEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'ev-1' },
      data: { status: 'error', error: 'boom', processedAt: expect.any(Date) },
    });
  });
});
