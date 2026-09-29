/**
 * Envio de web push a partir de uma Notification recém-criada (PWA fase 5,
 * fatia A). O shape do payload, as categorias, as tags, os TTLs e o deep link
 * vêm SEMPRE de `src/lib/push/contract.ts` — fonte única do contrato.
 *
 * SÍNCRONO best-effort, sem fila/cron novo (decisão da spec): ~1.000 DAU num
 * Node longevo no Lightsail, todas as fontes já são best-effort e o TTL do
 * web-push delega o retry ao push service. Falha de push NUNCA falha a
 * criação da Notification — o gancho nas fontes é `void enviarPushDaNotificacao(...)`
 * e este módulo nunca lança.
 *
 * O import do contract é DINÂMICO de propósito: o contract importa as
 * constantes de type das MESMAS fontes que chamam este serviço
 * (orcamentoAlertas, lembretes, notificacoes). Um import estático fecharia o
 * ciclo fonte → enviarPush → contract → fonte, com TDZ na avaliação do
 * CATEGORIA_POR_TYPE quando a fonte é o entry point.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { pushHabilitado } from '@/lib/push/pushConfig';
import { getWebPush } from '@/lib/webPush';
import type { PushPayloadV1 } from '@/lib/push/contract';

/** Subconjunto da Notification que o envio usa — o registro criado serve direto. */
export interface NotificacaoCriada {
  id: string;
  userId: string;
  type: string;
  title: string;
  metadata?: unknown;
}

const metadataComoObjeto = (metadata: unknown): Record<string, unknown> | null =>
  typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;

const statusCodeDoErro = (error: unknown): number | null => {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : null;
};

/**
 * Envia o push da notificação para TODOS os aparelhos assinados do usuário,
 * respeitando a PushPreferencia por categoria (sem registro = tudo ligado —
 * o gate vale para todo envio, cron incluído). Endpoint morto (404/410 do
 * push service) é apagado na primeira falha; qualquer outro erro só loga.
 *
 * Consultor agindo pelo cliente: o push espelha o sino 1:1 (decisão 5) — a
 * notificação criada em nome do cliente vai para os aparelhos DO CLIENTE,
 * que é o dono do `userId` dela.
 */
export async function enviarPushDaNotificacao(notificacao: NotificacaoCriada): Promise<void> {
  try {
    if (!notificacao?.id || !pushHabilitado()) return;

    const {
      categoriaDaNotificacao,
      corpoGenerico,
      deepLinkDaNotificacao,
      tagDaNotificacao,
      TTL_SEGUNDOS_POR_CATEGORIA,
    } = await import('@/lib/push/contract');

    const categoria = categoriaDaNotificacao(notificacao.type);
    if (!categoria) return; // type fora do contrato NÃO envia

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: notificacao.userId },
    });
    if (subscriptions.length === 0) return;

    const preferencia = await prisma.pushPreferencia.findUnique({
      where: { userId: notificacao.userId },
    });
    if (preferencia && !preferencia[categoria]) return;

    const metadata = metadataComoObjeto(notificacao.metadata);
    const payload: PushPayloadV1 = {
      v: 1,
      categoria,
      // Título REAL do sino (sem R$ — verificado nas fontes); a `message`,
      // que embute valores, NUNCA sai no payload (LGPD, decisão 1).
      title: notificacao.title,
      body: corpoGenerico(categoria),
      url: deepLinkDaNotificacao(notificacao.type, metadata),
      tag: tagDaNotificacao(notificacao.type, metadata, notificacao.id),
      notificationId: notificacao.id,
    };
    const json = JSON.stringify(payload);
    const ttl = TTL_SEGUNDOS_POR_CATEGORIA[categoria];
    const webpush = getWebPush();

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            json,
            { TTL: ttl, urgency: 'normal' },
          );
        } catch (error: unknown) {
          const statusCode = statusCodeDoErro(error);
          if (statusCode === 404 || statusCode === 410) {
            // Assinatura morta: o push service não a conhece mais.
            try {
              await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
            } catch {
              // já removida por um envio concorrente — nada a fazer
            }
          } else {
            // Nunca logar o `error` cru: WebPushError carrega o endpoint (URL-capacidade).
            logger.error('[push] envio falhou para uma assinatura:', {
              notificationId: notificacao.id,
              subscriptionId: sub.id,
              statusCode,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }),
    );
  } catch (error: unknown) {
    // Best-effort de verdade: nada daqui propaga para a mutação que criou a Notification.
    logger.error('[push] enviarPushDaNotificacao falhou:', {
      notificationId: notificacao?.id,
      error,
    });
  }
}
