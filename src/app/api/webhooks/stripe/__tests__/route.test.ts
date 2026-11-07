/**
 * Webhook do Stripe com o SDK REAL (assinatura validada de verdade, com um whsec falso) e os
 * métodos de rede espionados: nenhum pedido sai para a API do Stripe. O banco é um fake em
 * memória (só o que a rota e sincronizar.ts usam).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

type Linha = Record<string, unknown> & { userId: string };

const db = vi.hoisted(() => {
  const estado = {
    eventos: new Map<string, Record<string, unknown>>(),
    assinaturas: new Map<string, Record<string, unknown> & { userId: string }>(),
    users: new Map<string, { id: string; role: string }>(),
    pedidos: [] as Array<Record<string, unknown>>,
    notificacoes: [] as Array<Record<string, unknown>>,
  };
  const porWhere = (where: Record<string, unknown>) =>
    [...estado.assinaturas.values()].find((l) =>
      Object.entries(where).every(([k, v]) => l[k] === v),
    ) ?? null;
  const prisma = {
    stripeWebhookEvent: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const e of data) {
          if (estado.eventos.has(e.id as string)) continue;
          estado.eventos.set(e.id as string, { ...e, status: 'recebido' });
          count++;
        }
        return { count };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return estado.eventos.get(where.id) ?? null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const atual = estado.eventos.get(where.id);
          if (!atual) throw new Error('evento não existe');
          Object.assign(atual, data);
          return atual;
        },
      ),
    },
    assinatura: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => porWhere(where)),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const atual = estado.assinaturas.get(where.userId);
          if (atual) Object.assign(atual, update);
          else estado.assinaturas.set(where.userId, { ...create, userId: where.userId });
          return estado.assinaturas.get(where.userId);
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
          const atual = estado.assinaturas.get(where.userId);
          if (!atual) throw new Error('linha não existe');
          Object.assign(atual, data);
          return atual;
        },
      ),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return estado.users.get(where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { role: string } }) =>
        [...estado.users.values()].filter((u) => u.role === where.role),
      ),
    },
    assinaturaPedido: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const p of estado.pedidos) {
            if (Object.entries(where).every(([k, v]) => p[k] === v)) {
              Object.assign(p, data);
              count++;
            }
          }
          return { count };
        },
      ),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const n = { id: `n${estado.notificacoes.length + 1}`, ...data };
        estado.notificacoes.push(n);
        return n;
      }),
    },
  };
  return { estado, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma, default: db.prisma }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { definirStripeParaTestes } from '@/lib/stripe';
import { getTierForPath } from '@/lib/rateLimit';
import * as resolverPlano from '@/services/planos/resolverPlano';

const WHSEC = 'whsec_test_local';
const stripe = new Stripe('sk_test_fake_local');

/** Assinaturas "no Stripe" (o retrieve/list leem daqui). */
const noStripe = new Map<string, Stripe.Subscription>();

const retrieve = vi.spyOn(stripe.subscriptions, 'retrieve');
const list = vi.spyOn(stripe.subscriptions, 'list');
const cancel = vi.spyOn(stripe.subscriptions, 'cancel');
const invoicePaymentsList = vi.spyOn(stripe.invoicePayments, 'list');
const refundsCreate = vi.spyOn(stripe.refunds, 'create');

function sub(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    created: 1_762_000_000,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { userId: 'user-1', plano: 'pro' },
    latest_invoice: 'in_1',
    items: {
      object: 'list',
      data: [{ id: 'si_1', current_period_end: 1_764_600_000, price: { id: 'price_pro_mes' } }],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

let seq = 0;
function evento(type: string, object: unknown, over: Record<string, unknown> = {}) {
  seq++;
  return {
    id: `evt_${seq}`,
    object: 'event',
    api_version: '2026-10-28.endive',
    created: 1_762_500_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
    ...over,
  };
}

function req(payload: string, assinatura?: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig =
    assinatura === undefined
      ? stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC })
      : assinatura;
  if (sig) headers['stripe-signature'] = sig;
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: payload,
    headers,
  });
}

const enviar = (ev: unknown) => POST(req(JSON.stringify(ev)));

const linha = (userId = 'user-1') => db.estado.assinaturas.get(userId) as Linha | undefined;

