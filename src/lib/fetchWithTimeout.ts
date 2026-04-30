/**
 * Helper para `fetch` com timeout via AbortController. Padroniza a postura
 * defensiva contra externals lentos (BRAPI, BACEN, Tesouro): não deixa um
 * upstream degradado consumir todo o budget da Vercel function.
 *
 * Em caso de timeout, lança um Error com `name === 'AbortError'`. Callers
 * tipicamente caem em fallback (DB cache, valor neutro) sem propagar.
 */
export const fetchWithTimeout = async (
  url: string,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<Response> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};
