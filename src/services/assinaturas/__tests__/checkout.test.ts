import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stripe } from '@/lib/stripe';

const mockPrisma = vi.hoisted(() => ({
  assinatura: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  assinaturaPedido: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn() },
}));
const mockPush = vi.hoisted(() => vi.fn());
const mockSincronizar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mockPush }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/assinaturas/sincronizar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/assinaturas/sincronizar')>()),
  sincronizarAssinatura: mockSincronizar,
}));

import { definirStripeParaTestes } from '@/lib/stripe';
import { invalidarPlano } from '@/services/planos/resolverPlano';
import {
  criarSessaoCheckout,
  criarSessaoPortal,
  fimJanelaArrependimento,
  montarAssinaturaMe,
  registrarArrependimento,
  sincronizarSessaoDoDono,
} from '../checkout';

const stripe = {
  customers: { create: vi.fn() },
  subscriptions: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
};

const ANTES_DA_OFERTA = new Date('2026-11-20T15:00:00Z');
const DEPOIS_DA_OFERTA = new Date('2026-12-06T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;

const pedido = (over: Partial<Parameters<typeof criarSessaoCheckout>[0]> = {}) => ({
  userId: 'user-1',
  email: 'u@x.com',
  name: 'U',
  plano: 'pro' as const,
  intervalo: 'mes' as const,
  agora: ANTES_DA_OFERTA,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_local');
  vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', 'price_pro_mes');
  vi.stubEnv('STRIPE_PRICE_PRO_ANUAL', 'price_pro_ano');
  vi.stubEnv('STRIPE_PRICE_ADV_MENSAL', 'price_adv_mes');
  vi.stubEnv('STRIPE_PRICE_ADV_ANUAL', 'price_adv_ano');
  vi.stubEnv('STRIPE_COUPON_BF_PRO_ANUAL', 'cupom_bf_pro');
  vi.stubEnv('STRIPE_COUPON_BF_ADV_ANUAL', 'cupom_bf_adv');
  vi.stubEnv('ASSINATURAS_APP_URL', 'https://app.teste');
  vi.stubEnv('PLANO_FORCADO_PERMITIDO', '');
  vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
  definirStripeParaTestes(stripe as unknown as Stripe);
  invalidarPlano();

  mockPrisma.assinatura.upsert.mockResolvedValue({ stripeCustomerId: null });
  mockPrisma.assinatura.updateMany.mockResolvedValue({ count: 1 });
  stripe.customers.create.mockResolvedValue({ id: 'cus_novo' });
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe/cs_1' });
  stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.stripe/p_1' });
  mockPrisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'n1', ...data }));
});

afterEach(() => {
  definirStripeParaTestes(undefined);
  vi.unstubAllEnvs();
});

