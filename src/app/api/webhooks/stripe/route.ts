import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { obterStripe, type Stripe } from '@/lib/stripe';
import {
  assinaturasHabilitadas,
  carenciaDias,
  stripeModoLive,
  stripeWebhookSecret,
} from '@/lib/assinaturasConfig';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { invalidarPlano } from '@/services/planos/resolverPlano';
import {
  idDe,
  lerSubscriptionDaFatura,
  resolverDono,
  sincronizarAssinatura,
} from '@/services/assinaturas/sincronizar';
import {
  fecharPedidosArrependimento,
  notificarPagamentoFalhou,
} from '@/services/assinaturas/checkout';

/**
 * POST /api/webhooks/stripe — eventos do Stripe (assinaturas, ClickUp 86e2zkhe2).
 *
 * - Chave ASSINATURAS_HABILITADAS desligada: 404.
 * - Corpo BRUTO (request.text()) + stripe-signature validados com STRIPE_WEBHOOK_SECRET;
 *   inválido ou sem header = 400. livemode diferente da chave (sk_live_/sk_test_) = 200 e ignora.
 * - Idempotência por event.id (stripe_webhook_events, INSERT … ON CONFLICT DO NOTHING): evento
 *   já processado = 200 sem tocar em nada; um que falhou antes é reprocessado na retentativa.
 * - Sem regra de ordem: cada evento resolve o subscriptionId e faz retrieve + upsert
 *   (src/services/assinaturas/sincronizar.ts).
 * - Erro = 500 (o Stripe retenta por até 3 dias) e a linha do evento fica 'erro'.
 *
 * Fora do JWT e do CSRF pelo prefixo /api/webhooks/ do middleware (nenhuma outra rota abre);
 * rate limit próprio em getTierForPath.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Eventos tratados (configurar exatamente estes no endpoint do Dashboard, mesma api_version):
// checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid,
// invoice.payment_failed, charge.refunded. Qualquer outro é registrado como 'ignorado'.

interface Desfecho {
  status: 'processado' | 'ignorado';
  userId: string | null;
  valorCentavos?: number | null;
  error?: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function dataDe(segundos: number | null | undefined, reserva: Date): Date {
  return typeof segundos === 'number' && segundos > 0 ? new Date(segundos * 1000) : reserva;
}

async function sincronizarOuIgnorar(
  subscriptionId: string | null,
  agora: Date,
  dicaUserId?: string | null,
): Promise<Desfecho> {
  if (!subscriptionId) return { status: 'ignorado', userId: null, error: 'sem assinatura' };
  const r = await sincronizarAssinatura(subscriptionId, { dicaUserId, agora });
  if (!r.userId) return { status: 'ignorado', userId: null, error: 'usuário não encontrado' };
  return { status: 'processado', userId: r.userId };
}

async function faturaPaga(invoice: Stripe.Invoice, agora: Date): Promise<Desfecho> {
  const subscriptionId = lerSubscriptionDaFatura(invoice);
  const desfecho = await sincronizarOuIgnorar(subscriptionId, agora);
  desfecho.valorCentavos = invoice.amount_paid;
  if (!desfecho.userId) return desfecho;

  const linha = await prisma.assinatura.findUnique({
    where: { userId: desfecho.userId },
    select: { stripeSubscriptionId: true, primeiraCobrancaEm: true },
  });
  const pagaEm = dataDe(invoice.status_transitions?.paid_at, agora);
  const ehDaPrincipal = linha?.stripeSubscriptionId === subscriptionId;
  // 1ª cobrança paga desta assinatura: abre a janela de 7 dias do arrependimento.
  const primeira =
    ehDaPrincipal &&
    (invoice.billing_reason === 'subscription_create' || !linha?.primeiraCobrancaEm);
  await prisma.assinatura.update({
    where: { userId: desfecho.userId },
    data: { carenciaAte: null, ...(primeira ? { primeiraCobrancaEm: pagaEm } : {}) },
  });
  return desfecho;
}

async function faturaFalhou(invoice: Stripe.Invoice, agora: Date): Promise<Desfecho> {
  const desfecho = await sincronizarOuIgnorar(lerSubscriptionDaFatura(invoice), agora);
  if (!desfecho.userId) return desfecho;

  const primeira = invoice.attempt_count === 1;
  const ultima = invoice.next_payment_attempt === null;
  let atualizarAte: Date | null = null;
  if (primeira) {
    // Só exibição ("atualize até dd/mm"): o Smart Retries do Stripe decide o fim real.
    atualizarAte = new Date(agora.getTime() + carenciaDias() * DIA_MS);
    await prisma.assinatura.update({
      where: { userId: desfecho.userId },
      data: { carenciaAte: atualizarAte },
    });
  }
  if (primeira || ultima) {
    await notificarPagamentoFalhou(desfecho.userId, { ultima: ultima && !primeira, atualizarAte });
  }
  return desfecho;
}

async function cobrancaReembolsada(charge: Stripe.Charge, agora: Date): Promise<Desfecho> {
  const customerId = idDe(charge.customer);
  // Só a linha local vincula aqui (a Charge não traz metadata do usuário).
  const userId = customerId ? await resolverDono(customerId, null, null) : null;
  if (!userId) {
    return {
      status: 'ignorado',
      userId: null,
      valorCentavos: charge.amount_refunded,
      error: 'usuário não encontrado',
    };
  }
  // Reembolso integral = pedido de arrependimento atendido.
  if (charge.refunded) await fecharPedidosArrependimento(userId, agora);
  return { status: 'processado', userId, valorCentavos: charge.amount_refunded };
}

async function processar(event: Stripe.Event): Promise<Desfecho> {
  const agora = dataDe(event.created, new Date());
  switch (event.type) {
    case 'checkout.session.completed': {
      const sessao = event.data.object;
      if (sessao.mode !== 'subscription') {
        return { status: 'ignorado', userId: null, error: 'sessão sem assinatura' };
      }
      return sincronizarOuIgnorar(idDe(sessao.subscription), agora, sessao.client_reference_id);
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return sincronizarOuIgnorar(event.data.object.id, agora);
    case 'invoice.paid':
      return faturaPaga(event.data.object, agora);
    case 'invoice.payment_failed':
      return faturaFalhou(event.data.object, agora);
    case 'charge.refunded':
      return cobrancaReembolsada(event.data.object, agora);
    default:
      return { status: 'ignorado', userId: null, error: 'tipo de evento não tratado' };
  }
}

/** true = já foi processado (ou ignorado) antes: responder 200 sem refazer. */
async function registrarEvento(event: Stripe.Event): Promise<boolean> {
  const { count } = await prisma.stripeWebhookEvent.createMany({
    data: [
      {
        id: event.id,
        type: event.type,
        livemode: event.livemode,
        stripeCreatedAt: dataDe(event.created, new Date()),
      },
    ],
    skipDuplicates: true,
  });
  if (count > 0) return false;
  const anterior = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { status: true },
  });
  return anterior?.status === 'processado' || anterior?.status === 'ignorado';
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!assinaturasHabilitadas()) throw new ApiError(404, 'Não encontrado');

  const assinatura = request.headers.get('stripe-signature');
  if (!assinatura) throw new ApiError(400, 'Assinatura ausente');
  const corpo = await request.text();

  let event: Stripe.Event;
  try {
    event = obterStripe().webhooks.constructEvent(corpo, assinatura, stripeWebhookSecret() ?? '');
  } catch (error: unknown) {
    logger.warn('[stripe webhook] assinatura inválida', {
      msg: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError(400, 'Assinatura inválida');
  }

  if (event.livemode !== stripeModoLive()) {
    logger.warn('[stripe webhook] livemode diferente da chave: ignorado', {
      id: event.id,
      livemode: event.livemode,
    });
    return NextResponse.json({ recebido: true, ignorado: true });
  }

  if (await registrarEvento(event)) {
    return NextResponse.json({ recebido: true, duplicado: true });
  }

  let desfecho: Desfecho;
  try {
    desfecho = await processar(event);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[stripe webhook] falha ao processar', { id: event.id, type: event.type, msg });
    await prisma.stripeWebhookEvent
      .update({ where: { id: event.id }, data: { status: 'erro', error: msg.slice(0, 1000) } })
      .catch(() => undefined);
    return NextResponse.json({ error: 'Falha ao processar o evento' }, { status: 500 });
  }

  await prisma.stripeWebhookEvent.update({
    where: { id: event.id },
    data: {
      status: desfecho.status,
      processedAt: new Date(),
      userId: desfecho.userId,
      valorCentavos: desfecho.valorCentavos ?? null,
      error: desfecho.error ?? null,
    },
  });
  if (desfecho.userId) invalidarPlano(desfecho.userId);

  return NextResponse.json({ recebido: true });
});
