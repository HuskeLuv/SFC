/**
 * Customer do Stripe por usuário e cancelamento na exclusão de conta (ClickUp 86e2zkhe2).
 *
 * Anti-duplicidade (desenho, revisão): a linha `assinaturas` é upsertada por userId (unique)
 * ANTES de criar o Customer, e o Customer nasce com idempotencyKey `customer:${userId}`. Dois
 * cliques ou duas abas chegam no mesmo Customer; o webhook depois acha o dono pela linha.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { obterStripe } from '@/lib/stripe';
import { assinaturasHabilitadas, stripeSecretKey } from '@/lib/assinaturasConfig';
import { ApiError } from '@/utils/apiErrorHandler';
import { EMAIL_SUPORTE } from '@/content/faq';
import { invalidarPlano } from '@/services/planos/resolverPlano';
import { STATUS_TERMINAIS } from '@/services/assinaturas/sincronizar';

export interface DadosCustomer {
  userId: string;
  email: string;
  name: string | null;
}

/** stripeCustomerId do usuário, criando o Customer (e a linha) na primeira vez. */
export async function garantirCustomer({ userId, email, name }: DadosCustomer): Promise<string> {
  const linha = await prisma.assinatura.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { stripeCustomerId: true },
  });
  if (linha.stripeCustomerId) return linha.stripeCustomerId;

  const customer = await obterStripe().customers.create(
    { email, name: name ?? undefined, metadata: { userId } },
    { idempotencyKey: `customer:${userId}` },
  );
  // Só grava se ninguém gravou antes (a outra aba recebeu o MESMO Customer pela idempotência).
  await prisma.assinatura.updateMany({
    where: { userId, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export const MENSAGEM_FALHA_CANCELAMENTO = `Não conseguimos cancelar sua assinatura agora. Tente excluir a conta de novo em alguns minutos ou fale com o suporte em ${EMAIL_SUPORTE}.`;

/**
 * Exclusão de conta (LGPD): cancela no Stripe toda assinatura não encerrada do Customer, na hora
 * e sem reembolso automático, ANTES de anonimizar. Falha no Stripe = ApiError 503 (a conta fica
 * intacta, mesmo padrão do Pluggy). A linha local fica 'canceled'; o Customer é retido (prazo
 * fiscal). Sem STRIPE_SECRET_KEY e com a chave desligada não toca no banco (app como hoje).
 * Devolve quantas assinaturas foram canceladas.
 */
export async function cancelarAssinaturasDaConta(userId: string): Promise<number> {
  if (!assinaturasHabilitadas() && !stripeSecretKey()) return 0;

  const linha = await prisma.assinatura.findUnique({
    where: { userId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!linha?.stripeCustomerId) return 0;

  let canceladas = 0;
  try {
    const stripe = obterStripe();
    const lista = await stripe.subscriptions.list({
      customer: linha.stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    for (const sub of lista.data) {
      if (STATUS_TERMINAIS.includes(sub.status)) continue;
      await stripe.subscriptions.cancel(sub.id, {}, { idempotencyKey: `cancel-conta:${sub.id}` });
      canceladas++;
    }
  } catch (error: unknown) {
    logger.error('[assinaturas] exclusão da conta: não cancelou a assinatura', {
      userId,
      msg: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError(503, MENSAGEM_FALHA_CANCELAMENTO);
  }

  await prisma.assinatura.update({
    where: { userId },
    data: { status: 'canceled', cancelAtPeriodEnd: false, carenciaAte: null },
  });
  invalidarPlano(userId);
  return canceladas;
}