describe('criarSessaoCheckout', () => {
  it('parâmetros do Checkout: subscription, price, pt-BR, cartão, termos, URLs, userId', async () => {
    const r = await criarSessaoCheckout(pedido());
    expect(r).toEqual({ url: 'https://checkout.stripe/cs_1', destino: 'checkout' });
    const [params, opts] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params).toMatchObject({
      mode: 'subscription',
      customer: 'cus_novo',
      client_reference_id: 'user-1',
      line_items: [{ price: 'price_pro_mes', quantity: 1 }],
      subscription_data: { metadata: { userId: 'user-1', plano: 'pro' } },
      locale: 'pt-BR',
      allowed_payment_method_types: ['card'],
      consent_collection: { terms_of_service: 'required' },
      allow_promotion_codes: false,
      success_url: 'https://app.teste/planos/sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.teste/planos?checkout=cancelado',
    });
    const minuto = Math.floor(ANTES_DA_OFERTA.getTime() / 60_000);
    expect(opts).toEqual({ idempotencyKey: `checkout:user-1:price_pro_mes:${minuto}` });
  });

  it('mensal NUNCA envia discounts, nem na Black Friday', async () => {
    await criarSessaoCheckout(pedido({ plano: 'adv', intervalo: 'mes' }));
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.discounts).toBeUndefined();
    expect(params.line_items[0].price).toBe('price_adv_mes');
  });

  it('anual com a oferta vigente leva o cupom do plano (sem allow_promotion_codes)', async () => {
    await criarSessaoCheckout(pedido({ plano: 'adv', intervalo: 'ano' }));
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.discounts).toEqual([{ coupon: 'cupom_bf_adv' }]);
    expect(params.allow_promotion_codes).toBeUndefined();
  });

  it('anual depois de 05/12 vai sem cupom', async () => {
    await criarSessaoCheckout(pedido({ intervalo: 'ano', agora: DEPOIS_DA_OFERTA }));
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.discounts).toBeUndefined();
  });

  it('anual sem cupom no env vai sem desconto', async () => {
    vi.stubEnv('STRIPE_COUPON_BF_PRO_ANUAL', '');
    await criarSessaoCheckout(pedido({ intervalo: 'ano' }));
    expect(stripe.checkout.sessions.create.mock.calls[0][0].discounts).toBeUndefined();
  });

  it('Customer criado com idempotencyKey customer:userId e a linha upsertada ANTES', async () => {
    await criarSessaoCheckout(pedido());
    expect(mockPrisma.assinatura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, create: { userId: 'user-1' } }),
    );
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: 'u@x.com', name: 'U', metadata: { userId: 'user-1' } },
      { idempotencyKey: 'customer:user-1' },
    );
    expect(mockPrisma.assinatura.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      stripe.customers.create.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.assinatura.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', stripeCustomerId: null },
      data: { stripeCustomerId: 'cus_novo' },
    });
  });

  it('reaproveita o stripeCustomerId da linha', async () => {
    mockPrisma.assinatura.upsert.mockResolvedValue({ stripeCustomerId: 'cus_velho' });
    await criarSessaoCheckout(pedido());
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_velho',
      status: 'all',
      limit: 10,
    });
  });

  it.each(['active', 'trialing', 'past_due', 'incomplete'])(
    'com assinatura %s no Customer devolve o Portal, não uma sessão nova',
    async (status) => {
      stripe.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_1', status }] });
      const r = await criarSessaoCheckout(pedido());
      expect(r).toEqual({ url: 'https://portal.stripe/p_1', destino: 'portal' });
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it('assinatura antiga cancelada não impede o Checkout', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_0', status: 'canceled' }] });
    expect((await criarSessaoCheckout(pedido())).destino).toBe('checkout');
  });

  it('Price ausente no env: 503 sem chamar o Stripe', async () => {
    vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', '');
    await expect(criarSessaoCheckout(pedido())).rejects.toMatchObject({ statusCode: 503 });
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
});

describe('criarSessaoPortal', () => {
  it('return_url em /profile', async () => {
    expect(await criarSessaoPortal('cus_1')).toEqual({ url: 'https://portal.stripe/p_1' });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://app.teste/profile',
    });
  });
});

describe('sincronizarSessaoDoDono (/me?session_id=)', () => {
  beforeEach(() => {
    mockPrisma.assinatura.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    mockSincronizar.mockResolvedValue({ userId: 'user-1' });
  });

  it('sessão do próprio requisitante: sincroniza a assinatura dela', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: 'user-1',
      customer: 'cus_1',
      subscription: 'sub_1',
    });
    expect(await sincronizarSessaoDoDono('user-1', 'cs_test_abc123')).toBe(true);
    expect(mockSincronizar).toHaveBeenCalledWith('sub_1');
  });

  it('session_id de OUTRO usuário: nenhum upsert', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: 'user-2',
      customer: 'cus_2',
      subscription: 'sub_2',
    });
    expect(await sincronizarSessaoDoDono('user-1', 'cs_test_abc123')).toBe(false);
    expect(mockSincronizar).not.toHaveBeenCalled();
  });

  it('client_reference_id certo mas customer de outra linha: ignora', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: 'user-1',
      customer: 'cus_2',
      subscription: 'sub_2',
    });
    expect(await sincronizarSessaoDoDono('user-1', 'cs_test_abc123')).toBe(false);
    expect(mockSincronizar).not.toHaveBeenCalled();
  });

  it('formato inválido ou sem linha: não chama o Stripe', async () => {
    expect(await sincronizarSessaoDoDono('user-1', '../../v1/customers')).toBe(false);
    mockPrisma.assinatura.findUnique.mockResolvedValue(null);
    expect(await sincronizarSessaoDoDono('user-1', 'cs_test_abc123')).toBe(false);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it('erro do Stripe no retrieve: ignora sem lançar', async () => {
    stripe.checkout.sessions.retrieve.mockRejectedValue(new Error('No such checkout.session'));
    expect(await sincronizarSessaoDoDono('user-1', 'cs_test_abc123')).toBe(false);
  });
});

