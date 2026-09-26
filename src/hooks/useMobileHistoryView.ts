'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Vista interna com "voltar" do sistema no celular (PWA fase 3): detalhe da dívida (`?divida=id`)
 * e tela da caixa de entrada das Conexões (`?caixa=1`).
 *
 * - `enabled=false` (desktop): `value` vem só do estado local e `open`/`close` NÃO tocam no
 *   history — o desktop fica igual (a URL não muda).
 * - `enabled=true` (celular): `open(v)` faz pushState com `?param=v`; `close()` faz history.back()
 *   se a entrada foi nossa (senão replaceState sem o parâmetro); `popstate` (voltar do Android,
 *   gesto do iPhone) atualiza `value`.
 */

const readParam = (param: string): string | null => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(param);
};

const urlWith = (param: string, value: string | null): string => {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(param);
  else url.searchParams.set(param, value);
  return url.toString();
};

/** Marca no history.state das entradas que este hook empilhou. */
const STATE_KEY = '__mfHistoryView';

export function useMobileHistoryView(
  param: string,
  enabled: boolean,
): { value: string | null; open(v: string): void; close(): void } {
  const [value, setValue] = useState<string | null>(null);
  const pushedRef = useRef(false);

  // Celular: o valor da URL (deep link / recarregar) vale na montagem e a cada popstate.
  useEffect(() => {
    if (!enabled) return;
    setValue(readParam(param));
    const onPop = () => {
      const next = readParam(param);
      const state = window.history.state as Record<string, unknown> | null;
      pushedRef.current = !!next && state?.[STATE_KEY] === param;
      setValue(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled, param]);

  const open = useCallback(
    (v: string) => {
      setValue(v);
      if (!enabled) return;
      if (readParam(param) === v) return;
      const prev = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...prev, [STATE_KEY]: param }, '', urlWith(param, v));
      pushedRef.current = true;
    },
    [enabled, param],
  );

  const close = useCallback(() => {
    setValue(null);
    if (!enabled) return;
    if (readParam(param) === null) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    const prev = (window.history.state as Record<string, unknown> | null) ?? {};
    const rest = { ...prev };
    delete rest[STATE_KEY];
    window.history.replaceState(rest, '', urlWith(param, null));
  }, [enabled, param]);

  return { value, open, close };
}

export default useMobileHistoryView;
