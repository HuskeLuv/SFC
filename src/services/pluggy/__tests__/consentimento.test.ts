import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  openFinanceConsentimento: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  bankConnection: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  exigirConsentimentoPendente,
  hashDoTexto,
  listarConsentimentos,
  registrarConsentimento,
  revogarConsentimentosDaConexao,
  vincularConsentimento,
} from '../consentimento';
import { PRODUTOS_OPEN_FINANCE, TEXTO_CONSENTIMENTO_ATUAL } from '@/lib/openFinanceConsentimento';

const VERSAO = TEXTO_CONSENTIMENTO_ATUAL.versao;
const req = () =>
  new NextRequest('http://localhost/api/pluggy/consentimentos', {
    method: 'POST',
    headers: { 'user-agent': 'Teste/1.0', 'x-forwarded-for': '200.1.2.3' },
  });

beforeEach(() => vi.clearAllMocks());

describe('registrarConsentimento', () => {
  it('grava versão, hash do texto, produtos, IP e navegador (pendente)', async () => {
    mockPrisma.openFinanceConsentimento.create.mockImplementation(async ({ data }) => ({
      id: 'c1',
      ...data,
    }));
    await registrarConsentimento(req(), 'u1', { versao: VERSAO });
    const data = mockPrisma.openFinanceConsentimento.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'u1',
      versaoTexto: VERSAO,
      hashTexto: hashDoTexto(VERSAO),
      produtos: [...PRODUTOS_OPEN_FINANCE],
      reconexao: false,
      userAgent: 'Teste/1.0',
    });
    expect(data.hashTexto).toMatch(/^[0-9a-f]{64}$/);
  });

  it('409 se a tela mostrou um texto de versão antiga', async () => {
    await expect(registrarConsentimento(req(), 'u1', { versao: 'v0' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.openFinanceConsentimento.create).not.toHaveBeenCalled();
  });

  it('reconexão só de conexão do próprio usuário', async () => {
    mockPrisma.bankConnection.findFirst.mockResolvedValueOnce(null);
    await expect(
      registrarConsentimento(req(), 'u1', { versao: VERSAO, reconexaoDe: 'conn-x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.bankConnection.findFirst.mockResolvedValueOnce({ id: 'conn-1' });
    mockPrisma.openFinanceConsentimento.create.mockResolvedValue({ id: 'c2' });
    await registrarConsentimento(req(), 'u1', { versao: VERSAO, reconexaoDe: 'conn-1' });
    expect(mockPrisma.openFinanceConsentimento.create.mock.calls[0][0].data.reconexao).toBe(true);
  });
});

describe('exigirConsentimentoPendente', () => {
  it('recusa sem id, de outro usuário, já usado ou vencido', async () => {
    await expect(exigirConsentimentoPendente('u1', undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    mockPrisma.openFinanceConsentimento.findFirst.mockResolvedValueOnce(null);
    await expect(exigirConsentimentoPendente('u1', 'c1')).rejects.toMatchObject({
      statusCode: 400,
    });
    mockPrisma.openFinanceConsentimento.findFirst.mockResolvedValueOnce({
      status: 'ativo',
      aceitoEm: new Date(),
    });
    await expect(exigirConsentimentoPendente('u1', 'c1')).rejects.toMatchObject({
      statusCode: 400,
    });
    mockPrisma.openFinanceConsentimento.findFirst.mockResolvedValueOnce({
      status: 'pendente',
      aceitoEm: new Date(Date.now() - 2 * 3600_000),
    });
    await expect(exigirConsentimentoPendente('u1', 'c1')).rejects.toThrow(/expirou/);
  });

  it('aceita pendente recente do próprio usuário', async () => {
    const c = { id: 'c1', status: 'pendente', aceitoEm: new Date() };
    mockPrisma.openFinanceConsentimento.findFirst.mockResolvedValueOnce(c);
    await expect(exigirConsentimentoPendente('u1', 'c1')).resolves.toBe(c);
    expect(mockPrisma.openFinanceConsentimento.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', userId: 'u1' },
    });
  });
});

describe('vincular / revogar', () => {
  it('vincular ativa o aceite e marca o anterior da mesma conexão como substituído', async () => {
    await vincularConsentimento('u1', 'c2', {
      id: 'conn-1',
      providerItemId: 'item-2',
      connectorName: 'Banco X',
    });
    const [substituir, ativar] = mockPrisma.openFinanceConsentimento.updateMany.mock.calls.map(
      (c) => c[0],
    );
    expect(substituir).toMatchObject({
      where: { userId: 'u1', connectionId: 'conn-1', status: 'ativo', id: { not: 'c2' } },
      data: { status: 'substituido', motivoRevogacao: 'substituido' },
    });
    expect(ativar).toMatchObject({
      where: { id: 'c2', userId: 'u1', status: 'pendente' },
      data: {
        status: 'ativo',
        connectionId: 'conn-1',
        providerItemId: 'item-2',
        connectorName: 'Banco X',
      },
    });
  });

  it('revogar marca (não apaga) as autorizações ativas da conexão', async () => {
    await revogarConsentimentosDaConexao('conn-1', 'usuario');
    expect(mockPrisma.openFinanceConsentimento.updateMany).toHaveBeenCalledWith({
      where: { connectionId: 'conn-1', status: 'ativo' },
      data: { status: 'revogado', revogadoEm: expect.any(Date), motivoRevogacao: 'usuario' },
    });
  });

  it('listar esconde aceites que não viraram conexão', async () => {
    mockPrisma.openFinanceConsentimento.findMany.mockResolvedValue([]);
    await listarConsentimentos('u1');
    expect(mockPrisma.openFinanceConsentimento.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { not: 'pendente' } },
      orderBy: { aceitoEm: 'desc' },
    });
  });
});
