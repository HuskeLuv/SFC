'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import { MOBILE_FIELD_ERROR_TEXT_CLASS } from '@/components/ui/sheet/MobileNumberField';

/**
 * Peças comuns dos painéis do sheet de edição do Fluxo (PWA fase 2, fatia B). Um único
 * BottomSheet troca de painel: o rodapé de cada painel vai por portal para o rodapé fixo do sheet
 * (`SheetFooter`), que fica acima do teclado.
 */

const SheetFooterContext = createContext<HTMLElement | null>(null);

export const SheetFooterProvider = SheetFooterContext.Provider;

/** Conteúdo do rodapé fixo do sheet (botões Voltar/Cancelar/Salvar). */
export function SheetFooter({ children }: { children: ReactNode }) {
  const target = useContext(SheetFooterContext);
  if (!target) return null;
  return createPortal(<div className="flex flex-col gap-2">{children}</div>, target);
}

export const SAVE_FAILED_MESSAGE =
  'Não foi possível salvar. Confira a conexão e toque em Salvar de novo.';

/** Erro de gravação (fica no sheet, com o que foi digitado). */
export function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className={twMerge(MOBILE_FIELD_ERROR_TEXT_CLASS, 'mt-0')}>
      {message}
    </p>
  );
}

const SPINNER = (
  <svg
    className="h-4 w-4 motion-safe:animate-spin"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const BUTTON_BASE =
  'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40';

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={twMerge(
        BUTTON_BASE,
        'border border-gray-300 font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200',
      )}
    >
      {children}
    </button>
  );
}

/** Botão principal com "Salvando…" e spinner; `danger` = vermelho semântico (Excluir). */
export function PrimaryButton({
  children,
  busy,
  busyLabel = 'Salvando…',
  disabled,
  danger,
  form,
  onClick,
}: {
  children: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Com `form`, é o submit desse formulário. */
  form?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={form ? 'submit' : 'button'}
      form={form}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={twMerge(
        BUTTON_BASE,
        'font-semibold text-white disabled:opacity-60',
        busy && 'disabled:opacity-80',
        danger ? 'bg-[#D92D20] dark:bg-[#F97066] dark:text-gray-950' : 'bg-mf-patrimonio',
      )}
    >
      {busy && SPINNER}
      <span className="min-w-0 truncate">{busy ? busyLabel : children}</span>
    </button>
  );
}

/** Linha de ação do sheet: 52px, ícone em caixa de 36px, título + descrição e seta opcional. */
export function ActionRow({
  icon,
  title,
  description,
  onClick,
  disabled,
  danger,
  chevron = true,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid min-h-[52px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40 active:bg-gray-100 disabled:opacity-45 dark:active:bg-white/5"
    >
      <span
        className={twMerge(
          'grid h-9 w-9 place-items-center rounded-[10px]',
          danger
            ? 'bg-[#D92D20]/10 text-[#D92D20] dark:bg-[#F97066]/15 dark:text-[#F97066]'
            : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={twMerge(
            'block text-[15px] font-medium',
            danger ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-800 dark:text-white/90',
          )}
        >
          {title}
        </span>
        {description != null && (
          <span className="block truncate text-[12.5px] text-gray-500 dark:text-gray-400">
            {description}
          </span>
        )}
      </span>
      {chevron ? (
        <span className="text-gray-400 dark:text-gray-500" aria-hidden="true">
          {ICONS.chevron}
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}

/** Aviso cinza com ícone (motivo de linha travada, dicas). */
export function InfoNote({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return (
    <div
      className={twMerge(
        'flex gap-2.5 rounded-xl p-3 text-[13px] leading-snug',
        tone === 'warn'
          ? 'bg-[#D92D20]/8 text-gray-800 dark:bg-[#F97066]/12 dark:text-white/90'
          : 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300',
      )}
    >
      <span
        className={twMerge(
          'mt-px shrink-0',
          tone === 'warn' ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-500',
        )}
        aria-hidden="true"
      >
        {tone === 'warn' ? ICONS.alert : ICONS.info}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SheetSeparator() {
  return <div className="-mx-4 my-3.5 h-px bg-gray-100 dark:bg-gray-800" aria-hidden="true" />;
}

const svg = (d: ReactNode, size = 18) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

export const ICONS = {
  chevron: svg(<path d="M9 6l6 6-6 6" />),
  back: svg(<path d="M15 6l-6 6 6 6" />, 22),
  edit: svg(
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>,
  ),
  comment: svg(<path d="M5 5h14v10H9l-4 4V5z" />),
  move: svg(
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>,
  ),
  trash: svg(
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>,
  ),
  up: svg(<path d="M12 19V5M6 11l6-6 6 6" />),
  down: svg(<path d="M12 5v14M6 13l6 6 6-6" />),
  add: svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>,
  ),
  reorder: svg(<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />),
  link: svg(<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />),
  lock: svg(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
    16,
  ),
  info: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
  ),
  alert: svg(
    <>
      <path d="M12 3l9.5 17h-19L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </>,
  ),
  search: svg(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </>,
  ),
};
