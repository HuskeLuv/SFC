/**
 * Contratos das assinaturas (Stripe, ClickUp 86e2zkhe2) compartilhados entre servidor e front.
 */
import type { Intervalo, Plano, PlanoPago } from '@/lib/planos';

/** Status da assinatura no Stripe, ou 'none' para a linha sem assinatura (só cortesia/Customer). */
export type StatusAssinatura =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'canceled'
  | 'paused'
  | 'none';

/**
 * De onde vem o plano efetivo:
 *  - 'assinatura': assinatura paga no Stripe
 *  - 'cortesia': cortesia manual da linha (equipe/QA)
 *  - 'legado': usuário criado antes de ASSINATURAS_CORTESIA_CORTE (até ASSINATURAS_CORTESIA_ATE)
 *  - 'lancamento': cadastro após o corte, até ASSINATURAS_LANCAMENTO_ATE
 *  - 'basic': nada acima, plano grátis
 *  - 'forcado': override de QA (PLANO_FORCADO / RELATORIO_PLANO_FORCADO)
 *  - 'desligado': ASSINATURAS_HABILITADAS desligada (todos Advanced, como hoje)
 *  - 'consultor': role admin/consultant (Advanced para si)
 */
export type OrigemPlano =
  | 'assinatura'
  | 'cortesia'
  | 'legado'
  | 'lancamento'
  | 'basic'
  | 'forcado'
  | 'desligado'
  | 'consultor';

/** Pedido de desistência (7 dias) mais recente do usuário. */
export interface PedidoArrependimentoMe {
  /** Protocolo exibido na tela (id do pedido). */
  protocolo: string;
  status: 'aberto' | 'atendido';
  /** ISO. */
  criadoEm: string;
  /** ISO, quando o suporte concluiu o reembolso. */
  atendidoEm: string | null;
}

/** Resposta de GET /api/assinaturas/me. Datas em ISO. */
export interface AssinaturaMe {
  /** Plano efetivo (o que vale nas telas). */
  plano: Plano;
  origem: OrigemPlano;
  /** Status da assinatura no Stripe ('none' sem assinatura). */
  status: StatusAssinatura;
  /** Plano pago da assinatura (independente do efetivo), null sem assinatura. */
  planoAssinatura: PlanoPago | null;
  intervalo: Intervalo | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Fim da cortesia/legado/lançamento que está valendo (null = sem data ou sem cortesia). */
  cortesiaAte: string | null;
  /** Só exibição: "atualize o pagamento até dd/mm" (past_due). */
  carenciaAte: string | null;
  /** Pode abrir o Checkout (false para consultor agindo pelo cliente e com assinatura ativa). */
  podeAssinar: boolean;
  /** Limite da janela de 7 dias do arrependimento; null fora da janela. */
  podeDesistirAte: string | null;
  pedidoArrependimento: PedidoArrependimentoMe | null;
  /** ASSINATURAS_HABILITADAS ligada. false = app como hoje (plano 'adv', origem 'desligado'). */
  habilitado: boolean;
}

/** Resposta de /me com a chave desligada (também é o que o front assume em 404/erro). */
export const ASSINATURA_ME_DESLIGADA: AssinaturaMe = {
  plano: 'adv',
  origem: 'desligado',
  status: 'none',
  planoAssinatura: null,
  intervalo: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cortesiaAte: null,
  carenciaAte: null,
  podeAssinar: false,
  podeDesistirAte: null,
  pedidoArrependimento: null,
  habilitado: false,
};

/** Códigos de erro de plano no corpo das respostas 403/429. */
export type CodigoErroPlano = 'plano_insuficiente' | 'limite_plano';

/**
 * Corpo JSON de 403 por plano (gate central / exigirPlano):
 * { error, codigo: 'plano_insuficiente', need, plano }.
 */
export interface ErroPlanoInsuficiente {
  error: string;
  codigo: 'plano_insuficiente';
  /** Plano exigido pela rota. */
  need: PlanoPago;
  /** Plano efetivo de quem pediu. */
  plano: Plano;
}

/** Corpo JSON de 403/429 por limite do plano (conexões Pluggy, mensagens da IA). */
export interface ErroLimitePlano {
  error: string;
  codigo: 'limite_plano';
  plano: Plano;
  limite: number;
  /** Ex.: 'conexoes' | 'ia'. */
  recurso: string;
}

/** Corpo de POST /api/assinaturas/checkout. */
export interface CheckoutAssinaturaBody {
  plano: PlanoPago;
  intervalo: Intervalo;
  aceiteTermos: true;
}

/** Resposta de POST /api/assinaturas/checkout e /portal (o front faz window.location.assign). */
export interface UrlRedirecionamento {
  url: string;
}
