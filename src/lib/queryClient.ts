'use client';

import { QueryClient } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
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
