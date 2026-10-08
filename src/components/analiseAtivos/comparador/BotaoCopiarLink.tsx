'use client';

/**
 * "Copiar link" do Comparador: copia a URL ABSOLUTA com os tickers dos slots (?t=) e confirma com
 * "Link copiado" (aria-live) por 3 s. O link cobre o "salvar comparação" (decisão 12).
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { urlCompartilhavel } from '@/components/analiseAtivos/comparador/useEstadoComparadorUrl';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';

const TA = TEXTOS_COMPARADOR.acoes;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

export function IconeLink({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no fallback
  }
  try {
    const el = document.createElement('textarea');
    el.value = texto;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface BotaoCopiarLinkProps {
  slots: readonly string[];
  /** celular: botão de largura toda */
  larguraToda?: boolean;
}

export default function BotaoCopiarLink({ slots, larguraToda = false }: BotaoCopiarLinkProps) {
  const pathname = usePathname();
  const [aviso, setAviso] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copiar = async () => {
    const ok = await copiarTexto(urlCompartilhavel(window.location.origin, pathname, slots));
    setAviso(ok ? TA.linkCopiado : TA.erroCopiar);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAviso(null), 3000);
  };

  return (
    <span className={`inline-flex flex-col gap-1 ${larguraToda ? 'w-full' : 'items-end'}`}>
      <button
        type="button"
        onClick={copiar}
        data-acao="copiar-link"
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:hover:bg-white/[0.06] ${
          larguraToda ? 'w-full' : ''
        } ${FOCO}`}
      >
        <IconeLink />
        {TA.copiarLink}
      </button>
      <span aria-live="polite" className="min-h-0 text-xs text-gray-600 dark:text-gray-300">
        {aviso}
      </span>
    </span>
  );
}