beforeEach(() => {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake_local');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', WHSEC);
  vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', 'price_pro_mes');
  vi.stubEnv('STRIPE_PRICE_PRO_ANUAL', 'price_pro_ano');
  vi.stubEnv('STRIPE_PRICE_ADV_MENSAL', 'price_adv_mes');
  vi.stubEnv('STRIPE_PRICE_ADV_ANUAL', 'price_adv_ano');
  vi.stubEnv('PLANO_FORCADO_PERMITIDO', '');
  vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
  definirStripeParaTestes(stripe);

  db.estado.eventos.clear();
  db.estado.assinaturas.clear();
  db.estado.users.clear();
  db.estado.pedidos.length = 0;
  db.estado.notificacoes.length = 0;
  db.estado.users.set('user-1', { id: 'user-1', role: 'user' });
  db.estado.users.set('admin-1', { id: 'admin-1', role: 'admin' });
  // Linha criada pelo checkout ANTES da sessão (customer.ts): vínculo por stripeCustomerId.
  db.estado.assinaturas.set('user-1', {
    userId: 'user-1',
    stripeCustomerId: 'cus_1',
    status: 'none',
    primeiraCobrancaEm: null,
  });

  noStripe.clear();
  noStripe.set('sub_1', sub());
  retrieve.mockReset().mockImplementation((async (id: string) => {
    const s = noStripe.get(id);
    if (!s) throw new Error(`No such subscription: ${id}`);
    return s;
  }) as never);
  list.mockReset().mockImplementation((async (params: { customer: string }) => ({
    object: 'list',
    data: [...noStripe.values()].filter((s) => s.customer === params.customer),
    has_more: false,
  })) as never);
  cancel.mockReset().mockImplementation((async (id: string) => {
    const s = noStripe.get(id)!;
    noStripe.set(id, { ...s, status: 'canceled' } as Stripe.Subscription);
    return noStripe.get(id);
  }) as never);
  invoicePaymentsList.mockReset().mockResolvedValue({
    object: 'list',
    data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_dup' } }],
    has_more: false,
  } as never);
  refundsCreate.mockReset().mockResolvedValue({ id: 're_1' } as never);
  for (const fn of Object.values(db.prisma).flatMap((m) => Object.values(m))) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
});

afterEach(() => {
  definirStripeParaTestes(undefined);
  vi.unstubAllEnvs();
});