const AGORA = new Date('2026-12-10T12:00:00Z');

function linhaAtiva(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    userId: 'user-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    stripePriceId: 'price_pro_mes',
    plano: 'pro',
    intervalo: 'mes',
    status: 'active',
    currentPeriodEnd: new Date('2027-01-08T12:00:00Z'),
    cancelAtPeriodEnd: false,
    trialEnd: null,
    carenciaAte: null,
    primeiraCobrancaEm: new Date(AGORA.getTime() - 2 * DIA),
    cortesiaPlano: null,
    cortesiaAte: null,
    cortesiaMotivo: null,
    ultimoEventoStripeEm: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}

describe('montarAssinaturaMe', () => {
  beforeEach(() => {
    // Cadastro depois do corte (não é legado) e sem lançamento.
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === 'consultor-1') {
        return { role: 'consultant', createdAt: AGORA, assinatura: null };
      }
      return {
        role: 'user',
        createdAt: new Date('2026-11-20T12:00:00Z'),
        assinatura: linhaAtiva(),
      };
    });
    mockPrisma.assinaturaPedido.findFirst.mockResolvedValue(null);
  });

  it('assinante Pro dentro dos 7 dias', async () => {
    const me = await montarAssinaturaMe({
      userId: 'user-1',
      requisitanteId: 'user-1',
      agora: AGORA,
    });
    expect(me).toMatchObject({
      plano: 'pro',
      origem: 'assinatura',
      status: 'active',
      planoAssinatura: 'pro',
      intervalo: 'mes',
      currentPeriodEnd: '2027-01-08T12:00:00.000Z',
      podeAssinar: false,
      podeDesistirAte: new Date(AGORA.getTime() + 5 * DIA).toISOString(),
      pedidoArrependimento: null,
      habilitado: true,
    });
  });

  it('com pedido de desistência desta assinatura: sem botão e com o protocolo', async () => {
    mockPrisma.assinaturaPedido.findFirst.mockResolvedValue({
      id: 'ped_1',
      status: 'aberto',
      createdAt: AGORA,
      atendidoEm: null,
      stripeSubscriptionId: 'sub_1',
    });
    const me = await montarAssinaturaMe({
      userId: 'user-1',
      requisitanteId: 'user-1',
      agora: AGORA,
    });
    expect(me.podeDesistirAte).toBeNull();
    expect(me.pedidoArrependimento).toEqual({
      protocolo: 'ped_1',
      status: 'aberto',
      criadoEm: AGORA.toISOString(),
      atendidoEm: null,
    });
  });

  it('past_due mostra carenciaAte', async () => {
    const carencia = new Date('2026-12-15T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'user',
      createdAt: new Date('2026-11-20T12:00:00Z'),
      assinatura: linhaAtiva({ status: 'past_due', carenciaAte: carencia }),
    });
    const me = await montarAssinaturaMe({
      userId: 'user-1',
      requisitanteId: 'user-1',
      agora: AGORA,
    });
    expect(me).toMatchObject({
      plano: 'pro',
      status: 'past_due',
      carenciaAte: carencia.toISOString(),
    });
  });

  it('Basic sem linha pode assinar', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'user',
      createdAt: new Date('2026-11-20T12:00:00Z'),
      assinatura: null,
    });
    const me = await montarAssinaturaMe({
      userId: 'user-1',
      requisitanteId: 'user-1',
      agora: AGORA,
    });
    expect(me).toMatchObject({
      plano: 'basic',
      origem: 'basic',
      status: 'none',
      planoAssinatura: null,
      podeAssinar: true,
      podeDesistirAte: null,
    });
  });

  it('consultor agindo pelo cliente: origem consultor, só leitura', async () => {
    const me = await montarAssinaturaMe({
      userId: 'user-1',
      requisitanteId: 'consultor-1',
      agora: AGORA,
    });
    expect(me).toMatchObject({
      plano: 'adv',
      origem: 'consultor',
      status: 'active',
      podeAssinar: false,
      podeDesistirAte: null,
    });
  });
});

