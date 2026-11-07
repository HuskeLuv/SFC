/**
 * Gate central de plano em requireAuthWithActing (assinaturas F2, ClickUp 86e2zkhe2).
 *
 * Usa o resolverPlano e o exigirPlano de verdade, com o Prisma mockado: cada teste diz o plano de
 * cada usuário por uma linha `assinaturas` ativa. CORTE no ano 2000 = ninguém é legado.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const mockAssertSessionVersion = vi.hoisted(() => vi.fn());
const mockResolveActingContext = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock('@/lib/auth/sessionVersion', () => ({ assertSessionVersion: mockAssertSessionVersion }));
vi.mock('@/utils/consultantActing', () => ({ resolveActingContext: mockResolveActingContext }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { requireAuthWithActing } from '../auth';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { invalidarPlano } from '@/services/planos/resolverPlano';
import type { Plano } from '@/lib/planos';

const PRICE: Record<Exclude<Plano, 'basic'>, string> = {
  pro: 'price_test_pro_mensal',
  adv: 'price_test_adv_mensal',
};

/** Plano de cada userId nos testes (basic = sem linha). Role 'consultant' vira 'adv' sozinho. */
let planos: Record<string, Plano> = {};
let roles: Record<string, string> = {};

function usuarioDoBanco(id: string) {
  const plano = planos[id] ?? 'basic';
  return {
    role: roles[id] ?? 'user',
    createdAt: new Date('2026-12-01T12:00:00Z'),
    assinatura:
      plano === 'basic'
        ? null
        : {
            id: `a-${id}`,
            userId: id,
            stripeCustomerId: `cus_${id}`,
            stripeSubscriptionId: `sub_${id}`,
            stripePriceId: PRICE[plano],
            plano,
            intervalo: 'mes',
            status: 'active',
            currentPeriodEnd: new Date('2099-01-01T00:00:00Z'),
            cancelAtPeriodEnd: false,
            trialEnd: null,
            carenciaAte: null,
            primeiraCobrancaEm: null,
            cortesiaPlano: null,
            cortesiaAte: null,
            cortesiaMotivo: null,
            ultimoEventoStripeEm: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
  };
}

function ligar() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
  vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', PRICE.pro);
  vi.stubEnv('STRIPE_PRICE_ADV_MENSAL', PRICE.adv);
  vi.stubEnv('ASSINATURAS_CORTESIA_CORTE', '2000-01-01T00:00:00Z');
  vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '');
}

const requisicao = (path: string, method = 'GET', userId = 'u1') =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      cookie: `token=${jwt.sign({ id: userId, role: roles[userId] ?? 'user' }, process.env.JWT_SECRET!, { expiresIn: 3600 })}`,
    },
  });

async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('não lançou');
}

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
});

beforeEach(() => {
  vi.clearAllMocks();
  invalidarPlano();
  planos = {};
  roles = {};
  vi.stubEnv('ASSINATURAS_HABILITADAS', '');
  vi.stubEnv('PLANO_FORCADO', '');
  vi.stubEnv('RELATORIO_PLANO_FORCADO', '');
  mockAssertSessionVersion.mockResolvedValue(undefined);
  mockResolveActingContext.mockImplementation(async (_req: unknown, user: { id: string }) => ({
    targetUserId: user.id,
    actingClient: null,
  }));
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    usuarioDoBanco(where.id),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  invalidarPlano();
});

