'use client';

import React, { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

/**
 * Confirmação responsiva (PWA fase 3).
 *
 * - Desktop (≥ lg): `window.confirm(desktopMessage)` com o MESMO texto de hoje. Sem
 *   `desktopMessage` (confirmação que só o celular ganhou) resolve `true` sem perguntar — o
 *   desktop hoje não confirma.
 * - Celular: sheet com `role="alertdialog"`, foco inicial no Cancelar; Esc, fundo e Cancelar
 *   resolvem `false` (bloqueados enquanto a ação roda).
 *
 * Os hooks são sempre chamados; só o USO é condicional. Quem chama renderiza `confirmSheet`.
 */

export interface ConfirmOptions {
  /** Texto EXATO do window.confirm de hoje. Sem ele, o desktop não pergunta. */
  desktopMessage?: string;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Rótulo do botão enquanto a ação roda (confirmAndRun). */
  busyLabel?: string;
}

export interface ResponsiveConfirm {
  confirm(o: ConfirmOptions): Promise<boolean>;
  /** Confirma e executa. Celular: sheet fica aberto com spinner (busyLabel), erro dentro do sheet (role=alert) + 'Tentar de novo'; resolve true só no sucesso. Desktop: window.confirm(desktopMessage) e então await action() (erro propaga ao chamador como hoje). */
  confirmAndRun(o: ConfirmOptions, action: () => Promise<void>): Promise<boolean>;
  confirmSheet: ReactNode;
}

interface Pending {
  options: ConfirmOptions;
  action?: () => Promise<void>;
  resolve(value: boolean): void;
}

const GENERIC_ERROR = 'Não foi possível concluir. Verifique a conexão e tente de novo.';

export function useResponsiveConfirm(): ResponsiveConfirm {
  const isBelowLg = useIsBelowLg();
  const isBelowLgRef = useRef(isBelowLg);
  useEffect(() => {
    isBelowLgRef.current = isBelowLg;
  }, [isBelowLg]);

  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const messageId = useId();

  const open = useCallback((next: Omit<Pending, 'resolve'>) => {
    return new Promise<boolean>((resolve) => {
      // Uma confirmação por vez: a anterior (se houver) é cancelada.
      pendingRef.current?.resolve(false);
      const entry: Pending = { ...next, resolve };
      pendingRef.current = entry;
      setError(null);
      setPending(entry);
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    const entry = pendingRef.current;
    pendingRef.current = null;
    busyRef.current = false;
    setBusy(false);
    setError(null);
    setPending(null);
    entry?.resolve(value);
  }, []);

  const confirm = useCallback(
    async (o: ConfirmOptions) => {
      if (!isBelowLgRef.current) {
        return o.desktopMessage === undefined ? true : window.confirm(o.desktopMessage);
      }
      return open({ options: o });
    },
    [open],
  );

  const confirmAndRun = useCallback(
    async (o: ConfirmOptions, action: () => Promise<void>) => {
      if (!isBelowLgRef.current) {
        const ok = o.desktopMessage === undefined ? true : window.confirm(o.desktopMessage);
        if (!ok) return false;
        await action();
        return true;
      }
      return open({ options: o, action });
    },
    [open],
  );

  const run = useCallback(async () => {
    const entry = pendingRef.current;
    if (!entry || busyRef.current) return;
    if (!entry.action) {
      finish(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await entry.action();
      if (pendingRef.current === entry) finish(true);
    } catch (e: unknown) {
      if (pendingRef.current !== entry) return;
      busyRef.current = false;
      setBusy(false);
      setError(e instanceof Error && e.message ? e.message : GENERIC_ERROR);
    }
  }, [finish]);

  const cancel = useCallback(() => {
    if (busyRef.current) return;
    finish(false);
  }, [finish]);

  // Janela passou a lg com a confirmação aberta (o sheet some): cancela em vez de ficar pendente.
  useEffect(() => {
    if (!isBelowLg && pendingRef.current && !busyRef.current) finish(false);
  }, [isBelowLg, finish]);

  const o = pending?.options;
  const confirmSheet: ReactNode = (
    <BottomSheet isOpen={!!pending && isBelowLg} onClose={cancel} ariaLabel={o?.title}>
      {o ? (
        <div
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={o.message ? messageId : undefined}
          aria-busy={busy || undefined}
          className="pb-2"
        >
          <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white/90">
            {o.title}
          </h3>
          {o.message ? (
            <div id={messageId} className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {o.message}
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-[#D92D20]/30 bg-[#D92D20]/5 px-3 py-2 text-sm text-[#D92D20] dark:border-[#F97066]/30 dark:bg-[#F97066]/10 dark:text-[#F97066]"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2">
            <button
              type="button"
              autoFocus
              onClick={cancel}
              disabled={busy}
              className="min-h-11 w-full rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
            >
              {o.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-70 ${
                o.danger
                  ? 'bg-[#D92D20] dark:bg-[#F97066] dark:text-gray-900'
                  : 'bg-mf-seguranca dark:bg-mf-patrimonio'
              }`}
            >
              {busy ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : null}
              {busy ? (o.busyLabel ?? o.confirmLabel) : error ? 'Tentar de novo' : o.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );

  return { confirm, confirmAndRun, confirmSheet };
}

export default useResponsiveConfirm;
