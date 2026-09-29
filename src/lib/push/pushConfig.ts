/**
 * Configuração do web push (PWA fase 5) — edge-safe, no espírito de
 * `pluggyConfig`: só lê variáveis de ambiente, NÃO importa `web-push` (o SDK
 * Node vive em `src/lib/webPush.ts`, fatia A).
 *
 * Variáveis (sem NEXT_PUBLIC — o build roda no runner sem secrets; a chave
 * pública viaja no GET /api/push/preferencias):
 *  - WEB_PUSH_HABILITADO="true"  liga o envio e as rotas /api/push/*
 *  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  par VAPID (npx web-push generate-vapid-keys)
 *  - VAPID_SUBJECT  contato do emissor (default mailto do suporte)
 */

export function vapidPublicKey(): string | null {
  const chave = process.env.VAPID_PUBLIC_KEY?.trim();
  return chave ? chave : null;
}

export function vapidPrivateKey(): string | null {
  const chave = process.env.VAPID_PRIVATE_KEY?.trim();
  return chave ? chave : null;
}

export function vapidSubject(): string {
  const subject = process.env.VAPID_SUBJECT?.trim();
  return subject ? subject : 'mailto:suporte@appmyfinance.com.br';
}

/** Flag + chaves presentes, no mesmo espírito de `pluggyHabilitado()`. */
export function pushHabilitado(): boolean {
  return (
    process.env.WEB_PUSH_HABILITADO === 'true' &&
    vapidPublicKey() !== null &&
    vapidPrivateKey() !== null
  );
}
