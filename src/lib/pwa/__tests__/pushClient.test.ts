// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PUSH_SUBSCRIPTIONS_URL,
  assinarPush,
  cancelarAssinatura,
  isIosSemPwa,
  isPushSupported,
  permissaoAtual,
  sincronizarAssinaturaSeAtiva,
} from '../pushClient';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

const VAPID_KEY = 'BPn_test-key_123'; // 16 chars: base64url válido sem padding

let standalone = false;

function setNavigator(name: string, value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true });
}

function fakeSubscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function fakeRegistration(params: {
  existente?: PushSubscription | null;
  nova?: PushSubscription;
}) {
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(params.existente ?? null),
      subscribe: vi.fn().mockResolvedValue(params.nova ?? fakeSubscription('https://push/nova')),
    },
  };
  setNavigator('serviceWorker', {
    getRegistration: vi.fn().mockResolvedValue(registration),
  });
  return registration;
}

function stubNotification(
  permission: NotificationPermission,
  requestResult?: NotificationPermission,
) {
  const requestPermission = vi.fn().mockResolvedValue(requestResult ?? permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { requestPermission };
}

function csrfFetchStub(ok = true) {
  return vi.fn().mockResolvedValue({ ok } as Response);
}

beforeEach(() => {
  standalone = false;
  setNavigator('userAgent', ANDROID_UA);
  setNavigator('platform', 'Linux armv81');
  setNavigator('maxTouchPoints', 5);
  setNavigator('standalone', undefined);
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('standalone') ? standalone : false }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
});

describe('isPushSupported / permissaoAtual', () => {
  it('sem serviceWorker no navegador não há suporte e assinarPush devolve erro', async () => {
    stubNotification('default');
    // sem setNavigator('serviceWorker', …): navegador antigo
    expect(isPushSupported()).toBe(false);
    await expect(assinarPush(VAPID_KEY, csrfFetchStub())).resolves.toBe('erro');
  });

  it('sem Notification a permissão é unsupported', () => {
    expect(permissaoAtual()).toBe('unsupported');
    stubNotification('granted');
    expect(permissaoAtual()).toBe('granted');
  });
});

describe('isIosSemPwa', () => {
  it('iPhone no Safari (fora do app instalado) → true', () => {
    setNavigator('userAgent', IOS_UA);
    setNavigator('platform', 'iPhone');
    expect(isIosSemPwa()).toBe(true);
  });

  it('iPhone com o app instalado (standalone) → false', () => {
    setNavigator('userAgent', IOS_UA);
    setNavigator('platform', 'iPhone');
    standalone = true;
    expect(isIosSemPwa()).toBe(false);
    standalone = false;
    setNavigator('standalone', true); // navigator.standalone do Safari
    expect(isIosSemPwa()).toBe(false);
  });

  it('iPad "desktop-class" (MacIntel + maxTouchPoints > 1) → true', () => {
    setNavigator('userAgent', MAC_UA);
    setNavigator('platform', 'MacIntel');
    setNavigator('maxTouchPoints', 5);
    expect(isIosSemPwa()).toBe(true);
  });

  it('Mac de verdade (MacIntel sem toque) e Android → false', () => {
    setNavigator('userAgent', MAC_UA);
    setNavigator('platform', 'MacIntel');
    setNavigator('maxTouchPoints', 0);
    expect(isIosSemPwa()).toBe(false);
    setNavigator('userAgent', ANDROID_UA);
    setNavigator('platform', 'Linux armv81');
    setNavigator('maxTouchPoints', 5);
    expect(isIosSemPwa()).toBe(false);
  });
});

describe('assinarPush', () => {
  it('permissão negada → negado, sem tentar subscribe', async () => {
    const { requestPermission } = stubNotification('default', 'denied');
    const registration = fakeRegistration({});
    const fetchMock = csrfFetchStub();

    await expect(assinarPush(VAPID_KEY, fetchMock)).resolves.toBe('negado');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caminho feliz: requestPermission → subscribe → POST da assinatura', async () => {
    const { requestPermission } = stubNotification('default', 'granted');
    const nova = fakeSubscription('https://push.example/end-1');
    const registration = fakeRegistration({ nova });
    const fetchMock = csrfFetchStub();

    await expect(assinarPush(VAPID_KEY, fetchMock)).resolves.toBe('ok');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PUSH_SUBSCRIPTIONS_URL);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      endpoint: 'https://push.example/end-1',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
    });
  });

  it('reaproveita assinatura existente sem chamar subscribe de novo', async () => {
    stubNotification('granted', 'granted');
    const existente = fakeSubscription('https://push.example/ja-existe');
    const registration = fakeRegistration({ existente });
    const fetchMock = csrfFetchStub();

    await expect(assinarPush(VAPID_KEY, fetchMock)).resolves.toBe('ok');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('servidor recusando o POST → erro', async () => {
    stubNotification('default', 'granted');
    fakeRegistration({});
    await expect(assinarPush(VAPID_KEY, csrfFetchStub(false))).resolves.toBe('erro');
  });
});

describe('cancelarAssinatura', () => {
  it('apaga no servidor (DELETE por endpoint) e desinscreve no navegador', async () => {
    stubNotification('granted');
    const existente = fakeSubscription('https://push.example/end-2');
    fakeRegistration({ existente });
    const fetchMock = csrfFetchStub();

    await expect(cancelarAssinatura(fetchMock)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PUSH_SUBSCRIPTIONS_URL);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'https://push.example/end-2' });
    expect(existente.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('sem assinatura ativa não chama o servidor', async () => {
    stubNotification('granted');
    fakeRegistration({});
    const fetchMock = csrfFetchStub();
    await expect(cancelarAssinatura(fetchMock)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sincronizarAssinaturaSeAtiva', () => {
  it('reconcilia endpoint novo re-POSTando a assinatura existente', async () => {
    stubNotification('granted');
    const rotacionada = fakeSubscription('https://push.example/endpoint-rotacionado');
    fakeRegistration({ existente: rotacionada });
    const fetchMock = csrfFetchStub();

    await sincronizarAssinaturaSeAtiva(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PUSH_SUBSCRIPTIONS_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).endpoint).toBe(
      'https://push.example/endpoint-rotacionado',
    );
  });

  it('sem permissão concedida NÃO pede permissão nem fala com o servidor', async () => {
    const { requestPermission } = stubNotification('default');
    fakeRegistration({ existente: fakeSubscription('https://push.example/x') });
    const fetchMock = csrfFetchStub();

    await sincronizarAssinaturaSeAtiva(fetchMock);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permissão concedida sem assinatura local: nada a sincronizar', async () => {
    stubNotification('granted');
    fakeRegistration({});
    const fetchMock = csrfFetchStub();
    await sincronizarAssinaturaSeAtiva(fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
