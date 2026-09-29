/**
 * Cliente do `web-push` — singleton por processo, no espírito de `lib/pluggy.ts`.
 *
 * Só roda em rotas/serviços Node (runtime 'nodejs'); nunca importar no
 * middleware (edge) nem em componentes cliente. A configuração (envs VAPID)
 * vive em `src/lib/push/pushConfig.ts`, que é edge-safe e NÃO importa o SDK.
 */
import webpush from 'web-push';
import { ApiError } from '@/utils/apiErrorHandler';
import { pushHabilitado, vapidPrivateKey, vapidPublicKey, vapidSubject } from './push/pushConfig';

let configurado = false;

export function getWebPush(): typeof webpush {
  if (!pushHabilitado()) {
    throw new ApiError(503, 'Web push desabilitado');
  }
  if (!configurado) {
    const publica = vapidPublicKey();
    const privada = vapidPrivateKey();
    if (!publica || !privada) throw new ApiError(503, 'Chaves VAPID ausentes');
    webpush.setVapidDetails(vapidSubject(), publica, privada);
    configurado = true;
  }
  return webpush;
}

/** Descarta a configuração aplicada (testes e troca de chaves em runtime). */
export function resetWebPush(): void {
  configurado = false;
}