describe('POST /api/webhooks/stripe — portas', () => {
  it('chave desligada: 404 sem ler o corpo nem tocar no banco', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    const res = await enviar(evento('customer.subscription.updated', sub()));
    expect(res.status).toBe(404);
    expect(db.prisma.stripeWebhookEvent.createMany).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('sem header stripe-signature: 400', async () => {
    const res = await POST(req(JSON.stringify(evento('invoice.paid', {})), null));
    expect(res.status).toBe(400);
    expect(db.prisma.stripeWebhookEvent.createMany).not.toHaveBeenCalled();
  });

  it('assinatura inválida (outro segredo): 400 e nada gravado', async () => {
    const payload = JSON.stringify(evento('customer.subscription.updated', sub()));
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outro' });
    const res = await POST(req(payload, sig));
    expect(res.status).toBe(400);
    expect(db.prisma.stripeWebhookEvent.createMany).not.toHaveBeenCalled();
    expect(db.prisma.assinatura.upsert).not.toHaveBeenCalled();
  });

  it('corpo alterado depois de assinado: 400', async () => {
    const payload = JSON.stringify(evento('customer.subscription.updated', sub()));
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
    const res = await POST(req(payload.replace('active', 'trialing'), sig));
    expect(res.status).toBe(400);
  });

  it('livemode diferente da chave (evento live com sk_test): 200 e ignora', async () => {
    const res = await enviar(evento('customer.subscription.updated', sub(), { livemode: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignorado: true });
    expect(db.prisma.stripeWebhookEvent.createMany).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rate limit: tier próprio de 300/min, antes do genérico /api/', () => {
    expect(getTierForPath('/api/webhooks/stripe').limit).toBe(300);
    expect(getTierForPath('/api/webhooks/pluggy').limit).toBe(60);
  });
});

describe('POST /api/webhooks/stripe — processamento', () => {
  it('subscription.created: retrieve + upsert pela linha do stripeCustomerId', async () => {
    const invalidar = vi.spyOn(resolverPlano, 'invalidarPlano');
    const ev = evento('customer.subscription.created', sub({ status: 'incomplete' }));
    const res = await enviar(ev);
    expect(res.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    // Grava o estado ATUAL do Stripe (active), não o do payload (incomplete).
    expect(linha()).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_pro_mes',
      plano: 'pro',
      intervalo: 'mes',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_764_600_000 * 1000),
    });
    expect(db.estado.eventos.get(ev.id)).toMatchObject({
      status: 'processado',
      userId: 'user-1',
      type: 'customer.subscription.created',
    });
    expect(db.estado.eventos.get(ev.id)?.processedAt).toBeInstanceOf(Date);
    expect(invalidar).toHaveBeenCalledWith('user-1');
    invalidar.mockRestore();
  });

  it('evento repetido (mesmo event.id): 200 sem retrieve nem upsert', async () => {
    const ev = evento('customer.subscription.updated', sub());
    expect((await enviar(ev)).status).toBe(200);
    retrieve.mockClear();
    db.prisma.assinatura.upsert.mockClear();
    const res = await enviar(ev);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicado: true });
    expect(retrieve).not.toHaveBeenCalled();
    expect(db.prisma.assinatura.upsert).not.toHaveBeenCalled();
  });

  it('fora de ordem: um "updated" antigo chegando depois não volta o estado (sempre retrieve)', async () => {
    // Estado atual no Stripe: cancelada.
    noStripe.set('sub_1', sub({ status: 'canceled' }));
    await enviar(evento('customer.subscription.deleted', sub({ status: 'canceled' })));
    expect(linha()?.status).toBe('canceled');
    // O "updated" de antes (payload active) chega depois, no mesmo segundo.
    await enviar(evento('customer.subscription.updated', sub({ status: 'active' })));
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(linha()?.status).toBe('canceled');
  });

  it('subscription.deleted rebaixa (status canceled na linha)', async () => {
    await enviar(evento('customer.subscription.created', sub()));
    expect(linha()?.status).toBe('active');
    noStripe.set('sub_1', sub({ status: 'canceled' }));
    await enviar(evento('customer.subscription.deleted', sub({ status: 'canceled' })));
    expect(linha()?.status).toBe('canceled');
  });

  it('cancelAtPeriodEnd é gravado (mantém o plano até o fim, com aviso)', async () => {
    noStripe.set('sub_1', sub({ cancel_at_period_end: true }));
    await enviar(evento('customer.subscription.updated', sub()));
    expect(linha()).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
  });

  it('sem linha local: vincula por subscription.metadata.userId', async () => {
    db.estado.assinaturas.clear();
    await enviar(evento('customer.subscription.created', sub()));
    expect(linha()).toMatchObject({ stripeCustomerId: 'cus_1', status: 'active' });
  });

  it('checkout.session.completed: sem linha nem metadata, usa o client_reference_id', async () => {
    db.estado.assinaturas.clear();
    noStripe.set('sub_1', sub({ metadata: {} }));
    const sessao = {
      id: 'cs_test_1',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_1',
      subscription: 'sub_1',
      client_reference_id: 'user-1',
    };
    const res = await enviar(evento('checkout.session.completed', sessao));
    expect(res.status).toBe(200);
    expect(linha()).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active' });
  });

  it('usuário inexistente: 200, evento ignorado, nenhum upsert', async () => {
    db.estado.assinaturas.clear();
    noStripe.set(
      'sub_9',
      sub({ id: 'sub_9', customer: 'cus_9', metadata: { userId: 'fantasma' } }),
    );
    const ev = evento('customer.subscription.created', sub({ id: 'sub_9' }));
    const res = await enviar(ev);
    expect(res.status).toBe(200);
    expect(db.prisma.assinatura.upsert).not.toHaveBeenCalled();
    expect(db.estado.eventos.get(ev.id)).toMatchObject({
      status: 'ignorado',
      error: 'usuário não encontrado',
    });
  });

  it('tipo não tratado: registrado como ignorado, sem retrieve', async () => {
    const ev = evento('customer.created', { id: 'cus_1' });
    expect((await enviar(ev)).status).toBe(200);
    expect(retrieve).not.toHaveBeenCalled();
    expect(db.estado.eventos.get(ev.id)?.status).toBe('ignorado');
  });

  it('duas assinaturas ativas: cancela a MAIS NOVA e reembolsa a fatura dela', async () => {
    noStripe.set('sub_2', sub({ id: 'sub_2', created: 1_762_000_500, latest_invoice: 'in_2' }));
    await enviar(evento('customer.subscription.created', sub({ id: 'sub_2' })));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('sub_2', {}, { idempotencyKey: 'cancel-duplicada:sub_2' });
    expect(invoicePaymentsList).toHaveBeenCalledWith({ invoice: 'in_2', status: 'paid' });
    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_dup', reason: 'duplicate' },
      { idempotencyKey: 'refund-duplicada:sub_2:pi_dup' },
    );
    // A linha fica com a mais antiga.
    expect(linha()).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active' });
  });

  it('Prisma falha: 500, evento com status erro; a retentativa reprocessa', async () => {
    const ev = evento('customer.subscription.updated', sub());
    db.prisma.assinatura.upsert.mockRejectedValueOnce(new Error('conexão caiu'));
    const res = await enviar(ev);
    expect(res.status).toBe(500);
    expect(db.estado.eventos.get(ev.id)).toMatchObject({ status: 'erro', error: 'conexão caiu' });

    const retentativa = await enviar(ev);
    expect(retentativa.status).toBe(200);
    expect(db.estado.eventos.get(ev.id)?.status).toBe('processado');
    expect(linha()?.status).toBe('active');
  });
});

