/**
 * Assinaturas F2 no Pluggy: limite de conexões por plano (connect-token sem itemId e defesa dupla
 * no POST /connections) e destino 'carteira' só no Pro (exigirPlano em /api/pluggy/carteira/**).
 * Chave desligada: nada muda (sem limite, sem consulta de plano).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));

const mockPrisma = vi.hoisted(() => ({
  bankConnection: { findFirst: vi.fn(), count: vi.fn() },
  bankInvestment: { findMany: vi.fn() },
  bankLoan: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

const mockPlano = vi.hoisted(() => ({ planoDoUsuario: vi.fn(), planoParaRequisicao: vi.fn() }));
vi.mock('@/services/planos/resolverPlano', () => mockPlano);

const mockClient = vi.hoisted(() => ({ createConnectToken: vi.fn(), fetchConnectors: vi.fn() }));
vi.mock('@/lib/pluggy', () => ({ getPluggyClient: () => mockClient }));

const mockSync = vi.hoisted(() => ({
  registrarConexao: vi.fn(),
  resumoImportado: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/pluggy/sync', () => mockSync);

const mockConsent = vi.hoisted(() => ({
  exigirConsentimentoPendente: vi.fn(),
  vincularConsentimento: vi.fn(),
}));
vi.mock('@/services/pluggy/consentimento', () => mockConsent);

const mockImportar = vi.hoisted(() => ({
  importarPendentes: vi.fn(),
  ignorarInvestimento: vi.fn(),
}));
vi.mock('@/services/pluggy/importarCarteira', () => mockImportar);

const mockDestinos = vi.hoisted(() => ({
  aplicarDestinos: vi.fn(),
  listarDestinosImportados: vi.fn(),
  classificarDestinos: vi.fn(),
  contarParaRevisar: vi.fn().mockResolvedValue(0),
  destinoAtualPorPortfolio: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/services/pluggy/destinosImportacao', () => mockDestinos);

import { POST as connectToken } from '../connect-token/route';
import { POST as registrar } from '../connections/route';
import { GET as carteira } from '../carteira/route';
import { POST as importar } from '../carteira/importar/route';
import { POST as ignorar } from '../carteira/ignorar/route';
import { GET as destinos, POST as aplicarDestinos } from '../carteira/destinos/route';

const ITEM = '42c732c2-b234-4805-9674-cc529eb3a123';
const CONSENT = '7d3c1e2a-0b1c-4d5e-8f90-123456789abc';
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function ligar() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
}

describe('Pluggy × planos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLUGGY_HABILITADO', 'true');
    vi.stubEnv('PLUGGY_CLIENT_ID', 'id');
    vi.stubEnv('PLUGGY_CLIENT_SECRET', 'secret');
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    for (const p of ['BASIC', 'PRO', 'ADV']) vi.stubEnv(`ASSINATURAS_LIMITE_CONEXOES_${p}`, '');
    mockAuth.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@x', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockClient.createConnectToken.mockResolvedValue({ accessToken: 'tok' });
    mockClient.fetchConnectors.mockResolvedValue({ results: [] });
    mockPrisma.bankConnection.findFirst.mockResolvedValue(null);
    mockPrisma.bankInvestment.findMany.mockResolvedValue([]);
    mockPrisma.bankLoan.findMany.mockResolvedValue([]);
    mockImportar.importarPendentes.mockResolvedValue({ importados: 0 });
    mockImportar.ignorarInvestimento.mockResolvedValue(true);
    mockDestinos.listarDestinosImportados.mockResolvedValue({
      habilitado: true,
      itens: [],
      paraRevisar: 0,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('limite de conexões', () => {
    it('chave desligada + 7 conexões: connect-token 200 sem contar nem resolver plano', async () => {
      mockPrisma.bankConnection.count.mockResolvedValue(7);
      const res = await connectToken(
        json('/api/pluggy/connect-token', 'POST', { consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.bankConnection.count).not.toHaveBeenCalled();
      expect(mockPlano.planoDoUsuario).not.toHaveBeenCalled();
    });

    it('chave ligada, Basic com 1 conexão ativa: 403 limite_plano (sem criar token)', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('basic');
      mockPrisma.bankConnection.count.mockResolvedValue(1);
      const res = await connectToken(
        json('/api/pluggy/connect-token', 'POST', { consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        codigo: 'limite_plano',
        plano: 'basic',
        limite: 1,
        recurso: 'conexoes',
        error: 'O plano Basic permite 1 conexão bancária. Exclua uma conexão ou mude de plano.',
      });
      expect(mockClient.createConnectToken).not.toHaveBeenCalled();
      expect(mockPrisma.bankConnection.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: { not: 'DELETED' } },
      });
    });

    it('chave ligada, abaixo do limite: passa (Pro 2 de 3)', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('pro');
      mockPrisma.bankConnection.count.mockResolvedValue(2);
      const res = await connectToken(
        json('/api/pluggy/connect-token', 'POST', { consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(200);
    });

    it('override por env: ASSINATURAS_LIMITE_CONEXOES_PRO=2 barra o Pro com 2', async () => {
      ligar();
      vi.stubEnv('ASSINATURAS_LIMITE_CONEXOES_PRO', '2');
      mockPlano.planoDoUsuario.mockResolvedValue('pro');
      mockPrisma.bankConnection.count.mockResolvedValue(2);
      const res = await connectToken(
        json('/api/pluggy/connect-token', 'POST', { consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ limite: 2, plano: 'pro' });
    });

    it('reconexão (itemId) passa mesmo no limite', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('basic');
      mockPrisma.bankConnection.count.mockResolvedValue(5);
      mockPrisma.bankConnection.findFirst.mockResolvedValue({ providerItemId: ITEM });
      const res = await connectToken(
        json('/api/pluggy/connect-token', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.bankConnection.count).not.toHaveBeenCalled();
    });

    it('POST /connections: item novo no limite → 403 sem registrar', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('basic');
      mockPrisma.bankConnection.count.mockResolvedValue(1);
      const res = await registrar(
        json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ codigo: 'limite_plano', recurso: 'conexoes' });
      expect(mockSync.registrarConexao).not.toHaveBeenCalled();
    });

    it('POST /connections: item que já é do usuário passa no limite', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('basic');
      mockPrisma.bankConnection.count.mockResolvedValue(1);
      mockPrisma.bankConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
      mockSync.registrarConexao.mockResolvedValue({
        conexao: { id: 'conn-1', accounts: [], createdAt: new Date(), updatedAt: new Date() },
        reaproveitada: false,
        contasRepetidas: 0,
      });
      const res = await registrar(
        json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
      );
      expect(mockSync.registrarConexao).toHaveBeenCalledWith('user-1', ITEM);
      expect(res.status).not.toBe(403);
      expect(mockPrisma.bankConnection.count).not.toHaveBeenCalled();
    });

    it('POST /connections com a chave desligada: nem procura o item para o limite', async () => {
      mockSync.registrarConexao.mockRejectedValue(new Error('para aqui'));
      await registrar(
        json('/api/pluggy/connections', 'POST', { itemId: ITEM, consentimentoId: CONSENT }),
      );
      expect(mockPrisma.bankConnection.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.bankConnection.count).not.toHaveBeenCalled();
    });
  });

  describe('destino carteira (/api/pluggy/carteira/**) = Pro', () => {
    const chamadas = () => [
      carteira(json('/api/pluggy/carteira', 'GET')),
      importar(json('/api/pluggy/carteira/importar', 'POST', {})),
      ignorar(json('/api/pluggy/carteira/ignorar', 'POST', { id: ITEM })),
      destinos(json('/api/pluggy/carteira/destinos', 'GET')),
      aplicarDestinos(json('/api/pluggy/carteira/destinos', 'POST', { itens: [] })),
    ];

    it('chave desligada: nenhuma consulta de plano e nenhuma resposta 403', async () => {
      const res = await Promise.all(chamadas());
      for (const r of res) expect(r.status).not.toBe(403);
      expect(mockPlano.planoDoUsuario).not.toHaveBeenCalled();
    });

    it('chave ligada + Basic: 403 plano_insuficiente need pro em todas', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('basic');
      const res = await Promise.all(chamadas());
      for (const r of res) {
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({
          codigo: 'plano_insuficiente',
          need: 'pro',
          plano: 'basic',
        });
      }
      expect(mockImportar.importarPendentes).not.toHaveBeenCalled();
      expect(mockDestinos.aplicarDestinos).not.toHaveBeenCalled();
    });

    it('chave ligada + Pro: passa', async () => {
      ligar();
      mockPlano.planoDoUsuario.mockResolvedValue('pro');
      const res = await carteira(json('/api/pluggy/carteira', 'GET'));
      expect(res.status).toBe(200);
      expect(mockPlano.planoDoUsuario).toHaveBeenCalledWith('user-1');
    });
  });
});
