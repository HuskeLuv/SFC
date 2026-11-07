/**
 * Operações das rotas /api/assinaturas/* (ClickUp 86e2zkhe2): Checkout hospedado, Portal,
 * estado do /me, sincronização pelo session_id e o pedido de arrependimento (7 dias).
 *
 * Nada aqui olha a chave ASSINATURAS_HABILITADAS: as rotas respondem 404 antes de chamar.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { obterStripe, type Stripe } from '@/lib/stripe';
import {
  assinaturasAppUrl,
  cupomOfertaAnual,
  priceDe,
  precoParaPlano,
} from '@/lib/assinaturasConfig';
import { ehIntervalo, maxPlano, ofertaVigente, type Intervalo, type PlanoPago } from '@/lib/planos';
import type { Assinatura } from '@prisma/client';
import { ApiError } from '@/utils/apiErrorHandler';
import { enviarPushDaNotificacao } from '@/services/push/enviarPush';
import {
  ASSINATURA_ARREPENDIMENTO_ADMIN_TYPE,
  ASSINATURA_ARREPENDIMENTO_TYPE,
  ASSINATURA_PAGAMENTO_FALHOU_TYPE,
} from '@/lib/push/contract';
import type {
  AssinaturaMe,
  PedidoArrependimentoMe,
  StatusAssinatura,
  UrlRedirecionamento,
} from '@/types/assinatura';
import {
  invalidarPlano,
  planoDoUsuario,
  resolverAssinatura,
} from '@/services/planos/resolverPlano';
import { garantirCustomer } from '@/services/assinaturas/customer';
import {
  STATUS_BLOQUEIA_CHECKOUT,
  idDe,
  sincronizarAssinatura,
} from '@/services/assinaturas/sincronizar';
import { STATUS_COM_ACESSO } from '@/services/planos/planoEfetivo';

/**
 * Versão dos Termos aceita no Checkout (UserConsent 'terms-of-sale'). Acompanha a versão da
 * página /termos-de-uso (`termsVersion` do SignUpForm); subir junto quando o §7 mudar.
 */
export const VERSAO_TERMOS_VENDA = '2.0';

/** Janela do direito de arrependimento (Decreto 7.962/2013, art. 5º; CDC art. 49). */
export const ARREPENDIMENTO_DIAS = 7;

/** Prazo do reembolso informado ao usuário no pedido de desistência. */
export const ARREPENDIMENTO_PRAZO_DIAS_UTEIS = 5;

/** Types de Notification das assinaturas (push na categoria 'conta', em src/lib/push/contract). */
export const NOTIFICACAO_ARREPENDIMENTO_TYPE = ASSINATURA_ARREPENDIMENTO_TYPE;
export const NOTIFICACAO_ARREPENDIMENTO_ADMIN_TYPE = ASSINATURA_ARREPENDIMENTO_ADMIN_TYPE;
export const NOTIFICACAO_PAGAMENTO_FALHOU_TYPE = ASSINATURA_PAGAMENTO_FALHOU_TYPE;

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Checkout e Portal
// ---------------------------------------------------------------------------

export interface PedidoCheckout {
  userId: string;
  email: string;
  name: string | null;
  plano: PlanoPago;
  intervalo: Intervalo;
  agora?: Date;
}

export interface ResultadoCheckout extends UrlRedirecionamento {
  /** 'portal' = já havia assinatura viva no Customer (anti-duplicidade). */
  destino: 'checkout' | 'portal';
}

