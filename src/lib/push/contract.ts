/**
 * Contrato ÚNICO do web push (PWA fase 5, fatia 0).
 *
 * Este arquivo é a única fonte do shape do payload, das categorias, das tags,
 * dos TTLs e do deep link. As fatias A (envio no servidor), B (service worker)
 * e C (UI de opt-in) referenciam ESTE arquivo — nunca cópias.
 *
 * LGPD (decisão do Wellington, 29/09/2026): o push leva o `Notification.title`
 * REAL (verificado: `tituloEMensagem` do orçamento e `textoDoLembrete` da
 * agenda só formatam R$ na `message`) + um corpo GENÉRICO por categoria. A
 * `message` do sino — que embute valores em R$ — NUNCA sai no payload.
 *
 * ## Contrato HTTP (rotas da fatia A)
 *
 * POST /api/push/subscriptions
 *   body { endpoint: string (url https), keys: { p256dh: string, auth: string },
 *          userAgent?: string } → 204. Upsert por `endpoint` (endpoint é a
 *   identidade da assinatura; re-POST reconcilia rotação de endpoint do
 *   navegador e reassocia ao usuário da SESSÃO — nunca ao cliente personificado).
 *
 * GET /api/push/subscriptions
 *   → { subscriptions: [{ id: string, rotulo: string (derivado do userAgent,
 *   ex. 'Chrome · computador'), criadoEm: string, endpoint: string }] }.
 *   O endpoint vai na resposta só para o cliente marcar "este aparelho".
 *
 * DELETE /api/push/subscriptions
 *   body { endpoint: string } → 204. Remove a assinatura DESTE aparelho.
 *
 * DELETE /api/push/subscriptions/[id]
 *   → 204. Remove um aparelho REMOTO da lista do Perfil; exige que a
 *   assinatura pertença ao userId da sessão.
 *
 * GET /api/push/preferencias
 *   → { habilitado: boolean, vapidPublicKey: string | null,
 *       categorias: { orcamento, agenda, comunidade, conta }: boolean,
 *       comunidadeVisivel: boolean }. Sem registro = tudo ligado. A chave
 *   pública VAPID viaja aqui (envs sem NEXT_PUBLIC: o build roda sem secrets).
 *
 * PATCH /api/push/preferencias
 *   body parcial { orcamento?, agenda?, comunidade?, conta?: boolean } → 204.
 *   Linha criada sob demanda, no molde da AgendaPreferencia.
 *
 * Todas as rotas usam a SESSÃO (`requireSession`), nunca
 * `requireAuthWithActing`: consultor personificando jamais assina push como o
 * cliente. Mutações exigem CSRF (`csrfFetch`).
 */
import { ORCAMENTO_ALERTA_TYPE } from '@/services/cashflow/orcamentoAlertas';
import { AGENDA_LEMBRETE_TYPE } from '@/services/calendario/lembretes';
import {
  COMUNIDADE_COMENTARIO_TYPE,
  COMUNIDADE_MODERACAO_TYPE,
} from '@/services/comunidade/notificacoes';

export type CategoriaPush = 'orcamento' | 'agenda' | 'comunidade' | 'conta';

/** Types de Notification dos convites de consultoria (strings literais nas rotas). */
export const CONSULTANT_INVITE_TYPE = 'consultant_invite';
export const CONSULTANT_INVITE_RESPONSE_TYPE = 'consultant_invite_response';

/**
 * Categoria de push por `Notification.type`, usando as constantes exportadas
 * pelos serviços reais. Type fora deste mapa NÃO envia push.
 */
export const CATEGORIA_POR_TYPE: Readonly<Record<string, CategoriaPush>> = {
  [ORCAMENTO_ALERTA_TYPE]: 'orcamento',
  [AGENDA_LEMBRETE_TYPE]: 'agenda',
  [COMUNIDADE_COMENTARIO_TYPE]: 'comunidade',
  [COMUNIDADE_MODERACAO_TYPE]: 'comunidade',
  [CONSULTANT_INVITE_TYPE]: 'conta',
  [CONSULTANT_INVITE_RESPONSE_TYPE]: 'conta',
};

/** null = type desconhecido: não envia push. */
export function categoriaDaNotificacao(type: string): CategoriaPush | null {
  return CATEGORIA_POR_TYPE[type] ?? null;
}

/**
 * Payload v1 — o que a fatia A serializa em `webpush.sendNotification` e a
 * fatia B (sw.js) desserializa no handler de `push`.
 */
export interface PushPayloadV1 {
  v: 1;
  categoria: CategoriaPush;
  /** `Notification.title` real — sem R$ e sem números de conta (verificado nas fontes). */
  title: string;
  /** SEMPRE `corpoGenerico(categoria)` — NUNCA a `Notification.message` (embute R$). */
  body: string;
  /** Deep link relativo (same-origin), de `deepLinkDaNotificacao`. */
  url: string;
  /** Tag de substituição, de `tagDaNotificacao`. */
  tag: string;
  notificationId: string;
}

/**
 * TTL do push por categoria (segundos). Categoria conta = 7 DIAS — decisão do
 * Wellington (fase5-decisoes.md): o convite segue acionável por dias.
 */
export const TTL_SEGUNDOS_POR_CATEGORIA: Readonly<Record<CategoriaPush, number>> = {
  orcamento: 86400,
  agenda: 43200,
  comunidade: 86400,
  conta: 604800,
};

/** Corpo genérico por categoria — nunca leva valores nem texto livre. */
export function corpoGenerico(categoria: CategoriaPush): string {
  switch (categoria) {
    case 'agenda':
      return 'Toque para ver os detalhes na agenda.';
    case 'comunidade':
      return 'Toque para ver os detalhes na comunidade.';
    default:
      return 'Toque para ver os detalhes no app.';
  }
}

const chaveDeTag = (metadata: Record<string, unknown> | null | undefined): string | null => {
  if (!metadata) return null;
  for (const campo of ['groupId', 'eventoId', 'postId', 'inviteId']) {
    const valor = metadata[campo];
    if (typeof valor === 'string' && valor.length > 0) return valor;
  }
  return null;
};

/**
 * Tag de substituição: `mf-<categoria>-<groupId|eventoId|postId|inviteId>`,
 * caindo para o notificationId quando o metadata não tem chave de grupo.
 * POR GRUPO/EVENTO de propósito: a escalada de rank do mesmo grupo do
 * orçamento (3 níveis/grupo/mês, orcamentoAlertas.ts) SUBSTITUI o aviso
 * anterior em vez de empilhar.
 */
export function tagDaNotificacao(
  type: string,
  metadata: Record<string, unknown> | null | undefined,
  notificationId: string,
): string {
  const categoria = categoriaDaNotificacao(type) ?? 'conta';
  return `mf-${categoria}-${chaveDeTag(metadata) ?? notificationId}`;
}

/** Aceita só caminho relativo same-origin: começa com '/' e não com '//'. */
const hrefValido = (href: unknown): href is string =>
  typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');

/**
 * Deep link do toque na notificação (mesma regra de validação do
 * `hrefDaNotificacao` do NotificationDropdown): caminho relativo same-origin,
 * nunca URL absoluta — '//evil.com' e 'https://…' caem no fallback '/'.
 */
export function deepLinkDaNotificacao(
  type: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (type === ORCAMENTO_ALERTA_TYPE) return '/fluxodecaixa?modo=orcamento';
  if (type === AGENDA_LEMBRETE_TYPE) return '/calendario';
  const href = metadata?.href;
  return hrefValido(href) ? href : '/';
}
