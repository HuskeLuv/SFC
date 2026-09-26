import React, { type ReactNode } from 'react';

/**
 * Estados de página do celular (PWA fase 3): vazio, erro e carregando.
 * - empty: círculo de 72px, título de 19px, frase de até 30ch e a ação;
 * - error: role=alert + "Tentar de novo" (ou a ação dada);
 * - loading: aria-busy + aria-label (o `skeleton` dado, ou um genérico).
 */

export interface MobilePageStateProps {
  kind: 'empty' | 'error' | 'loading';
  title?: ReactNode;
  text?: ReactNode;
  action?: { label: string; onClick(): void };
  /** Esqueleto próprio da página (kind='loading'). */
  skeleton?: ReactNode;
  /** Nome acessível do carregamento (padrão 'Carregando'). */
  busyLabel?: string;
  /** Ícone dentro do círculo (kind='empty'). */
  icon?: ReactNode;
}

const ACTION_CLASS =
  'mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-mf-seguranca px-5 text-sm font-semibold text-white dark:bg-mf-patrimonio';

export function MobilePageState({
  kind,
  title,
  text,
  action,
  skeleton,
  busyLabel = 'Carregando',
  icon,
}: MobilePageStateProps) {
  if (kind === 'loading') {
    return (
      <div data-mf-mobile="" aria-busy="true" aria-label={busyLabel} role="status">
        {skeleton ?? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'error') {
    return (
      <div
        data-mf-mobile=""
        role="alert"
        className="flex flex-col items-center px-4 py-10 text-center"
      >
        <p className="text-[19px] font-semibold text-gray-900 dark:text-white/90">
          {title ?? 'Não foi possível carregar'}
        </p>
        {text ? (
          <p className="mt-2 max-w-[30ch] text-sm text-gray-600 dark:text-gray-300">{text}</p>
        ) : null}
        {action ? (
          <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
            {action.label || 'Tentar de novo'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-mf-mobile="" className="flex flex-col items-center px-4 py-10 text-center">
      <div
        aria-hidden="true"
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-mf-tranquilidade/15 text-mf-patrimonio dark:bg-mf-tranquilidade/20 dark:text-mf-tranquilidade"
      >
        {icon ?? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M4 12h16M4 17h10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      {title ? (
        <p className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white/90">{title}</p>
      ) : null}
      {text ? (
        <p className="mt-2 max-w-[30ch] text-sm text-gray-600 dark:text-gray-300">{text}</p>
      ) : null}
      {action ? (
        <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export default MobilePageState;
