/**
 * Harness do service worker (public/sw.js) — fase 5, fatia B.
 *
 * O sw.js é um script clássico (sem módulos): avaliamos o fonte com `new Function`
 * injetando `self`/`caches`/`fetch` falsos e disparamos os eventos na mão.
 * O shape do payload segue o PushPayloadV1 de src/lib/push/contract.ts (fonte única).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SW_SOURCE = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf8');

const ORIGEM = 'https://app.local';

type Evento = Record<string, unknown>;
type Handler = (evento: Evento) => void;

interface RequestFalso {
  method: string;
  url: string;
  mode?: string;
}

const chaveDeCache = (alvo: string | RequestFalso): string =>
  typeof alvo === 'string' ? alvo : new URL(alvo.url, ORIGEM).pathname;

function criarSw() {
  const handlers = new Map<string, Handler>();

  // Notificações "visíveis": mesma tag substitui (comportamento da plataforma).
  const visiveis = new Map<string, { title: string; options: Record<string, unknown> }>();
  let semTag = 0;
  const showNotification = vi.fn((title: string, options: Record<string, unknown>) => {
    const chave = typeof options?.tag === 'string' ? `tag:${options.tag}` : `sem-tag:${++semTag}`;
    visiveis.set(chave, { title, options });
    return Promise.resolve();
  });

  const subscribe = vi.fn(() => Promise.resolve({ endpoint: 'https://push.local/novo' }));
  const openWindow = vi.fn(() => Promise.resolve(null));
  const matchAll = vi.fn((): Promise<unknown[]> => Promise.resolve([]));

  const lojas = new Map<string, Map<string, unknown>>();
  const abrir = (nome: string) => {
    const existente = lojas.get(nome);
    if (existente) return existente;
    const nova = new Map<string, unknown>();
    lojas.set(nome, nova);
    return nova;
  };
  const cachesFalso = {
    open: async (nome: string) => {
      const loja = abrir(nome);
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) loja.set(url, { corpo: `cache:${url}` });
        },
        keys: async () => [...loja.keys()].map((url) => ({ url: `${ORIGEM}${url}` })),
        put: async (req: string | RequestFalso, res: unknown) => {
          loja.set(chaveDeCache(req), res);
        },
        delete: async (req: string | RequestFalso) => loja.delete(chaveDeCache(req)),
      };
    },
    match: async (alvo: string | RequestFalso, opts?: { cacheName?: string }) => {
      if (opts?.cacheName) return lojas.get(opts.cacheName)?.get(chaveDeCache(alvo));
      for (const loja of lojas.values()) {
        const achado = loja.get(chaveDeCache(alvo));
        if (achado) return achado;
      }
      return undefined;
    },
    keys: async () => [...lojas.keys()],
    delete: async (nome: string) => lojas.delete(nome),
  };

  const fetchFalso = vi.fn(
    (): Promise<unknown> => Promise.reject(new TypeError('rede indisponível')),
  );

  const selfFalso = {
    location: { origin: ORIGEM },
    addEventListener: (tipo: string, fn: Handler) => handlers.set(tipo, fn),
    registration: {
      showNotification,
      navigationPreload: null,
      pushManager: { subscribe },
    },
    clients: { matchAll, openWindow, claim: vi.fn() },
    skipWaiting: vi.fn(),
  };

  new Function('self', 'caches', 'fetch', SW_SOURCE)(selfFalso, cachesFalso, fetchFalso);

  const disparar = async (tipo: string, evento: Evento) => {
    const pendentes: Promise<unknown>[] = [];
    const respostas: Promise<unknown>[] = [];
    const completo = {
      waitUntil: (p: Promise<unknown>) => pendentes.push(p),
      respondWith: (p: Promise<unknown>) => respostas.push(p),
      ...evento,
    };
    handlers.get(tipo)?.(completo);
    await Promise.all(pendentes);
    return { pendentes, respostas };
  };

  return {
    handlers,
    disparar,
    selfFalso,
    lojas,
    visiveis,
    showNotification,
    subscribe,
    openWindow,
    matchAll,
    fetchFalso,
  };
}

const payloadV1 = (extra: Record<string, unknown> = {}) => ({
  v: 1,
  categoria: 'orcamento',
  title: 'Orçamento de Alimentação em atenção',
  body: 'Toque para ver os detalhes no app.',
  url: '/fluxodecaixa?modo=orcamento',
  tag: 'mf-orcamento-grupo-1',
  notificationId: 'notif-1',
  ...extra,
});

const eventoPush = (json: unknown) => ({
  data: { json: typeof json === 'function' ? json : () => json },
});

const eventoClique = (data: unknown, close = vi.fn()) => ({
  notification: { close, data },
});

describe('sw.js — push (PushPayloadV1)', () => {
  it('payload v1 vira exatamente uma notificação com tag/icon/badge/lang/data do contrato', async () => {
    const sw = criarSw();
    await sw.disparar('push', eventoPush(payloadV1()));

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    expect(sw.showNotification).toHaveBeenCalledWith('Orçamento de Alimentação em atenção', {
      body: 'Toque para ver os detalhes no app.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'pt-BR',
      tag: 'mf-orcamento-grupo-1',
      data: { url: '/fluxodecaixa?modo=orcamento', notificationId: 'notif-1' },
    });
    expect(sw.visiveis.size).toBe(1);
  });

  it('segunda push com a MESMA tag substitui a anterior (escalada não empilha)', async () => {
    const sw = criarSw();
    await sw.disparar('push', eventoPush(payloadV1({ title: 'Orçamento em atenção' })));
    await sw.disparar('push', eventoPush(payloadV1({ title: 'Orçamento estourado' })));

    expect(sw.showNotification).toHaveBeenCalledTimes(2);
    expect(sw.visiveis.size).toBe(1);
    expect(sw.visiveis.get('tag:mf-orcamento-grupo-1')?.title).toBe('Orçamento estourado');
  });

  it('tags diferentes convivem (grupos distintos não se substituem)', async () => {
    const sw = criarSw();
    await sw.disparar('push', eventoPush(payloadV1()));
    await sw.disparar('push', eventoPush(payloadV1({ tag: 'mf-agenda-evento-9' })));
    expect(sw.visiveis.size).toBe(2);
  });

  it.each([
    ['json que não parseia', { json: () => JSON.parse('{quebrado') } as unknown],
    ['sem data', null],
    ['versão desconhecida', { json: () => payloadV1({ v: 2 }) }],
    ['sem title', { json: () => payloadV1({ title: '' }) }],
  ])('payload malformado (%s) mostra o aviso genérico e não quebra o SW', async (_nome, data) => {
    const sw = criarSw();
    await sw.disparar('push', { data });

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0];
    expect(title).toBe('My Finance');
    expect(options.body).toBe('Você tem uma nova notificação.');
    expect(options.data).toEqual({ url: '/', notificationId: null });
    expect(options.tag).toBeUndefined();
  });
});

describe('sw.js — notificationclick', () => {
  it('fecha, foca o app aberto e navega para a url do payload', async () => {
    const sw = criarSw();
    const navegado: string[] = [];
    const cliente = {
      focus: vi.fn(function (this: unknown) {
        return Promise.resolve(cliente);
      }),
      navigate: vi.fn((url: string) => {
        navegado.push(url);
        return Promise.resolve(cliente);
      }),
    };
    sw.matchAll.mockResolvedValueOnce([cliente]);
    const close = vi.fn();
    await sw.disparar(
      'notificationclick',
      eventoClique({ url: '/fluxodecaixa?modo=orcamento', notificationId: 'n1' }, close),
    );

    expect(close).toHaveBeenCalledTimes(1);
    expect(cliente.focus).toHaveBeenCalledTimes(1);
    expect(navegado).toEqual([`${ORIGEM}/fluxodecaixa?modo=orcamento`]);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('sem aba aberta, abre janela nova na url do payload', async () => {
    const sw = criarSw();
    await sw.disparar('notificationclick', eventoClique({ url: '/calendario' }));
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGEM}/calendario`);
  });

  it.each([
    ['url absoluta externa', 'https://evil.example/rouba'],
    ['protocol-relative', '//evil.example/rouba'],
    ['sem barra inicial', 'evil'],
    ['url ausente', undefined],
  ])('%s cai na home same-origin, nunca em origem externa', async (_nome, url) => {
    const sw = criarSw();
    await sw.disparar('notificationclick', eventoClique({ url }));
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGEM}/`);
  });

  it('data ausente não quebra o clique', async () => {
    const sw = criarSw();
    await sw.disparar('notificationclick', eventoClique(undefined));
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGEM}/`);
  });
});

describe('sw.js — pushsubscriptionchange', () => {
  it('re-assina localmente com a applicationServerKey antiga', async () => {
    const sw = criarSw();
    await sw.disparar('pushsubscriptionchange', {
      oldSubscription: { options: { applicationServerKey: 'chave-vapid' } },
    });
    expect(sw.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: 'chave-vapid',
    });
  });

  it('sem assinatura antiga, não tenta assinar', async () => {
    const sw = criarSw();
    await sw.disparar('pushsubscriptionchange', { oldSubscription: null });
    expect(sw.subscribe).not.toHaveBeenCalled();
  });
});

describe('sw.js — regressão da fase 0 (cache/offline e mensagens)', () => {
  it('SKIP_WAITING segue chamando skipWaiting', async () => {
    const sw = criarSw();
    await sw.disparar('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.selfFalso.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('CLEAR_CACHES limpa os caches mf-* (menos o offline) e responde na porta', async () => {
    const sw = criarSw();
    await sw.disparar('install', {});
    // povoamos um cache estático para ver a limpeza
    sw.lojas.set('mf-static-v1', new Map([['/_next/static/x.js', { corpo: 'x' }]]));
    const postMessage = vi.fn();
    await sw.disparar('message', {
      data: { type: 'CLEAR_CACHES' },
      ports: [{ postMessage }],
    });

    expect(sw.lojas.has('mf-static-v1')).toBe(false);
    expect(sw.lojas.has('mf-offline-v1')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'CACHES_CLEARED', version: 'mf-sw-v2' });
  });

  it('navegação sem rede cai no /offline.html do cache', async () => {
    const sw = criarSw();
    await sw.disparar('install', {});
    const { respostas } = await sw.disparar('fetch', {
      request: { method: 'GET', url: `${ORIGEM}/carteira`, mode: 'navigate' },
      preloadResponse: Promise.resolve(undefined),
    });

    expect(respostas).toHaveLength(1);
    await expect(respostas[0]).resolves.toEqual({ corpo: 'cache:/offline.html' });
  });

  it('estático same-origin é cache-first (rede uma vez, depois cache)', async () => {
    const sw = criarSw();
    const resposta = { ok: true, type: 'basic', clone: () => ({ corpo: 'da-rede' }) };
    sw.fetchFalso.mockResolvedValueOnce(resposta);
    const request = { method: 'GET', url: `${ORIGEM}/_next/static/chunks/app.js` };

    const primeira = await sw.disparar('fetch', { request });
    await expect(primeira.respostas[0]).resolves.toBe(resposta);
    // o put no cache acontece fora do await do respondWith — dá um tick
    await new Promise((resolve) => setTimeout(resolve, 0));

    const segunda = await sw.disparar('fetch', { request });
    await expect(segunda.respostas[0]).resolves.toEqual({ corpo: 'da-rede' });
    expect(sw.fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('API e métodos não-GET nunca passam pelo SW', async () => {
    const sw = criarSw();
    const api = await sw.disparar('fetch', {
      request: { method: 'GET', url: `${ORIGEM}/api/carteira/resumo` },
    });
    const post = await sw.disparar('fetch', {
      request: { method: 'POST', url: `${ORIGEM}/carteira` },
    });
    expect(api.respostas).toHaveLength(0);
    expect(post.respostas).toHaveLength(0);
  });
});

describe('sw.js — restrições estáticas (CSP e cortes da v1)', () => {
  it('não usa importScripts, eval nem setAppBadge', () => {
    const semComentarios = SW_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(semComentarios).not.toMatch(/importScripts/);
    expect(semComentarios).not.toMatch(/\beval\s*\(/);
    expect(semComentarios).not.toMatch(/setAppBadge/);
  });
});
