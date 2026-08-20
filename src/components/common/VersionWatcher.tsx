'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { logger } from '@/lib/logger';

/**
 * Detecta deploy novo com a aba aberta (ticket 20/08/2026: tester não via a
 * opção Imóveis & Bens porque o bundle antigo seguia carregado).
 *
 * Estratégia em 3 camadas, sem puxar o tapete de quem está editando:
 * 1. Checa /api/version ao montar, ao focar a aba e a cada 5 min. Se o build
 *    mudou, marca stale e mostra o banner "Atualizar".
 * 2. Stale + navegação (pathname mudou) → reload automático: a troca de página
 *    já descarta o estado local, então o reload é imperceptível — e evita o
 *    ChunkLoadError de navegar com chunks antigos que o deploy removeu.
 * 3. ChunkLoadError mesmo assim (ex.: chunk lazy na mesma página) → reload
 *    com guarda de sessão para nunca entrar em loop.
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const CHUNK_RELOAD_GUARD_KEY = 'myfinance:chunk-reload-at';
const CHUNK_RELOAD_MIN_GAP_MS = 60 * 1000;

const isChunkLoadMessage = (message: string): boolean =>
  /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module/i.test(
    message,
  );

export default function VersionWatcher() {
  const pathname = usePathname();
  const initialBuildRef = useRef<string | null>(null);
  const staleRef = useRef(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (staleRef.current) return;
      try {
        const res = await fetch('/api/version', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (cancelled || !buildId || buildId === 'dev') return;
        if (initialBuildRef.current === null) {
          initialBuildRef.current = buildId;
        } else if (buildId !== initialBuildRef.current) {
          staleRef.current = true;
          setStale(true);
        }
      } catch {
        // rede indisponível: tenta de novo no próximo gatilho
      }
    };

    void check();
    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // Camada 3: chunk antigo sumiu do servidor → reload guardado contra loop.
    const onError = (event: ErrorEvent) => {
      const message = String(event?.message || event?.error?.message || '');
      if (!isChunkLoadMessage(message)) return;
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || 0);
      if (Date.now() - last < CHUNK_RELOAD_MIN_GAP_MS) return;
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
      logger.error('[VersionWatcher] ChunkLoadError — recarregando para a versão nova');
      window.location.reload();
    };
    window.addEventListener('error', onError);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('error', onError);
    };
  }, []);

  // Camada 2: reload transparente na primeira navegação após ficar stale.
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPathnameRef.current) {
      lastPathnameRef.current = pathname;
      if (staleRef.current) window.location.reload();
    }
  }, [pathname]);

  if (!stale) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 print:hidden">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-300 bg-white p-3 shadow-theme-lg dark:border-brand-800 dark:bg-gray-900">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Uma nova versão do My Finance está disponível.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