describe('requireAuthWithActing — chave desligada', () => {
  it('não consulta plano nenhum, nem em rota Advanced', async () => {
    const auth = await requireAuthWithActing(requisicao('/api/saude-financeira'));
    expect(auth.targetUserId).toBe('u1');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('não lê nem o pathname (request sem nextUrl passa como hoje)', async () => {
    const real = requisicao('/api/carteira/resumo');
    const semUrl = { cookies: real.cookies, headers: real.headers } as unknown as NextRequest;
    await expect(requireAuthWithActing(semUrl)).resolves.toMatchObject({ targetUserId: 'u1' });
  });

  it('PLANO_FORCADO (QA) não liga o corte', async () => {
    vi.stubEnv('PLANO_FORCADO', 'basic');
    vi.stubEnv('PLANO_FORCADO_PERMITIDO', '1');
    await expect(requireAuthWithActing(requisicao('/api/carteira/resumo'))).resolves.toBeTruthy();
  });

  it('chave "true" sem os segredos do Stripe = desligada', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
    await expect(requireAuthWithActing(requisicao('/api/saude-financeira'))).resolves.toBeTruthy();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('requireAuthWithActing — chave ligada (gate central)', () => {
  beforeEach(ligar);

  it('Basic em rota Pro: 403 plano_insuficiente com need e plano', async () => {
    const e = await erroDe(requireAuthWithActing(requisicao('/api/carteira/resumo')));
    expect(e.statusCode).toBe(403);
    expect(e.extra).toEqual({ codigo: 'plano_insuficiente', need: 'pro', plano: 'basic' });
  });

  it('o JSON da rota sob withErrorHandler leva codigo, need e plano', async () => {
    const GET = withErrorHandler(async (request: NextRequest) => {
      await requireAuthWithActing(request);
      return NextResponse.json({ ok: true });
    });
    const res = await GET(requisicao('/api/analises/ir-mensal'));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'Recurso disponível no plano Advanced',
      codigo: 'plano_insuficiente',
      need: 'adv',
      plano: 'basic',
    });
  });

  it('Basic em rotas Basic passa', async () => {
    for (const path of [
      '/api/cashflow',
      '/api/dividas',
      '/api/historico-alteracoes',
      '/api/saude-financeira/config',
      '/api/analises/indicadores',
      '/api/relatorios/financeiro',
      '/api/assistente',
    ]) {
      await expect(requireAuthWithActing(requisicao(path))).resolves.toBeTruthy();
    }
  });

  it('DELETE livre na carteira (decisão 6), POST/PATCH não', async () => {
    for (const path of ['/api/carteira/acoes/abc', '/api/ativos/1', '/api/historico/transacao/2']) {
      await expect(requireAuthWithActing(requisicao(path, 'DELETE'))).resolves.toBeTruthy();
    }
    expect(
      (await erroDe(requireAuthWithActing(requisicao('/api/carteira/operacao', 'POST')))).extra,
    ).toMatchObject({ need: 'pro' });
    expect(
      (await erroDe(requireAuthWithActing(requisicao('/api/historico/transacao/2', 'PATCH'))))
        .extra,
    ).toMatchObject({ need: 'pro' });
  });

  it('prefixo mais longo vence: saude-financeira adv, /config basic; analises/ir-* adv', async () => {
    planos.u1 = 'pro';
    await expect(
      requireAuthWithActing(requisicao('/api/saude-financeira/config')),
    ).resolves.toBeTruthy();
    expect(
      (await erroDe(requireAuthWithActing(requisicao('/api/saude-financeira')))).extra,
    ).toEqual({
      codigo: 'plano_insuficiente',
      need: 'adv',
      plano: 'pro',
    });
    expect(
      (await erroDe(requireAuthWithActing(requisicao('/api/analises/ir-resumo-anual')))).extra,
    ).toMatchObject({ need: 'adv' });
    await expect(requireAuthWithActing(requisicao('/api/carteira/resumo'))).resolves.toBeTruthy();
    await expect(
      requireAuthWithActing(requisicao('/api/analises/rentabilidade-janelas')),
    ).resolves.toBeTruthy();
  });

  it('Advanced passa em tudo', async () => {
    planos.u1 = 'adv';
    for (const path of ['/api/saude-financeira', '/api/analises/proventos', '/api/carteira']) {
      await expect(requireAuthWithActing(requisicao(path, 'POST'))).resolves.toBeTruthy();
    }
  });

  it('rota isenta não consulta o plano', async () => {
    await expect(
      requireAuthWithActing(requisicao('/api/consultant/clients')),
    ).resolves.toBeTruthy();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('consultor agindo pelo cliente Basic: leitura = max(cliente, consultor)', async () => {
    roles.cons = 'consultant';
    mockResolveActingContext.mockResolvedValue({
      targetUserId: 'cliente',
      actingClient: { id: 'cliente', name: 'C', email: 'c@x' },
    });
    const auth = await requireAuthWithActing(requisicao('/api/saude-financeira', 'GET', 'cons'));
    expect(auth.targetUserId).toBe('cliente');
  });

  it('agindo por cliente: o maior dos dois vale (cliente Pro, ator Basic)', async () => {
    planos.cliente = 'pro';
    mockResolveActingContext.mockResolvedValue({
      targetUserId: 'cliente',
      actingClient: { id: 'cliente', name: 'C', email: 'c@x' },
    });
    await expect(
      requireAuthWithActing(requisicao('/api/carteira/resumo', 'GET', 'ator')),
    ).resolves.toBeTruthy();
    expect(
      (await erroDe(requireAuthWithActing(requisicao('/api/saude-financeira', 'GET', 'ator'))))
        .extra,
    ).toEqual({ codigo: 'plano_insuficiente', need: 'adv', plano: 'pro' });
  });

  it('gatePlano: false pula o gate (quem confere o plano por conta própria)', async () => {
    await expect(
      requireAuthWithActing(requisicao('/api/analise-ativos/quadro'), { gatePlano: false }),
    ).resolves.toBeTruthy();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sem sessão continua 401/Não autorizado antes do plano', async () => {
    const req = new NextRequest('http://localhost/api/carteira/resumo');
    await expect(requireAuthWithActing(req)).rejects.toThrow('Não autorizado');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
