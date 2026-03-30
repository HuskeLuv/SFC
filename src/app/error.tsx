'use client';

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-gray-900">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg
            className="h-8 w-8 text-red-500 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-800 dark:text-gray-100">
          Algo deu errado
        </h2>
        <p className="mb-6 text-gray-500 dark:text-gray-400">
          Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
