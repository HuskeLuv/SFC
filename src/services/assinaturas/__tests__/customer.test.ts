import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stripe } from '@/lib/stripe';

const mockPrisma = vi.hoisted(() => ({
  assinatura: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { definirStripeParaTestes } from '@/lib/stripe';
import { cancelarAssinaturasDaConta, garantirCustomer } from '../customer';

const stripe = {
  customers: { create: vi.fn() },
  subscriptions: { list: vi.fn(), cancel: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_local');
  definirStripeParaTestes(stripe as unknown as Stripe);
  mockPrisma.assinatura.findUnique.mockResolvedValue({
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
  });
  stripe.subscriptions.list.mockResolvedValue({
    data: [
      { id: 'sub_0', status: 'canceled' },
      { id: 'sub_1', status: 'active' },
      { id: 'sub_2', status: 'past_due' },
    ],
  });
  stripe.subscriptions.cancel.mockResolvedValue({});
});

afterEach(() => {
  definirStripeParaTestes(undefined);
  vi.unstubAllEnvs();
});

describe('garantirCustomer', () => {
  it('cria o Customer uma vez (idempotencyKey) e grava só se a linha não tinha', async () => {
    mockPrisma.assinatura.upsert.mockResolvedValue({ stripeCustomerId: null });
    stripe.customers.create.mockResolvedValue({ id: 'cus_novo' });
    expect(await garantirCustomer({ userId: 'u1', email: 'a@b.c', name: null })).toBe('cus_novo');
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: 'a@b.c', name: undefined, metadata: { userId: 'u1' } },
      { idempotencyKey: 'customer:u1' },
    );
    expect(mockPrisma.assinatura.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', stripeCustomerId: null },
      data: { stripeCustomerId: 'cus_novo' },
    });
  });
});

describe('cancelarAssinaturasDaConta', () => {
  it('cancela todas as não encerradas e marca a linha canceled', async () => {
    expect(await cancelarAssinaturasDaConta('u1')).toBe(2);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_1',
      {},
      { idempotencyKey: 'cancel-conta:sub_1' },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_2',
      {},
      { idempotencyKey: 'cancel-conta:sub_2' },
    );
    expect(mockPrisma.assinatura.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { status: 'canceled', cancelAtPeriodEnd: false, carenciaAte: null },
    });
  });

  it('falha no Stripe: ApiError 503 e a linha não muda', async () => {
    stripe.subscriptions.cancel.mockRejectedValue(new Error('api down'));
    await expect(cancelarAssinaturasDaConta('u1')).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.assinatura.update).not.toHaveBeenCalled();
  });

  it('sem Customer: nada a fazer', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue(null);
    expect(await cancelarAssinaturasDaConta('u1')).toBe(0);
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it('chave desligada e sem STRIPE_SECRET_KEY: não toca no banco nem no Stripe', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(await cancelarAssinaturasDaConta('u1')).toBe(0);
    expect(mockPrisma.assinatura.findUnique).not.toHaveBeenCalled();
  });

  it('chave desligada COM chave do Stripe (desligaram depois de vender): ainda cancela', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    expect(await cancelarAssinaturasDaConta('u1')).toBe(2);
  });
});
