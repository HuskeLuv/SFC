/**
 * Cliente de web push (PWA fase 5, fatia 0).
 *
 * Assinatura, cancelamento e sincronização da PushSubscription deste
 * aparelho, sempre via `csrfFetch` (as rotas de push exigem CSRF e sessão).
 * Tudo defensivo, no espírito do `swClient`: navegador sem suporte, SW ausente
 * ou storage bloqueado nunca quebram o app.
 *
 * REGRA (LGPD/UX): `Notification.requestPermission()` SÓ acontece dentro de
 * `assinarPush`, que a UI chama exclusivamente em resposta a um gesto do
 * usuário (clique no Perfil ou no PushInviteSheet) — nunca em useEffect,
 * login ou carga de página.
 */

export type CsrfFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const PUSH_SUBSCRIPTIONS_URL = '/api/push/subscriptions';

export type ResultadoAssinatura = 'ok' | 'negado' | 'erro';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

const emStandalone = (): boolean => {
  try {
    const displayStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    return displayStandalone || window.navigator.standalone === true;
  } catch {
    return false;
  }
};

/**
 * iOS/iPadOS fora do app instalado: o Safari só libera web push dentro do PWA
 * na tela de início. Inclui a heurística do iPad "desktop-class" (crítica 8):
 * o iPadOS se apresenta como MacIntel, mas com tela de toque
 * (maxTouchPoints > 1). A UI usa isto para mostrar a orientação de instalar
 * ANTES de tentar assinar — e trata 'erro' do assinarPush com a MESMA
 * orientação, como rede de segurança quando a detecção falha.
 */
export function isIosSemPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaIos = /iPad|iPhone|iPod/.test(ua);
  const ipadComoMac = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  if (!uaIos && !ipadComoMac) return false;
  return !emStandalone();
}

export function permissaoAtual(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Chave VAPID base64url → Uint8Array (formato que o PushManager exige). */
function chaveVapidParaBytes(chaveBase64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (chaveBase64Url.length % 4)) % 4);
  const base64 = (chaveBase64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** POST da assinatura (upsert por endpoint no servidor). true = servidor aceitou. */
async function enviarAssinatura(
  subscription: PushSubscription,
  csrfFetch: CsrfFetch,
): Promise<boolean> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  try {
    const response = await csrfFetch(PUSH_SUBSCRIPTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent || undefined,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * SHA-256 base64 do endpoint local — o GET /api/push/subscriptions só devolve o hash
 * (endpoint é URL-capacidade; QA segurança da fase 5). null = sem crypto.subtle
 * (contexto inseguro): apenas o selo "este aparelho" deixa de aparecer.
 */
export async function hashDoEndpoint(endpoint: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  } catch {
    return null;
  }
}

/**
 * Assina o push DESTE aparelho. Chamar SOMENTE em resposta a gesto do usuário
 * (o requestPermission vive aqui dentro, e só aqui).
 * 'negado' = a pessoa recusou (ou já tinha recusado) a permissão;
 * 'erro' = sem suporte/SW/chave — a UI mostra a orientação de instalação.
 */
export async function assinarPush(
  vapidPublicKey: string,
  csrfFetch: CsrfFetch,
): Promise<ResultadoAssinatura> {
  if (!isPushSupported() || !vapidPublicKey) return 'erro';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'negado';
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'erro';
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveVapidParaBytes(vapidPublicKey) as BufferSource,
      }));
    return (await enviarAssinatura(subscription, csrfFetch)) ? 'ok' : 'erro';
  } catch {
    return 'erro';
  }
}

/**
 * Cancela a assinatura DESTE aparelho: apaga no servidor (DELETE por
 * endpoint) e desinscreve no navegador. true = não há mais assinatura ativa
 * aqui (mesmo que o servidor tenha falhado, o unsubscribe local vale).
 */
export async function cancelarAssinatura(csrfFetch: CsrfFetch): Promise<boolean> {
  if (!isPushSupported()) return true;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;
    try {
      await csrfFetch(PUSH_SUBSCRIPTIONS_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      // best-effort: a linha órfã morre no 404/410 do próximo envio
    }
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}

/**
 * Reconciliação na abertura do app (chamada única, no ServiceWorkerRegistrar):
 * se a permissão está concedida e existe assinatura local, re-POSTa (upsert
 * por endpoint) — cobre a rotação de endpoint feita pelo navegador, que o SW
 * não consegue avisar sozinho (ele não tem o token CSRF). Sem permissão ou
 * sem assinatura, não faz nada — jamais pede permissão aqui.
 */
export async function sincronizarAssinaturaSeAtiva(csrfFetch: CsrfFetch): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await enviarAssinatura(subscription, csrfFetch);
  } catch {
    // silencioso: sincronização é best-effort
  }
}
