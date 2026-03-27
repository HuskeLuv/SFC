'use client';

import { useCallback } from 'react';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Read the CSRF token from the csrf-token cookie.
 * The cookie is NOT httpOnly, so client JS can read it.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.split('=')[1] : null;
}

/**
 * Hook that provides a fetch wrapper which automatically attaches
 * the CSRF token header to state-changing requests (POST, PUT, DELETE, PATCH).
 *
 * Usage:
 *   const { csrfFetch } = useCsrf();
 *   await csrfFetch('/api/something', { method: 'POST', body: ... });
 */
export function useCsrf() {
  const csrfFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

      const headers = new Headers(init?.headers);

      if (needsCsrf) {
        const token = getCsrfToken();
        if (token) {
          headers.set(CSRF_HEADER_NAME, token);
        }
      }

      return fetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });
    },
    [],
  );

  return { csrfFetch, getCsrfToken };
}