describe('POST /api/webhooks/stripe — faturas e reembolso', () => {
  const fatura = (over: Record<string, unknown> = {}) => ({
    id: 'in_1',
    object: 'invoice',
    customer: 'cus_1',
    amount_paid: 4990,
    attempt_count: 1,
    next_payment_attempt: 1_762_600_000,
    billing_reason: 'subscription_create',
    status_transitions: { paid_at: 1_762_500_100 },
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
    ...over,
  });

  it('invoice.paid: registra valorCentavos, limpa carenciaAte e abre a janela dos 7 dias', async () => {
    db.estado.assinaturas.get('user-1')!.carenciaAte = new Date();
    const ev = evento('invoice.paid', fatura());
    expect((await enviar(ev)).status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(db.estado.eventos.get(ev.id)).toMatchObject({ valorCentavos: 4990, userId: 'user-1' });
    expect(linha()).toMatchObject({
      carenciaAte: null,
      primeiraCobrancaEm: new Date(1_762_500_100 * 1000),
    });
  });

  it('invoice.paid de renovação não move a 1ª cobrança', async () => {
    const primeira = new Date('2026-11-01T12:00:00Z');
    db.estado.assinaturas.get('user-1')!.primeiraCobrancaEm = primeira;
    await enviar(evento('invoice.paid', fatura({ billing_reason: 'subscription_cycle' })));
    expect(linha()?.primeiraCobrancaEm).toEqual(primeira);
  });

  it('invoice.paid com o campo antigo invoice.subscription (adaptador)', async () => {
    await enviar(evento('invoice.paid', fatura({ parent: null, subscription: 'sub_1' })));
    expect(retrieve).toHaveBeenCalledWith('sub_1');
  });

  it('payment_failed attempt 1: carenciaAte = falha + 7 dias e notifica', async () => {
    noStripe.set('sub_1', sub({ status: 'past_due' }));
    await enviar(evento('invoice.payment_failed', fatura()));
    const falha = 1_762_500_000 * 1000;
    expect(linha()).toMatchObject({
      status: 'past_due',
      carenciaAte: new Date(falha + 7 * 24 * 60 * 60 * 1000),
    });
    expect(db.estado.notificacoes).toHaveLength(1);
    expect(db.estado.notificacoes[0]).toMatchObject({
      userId: 'user-1',
      type: 'assinatura_pagamento_falhou',
    });
  });

  it('payment_failed nas tentativas do meio: não notifica nem mexe na carência', async () => {
    const carencia = new Date('2026-11-14T00:00:00Z');
    db.estado.assinaturas.get('user-1')!.carenciaAte = carencia;
    noStripe.set('sub_1', sub({ status: 'past_due' }));
    await enviar(evento('invoice.payment_failed', fatura({ attempt_count: 2 })));
    expect(db.estado.notificacoes).toHaveLength(0);
    expect(linha()?.carenciaAte).toEqual(carencia);
  });

  it('payment_failed na última tentativa (next_payment_attempt null): notifica', async () => {
    noStripe.set('sub_1', sub({ status: 'past_due' }));
    await enviar(
      evento('invoice.payment_failed', fatura({ attempt_count: 4, next_payment_attempt: null })),
    );
    expect(db.estado.notificacoes).toHaveLength(1);
    expect(db.estado.notificacoes[0].title).toBe('Não conseguimos cobrar sua assinatura');
  });

  it('charge.refunded integral: fecha o pedido de arrependimento aberto', async () => {
    db.estado.pedidos.push({
      id: 'ped_1',
      userId: 'user-1',
      tipo: 'arrependimento',
      status: 'aberto',
    });
    const charge = {
      id: 'ch_1',
      object: 'charge',
      customer: 'cus_1',
      amount_refunded: 4990,
      refunded: true,
    };
    const ev = evento('charge.refunded', charge);
    expect((await enviar(ev)).status).toBe(200);
    expect(db.estado.pedidos[0]).toMatchObject({ status: 'atendido' });
    expect(db.estado.pedidos[0].atendidoEm).toBeInstanceOf(Date);
    expect(db.estado.eventos.get(ev.id)).toMatchObject({
      valorCentavos: 4990,
      status: 'processado',
    });
  });

  it('charge.refunded parcial: registra, mas não fecha o pedido', async () => {
    db.estado.pedidos.push({
      id: 'ped_1',
      userId: 'user-1',
      tipo: 'arrependimento',
      status: 'aberto',
    });
    const charge = {
      id: 'ch_1',
      object: 'charge',
      customer: 'cus_1',
      amount_refunded: 100,
      refunded: false,
    };
    await enviar(evento('charge.refunded', charge));
    expect(db.estado.pedidos[0].status).toBe('aberto');
  });
});
