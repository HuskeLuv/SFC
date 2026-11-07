/**
 * Sincronização da linha `assinaturas` com o estado ATUAL do Stripe (ClickUp 86e2zkhe2).
 *
 * Regra (desenho, "sem regra de ordem"): todo evento resolve o subscriptionId, faz
 * subscriptions.retrieve e um upsert idempotente. A ordem de chegada dos eventos não importa,
 * porque o que grava é sempre o que o Stripe diz agora.
 *
 * Vínculo do userId, nesta ordem:
 *  1. linha local por stripeCustomerId (criada ANTES do checkout, em customer.ts);
 *  2. subscription.metadata.userId (gravado pelo checkout);
 *  3. client_reference_id da sessão do Checkout (dica do chamador).
 * O userId NUNCA vem de quem fez a requisição (o /me só pede a sincronização).
 *
 * Duplicidade: se o Customer tiver mais de uma assinatura active/trialing/past_due, fica a mais
 * antiga; as mais novas são canceladas e a fatura delas reembolsada (alerta no log).
 *
 * Adaptador da versão da API (2026-10-28.endive, mudanças da basil): o fim do período mora em
 * items.data[].current_period_end e a assinatura da fatura em
 * invoice.parent.subscription_details.subscription. Só lerPeriodo/lerSubscriptionDaFatura sabem
 * disso; o resto do código não toca nesses campos.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { obterStripe, type Stripe } from '@/lib/stripe';
import { precoParaPlano } from '@/lib/assinaturasConfig';
import { STATUS_COM_ACESSO } from '@/services/planos/planoEfetivo';

/** Status que contam como assinatura "viva" para a duplicidade (e para o checkout). */
export const STATUS_DUPLICIDADE: readonly string[] = STATUS_COM_ACESSO;

/** Status que bloqueiam abrir um Checkout novo (o usuário vai para o Portal). */
export const STATUS_BLOQUEIA_CHECKOUT: readonly string[] = [...STATUS_COM_ACESSO, 'incomplete'];

/** Status em que não há mais nada para cancelar. */
export const STATUS_TERMINAIS: readonly string[] = ['canceled', 'incomplete_expired'];

type Expansivel = string | { id: string } | null | undefined;

/** id de um campo do Stripe que pode vir como string ou objeto expandido. */
export function idDe(valor: Expansivel): string | null {
  if (!valor) return null;
  return typeof valor === 'string' ? valor : valor.id;
}

function dataDeUnix(segundos: number | null | undefined): Date | null {
  return typeof segundos === 'number' && segundos > 0 ? new Date(segundos * 1000) : null;
}

/**
 * Fim do período corrente. Desde a basil o campo saiu da Subscription e foi para cada item; com
 * vários itens vale o maior. Cai no campo antigo se a resposta ainda o trouxer.
 */
export function lerPeriodo(sub: Stripe.Subscription): { currentPeriodEnd: Date | null } {
  const fins = (sub.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === 'number');
  if (fins.length > 0) return { currentPeriodEnd: dataDeUnix(Math.max(...fins)) };
  const legado = (sub as unknown as { current_period_end?: number | null }).current_period_end;
  return { currentPeriodEnd: dataDeUnix(legado) };
}

/** Price do primeiro item da assinatura (o checkout cria sempre um item só). */
export function lerPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/**
 * Assinatura de uma fatura: invoice.parent.subscription_details.subscription (basil em diante),
 * com o campo antigo invoice.subscription de reserva.
 */
export function lerSubscriptionDaFatura(invoice: Stripe.Invoice): string | null {
  const nova = idDe(invoice.parent?.subscription_details?.subscription ?? null);
  if (nova) return nova;
  return idDe((invoice as unknown as { subscription?: Expansivel }).subscription);
}

export interface ResultadoSincronizacao {
  /** Dono da linha atualizada; null = nenhum usuário vinculável (evento ignorado). */
  userId: string | null;
  /** Assinatura gravada na linha (a principal do Customer). */
  subscriptionId: string | null;
  status: string | null;
  /** Assinaturas duplicadas canceladas nesta passada. */
  canceladas: string[];
}

const SEM_USUARIO: ResultadoSincronizacao = {
  userId: null,
  subscriptionId: null,
  status: null,
  canceladas: [],
};

