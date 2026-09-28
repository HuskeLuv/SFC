import type { Page } from '@playwright/test';

/**
 * Chamadas de API autenticadas nos e2e (PWA fase 3), com o mesmo CSRF do app (double-submit:
 * cookie `csrf-token` + header `x-csrf-token`, ver src/utils/csrf.ts).
 *
 * Só os arquivos `*.escrita.spec.ts` (projeto `escrita`, roda por último) podem gravar, e só com
 * `E2E_ALLOW_WRITES=1` (o CI liga: banco efêmero do job). Um arquivo de escrita só afirma sobre o
 * que ele próprio criou (`uniqueName`).
 */

/** Mesmos nomes de src/utils/csrf.ts (o módulo importa next/server; aqui fica a cópia). */
export const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const writesAllowed = (): boolean => process.env.E2E_ALLOW_WRITES === '1';

/** Nome identificável e único do que um teste de escrita cria. */
export const uniqueName = (mod: string): string => `E2E PWA fase 3 ${mod} ${Date.now()}`;

async function readCsrfCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === CSRF_COOKIE_NAME)?.value;
}

/** Página autenticada leve usada para o middleware gravar o cookie do CSRF. */
const CSRF_BOOTSTRAP_ROUTE = '/profile';

/**
 * Header do CSRF. O cookie vem do storageState; se faltar, um GET numa PÁGINA autenticada faz o
 * middleware gravá-lo. Rota pública (/api/health) retorna antes e não grava, e numa rota de API
 * a resposta do handler não leva o cookie do middleware (medido: GET /api/auth/me não grava).
 */
export async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  let token = await readCsrfCookie(page);
  if (!token) {
    await page.request.get(CSRF_BOOTSTRAP_ROUTE, { maxRedirects: 0 });
    token = await readCsrfCookie(page);
  }
  if (!token) {
    throw new Error(`cookie ${CSRF_COOKIE_NAME} ausente mesmo após GET ${CSRF_BOOTSTRAP_ROUTE}`);
  }
  return { [CSRF_HEADER_NAME]: token };
}

async function send<T>(
  page: Page,
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  const headers = await csrfHeaders(page);
  const res = await page.request.fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const apiPost = <T = unknown>(page: Page, url: string, body: unknown) =>
  send<T>(page, 'POST', url, body);

export const apiPatch = <T = unknown>(page: Page, url: string, body: unknown) =>
  send<T>(page, 'PATCH', url, body);

export const apiDelete = <T = unknown>(page: Page, url: string) => send<T>(page, 'DELETE', url);
