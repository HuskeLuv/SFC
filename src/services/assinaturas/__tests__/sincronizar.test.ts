import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stripe } from '@/lib/stripe';

const mockPrisma = vi.hoisted(() => ({
  assinatura: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { definirStripeParaTestes } from '@/lib/stripe';
import {
  idDe,
  lerPeriodo,
  lerPriceId,
  lerSubscriptionDaFatura,
  resolverDono,
  sincronizarAssinatura,
} from '../sincronizar';

const stripe = {
  subscriptions: { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() },
  invoicePayments: { list: vi.fn() },
  refunds: { create: vi.fn() },
};

function sub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    created: 100,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { userId: 'user-1' },
    latest_invoice: 'in_1',
    items: { data: [{ current_period_end: 2_000_000_000, price: { id: 'price_adv_ano' } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_PRICE_ADV_ANUAL', 'price_adv_ano');
  definirStripeParaTestes(stripe as unknown as Stripe);
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  mockPrisma.assinatura.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  definirStripeParaTestes(undefined);
  vi.unstubAllEnvs();
});

describe('adaptador da versão da API', () => {
  it('lerPeriodo usa o maior items.data[].current_period_end', () => {
    const s = sub({
      items: { data: [{ current_period_end: 10 }, { current_period_end: 30 }] },
    });
    expect(lerPeriodo(s).currentPeriodEnd).toEqual(new Date(30_000));
  });

  it('lerPeriodo cai no campo antigo e devolve null sem nada', () => {
    expect(
      lerPeriodo(sub({ items: { data: [] }, current_period_end: 50 })).currentPeriodEnd,
    ).toEqual(new Date(50_000));
    expect(lerPeriodo(sub({ items: { data: [] } })).currentPeriodEnd).toBeNull();
  });

  it('lerSubscriptionDaFatura: parent.subscription_details e o campo antigo', () => {
    const nova = { parent: { subscription_details: { subscription: { id: 'sub_x' } } } };
    expect(lerSubscriptionDaFatura(nova as unknown as Stripe.Invoice)).toBe('sub_x');
    const antiga = { parent: null, subscription: 'sub_y' };
    expect(lerSubscriptionDaFatura(antiga as unknown as Stripe.Invoice)).toBe('sub_y');
    expect(lerSubscriptionDaFatura({ parent: null } as unknown as Stripe.Invoice)).toBeNull();
  });

  it('lerPriceId e idDe', () => {
    expect(lerPriceId(sub())).toBe('price_adv_ano');
    expect(idDe({ id: 'x' })).toBe('x');
    expect(idDe('y')).toBe('y');
    expect(idDe(null)).toBeNull();
  });
});

describe('resolverDono', () => {
  it('linha por stripeCustomerId vence o metadata', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue({ userId: 'dono-da-linha' });
    expect(await resolverDono('cus_1', 'user-1', 'user-2')).toBe('dono-da-linha');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sem linha: metadata (se o usuário existe), depois a dica', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === 'user-2' ? { id: 'user-2' } : null,
    );
    expect(await resolverDono('cus_1', 'nao-existe', 'user-2')).toBe('user-2');
    expect(await resolverDono('cus_1', null, null)).toBeNull();
  });
});

describe('sincronizarAssinatura', () => {
  beforeEach(() => {
    stripe.subscriptions.retrieve.mockResolvedValue(sub());
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
  });

  it('upsert com o estado do retrieve (plano e intervalo do Price)', async () => {
    const r = await sincronizarAssinatura('sub_1', { agora: new Date(5_000) });
    expect(r).toEqual({
      userId: 'user-1',
      subscriptionId: 'sub_1',
      status: 'active',
      canceladas: [],
    });
    const arg = mockPrisma.assinatura.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'user-1' });
    expect(arg.update).toMatchObject({
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_adv_ano',
      plano: 'adv',
      intervalo: 'ano',
      status: 'active',
      currentPeriodEnd: new Date(2_000_000_000_000),
      ultimoEventoStripeEm: new Date(5_000),
    });
  });

  it('priceId desconhecido: grava plano basic', async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(
      sub({ items: { data: [{ current_period_end: 1, price: { id: 'price_x' } }] } }),
    );
    await sincronizarAssinatura('sub_1');
    expect(mockPrisma.assinatura.upsert.mock.calls[0][0].update).toMatchObject({
      plano: 'basic',
      intervalo: null,
    });
  });

  it('usuário já vinculado a OUTRO Customer: não grava', async () => {
    mockPrisma.assinatura.findUnique.mockImplementation(async ({ where }) =>
      where.userId ? { stripeCustomerId: 'cus_outro' } : null,
    );
    const r = await sincronizarAssinatura('sub_1');
    expect(r.userId).toBeNull();
    expect(mockPrisma.assinatura.upsert).not.toHaveBeenCalled();
  });

  it('nenhuma viva: grava a mais recente (cancelada)', async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(sub({ status: 'canceled' }));
    stripe.subscriptions.list.mockResolvedValue({
      data: [sub({ id: 'sub_0', status: 'canceled', created: 50 }), sub({ status: 'canceled' })],
    });
    const r = await sincronizarAssinatura('sub_1');
    expect(r).toMatchObject({ subscriptionId: 'sub_1', status: 'canceled' });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