describe('fimJanelaArrependimento', () => {
  it('7 dias corridos da 1ª cobrança, só com assinatura com acesso', () => {
    const l = linhaAtiva({ primeiraCobrancaEm: new Date(AGORA.getTime() - 7 * DIA + 1000) });
    expect(fimJanelaArrependimento(l as never, AGORA)).not.toBeNull();
    const fora = linhaAtiva({ primeiraCobrancaEm: new Date(AGORA.getTime() - 7 * DIA) });
    expect(fimJanelaArrependimento(fora as never, AGORA)).toBeNull();
    expect(fimJanelaArrependimento(linhaAtiva({ status: 'canceled' }) as never, AGORA)).toBeNull();
  });
});

describe('registrarArrependimento', () => {
  beforeEach(() => {
    mockPrisma.assinatura.findUnique.mockResolvedValue(linhaAtiva());
    mockPrisma.assinaturaPedido.findFirst.mockResolvedValue(null);
    mockPrisma.assinaturaPedido.create.mockImplementation(async ({ data }) => ({
      id: 'ped_1',
      createdAt: AGORA,
      atendidoEm: null,
      ...data,
    }));
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
  });

  it('dentro dos 7 dias: grava o pedido, notifica o usuário e os admins (com push)', async () => {
    const r = await registrarArrependimento('user-1', AGORA);
    expect(r).toMatchObject({ protocolo: 'ped_1', status: 'aberto', novo: true });
    expect(r.mensagem).toContain('protocolo ped_1');
    expect(mockPrisma.assinaturaPedido.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tipo: 'arrependimento',
        status: 'aberto',
        stripeSubscriptionId: 'sub_1',
      },
    });
    const destinos = mockPrisma.notification.create.mock.calls.map((c) => c[0].data.userId);
    expect(destinos).toEqual(['user-1', 'admin-1', 'admin-2']);
    expect(mockPrisma.notification.create.mock.calls[0][0].data.type).toBe(
      'assinatura_arrependimento',
    );
    expect(mockPrisma.notification.create.mock.calls[1][0].data.type).toBe(
      'assinatura_arrependimento_admin',
    );
    expect(mockPush).toHaveBeenCalledTimes(3);
  });

  it('depois dos 7 dias: 409 sem gravar', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue(
      linhaAtiva({ primeiraCobrancaEm: new Date(AGORA.getTime() - 8 * DIA) }),
    );
    await expect(registrarArrependimento('user-1', AGORA)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.assinaturaPedido.create).not.toHaveBeenCalled();
  });

  it('sem compra paga: 409', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue(linhaAtiva({ primeiraCobrancaEm: null }));
    await expect(registrarArrependimento('user-1', AGORA)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('pedido repetido devolve o mesmo protocolo sem notificar de novo', async () => {
    mockPrisma.assinaturaPedido.findFirst.mockResolvedValue({
      id: 'ped_0',
      status: 'aberto',
      createdAt: AGORA,
      atendidoEm: null,
    });
    const r = await registrarArrependimento('user-1', AGORA);
    expect(r).toMatchObject({ protocolo: 'ped_0', novo: false });
    expect(mockPrisma.assinaturaPedido.create).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('falha ao notificar não derruba o pedido', async () => {
    mockPrisma.notification.create.mockRejectedValue(new Error('db'));
    const r = await registrarArrependimento('user-1', AGORA);
    expect(r.novo).toBe(true);
  });
});
