'use client';

import { QueryClient } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        // Retry 3× para tolerar blips transientes (BACEN/BRAPI/DB) — antes era 1, suficiente
        // pra um único erro de rede derrubar séries de indicadores na Análise.
        // Pula 4xx pra não martelar inutilmente em auth/validação.
        retry: (failureCount, error) => {
          if (error instanceof Error && /\b4\d\d\b/.test(error.message)) return false;
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
let bfcacheListenerRegistered = false;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  if (!bfcacheListenerRegistered) {
    bfcacheListenerRegistered = true;
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && browserQueryClient) {
        browserQueryClient.invalidateQueries();
      }
    });
  }
  return browserQueryClient;
}