/** Sessão do Portal do Stripe (pagamento, faturas, troca de plano e cancelamento). */
export async function criarSessaoPortal(customerId: string): Promise<UrlRedirecionamento> {
  const sessao = await obterStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${assinaturasAppUrl()}/profile`,
  });
  return { url: sessao.url };
}

/**
 * Checkout hospedado (mode subscription, BRL, só cartão). Se o Customer já tiver assinatura
 * active/trialing/past_due/incomplete, devolve o Portal em vez de uma sessão nova. O cupom da
 * Black Friday é decidido AQUI: só no anual e só com a oferta vigente; anual na oferta sem o cupom
 * no env = 503 (nunca cobrar acima do preço anunciado).
 */
export async function criarSessaoCheckout(pedido: PedidoCheckout): Promise<ResultadoCheckout> {
  const agora = pedido.agora ?? new Date();
  const price = priceDe(pedido.plano, pedido.intervalo);
  if (!price) {
    logger.error('[assinaturas] Price não configurado', {
      plano: pedido.plano,
      intervalo: pedido.intervalo,
    });
    throw new ApiError(503, 'Este plano está indisponível no momento. Tente mais tarde.');
  }

  // As telas anunciam o anual com desconto só pela data (ofertaVigente). Sem o cupom no env, o
  // Checkout cobraria o preço cheio, acima do anunciado (CDC): recusa como erro de configuração.
  const cupom =
    pedido.intervalo === 'ano' && ofertaVigente(agora) ? cupomOfertaAnual(pedido.plano) : null;
  if (pedido.intervalo === 'ano' && ofertaVigente(agora) && !cupom) {
    logger.error('[assinaturas] Oferta vigente sem cupom configurado', { plano: pedido.plano });
    throw new ApiError(503, 'Este plano está indisponível no momento. Tente mais tarde.');
  }

  const customer = await garantirCustomer(pedido);
  const stripe = obterStripe();

  const existentes = await stripe.subscriptions.list({ customer, status: 'all', limit: 10 });
  if (existentes.data.some((s) => STATUS_BLOQUEIA_CHECKOUT.includes(s.status))) {
    return { ...(await criarSessaoPortal(customer)), destino: 'portal' };
  }

  const app = assinaturasAppUrl();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer,
    client_reference_id: pedido.userId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { userId: pedido.userId, plano: pedido.plano } },
    metadata: { userId: pedido.userId, plano: pedido.plano, intervalo: pedido.intervalo },
    locale: 'pt-BR',
    // Só cartão (a endive trocou payment_method_types por allowed_payment_method_types).
    allowed_payment_method_types: ['card'],
    consent_collection: { terms_of_service: 'required' },
    success_url: `${app}/planos/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${app}/planos?checkout=cancelado`,
  };
  // allow_promotion_codes e discounts são exclusivos no Stripe: com cupom vai só discounts.
  if (cupom) params.discounts = [{ coupon: cupom }];
  else params.allow_promotion_codes = false;

  const minuto = Math.floor(agora.getTime() / 60_000);
  const sessao = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `checkout:${pedido.userId}:${price}:${minuto}`,
  });
  if (!sessao.url) throw new ApiError(502, 'O Stripe não devolveu o endereço do pagamento');
  return { url: sessao.url, destino: 'checkout' };
}

// ---------------------------------------------------------------------------
// /me: sincronização pelo session_id e estado
// ---------------------------------------------------------------------------

const RE_SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;

/**
 * Retorno do Checkout (/planos/sucesso?session_id=): sincroniza a assinatura SÓ se a sessão é do
 * próprio requisitante (client_reference_id === userId E customer === stripeCustomerId da linha
 * dele). Qualquer outra coisa é ignorada sem erro. Devolve true se sincronizou.
 */
export async function sincronizarSessaoDoDono(userId: string, sessionId: string): Promise<boolean> {
  if (!RE_SESSION_ID.test(sessionId)) return false;
  const linha = await prisma.assinatura.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });
  if (!linha?.stripeCustomerId) return false;

  let sessao: Stripe.Checkout.Session;
  try {
    sessao = await obterStripe().checkout.sessions.retrieve(sessionId);
  } catch (error: unknown) {
    logger.warn('[assinaturas] /me: session_id não encontrado no Stripe', {
      msg: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  if (sessao.client_reference_id !== userId || idDe(sessao.customer) !== linha.stripeCustomerId) {
    logger.warn('[assinaturas] /me: session_id de outro usuário ignorado', { userId });
    return false;
  }
  const subscriptionId = idDe(sessao.subscription);
  if (!subscriptionId) return false;

  const resultado = await sincronizarAssinatura(subscriptionId);
  if (resultado.userId) invalidarPlano(resultado.userId);
  return resultado.userId === userId;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function comoStatus(status: string | null | undefined): StatusAssinatura {
  return (status ?? 'none') as StatusAssinatura;
}

/** Fim da janela de 7 dias, ou null se a assinatura atual não está nela. */
export function fimJanelaArrependimento(
  linha: Pick<Assinatura, 'primeiraCobrancaEm' | 'status' | 'stripeSubscriptionId'> | null,
  agora: Date,
): Date | null {
  if (!linha?.primeiraCobrancaEm || !linha.stripeSubscriptionId) return null;
  if (!STATUS_COM_ACESSO.includes(linha.status)) return null;
  const fim = new Date(linha.primeiraCobrancaEm.getTime() + ARREPENDIMENTO_DIAS * DIA_MS);
  return agora.getTime() < fim.getTime() ? fim : null;
}

function pedidoMe(pedido: {
  id: string;
  status: string;
  createdAt: Date;
  atendidoEm: Date | null;
}): PedidoArrependimentoMe {
  return {
    protocolo: pedido.id,
    status: pedido.status === 'atendido' ? 'atendido' : 'aberto',
    criadoEm: pedido.createdAt.toISOString(),
    atendidoEm: iso(pedido.atendidoEm),
  };
}

export interface ContextoMe {
  /** Dono dos dados (targetUserId). */
  userId: string;
  /** Quem pediu (payload.id); diferente de userId = consultor agindo pelo cliente. */
  requisitanteId: string;
  agora?: Date;
}

/**
 * Monta o AssinaturaMe (com a chave ligada) a partir de resolverAssinatura. Consultor agindo pelo
 * cliente: vê o estado do cliente só para leitura (origem 'consultor', plano = max(cliente,
 * consultor), sem assinar nem desistir).
 */
export async function montarAssinaturaMe({
  userId,
  requisitanteId,
  agora = new Date(),
}: ContextoMe): Promise<AssinaturaMe> {
  const agindo = requisitanteId !== userId;
  const resolucao = await resolverAssinatura(userId, { agora });
  const linha = resolucao.assinatura;
  const status = comoStatus(linha?.status);
  // Só o pedido da assinatura ATUAL: o de uma compra anterior (já desistida e reembolsada) não
  // pode esconder o botão nem aparecer como se fosse desta compra (Decreto 7.962, art. 5º).
  const pedidoDestaAssinatura = linha?.stripeSubscriptionId
    ? await prisma.assinaturaPedido.findFirst({
        where: {
          userId,
          tipo: 'arrependimento',
          stripeSubscriptionId: linha.stripeSubscriptionId,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true, atendidoEm: true },
      })
    : null;

  const fimJanela = fimJanelaArrependimento(linha, agora);

  const plano = agindo
    ? maxPlano(resolucao.plano, await planoDoUsuario(requisitanteId))
    : resolucao.plano;
  const origem = agindo ? 'consultor' : resolucao.origem;
  const comAcessoGratis = ['cortesia', 'legado', 'lancamento'].includes(resolucao.origem);

  return {
    plano,
    origem,
    status,
    planoAssinatura: linha?.stripeSubscriptionId
      ? (precoParaPlano(linha.stripePriceId)?.plano ?? null)
      : null,
    intervalo: ehIntervalo(linha?.intervalo) ? linha.intervalo : null,
    currentPeriodEnd: iso(linha?.currentPeriodEnd),
    cancelAtPeriodEnd: linha?.cancelAtPeriodEnd ?? false,
    cortesiaAte: comAcessoGratis ? iso(resolucao.acessoAte) : null,
    carenciaAte: status === 'past_due' ? iso(linha?.carenciaAte) : null,
    podeAssinar: !agindo && !STATUS_BLOQUEIA_CHECKOUT.includes(status),
    podeDesistirAte: !agindo && !pedidoDestaAssinatura ? iso(fimJanela) : null,
    pedidoArrependimento: pedidoDestaAssinatura ? pedidoMe(pedidoDestaAssinatura) : null,
    habilitado: true,
  };
}

// ---------------------------------------------------------------------------
// Arrependimento (7 dias)
// ---------------------------------------------------------------------------

export interface ResultadoArrependimento extends PedidoArrependimentoMe {
  /** Texto de confirmação exibido na tela (art. 5º §4º: confirmação imediata). */
  mensagem: string;
  /** false = o pedido já existia (clique repetido). */
  novo: boolean;
}

export function mensagemArrependimento(protocolo: string): string {
  return `Recebemos seu pedido de desistência (protocolo ${protocolo}). O reembolso integral será feito em até ${ARREPENDIMENTO_PRAZO_DIAS_UTEIS} dias úteis e a assinatura será encerrada.`;
}

async function notificar(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, string>;
}): Promise<void> {
  try {
    const notificacao = await prisma.notification.create({ data });
    await enviarPushDaNotificacao(notificacao);
  } catch (error: unknown) {
    logger.error('[assinaturas] falha ao notificar', {
      type: data.type,
      msg: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Registra a desistência (só até 7 dias após a 1ª cobrança paga da assinatura atual), avisa o
 * usuário no sininho e todo admin (sininho + push). O suporte faz refund + cancel no Dashboard;
 * o webhook (charge.refunded) fecha o pedido. Pedido repetido devolve o que já existe.
 */
export async function registrarArrependimento(
  userId: string,
  agora: Date = new Date(),
): Promise<ResultadoArrependimento> {
  const linha = await prisma.assinatura.findUnique({ where: { userId } });
  if (!linha?.stripeSubscriptionId || !linha.primeiraCobrancaEm) {
    throw new ApiError(409, 'Não há compra paga para desistir.');
  }

  const existente = await prisma.assinaturaPedido.findFirst({
    where: { userId, tipo: 'arrependimento', stripeSubscriptionId: linha.stripeSubscriptionId },
    orderBy: { createdAt: 'desc' },
  });
  if (existente) {
    return {
      ...pedidoMe(existente),
      mensagem: mensagemArrependimento(existente.id),
      novo: false,
    };
  }

  if (!fimJanelaArrependimento(linha, agora)) {
    throw new ApiError(
      409,
      `O prazo de ${ARREPENDIMENTO_DIAS} dias para desistir terminou. Você pode cancelar a renovação em Gerenciar pagamento; o acesso segue até o fim do período.`,
    );
  }

  const pedido = await prisma.assinaturaPedido.create({
    data: {
      userId,
      tipo: 'arrependimento',
      status: 'aberto',
      stripeSubscriptionId: linha.stripeSubscriptionId,
    },
  });
  const mensagem = mensagemArrependimento(pedido.id);

  await notificar({
    userId,
    type: NOTIFICACAO_ARREPENDIMENTO_TYPE,
    title: 'Pedido de desistência recebido',
    message: mensagem,
    metadata: { protocolo: pedido.id, href: '/profile' },
  });
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  for (const admin of admins) {
    await notificar({
      userId: admin.id,
      type: NOTIFICACAO_ARREPENDIMENTO_ADMIN_TYPE,
      title: 'Novo pedido de desistência de assinatura',
      message: `Protocolo ${pedido.id}: reembolsar integralmente e cancelar a assinatura ${linha.stripeSubscriptionId} no Dashboard do Stripe em até ${ARREPENDIMENTO_PRAZO_DIAS_UTEIS} dias úteis.`,
      metadata: { protocolo: pedido.id, href: '/admin' },
    });
  }
  logger.info('[assinaturas] pedido de arrependimento registrado', {
    protocolo: pedido.id,
    userId,
    subscriptionId: linha.stripeSubscriptionId,
  });

  return { ...pedidoMe(pedido), mensagem, novo: true };
}

/** Webhook (charge.refunded): fecha os pedidos de arrependimento abertos do usuário. */
export async function fecharPedidosArrependimento(userId: string, agora: Date): Promise<number> {
  const { count } = await prisma.assinaturaPedido.updateMany({
    where: { userId, tipo: 'arrependimento', status: 'aberto' },
    data: { status: 'atendido', atendidoEm: agora },
  });
  return count;
}

/** Webhook (invoice.payment_failed): aviso ao usuário na 1ª e na última tentativa. */
export async function notificarPagamentoFalhou(
  userId: string,
  opts: { ultima: boolean; atualizarAte: Date | null },
): Promise<void> {
  const ate = opts.atualizarAte
    ? opts.atualizarAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;
  await notificar({
    userId,
    type: NOTIFICACAO_PAGAMENTO_FALHOU_TYPE,
    title: opts.ultima ? 'Não conseguimos cobrar sua assinatura' : 'Pagamento da assinatura falhou',
    message: opts.ultima
      ? 'Foi a última tentativa de cobrança. Atualize o cartão em Minha assinatura para não perder o acesso.'
      : `Atualize o cartão em Minha assinatura${ate ? ` até ${ate}` : ''} para manter o seu plano.`,
    metadata: { href: '/profile' },
  });
}
