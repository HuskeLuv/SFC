import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));

const mockPrisma = vi.hoisted(() => ({
  bankConnection: { findMany: vi.fn(), findFirst: vi.fn() },
  bankTransaction: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

const mockClient = vi.hoisted(() => ({ createConnectToken: vi.fn() }));
vi.mock('@/lib/pluggy', () => ({ getPluggyClient: () => mockClient }));

const mockSync = vi.hoisted(() => ({
  registrarConexao: vi.fn(),
  excluirConexao: vi.fn(),
  atualizarManualmente: vi.fn(),
  resumoImportado: vi.fn().mockResolvedValue({
    contas: 1,
    cartoes: 1,
    transacoes: 42,
    investimentos: 3,
    investimentosParaCadastrar: 1,
    emprestimos: 0,
    emprestimosParaCadastrar: 0,
  }),
}));
vi.mock('@/services/pluggy/sync', () => mockSync);

const mockConsent = vi.hoisted(() => ({
  exigirConsentimentoPendente: vi.fn(),
  vincularConsentimento: vi.fn(),
}));
vi.mock('@/services/pluggy/consentimento', () => mockConsent);
const CONSENT = '7d3c1e2a-0b1c-4d5e-8f90-123456789abc';

import { ApiError } from '@/utils/apiErrorHandler';
import { GET as listar, POST as registrar } from '../connections/route';
import { DELETE as excluir } from '../connections/[id]/route';
import { POST as atualizar } from '../connections/[id]/sync/route';
import { POST as connectToken } from '../connect-token/route';
import { GET as transacoes } from '../transactions/route';

const ITEM = '42c732c2-b234-4805-9674-cc529eb3a123';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const conexao = {
  id: 'conn-1',
  userId: 'user-1',
  provider: 'pluggy',
  providerItemId: ITEM,
  connectorId: 2,
  connectorName: 'Pluggy Bank',
  connectorImageUrl: null,
  isOpenFinance: false,
  isSandbox: true,
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  errorMessage: null,
  consentExpiresAt: null,
  providerUpdatedAt: null,
  lastSyncAt: new Date('2026-09-14T12:00:00Z'),
  lastSyncError: null,
  lastManualUpdateAt: null,
  createdAt: new Date('2026-09-14T11:00:00Z'),
  updatedAt: new Date('2026-09-14T12:00:00Z'),
  accounts: [
    {
      id: 'acc-1',
      connectionId: 'conn-1',
      userId: 'user-1',
      providerAccountId: 'p-acc-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'Conta Corrente',
      number: '1234-5',
      currencyCode: 'BRL',
      balance: 36180.75,
      balanceAt: null,
      creditLimit: null,
      creditAvailable: null,
      creditBrand: null,
      creditDueDate: null,
      creditClosingDate: null,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe('rotas /api/pluggy', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    mockAuth.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@x', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('503 quando a integração está desligada', async () => {
    delete process.env.PLUGGY_HABILITADO;
    const res = await listar(json('/api/pluggy/connections', 'GET'));
    expect(res.status).toBe(503);
  });

  it('403 para consultor agindo por cliente (sem extrato por impersonação)', async () => {
    mockAuth.mockResolvedValue({
      payload: { id: 'cons-1', email: 'c@x', role: 'consultant' },
      targetUserId: 'user-1',
      actingClient: { id: 'user-1', name: 'Cliente' },
    });
    expect((await listar(json('/api/pluggy/connections', 'GET'))).status).toBe(403);
    expect((await connectToken(json('/api/pluggy/connect-token', 'POST', {}))).status).toBe(403);
    expect((await transacoes(json('/api/pluggy/transactions', 'GET'))).status).toBe(403);
    expect(mockPrisma.bankConnection.findMany).not.toHaveBeenCalled();
  });

  it('GET connections lista as conexões do usuário serializadas', async () => {
    mockPrisma.bankConnection.findMany.mockResolvedValue([conexao]);
    const res = await listar(json('/api/pluggy/connections', 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockPrisma.bankConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(body.connections[0]).toMatchObject({
      id: 'conn-1',
      connectorName: 'Pluggy Bank',
      lastSyncAt: '2026-09-14T12:00:00.000Z',
      accounts: [expect.objectContaining({ name: 'Conta Corrente', balance: 36180.75 })],
    });
  });

  it('POST connections valida itemId e registra pelo serviço', async () => {
    expect((await registrar(json('/api/pluggy/connections', 'POST', { itemId: 'x' }))).status).toBe(
      400,
    );
    mockSync.registrarConexao.mockResolvedValue({
      conexao,
      reaproveitada: false,
      contasRepetidas: 0,
    });
    // Sem o aceite registrado no My Finance não registra.
    expect(
      (await registrar(json('/api/pluggy/connections', 'POST', { itemId: ITEM }))).status,
    ).toBe(400);
    const res = await registrar(
      json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
    );
    expect(res.status).toBe(201);
    expect(mockConsent.exigirConsentimentoPendente).toHaveBeenCalledWith('user-1', CONSENT);
    expect(mockSync.registrarConexao).toHaveBeenCalledWith('user-1', ITEM);
    expect(mockConsent.vincularConsentimento).toHaveBeenCalledWith('user-1', CONSENT, conexao);
    expect(await res.json()).toMatchObject({
      connection: { id: 'conn-1' },
      reaproveitada: false,
      aviso: null,
      // Tela "Conexão realizada": o que chegou, por tipo.
      importados: expect.objectContaining({ transacoes: 42, investimentos: 3 }),
    });
    expect(mockSync.resumoImportado).toHaveBeenCalledWith('conn-1');

    mockSync.registrarConexao.mockResolvedValue({
      conexao,
      reaproveitada: true,
      contasRepetidas: 2,
    });
    const re = await registrar(
      json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
    );
    expect(re.status).toBe(200);
    expect((await re.json()).aviso).toMatch(/já estava conectado/);

    mockSync.registrarConexao.mockResolvedValue({
      conexao,
      reaproveitada: false,
      contasRepetidas: 1,
    });
    expect(
      (
        await (
          await registrar(
            json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
          )
        ).json()
      ).aviso,
    ).toMatch(/1 conta já existia/);
  });

  it('DELETE e POST sync delegam ao serviço com o usuário da sessão', async () => {
    mockSync.excluirConexao.mockResolvedValue(undefined);
    const del = await excluir(json('/api/pluggy/connections/conn-1', 'DELETE'), ctx('conn-1'));
    expect(del.status).toBe(200);
    expect(mockSync.excluirConexao).toHaveBeenCalledWith('conn-1', 'user-1');

    mockSync.atualizarManualmente.mockResolvedValue({ ...conexao, status: 'UPDATING' });
    const up = await atualizar(json('/api/pluggy/connections/conn-1/sync', 'POST'), ctx('conn-1'));
    expect(up.status).toBe(202);
    expect((await up.json()).connection.status).toBe('UPDATING');
  });

  it('connect-token amarra o token ao usuário e valida itemId de reconexão', async () => {
    mockClient.createConnectToken.mockResolvedValue({ accessToken: 'tok' });
    const res = await connectToken(
      json('/api/pluggy/connect-token', 'POST', { consentimentoId: CONSENT }),
    );
    expect(mockConsent.exigirConsentimentoPendente).toHaveBeenCalledWith('user-1', CONSENT);
    expect(await res.json()).toEqual({
      accessToken: 'tok',
      includeSandbox: false,
      products: [
        'ACCOUNTS',
        'CREDIT_CARDS',
        'TRANSACTIONS',
        'PAYMENT_DATA',
        'INVESTMENTS',
        'INVESTMENTS_TRANSACTIONS',
        'LOANS',
      ],
    });
    expect(mockClient.createConnectToken).toHaveBeenCalledWith(undefined, {
      clientUserId: 'user-1',
      avoidDuplicates: true,
    });

    mockPrisma.bankConnection.findFirst.mockResolvedValue(null);
    const nf = await connectToken(
      json('/api/pluggy/connect-token', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
    );
    expect(nf.status).toBe(404);

    mockPrisma.bankConnection.findFirst.mockResolvedValue({ providerItemId: ITEM });
    await connectToken(
      json('/api/pluggy/connect-token', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
    );
    expect(mockClient.createConnectToken).toHaveBeenLastCalledWith(ITEM, expect.any(Object));

    // Sem consentimento válido, o serviço recusa e o widget não abre.
    mockConsent.exigirConsentimentoPendente.mockRejectedValueOnce(
      new ApiError(400, 'Autorize o compartilhamento de dados antes de conectar o banco.'),
    );
    mockClient.createConnectToken.mockClear();
    const sem = await connectToken(json('/api/pluggy/connect-token', 'POST', {}));
    expect(sem.status).toBe(400);
    expect(mockClient.createConnectToken).not.toHaveBeenCalled();
  });

  it('GET transactions filtra por conta/período, exclui removidas e pagina', async () => {
    mockPrisma.bankTransaction.count.mockResolvedValue(1);
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: 't-1',
        accountId: 'acc-1',
        date: new Date('2026-09-05T00:00:00Z'),
        description: 'SALARIO',
        amount: 8500,
        type: 'CREDIT',
        status: 'POSTED',
        currencyCode: 'BRL',
        providerCategory: 'Salary',
        merchantName: null,
        paymentMethod: null,
        counterpartName: 'EMPRESA XYZ',
        installmentNumber: null,
        installmentTotal: null,
        ignorada: false,
        cashflowItemId: null,
        appliedAt: null,
        duplicadaDe: null,
      },
    ]);
    const res = await transacoes(
      json(
        '/api/pluggy/transactions?accountId=11111111-1111-4111-8111-111111111111&from=2026-09-01&to=2026-09-30&page=2&limit=10',
        'GET',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    expect(body.transactions[0]).toMatchObject({ description: 'SALARIO', amount: 8500 });
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          deletedAt: null,
          accountId: '11111111-1111-4111-8111-111111111111',
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect((await transacoes(json('/api/pluggy/transactions?from=2026-9-1', 'GET'))).status).toBe(
      400,
    );
  });
});
