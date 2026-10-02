'use client';

import { logger } from '@/lib/logger';

import React from 'react';

interface DefaultErrorFallbackProps {
  error?: Error;
  onRetry: () => void;
}

function DefaultErrorFallback({ error, onRetry }: DefaultErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-7 w-7 text-red-500 dark:text-red-400"
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
      <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Algo deu errado
      </h3>
      <p className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.
      </p>
      {process.env.NODE_ENV === 'development' && error && (
        <pre className="mb-4 max-w-full overflow-auto rounded bg-gray-100 p-3 text-xs text-red-600 dark:bg-gray-900 dark:text-red-400">
          {error.message}
        </pre>
      )}
      <button
        onClick={onRetry}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      >
        Tentar novamente
      </button>
    </div>
  );
}

/**
 * notFound()/redirect()/forbidden() do Next lançam erros internos (digest NEXT_HTTP_ERROR_FALLBACK;…
 * ou NEXT_REDIRECT;…) que precisam subir até as fronteiras do próprio Next (ex.: o not-found.tsx
 * da raiz). Este boundary fica em volta das páginas do (admin) e não pode engoli-los.
 */
export function ehErroDeNavegacaoNext(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;') ||
      digest.startsWith('NEXT_REDIRECT;') ||
      digest === 'NEXT_NOT_FOUND')
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (ehErroDeNavegacaoNext(error)) return;
    logger.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    // Erro de navegação do Next: relança para a fronteira do Next tratar (404 da raiz, redirect).
    if (this.state.hasError && ehErroDeNavegacaoNext(this.state.error)) throw this.state.error;
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <DefaultErrorFallback
            error={this.state.error}
            onRetry={() => this.setState({ hasError: false })}
          />
        )
      );
    }
    return this.props.children;
  }
}