async function usuarioExiste(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * Descobre o dono do Customer: linha local por stripeCustomerId → metadata.userId → dica.
 * Devolve null se nenhum usuário existir (evento de outro ambiente, usuário apagado…).
 */
export async function resolverDono(
  customerId: string | null,
  metadataUserId: string | null | undefined,
  dicaUserId: string | null | undefined,
): Promise<string | null> {
  if (customerId) {
    const linha = await prisma.assinatura.findUnique({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    if (linha) return linha.userId;
  }
  return (await usuarioExiste(metadataUserId)) ?? (await usuarioExiste(dicaUserId));
}

/** Reembolsa a(s) cobrança(s) paga(s) da última fatura de uma assinatura duplicada. */
async function reembolsarUltimaFatura(stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  const invoiceId = idDe(sub.latest_invoice);
  if (!invoiceId) return;
  const pagamentos = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid' });
  for (const pagamento of pagamentos.data) {
    const paymentIntent = idDe(pagamento.payment?.payment_intent ?? null);
    if (!paymentIntent) continue;
    await stripe.refunds.create(
      { payment_intent: paymentIntent, reason: 'duplicate' },
      { idempotencyKey: `refund-duplicada:${sub.id}:${paymentIntent}` },
    );
  }
}

/**
 * Mantém UMA assinatura viva por Customer: a mais antiga fica, as outras são canceladas na hora
 * e reembolsadas. Devolve a principal (ou a mais recente, se nenhuma estiver viva).
 */
async function escolherPrincipal(
  stripe: Stripe,
  customerId: string,
  atual: Stripe.Subscription,
): Promise<{ principal: Stripe.Subscription; canceladas: string[] }> {
  const lista = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  const todas = new Map<string, Stripe.Subscription>();
  for (const s of lista.data) todas.set(s.id, s);
  todas.set(atual.id, atual); // o retrieve é o estado mais novo desta
  const ordenadas = [...todas.values()].sort(
    (a, b) => a.created - b.created || (a.id < b.id ? -1 : 1),
  );
  const vivas = ordenadas.filter((s) => STATUS_DUPLICIDADE.includes(s.status));

  const canceladas: string[] = [];
  if (vivas.length > 1) {
    const [, ...duplicadas] = vivas;
    logger.error('[assinaturas] Customer com mais de uma assinatura ativa: cancelando as novas', {
      customerId,
      fica: vivas[0].id,
      duplicadas: duplicadas.map((s) => s.id),
    });
    for (const dup of duplicadas) {
      await stripe.subscriptions.cancel(
        dup.id,
        {},
        { idempotencyKey: `cancel-duplicada:${dup.id}` },
      );
      await reembolsarUltimaFatura(stripe, dup);
      canceladas.push(dup.id);
    }
  }
  const principal = vivas[0] ?? ordenadas[ordenadas.length - 1] ?? atual;
  return { principal, canceladas };
}

/**
 * Busca a assinatura no Stripe (estado atual), escolhe a principal do Customer e faz o upsert
 * da linha do dono. `dicaUserId` = client_reference_id da sessão do Checkout, quando houver.
 */
export async function sincronizarAssinatura(
  subscriptionId: string,
  opts: { dicaUserId?: string | null; agora?: Date } = {},
): Promise<ResultadoSincronizacao> {
  const stripe = obterStripe();
  const atual = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idDe(atual.customer);
  if (!customerId) {
    logger.warn('[assinaturas] assinatura sem customer', { subscriptionId });
    return SEM_USUARIO;
  }

  const userId = await resolverDono(customerId, atual.metadata?.userId, opts.dicaUserId);
  if (!userId) {
    logger.warn('[assinaturas] nenhum usuário para a assinatura: ignorada', {
      subscriptionId,
      customerId,
    });
    return SEM_USUARIO;
  }

  const { principal, canceladas } = await escolherPrincipal(stripe, customerId, atual);
  const priceId = lerPriceId(principal);
  const preco = precoParaPlano(priceId);
  if (!preco) {
    logger.warn('[assinaturas] priceId desconhecido na assinatura', {
      subscriptionId: principal.id,
      priceId,
    });
  }
  const { currentPeriodEnd } = lerPeriodo(principal);
  const dados = {
    stripeSubscriptionId: principal.id,
    stripePriceId: priceId,
    plano: preco?.plano ?? 'basic',
    intervalo: preco?.intervalo ?? null,
    status: principal.status,
    currentPeriodEnd,
    cancelAtPeriodEnd: principal.cancel_at_period_end ?? false,
    trialEnd: dataDeUnix(principal.trial_end),
    ultimoEventoStripeEm: opts.agora ?? new Date(),
  };

  const existente = await prisma.assinatura.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });
  if (existente?.stripeCustomerId && existente.stripeCustomerId !== customerId) {
    // A linha já pertence a outro Customer: não troca o vínculo (alerta para o suporte).
    logger.error('[assinaturas] usuário já vinculado a outro Customer: assinatura não gravada', {
      userId,
      customerId,
      customerDaLinha: existente.stripeCustomerId,
    });
    return SEM_USUARIO;
  }

  await prisma.assinatura.upsert({
    where: { userId },
    create: { userId, stripeCustomerId: customerId, ...dados },
    update: { stripeCustomerId: customerId, ...dados },
  });
  return { userId, subscriptionId: principal.id, status: principal.status, canceladas };
}
